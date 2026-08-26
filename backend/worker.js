// backend/worker.js — Samferd Mini App backend (Cloudflare Worker).
//
// A single serverless function that:
//   1. Validates Telegram Mini App `initData` (HMAC-SHA256 with the bot token).
//   2. Enforces group membership via the Bot API `getChatMember`.
//   3. Stores and serves the shared flight board (KV storage).
//
// The bot itself is NOT interactive — it exists only to host the Mini App and
// provide the Bot API token used for initData validation + membership checks.
//
// Secrets are set with `wrangler secret put` (BOT_TOKEN, GROUP_ID). The KV
// namespace is bound as SAMFERD (see wrangler.toml).

const encoder = new TextEncoder();

// ---------------------------------------------------------------------------
// Config (secrets come from env bindings; see wrangler.toml)
// ---------------------------------------------------------------------------

const GROUP_ID = () => Number(env.GROUP_ID);
const BOT_TOKEN = () => env.BOT_TOKEN;
const FLIGHT_API_PROVIDER = () => env.FLIGHT_API_PROVIDER || '';
const FLIGHT_API_KEY = () => env.FLIGHT_API_KEY || '';

// CORS: the Mini App is served from Telegram's webview; allow any origin.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Init-Data',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// ---------------------------------------------------------------------------
// initData validation (Telegram Mini Apps security)
// ---------------------------------------------------------------------------

// HMAC-SHA256 over raw key bytes and a string message. The key may be a string
// (encoded to UTF-8) or raw bytes (Uint8Array/ArrayBuffer) — the latter is used
// for the derived `secret_key`, which is the raw HMAC digest, NOT a string.
async function hmacSha256(key, message) {
  const keyBytes = key instanceof Uint8Array ? key
    : key instanceof ArrayBuffer ? new Uint8Array(key)
    : encoder.encode(key);
  const k = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return crypto.subtle.sign('HMAC', k, encoder.encode(message));
}

async function hmacHex(key, message) {
  const sig = new Uint8Array(await hmacSha256(key, message));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Validate initData; returns the parsed user object or null. */
async function validateInitData(initData, botToken) {
  if (!initData) {
    console.log('[auth] no initData header');
    return null;
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) {
    console.log('[auth] no hash in initData');
    return null;
  }

  // Build the data-check-string per Telegram's spec:
  //   - all fields EXCEPT `hash` (INCLUDING `signature`)
  //   - values DECODED (URLSearchParams.get already decodes)
  //   - keys sorted alphabetically, joined with '\n'
  const dataCheckString = [...params.entries()]
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  // Per Telegram's spec:
  //   secret_key = HMAC_SHA256(key="WebAppData", message=<bot_token>)
  //   hash       = hex(HMAC_SHA256(key=secret_key, message=data_check_string))
  const secretKey = await hmacSha256('WebAppData', botToken);
  const computed = await hmacHex(secretKey, dataCheckString);
  if (computed !== hash) {
    console.log('[auth] hash mismatch — initData validation FAILED');
    console.log('[auth] computed:', computed);
    console.log('[auth] received:', hash);
    return null;
  }

  // Optional freshness check: reject initData older than ~2 days.
  const authDate = Number(params.get('auth_date') || 0);
  if (authDate && Date.now() / 1000 - authDate > 172800) {
    console.log('[auth] initData too old:', authDate);
    return null;
  }

  try {
    const user = JSON.parse(params.get('user'));
    console.log('[auth] initData valid, user id:', user?.id);
    return user;
  } catch {
    console.log('[auth] failed to parse user field');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Group membership (per the Mini Apps security guidance)
// ---------------------------------------------------------------------------

const ALLOWED = new Set(['creator', 'administrator', 'member']);

async function getMembership(userId) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN()}/getChatMember`
    + `?chat_id=${GROUP_ID()}&user_id=${userId}`;
  const res = await fetch(url);
  const body = await res.json();
  if (!body.ok) return { status: 'left' };
  return body.result;
}

async function isAllowedMember(userId) {
  // Short-term cache (5 min) to avoid hammering getChatMember on every call.
  const cacheKey = `member:${userId}`;
  const cached = await env.SAMFERD.get(cacheKey);
  if (cached !== null) {
    console.log('[auth] membership from cache:', userId, '=>', cached);
    return cached === 'yes';
  }

  const member = await getMembership(userId);
  console.log('[auth] getChatMember status:', member.status, 'is_member:', member.is_member);
  let allowed = ALLOWED.has(member.status);
  if (member.status === 'restricted') allowed = member.is_member === true;

  await env.SAMFERD.put(cacheKey, allowed ? 'yes' : 'no', { expirationTtl: 300 });
  return allowed;
}

/** Resolve the authenticated member from a request, or null. */
async function authUser(request) {
  const initData = request.headers.get('X-Init-Data') || '';
  const user = await validateInitData(initData, BOT_TOKEN());
  if (!user || user.is_bot) {
    console.log('[auth] authUser failed at initData/is_bot stage');
    return null;
  }
  if (!(await isAllowedMember(user.id))) {
    console.log('[auth] authUser failed at membership stage for', user.id);
    return null;
  }
  console.log('[auth] authUser OK for', user.id);
  return user;
}

// ---------------------------------------------------------------------------
// Board storage (single JSON document in KV)
// ---------------------------------------------------------------------------

async function loadBoard() {
  const raw = await env.SAMFERD.get('board');
  const board = raw ? JSON.parse(raw) : {};
  return {
    nextId: board.nextId || 1,
    flights: board.flights || [],
    cars: board.cars || [],
  };
}

async function saveBoard(board) {
  await env.SAMFERD.put('board', JSON.stringify(board));
}

function userInfo(u) {
  return {
    id: u.id,
    name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || `#${u.id}`,
    username: u.username || null,
  };
}

