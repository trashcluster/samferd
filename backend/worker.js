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
const RAPIDAPI_KEY = () => env.RAPIDAPI_KEY || '';

// Admin rights are NOT hardcoded: they are derived live from the user's
// Telegram role in the selected group (creator/administrator).

// CORS: the Mini App is served from Telegram's webview; allow any origin.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  // X-Group-Id selects the group's board — must be allowed in preflight.
  'Access-Control-Allow-Headers': 'Content-Type, X-Init-Data, X-Group-Id',
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
  if (!body.ok) {
    // Log the Bot API error — this is where lost-admin / wrong-id problems show.
    console.log('[auth] getChatMember FAILED for', chatId, 'user', userId,
      'code:', body.error_code, 'desc:', body.description);
    return { status: 'left' };
  }
  console.log('[auth] getChatMember OK for', chatId, 'user', userId,
    'status:', body.result.status);
  return body.result;
}

function statusAllows(member) {
  let allowed = ALLOWED.has(member.status);
  if (member.status === 'restricted') allowed = member.is_member === true;
  return allowed;
}

/** Is this Telegram role an app-admin in the group? */
function statusIsAdmin(member) {
  return member.status === 'creator' || member.status === 'administrator';
}

/**
 * Resolve the user's memberships across all whitelisted groups.
 * Also maintains the group lifecycle registry:
 *   group:<id>  → { title, photoUrl, botAdmin }  (bot's view of the group)
 * Boards are auto-created (materialized) for groups where the bot is admin.
 * When the bot loses admin in a group, the board is marked for deletion and
 * purged a day later (see sweepStaleBoards).
 * @returns {Promise<Array<{id:number, title:string, photoUrl:string|null, member:boolean, admin:boolean}>>}
 */
async function resolveGroups(userId) {
  const groups = [];
  for (const chatId of allowedGroups()) {
    const member = await getMembership(userId, chatId);
    const isMember = statusAllows(member);
    console.log('[auth] group', chatId, '→ member:', isMember, 'admin:', statusIsAdmin(member));
    if (!isMember) continue;

    // --- Group lifecycle: track whether the bot is still admin in this group.
    const regKey = `group:${chatId}`;
    const regRaw = await env.SAMFERD.get(regKey);
    let reg;
    try { reg = regRaw ? JSON.parse(regRaw) : null; } catch { reg = null; }
    if (!reg || typeof reg !== 'object') {
      reg = { title: `Group ${chatId}`, photoUrl: null, botAdmin: null, pendingDeleteAt: null };
    }
    const botAdmin = statusIsAdmin(await getMembership(await botId(), chatId));

    if (botAdmin) {
      // Bot is admin: (re-)activate the group and ensure its board exists.
      if (!reg || !reg.botAdmin) {
        console.log('[lifecycle] bot is admin of', chatId, '— board active');
      }
      const boardRaw = await env.SAMFERD.get(`board:${chatId}`);
      if (boardRaw === null) {
        await saveBoard(chatId, { nextId: 1, flights: [], cars: [] });
        console.log('[lifecycle] auto-created board for group', chatId);
      }
      if (reg && reg.pendingDeleteAt) {
        // Bot regained admin before the purge — cancel the pending deletion.
        console.log('[lifecycle] bot regained admin of', chatId, '— deletion cancelled');
        delete reg.pendingDeleteAt;
      }
    } else {
      // Bot lost admin: mark the board for deletion in 24 h (once).
      if (!reg.pendingDeleteAt) {
        console.log('[lifecycle] bot lost admin of', chatId, '— board marked for deletion in 24h');
      }
      reg.pendingDeleteAt = reg.pendingDeleteAt || (Date.now() + 24 * 3600 * 1000);
    }

    // Fetch group name + photo (best-effort; the app works without them).
    let title = reg?.title || `Group ${chatId}`;
    let photoUrl = reg?.photoUrl || null;
    try {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN()}/getChat?chat_id=${chatId}`);
      const body = await res.json();
      if (body.ok && body.result) {
        title = body.result.title || body.result.username || title;
        const fileId = body.result.photo?.big_file_id;
        if (fileId) {
          const fr = await fetch(`https://api.telegram.org/bot${BOT_TOKEN()}/getFile?file_id=${encodeURIComponent(fileId)}`);
          const fb = await fr.json();
          if (fb.ok && fb.result?.file_path) {
            photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN()}/${fb.result.file_path}`;
          }
        }
      }
    } catch { /* keep cached defaults */ }

    // Persist the registry entry (no expiry; it's the bot's group registry).
    await env.SAMFERD.put(regKey, JSON.stringify({ title, photoUrl, botAdmin, pendingDeleteAt: reg.pendingDeleteAt || null }));

    groups.push({
      id: chatId,
      title,
      photoUrl,
      member: true,
      admin: statusIsAdmin(member),
      botAdmin,
    });
  }
  return groups;
}

/** The bot's own Telegram id (cached — getMe never changes). */
async function botId() {
  if (env._botId) return env._botId;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN()}/getMe`);
  const body = await res.json();
  env._botId = body.ok ? body.result.id : 0;
  return env._botId;
}

