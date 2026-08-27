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

const GROUP_ID = () => env.GROUP_ID; // comma-separated whitelist of chat ids
const BOT_TOKEN = () => env.BOT_TOKEN;
const FLIGHT_API_PROVIDER = () => env.FLIGHT_API_PROVIDER || '';
const FLIGHT_API_KEY = () => env.FLIGHT_API_KEY || '';

// Telegram user ids with full admin (override) rights. Add more ids as needed.
const ADMIN_IDS = new Set([
  128294574, // Axel (the app owner)
]);

// CORS: the Mini App is served from Telegram's webview; allow any origin.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
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

/** Parse the GROUP_ID secret as a whitelist: comma-separated chat ids. */
function allowedGroups() {
  return String(GROUP_ID())
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n !== 0);
}

async function getMembership(userId, chatId) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN()}/getChatMember`
    + `?chat_id=${chatId}&user_id=${userId}`;
  const res = await fetch(url);
  const body = await res.json();
  if (!body.ok) return { status: 'left' };
  return body.result;
}

function statusAllows(member) {
  let allowed = ALLOWED.has(member.status);
  if (member.status === 'restricted') allowed = member.is_member === true;
  return allowed;
}

async function isAllowedMember(userId) {
  // Short-term cache (5 min) to avoid hammering getChatMember on every call.
  const cacheKey = `member:${userId}`;
  const cached = await env.SAMFERD.get(cacheKey);
  if (cached !== null) {
    console.log('[auth] membership from cache:', userId, '=>', cached);
    return cached === 'yes';
  }

  // Whitelist: membership in ANY of the configured groups grants access.
  const groups = allowedGroups();
  let allowed = false;
  for (const chatId of groups) {
    const member = await getMembership(userId, chatId);
    console.log('[auth] getChatMember', chatId, 'status:', member.status, 'is_member:', member.is_member);
    if (statusAllows(member)) { allowed = true; break; }
  }

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
  // Cache the user's display info so drivers/admins can add them as car riders.
  await env.SAMFERD.put(`user:${user.id}`, JSON.stringify(userInfo(user)));
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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Samferd is planning-only, no archive: drop past flights and past cars.
// Returns true if anything was removed (so callers can persist the change).
function prunePast(board) {
  const today = todayISO();
  const before = board.flights.length + (board.cars || []).length;
  board.flights = board.flights.filter((f) => f.departureDate >= today);
  // Cars must carry a date to be grouped by day; missing-date legacy rows and
  // past dates are removed.
  board.cars = (board.cars || []).filter((c) => c.date && c.date >= today);
  const after = board.flights.length + board.cars.length;
  return before !== after;
}

function userInfo(u) {
  return {
    id: u.id,
    name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || `#${u.id}`,
    username: u.username || null,
  };
}

// ---------------------------------------------------------------------------
// Flight-data enrichment (AirLabs) — cached per flight number + date
// ---------------------------------------------------------------------------
//
// To minimize API usage, we call AirLabs ONLY the first time a given
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
  if (provider === 'airlabs') {
    data = await fetchAirLabs(flightNumber, departureDate);
  }

  // 3. Cache whatever we got (including null → empty string).
  await env.SAMFERD.put(cacheKey, data ? JSON.stringify(data) : '');
  return data;
}

async function fetchAirLabs(flightNumber, departureDate) {
  // AirLabs flight lookup by flight IATA code. The `flight_date` parameter
  // filters to a specific operating day (YYYY-MM-DD).
  const url = 'https://airlabs.co/api/v9/flight'
    + `?api_key=${encodeURIComponent(FLIGHT_API_KEY())}`
    + `&flight_iata=${encodeURIComponent(flightNumber)}`
    + `&flight_date=${encodeURIComponent(departureDate)}`;
  try {
    const res = await fetch(url);
    const text = await res.text();
    console.log('[enrich] status:', res.status, 'flight:', flightNumber, departureDate);
    console.log('[enrich] body:', text.slice(0, 1000));
    if (!res.ok) return null;
    let body;
    try { body = JSON.parse(text); } catch { return null; }
    const f = body && body.response;
    if (!f) return null;

    // AirLabs returns nested objects: departure { airport, iata, time_utc, ... }
    const dep = f.dep || f.departure || {};
    const arr = f.arr || f.arrival || {};
    return {
      origin: dep.iata || dep.airport || null,
      destination: arr.iata || arr.airport || null,
      // AirLabs gives departure time in UTC ("time_utc": "2026-10-15T11:45:00Z").
      departureTime: toLocalHHMM(dep.time_utc),
      terminal: dep.terminal || null,
      gate: dep.gate || null,
    };
  } catch {
    return null;
  }
}