// ---------------------------------------------------------------------------
// Flight-data enrichment (Aviationstack) — cached per flight number + date
// ---------------------------------------------------------------------------
//
// To minimize API usage, we call Aviationstack ONLY the first time a given
// (flight number, date) pair is seen and cache the result in KV. Later flights
// with the same number AND date reuse the cache — but a different date is a
// different flight (different times/route), so it gets its own API call.
// A "not found" result is cached too (empty object) to avoid repeat calls.

const ENRICH_PREFIX = 'enrich:';

async function enrichFlight(flightNumber, departureDate) {
  const provider = FLIGHT_API_PROVIDER();
  if (!provider || provider === 'none' || !FLIGHT_API_KEY()) {
    return null; // enrichment disabled
  }

  const cacheKey = ENRICH_PREFIX + flightNumber + ':' + departureDate;

  // 1. Return cached data if we've already resolved this flight+date.
  const cached = await env.SAMFERD.get(cacheKey);
  if (cached !== null) {
    return cached === '' ? null : JSON.parse(cached);
  }

  // 2. First time — call the provider.
  let data = null;
  if (provider === 'aviationstack') {
    data = await fetchAviationstack(flightNumber, departureDate);
  }

  // 3. Cache whatever we got (including null → empty string).
  await env.SAMFERD.put(cacheKey, data ? JSON.stringify(data) : '');
  return data;
}