/**
 * Purge boards whose group lost bot-admin more than 24 h ago.
 * Runs opportunistically on group resolution (no scheduler needed).
 */
async function sweepStaleBoards() {
  const keys = await env.SAMFERD.list({ prefix: 'group:' });
  const now = Date.now();
  for (const k of keys.keys) {
    const raw = await env.SAMFERD.get(k.name);
    if (!raw) continue;
    let reg;
    try { reg = JSON.parse(raw); } catch { continue; }
    if (reg.pendingDeleteAt && reg.pendingDeleteAt <= now) {
      const chatId = k.name.slice('group:'.length);
      await env.SAMFERD.delete(`board:${chatId}`);
      await env.SAMFERD.delete(k.name);
      console.log('[lifecycle] purged board for group', chatId, '(bot not admin for >24h)');
    }
  }
}

/**
 * Auth for a group-scoped request. Returns { user, group, isAdmin } or null.
 * The target group comes from the X-Group-Id header; the user must be a
 * member of it. Admin rights are the user's Telegram role in that group.
 */
async function authUser(request) {
  const initData = request.headers.get('X-Init-Data') || '';
  const user = await validateInitData(initData, BOT_TOKEN());
  if (!user || user.is_bot) {
    console.log('[auth] authUser failed at initData/is_bot stage');
    return null;
  }

  const groupId = Number(request.headers.get('X-Group-Id') || 0);
  const groups = await resolveGroups(user.id);
  if (!groups.length) {
    console.log('[auth] user is not a member of any whitelisted group:', user.id);
    return null;
  }

  // Default to the first group when none specified (or invalid).
  const group = groups.find((g) => g.id === groupId) || groups[0];

  // Cache the user's display info so drivers/admins can add them as riders.
  await env.SAMFERD.put(`user:${user.id}`, JSON.stringify(userInfo(user)));

  return { user, group, groups, isAdmin: group.admin };
}

// ---------------------------------------------------------------------------
// Board storage (one JSON document per group in KV)
// ---------------------------------------------------------------------------

async function loadBoard(groupId) {
  const raw = await env.SAMFERD.get(`board:${groupId}`);
  const board = raw ? JSON.parse(raw) : {};
  return {
    nextId: board.nextId || 1,
    flights: board.flights || [],
    cars: board.cars || [],
  };
}