/** Convert an ISO UTC timestamp to a "HH:MM" string (keeps UTC; display-only). */
function toLocalHHMM(iso) {
  if (!iso) return null;
  const m = String(iso).match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : null;
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
  if (prunePast(board)) await saveBoard(board);
  const findFlight = (id) => board.flights.find((f) => f.id === id);

  // ---- auth check ----------------------------------------------------------
  if (path === '/api/auth') {
    return json({ ok: true, user: userInfo(user), isAdmin: ADMIN_IDS.has(user.id) });
  }

  // ---- board ---------------------------------------------------------------
  if (path === '/api/board' && method === 'GET') {
    const flights = board.flights
      .filter((f) => f.departureDate >= new Date().toISOString().slice(0, 10))
      .sort((a, b) => a.departureDate.localeCompare(b.departureDate) || a.id - b.id);

    // Known users (for the driver's passenger picker). Only exposed to
    // drivers/admins; it's display info only (name/username).
    let known = [];
    if (ADMIN_IDS.has(user.id) || (board.cars || []).some((c) => c.driver.id === user.id)) {
      const keys = await env.SAMFERD.list({ prefix: 'user:' });
      for (const k of keys.keys) {
        try { known.push(JSON.parse(await env.SAMFERD.get(k.name))); } catch {}
      }
      known.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }

    return json({ ok: true, flights, cars: board.cars, me: user.id, isAdmin: ADMIN_IDS.has(user.id), known });
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
      // One flight per day: joining a flight removes the user from every other
      // flight departing on the SAME date. Different days are unaffected.
      for (const other of board.flights) {
        if (other.id !== flight.id && other.departureDate === flight.departureDate) {
          other.passengers = other.passengers.filter((p) => p.id !== user.id);
        }
      }
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
    // Direction: 'outbound' = to the departure airport, 'return' = from the arrival airport.
    const direction = body.direction === 'return' ? 'return' : 'outbound';
    const date = String(body.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json({ ok: false, error: 'bad_date', message: 'Travel date must be YYYY-MM-DD.' }, 400);
    }
    const car = {
      id: board.nextId++,
      driver: userInfo(user),
      freeSeats,
      direction,
      date,
      note: String(body.note || '').slice(0, 200) || null,
      riders: [],
    };
    board.cars.push(car);
    await saveBoard(board);
    return json({ ok: true, car });
  }

  // Driver/admin manages a car's passenger list. Users cannot self-register:
  // seats are arranged out-of-band with the driver, who records them here.
  const cm = path.match(/^\/api\/cars\/(\d+)\/riders$/);
  if (cm && method === 'POST') {
    const id = Number(cm[1]);
    const car = board.cars.find((c) => c.id === id);
    if (!car) return json({ ok: false, error: 'not_found', message: 'Car not found.' }, 404);
    if (car.driver.id !== user.id && !ADMIN_IDS.has(user.id)) {
      return json({ ok: false, error: 'forbidden', message: 'Only the driver can manage passengers.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const riders = Array.isArray(body.riders) ? body.riders : [];
    if (riders.length > car.freeSeats) {
      return json({ ok: false, error: 'full', message: `This car has only ${car.freeSeats} seat(s).` }, 400);
    }
    // Riders must be known users (seen in the app) and not the driver.
    const clean = [];
    for (const r of riders) {
      const rid = Number(r && r.id);
      if (!Number.isFinite(rid)) continue;
      if (rid === car.driver.id) continue;
      const known = await env.SAMFERD.get(`user:${rid}`);
      if (known === null) continue; // unknown user — skip
      let info;
      try { info = JSON.parse(known); } catch { continue; }
      clean.push({
        id: info.id || rid,
        name: info.name || `#${rid}`,
        username: info.username ?? null,
      });
    }
    car.riders = clean;
    await saveBoard(board);
    return json({ ok: true, car });
  }

  // Toggle a car's direction (driver or admin only).
  const dm = path.match(/^\/api\/cars\/(\d+)\/direction$/);
  if (dm && method === 'POST') {
    const id = Number(dm[1]);
    const car = board.cars.find((c) => c.id === id);
    if (!car) return json({ ok: false, error: 'not_found', message: 'Car not found.' }, 404);
    if (car.driver.id !== user.id && !ADMIN_IDS.has(user.id)) {
      return json({ ok: false, error: 'forbidden', message: 'Only the driver can change this.' }, 403);
    }
    car.direction = car.direction === 'return' ? 'outbound' : 'return';
    await saveBoard(board);
    return json({ ok: true, car });
  }

  if (path === '/api/cars' && method === 'DELETE') {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    const car = board.cars.find((c) => c.id === id);
    if (!car) return json({ ok: false, error: 'not_found', message: 'Car not found.' }, 404);
    // Creator OR admin may delete.
    if (car.driver.id !== user.id && !ADMIN_IDS.has(user.id)) {
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
    // Creator OR admin may delete.
    if (flight.createdBy !== user.id && !ADMIN_IDS.has(user.id)) {
      return json({ ok: false, error: 'forbidden', message: 'Only the creator can delete it.' }, 403);
    }
    board.flights = board.flights.filter((f) => f.id !== id);
    await saveBoard(board);
    return json({ ok: true });
  }

  // ---- admin: edit flight info -------------------------------------------
  if (path === '/api/flights' && method === 'PATCH') {
    if (!ADMIN_IDS.has(user.id)) {
      return json({ ok: false, error: 'forbidden', message: 'Admin only.' }, 403);
    }
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    const flight = findFlight(id);
    if (!flight) return json({ ok: false, error: 'not_found', message: 'Flight not found.' }, 404);

    if ('departureDate' in body) {
      const d = String(body.departureDate || '');
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        return json({ ok: false, error: 'bad_date', message: 'Date must be YYYY-MM-DD.' }, 400);
      }
      flight.departureDate = d || flight.departureDate;
    }
    if ('flightNumber' in body) {
      const n = String(body.flightNumber || '').toUpperCase().replace(/[\s-]/g, '');
      if (n && !/^[A-Z0-9]{2}\d{1,4}$/.test(n)) {
        return json({ ok: false, error: 'bad_flight', message: 'Invalid flight number.' }, 400);
      }
      if (n) flight.flightNumber = n;
    }
    // Departure city/airport, time, and other info.
    for (const f of ['origin', 'destination', 'departureTime', 'terminal', 'gate', 'status']) {
      if (f in body) flight[f] = body[f] ? String(body[f]) : null;
    }

    await saveBoard(board);
    return json({ ok: true, flight });
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