async function fetchAviationstack(flightNumber, departureDate) {
  const url = 'https://api.aviationstack.com/v1/flights'
    + `?access_key=${encodeURIComponent(FLIGHT_API_KEY())}`
    + `&flight_iata=${encodeURIComponent(flightNumber)}`
    + `&flight_date=${encodeURIComponent(departureDate)}`
    + '&limit=1';
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = await res.json();
    const f = body && body.data && body.data[0];
    if (!f) return null;
    return {
      origin: f.departure?.airport || f.departure?.iata || null,
      destination: f.arrival?.airport || f.arrival?.iata || null,
      // Departure time in local airport time (e.g. "13:45"), and gate if present.
      departureTime: f.departure?.scheduled?.slice(11, 16) || null,
      terminal: f.departure?.terminal || null,
      gate: f.departure?.gate || null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

async function handle(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  // Auth gate for every API route.
  const user = await authUser(request);
  if (!user) {
    return json({ ok: false, error: 'forbidden', message: 'You must be a member of the group.' }, 403);
  }

  const board = await loadBoard();
  const findFlight = (id) => board.flights.find((f) => f.id === id);

  // ---- auth check ----------------------------------------------------------
  if (path === '/api/auth') {
    return json({ ok: true, user: userInfo(user) });
  }

  // ---- board ---------------------------------------------------------------
  if (path === '/api/board' && method === 'GET') {
    const flights = board.flights
      .filter((f) => f.departureDate >= new Date().toISOString().slice(0, 10))
      .sort((a, b) => a.departureDate.localeCompare(b.departureDate) || a.id - b.id);
    return json({ ok: true, flights, cars: board.cars, me: user.id });
  }

  // ---- create flight -------------------------------------------------------
  if (path === '/api/flights' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const flightNumber = String(body.flightNumber || '').toUpperCase().replace(/[\s-]/g, '');
    const departureDate = String(body.departureDate || '');
    if (!/^[A-Z0-9]{2}\d{1,4}$/.test(flightNumber)) {
      return json({ ok: false, error: 'bad_flight', message: 'Invalid flight number.' }, 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(departureDate)) {
      return json({ ok: false, error: 'bad_date', message: 'Date must be YYYY-MM-DD.' }, 400);
    }
    if (board.flights.some((f) => f.flightNumber === flightNumber && f.departureDate === departureDate)) {
      return json({ ok: false, error: 'duplicate', message: 'That flight already exists.' }, 409);
    }

    // Auto-enrich origin/destination/departure time the first time this
    // flight number + date is seen (cached; null when disabled or unknown).
    const enrichment = await enrichFlight(flightNumber, departureDate);

    const flight = {
      id: board.nextId++,
      flightNumber,
      departureDate,
      origin: enrichment?.origin || null,
      destination: enrichment?.destination || null,
      departureTime: enrichment?.departureTime || null,
      terminal: enrichment?.terminal || null,
      gate: enrichment?.gate || null,
      status: null,
      createdBy: user.id,
      passengers: [],
    };
    board.flights.push(flight);
    await saveBoard(board);
    return json({ ok: true, flight });
  }

  // ---- join / leave / note / delete ---------------------------------------
  const m = path.match(/^\/api\/flights\/(\d+)\/(join|leave)$/);
  if (m && method === 'POST') {
    const id = Number(m[1]);
    const action = m[2];
    const flight = findFlight(id);
    if (!flight) return json({ ok: false, error: 'not_found', message: 'Flight not found.' }, 404);

    if (action === 'join') {
      if (flight.passengers.some((p) => p.id === user.id)) {
        return json({ ok: false, error: 'already', message: 'You are already on this flight.' }, 409);
      }
      flight.passengers.push({ ...userInfo(user), note: null });
    } else {
      const before = flight.passengers.length;
      flight.passengers = flight.passengers.filter((p) => p.id !== user.id);
      if (flight.passengers.length === before) {
        return json({ ok: false, error: 'not_found', message: 'You are not on this flight.' }, 404);
      }
    }
    await saveBoard(board);
    return json({ ok: true, flight });
  }

  if (path === '/api/note' && method === 'POST') {
    return json({ ok: false, error: 'removed', message: 'Notes are no longer available.' }, 410);
  }

  // ---- cars ----------------------------------------------------------------
  if (path === '/api/cars' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const freeSeats = Math.max(1, Math.min(20, Number(body.freeSeats) || 0));
    const car = {
      id: board.nextId++,
      driver: userInfo(user),
      freeSeats,
      note: String(body.note || '').slice(0, 200) || null,
      riders: [],
    };
    board.cars.push(car);
    await saveBoard(board);
    return json({ ok: true, car });
  }

  const cm = path.match(/^\/api\/cars\/(\d+)\/(join|leave)$/);
  if (cm && method === 'POST') {
    const id = Number(cm[1]);
    const action = cm[2];
    const car = board.cars.find((c) => c.id === id);
    if (!car) return json({ ok: false, error: 'not_found', message: 'Car not found.' }, 404);

    if (action === 'join') {
      if (car.driver.id === user.id) {
        return json({ ok: false, error: 'driver', message: 'You are the driver of this car.' }, 409);
      }
      if (car.riders.some((r) => r.id === user.id)) {
        return json({ ok: false, error: 'already', message: 'You are already in this car.' }, 409);
      }
      if (car.riders.length >= car.freeSeats) {
        return json({ ok: false, error: 'full', message: 'This car is full.' }, 409);
      }
      car.riders.push(userInfo(user));
    } else {
      const before = car.riders.length;
      car.riders = car.riders.filter((r) => r.id !== user.id);
      if (car.riders.length === before) {
        return json({ ok: false, error: 'not_found', message: 'You are not in this car.' }, 404);
      }
    }
    await saveBoard(board);
    return json({ ok: true, car });
  }

  if (path === '/api/cars' && method === 'DELETE') {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    const car = board.cars.find((c) => c.id === id);
    if (!car) return json({ ok: false, error: 'not_found', message: 'Car not found.' }, 404);
    if (car.driver.id !== user.id) {
      return json({ ok: false, error: 'forbidden', message: 'Only the driver can delete this car.' }, 403);
    }
    board.cars = board.cars.filter((c) => c.id !== id);
    await saveBoard(board);
    return json({ ok: true });
  }

  if (path === '/api/flights' && method === 'DELETE') {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    const flight = findFlight(id);
    if (!flight) return json({ ok: false, error: 'not_found', message: 'Flight not found.' }, 404);
    if (flight.createdBy !== user.id) {
      return json({ ok: false, error: 'forbidden', message: 'Only the creator can delete it.' }, 403);
    }
    board.flights = board.flights.filter((f) => f.id !== id);
    await saveBoard(board);
    return json({ ok: true });
  }

  return json({ ok: false, error: 'not_found', message: 'Not found.' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    // Bind globals used by helpers above.
    globalThis.env = env;
    return handle(request);
  },
};