async function saveBoard(groupId, board) {
  await env.SAMFERD.put(`board:${groupId}`, JSON.stringify(board));
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

/** Can this user manage (edit passengers / modify / delete) this car? */
function canManageCar(car, user, isAdmin) {
  return car.driver.id === user.id
    || car.createdBy === user.id
    || isAdmin === true;
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
  if (!provider || provider === 'none') {
    console.log('[enrich] disabled — FLIGHT_API_PROVIDER is', provider || '(empty)');
    return null; // enrichment disabled
  }
  console.log('[enrich] provider:', provider, 'flight:', flightNumber, departureDate);

  const cacheKey = ENRICH_PREFIX + flightNumber + ':' + departureDate;

  // 1. Return cached data if we've already resolved this flight+date.
  const cached = await env.SAMFERD.get(cacheKey);
  if (cached !== null) {
    return cached === '' ? null : JSON.parse(cached);
  }

  // 2. First time — call the provider.
  let data = null;
  if (provider === 'aerodatabox') {
    data = await fetchAeroDataBox(flightNumber, departureDate);
  } else if (provider === 'airlabs') {
    data = await fetchAirLabs(flightNumber, departureDate);
  }

  // 3. Cache the result. Successful data is kept permanently (a flight's
  // schedule for a given date doesn't change meaningfully). An EMPTY result is
  // cached only briefly: providers have a limited schedule horizon, so a
  // far-future flight may have no data today but will within a few weeks —
  // the short TTL makes it retry automatically as the date approaches.
  if (data) {
    await env.SAMFERD.put(cacheKey, JSON.stringify(data));
  } else {
    await env.SAMFERD.put(cacheKey, '', { expirationTtl: 6 * 3600 }); // retry in 6h
  }
  return data;
}

// AeroDataBox via RapidAPI. The API key is a Worker secret (RAPIDAPI_KEY),
// set with `wrangler secret put RAPIDAPI_KEY`.
async function fetchAeroDataBox(flightNumber, departureDate) {
  const apiKey = RAPIDAPI_KEY();
  if (!apiKey) {
    console.log('[enrich] no RAPIDAPI_KEY secret — AeroDataBox disabled');
    return null;
  }

  const url = `https://aerodatabox.p.rapidapi.com/flights/number/`
    + `${encodeURIComponent(flightNumber)}/${encodeURIComponent(departureDate)}`
    // 'Both' is the API's recommended role: matches flights departing OR
    // arriving on the date. A strict 'Departure' filter silently drops
    // schedule records classified by their arrival date.
    + '?withAircraftImage=false&withLocation=false&withFlightPlan=false&dateLocalRole=Both';
  try {
    const res = await fetch(url, {
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': 'aerodatabox.p.rapidapi.com',
      },
    });
    const text = await res.text();
    console.log('[enrich] status:', res.status, 'flight:', flightNumber, departureDate);
    console.log('[enrich] body:', text.slice(0, 1000));
    if (!res.ok) return null;
    let body;
    try { body = JSON.parse(text); } catch { return null; }
    // Response is an array of flights matching the number on that date.
    const flights = Array.isArray(body) ? body : [];
    if (!flights.length) return null;
    // Prefer the first flight with departure data.
    const f = flights.find((x) => x && x.departure && x.departure.airport) || flights[0];
    const dep = f.departure || {};
    const arr = f.arrival || {};
    const depAirport = dep.airport || {};
    const arrAirport = arr.airport || {};
    return {
      origin: depAirport.iata || depAirport.icao || depAirport.name || null,
      destination: arrAirport.iata || arrAirport.icao || arrAirport.name || null,
      // scheduledTime.local is the airport-local departure/arrival time.
      departureTime: toLocalHHMM(dep.scheduledTime?.local),
      arrivalTime: toLocalHHMM(arr.scheduledTime?.local),
      terminal: dep.terminal || null,
      gate: dep.gate || null,
      airline: f.airline?.name || null,
    };
  } catch {
    return null;
  }
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

  // Auth gate for every API route. auth resolves the user + selected group.
  const auth = await authUser(request);
  if (!auth) {
    return json({ ok: false, error: 'forbidden', message: 'You must be a member of a whitelisted group.' }, 403);
  }
  const { user, group, groups, isAdmin } = auth;

  // Opportunistic housekeeping: purge boards whose group lost bot-admin >24h ago.
  await sweepStaleBoards();

  const board = await loadBoard(group.id);
  if (prunePast(board)) await saveBoard(group.id, board);
  const findFlight = (id) => board.flights.find((f) => f.id === id);

  // ---- auth check ----------------------------------------------------------
  if (path === '/api/auth') {
    return json({ ok: true, user: userInfo(user), isAdmin, group, groups });
  }

  // ---- available groups (for the group picker) -----------------------------
  if (path === '/api/groups' && method === 'GET') {
    return json({ ok: true, groups, current: group.id });
  }

  // ---- bot-admin status per group (for the warning page) -------------------
  if (path === '/api/bot-status' && method === 'GET') {
    const all = allowedGroups().map(async (chatId) => {
      const regRaw = await env.SAMFERD.get(`group:${chatId}`);
      let reg = null;
      try { reg = regRaw ? JSON.parse(regRaw) : null; } catch {}
      return {
        id: chatId,
        title: reg?.title || `Group ${chatId}`,
        photoUrl: reg?.photoUrl || null,
        botAdmin: reg?.botAdmin === true,
      };
    });
    return json({ ok: true, groups: await Promise.all(all) });
  }

  // ---- board ---------------------------------------------------------------
  if (path === '/api/board' && method === 'GET') {
    const flights = board.flights
      .filter((f) => f.departureDate >= new Date().toISOString().slice(0, 10))
      .sort((a, b) => a.departureDate.localeCompare(b.departureDate) || a.id - b.id);

    // Known users (for the driver's passenger picker). Only exposed to
    // drivers/admins; it's display info only (name/username).
    let known = [];
    if (isAdmin || (board.cars || []).some((c) => c.driver.id === user.id)) {
      const keys = await env.SAMFERD.list({ prefix: 'user:' });
      for (const k of keys.keys) {
        try { known.push(JSON.parse(await env.SAMFERD.get(k.name))); } catch {}
      }
      known.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }

    return json({ ok: true, flights, cars: board.cars, me: user.id, isAdmin, known, group });
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
      arrivalTime: enrichment?.arrivalTime || null,
      terminal: enrichment?.terminal || null,
      gate: enrichment?.gate || null,
      airline: enrichment?.airline || null,
      status: null,
      createdBy: user.id,
      passengers: [],
    };
    board.flights.push(flight);
    await saveBoard(group.id, board);
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
    await saveBoard(group.id, board);
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
    // Mode of transport (car is the default for backwards compatibility).
    const MODES = ['car', 'rental', 'train', 'bus', 'shuttle', 'taxi', 'pickup', 'other'];
    const mode = MODES.includes(body.mode) ? body.mode : 'car';
    const date = String(body.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json({ ok: false, error: 'bad_date', message: 'Travel date must be YYYY-MM-DD.' }, 400);
    }
    // Admins may create on behalf of someone else (e.g. a less tech-savvy
    // driver). The owner must be a known user; defaults to the creator.
    let owner = userInfo(user);
    if (isAdmin && Number(body.onBehalfId)) {
      const known = await env.SAMFERD.get(`user:${Number(body.onBehalfId)}`);
      if (known) {
        try { owner = JSON.parse(known); } catch { /* keep creator */ }
      }
    }
    const car = {
      id: board.nextId++,
      driver: owner,
      createdBy: user.id,
      mode,
      freeSeats,
      direction,
      date,
      note: String(body.note || '').slice(0, 200) || null,
      // confirmed | provisional | cancelled (full is derived from seats)
      tripStatus: ['confirmed', 'provisional', 'cancelled'].includes(body.tripStatus)
        ? body.tripStatus : 'confirmed',
      riders: [],
    };
    board.cars.push(car);
    await saveBoard(group.id, board);
    return json({ ok: true, car });
  }

  // Driver/admin manages a car's passenger list. Users cannot self-register:
  // seats are arranged out-of-band with the driver, who records them here.
  const cm = path.match(/^\/api\/cars\/(\d+)\/riders$/);
  if (cm && method === 'POST') {
    const id = Number(cm[1]);
    const car = board.cars.find((c) => c.id === id);
    if (!car) return json({ ok: false, error: 'not_found', message: 'Car not found.' }, 404);
    if (!canManageCar(car, user, isAdmin)) {
      return json({ ok: false, error: 'forbidden', message: 'Only the driver can manage passengers.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const riders = Array.isArray(body.riders) ? body.riders : [];
    if (riders.length > car.freeSeats) {
      return json({ ok: false, error: 'full', message: `This car has only ${car.freeSeats} seat(s).` }, 400);
    }
    // Riders are either known users (matched by id against the user cache) or
    // custom entries with just a name (e.g. someone not yet in the group).
    // The driver is never a rider of their own car.
    const clean = [];
    for (const r of riders) {
      const name = String(r && r.name || '').trim().slice(0, 100);
      if (!name) continue;
      const rid = Number(r && r.id);
      if (Number.isFinite(rid) && rid > 0) {
        if (rid === car.driver.id) continue;
        const known = await env.SAMFERD.get(`user:${rid}`);
        if (known === null) continue; // unknown id — skip
        let info;
        try { info = JSON.parse(known); } catch { continue; }
        clean.push({
          id: info.id || rid,
          name: info.name || name || `#${rid}`,
          username: info.username ?? null,
        });
      } else {
        // Custom entry: display name only.
        clean.push({ id: null, name, username: null });
      }
    }
    car.riders = clean;
    await saveBoard(group.id, board);
    return json({ ok: true, car });
  }

  // Toggle a car's direction (driver or admin only).
  const dm = path.match(/^\/api\/cars\/(\d+)\/direction$/);
  if (dm && method === 'POST') {
    const id = Number(dm[1]);
    const car = board.cars.find((c) => c.id === id);
    if (!car) return json({ ok: false, error: 'not_found', message: 'Car not found.' }, 404);
    if (!canManageCar(car, user, isAdmin)) {
      return json({ ok: false, error: 'forbidden', message: 'Only the driver can change this.' }, 403);
    }
    car.direction = car.direction === 'return' ? 'outbound' : 'return';
    await saveBoard(group.id, board);
    return json({ ok: true, car });
  }

  // Edit a car (driver or admin only): date, direction, seats, status, note.
  if (path === '/api/cars' && method === 'PATCH') {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    const car = board.cars.find((c) => c.id === id);
    if (!car) return json({ ok: false, error: 'not_found', message: 'Car not found.' }, 404);
    if (!canManageCar(car, user, isAdmin)) {
      return json({ ok: false, error: 'forbidden', message: 'Only the driver can modify this car.' }, 403);
    }
    if ('date' in body) {
      const d = String(body.date || '');
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        return json({ ok: false, error: 'bad_date', message: 'Date must be YYYY-MM-DD.' }, 400);
      }
      if (d) car.date = d;
    }
    if ('direction' in body && ['outbound', 'return'].includes(body.direction)) {
      car.direction = body.direction;
    }
    if ('freeSeats' in body) {
      const seats = Math.max(1, Math.min(20, Number(body.freeSeats) || car.freeSeats));
      if (seats < car.riders.length) {
        return json({ ok: false, error: 'full', message: `Cannot set capacity below the ${car.riders.length} confirmed passenger(s).` }, 400);
      }
      car.freeSeats = seats;
    }
    if ('tripStatus' in body) {
      if (!['confirmed', 'provisional', 'cancelled'].includes(body.tripStatus)) {
        return json({ ok: false, error: 'bad_status', message: 'Invalid status.' }, 400);
      }
      car.tripStatus = body.tripStatus;
    }
    if ('note' in body) car.note = String(body.note || '').slice(0, 200) || null;
    await saveBoard(group.id, board);
    return json({ ok: true, car });
  }

  // Set a car's trip status (driver or admin only).
  const sm = path.match(/^\/api\/cars\/(\d+)\/status$/);
  if (sm && method === 'POST') {
    const id = Number(sm[1]);
    const car = board.cars.find((c) => c.id === id);
    if (!car) return json({ ok: false, error: 'not_found', message: 'Car not found.' }, 404);
    if (!canManageCar(car, user, isAdmin)) {
      return json({ ok: false, error: 'forbidden', message: 'Only the driver can change this.' }, 403);
    }
    const body = await request.json().catch(() => ({}));
    if (!['confirmed', 'provisional', 'cancelled'].includes(body.tripStatus)) {
      return json({ ok: false, error: 'bad_status', message: 'Invalid status.' }, 400);
    }
    car.tripStatus = body.tripStatus;
    await saveBoard(group.id, board);
    return json({ ok: true, car });
  }

  if (path === '/api/cars' && method === 'DELETE') {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    const car = board.cars.find((c) => c.id === id);
    if (!car) return json({ ok: false, error: 'not_found', message: 'Car not found.' }, 404);
    // Creator (who may be an admin acting on behalf) OR admin may delete.
    if (!canManageCar(car, user, isAdmin)) {
      return json({ ok: false, error: 'forbidden', message: 'Only the driver can delete this car.' }, 403);
    }
    board.cars = board.cars.filter((c) => c.id !== id);
    await saveBoard(group.id, board);
    return json({ ok: true });
  }

  if (path === '/api/flights' && method === 'DELETE') {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    const flight = findFlight(id);
    if (!flight) return json({ ok: false, error: 'not_found', message: 'Flight not found.' }, 404);
    // Creator OR admin may delete.
    if (flight.createdBy !== user.id && !isAdmin) {
      return json({ ok: false, error: 'forbidden', message: 'Only the creator can delete it.' }, 403);
    }
    board.flights = board.flights.filter((f) => f.id !== id);
    await saveBoard(group.id, board);
    return json({ ok: true });
  }

  // ---- admin: edit flight info -------------------------------------------
  if (path === '/api/flights' && method === 'PATCH') {
    if (!isAdmin) {
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
    // Departure city/airport, times, and other info.
    for (const f of ['origin', 'destination', 'departureTime', 'arrivalTime', 'terminal', 'gate', 'airline', 'status']) {
      if (f in body) flight[f] = body[f] ? String(body[f]) : null;
    }

    await saveBoard(group.id, board);
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
