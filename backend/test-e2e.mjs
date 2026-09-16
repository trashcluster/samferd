// test-e2e.mjs — automated end-to-end regression tests for the Samferd backend.
//
// Spoofs the Telegram Mini App identity by signing initData locally with the
// bot token (the same HMAC the real Telegram server performs). The bot token
// is NEVER sent to the API — it is only used to compute the signature.
//
// Usage:
//   $env:BOT_TOKEN = "123456:ABC..."     (from @BotFather)
//   node test-e2e.mjs                    (tests the production Worker)
//   node test-e2e.mjs --local            (tests wrangler dev on :8787)
//
// The script uses the real group ids from the GROUP_ID whitelist and the real
// user 128294574 (admin of -1003390132628, plain member of -1004475085649),
// plus a fake user id to exercise the non-member path. All created flights
// and cars are deleted again at the end (also on failure).

import crypto from 'crypto';

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('Set BOT_TOKEN env var first:  $env:BOT_TOKEN = "123456:ABC..."');
  process.exit(1);
}

const LOCAL = process.argv.includes('--local');
const API = LOCAL ? 'http://127.0.0.1:8787' : 'https://samferd.info473.workers.dev';

const ADMIN_USER = { id: 128294574, first_name: 'Axel', last_name: 'Steciuk', username: 'axelst', language_code: 'fr' };
const GROUP_ADMIN = -1003390132628;  // user is creator/admin here
const GROUP_MEMBER = -1004475085649; // user is plain member here
const FAKE_USER = { id: 999999001, first_name: 'Fake', username: 'fake_user' };

const FAR = '2030-06-10'; // far-future date: never pruned, never collides
const FAR2 = '2030-06-11';
const FAR3 = '2030-06-12';

// --- initData signing (mirrors Telegram's spec exactly) ---------------------

function signInitData(user) {
  const params = new URLSearchParams();
  params.set('user', JSON.stringify(user));
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  // hash/signature are excluded from the check string; omit them entirely.
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

// --- tiny test harness -------------------------------------------------------

const results = [];
let ctx = {}; // shared state between scenarios (ids etc.)

async function api(initData, groupId, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Init-Data': initData,
      ...(groupId ? { 'X-Group-Id': String(groupId) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, data };
}

async function test(name, fn) {
  try {
    await fn(ctx);
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

const adminInit = signInitData(ADMIN_USER);
const fakeInit = signInitData(FAKE_USER);

console.log(`Samferd E2E regression tests → ${API}${LOCAL ? ' (local)' : ''}\n`);

// ===========================================================================
console.log('— Authentication & authorization —');
// ===========================================================================

await test('auth: valid initData accepted, admin in Samferd group', async () => {
  const r = await api(adminInit, GROUP_ADMIN, 'GET', '/api/auth');
  assert(r.status === 200, `status ${r.status}: ${JSON.stringify(r.data)}`);
  assert(r.data.ok === true, 'ok !== true');
  assert(r.data.user.id === ADMIN_USER.id, 'wrong user');
  assert(r.data.isAdmin === true, 'expected isAdmin=true in Samferd group');
  assert(r.data.group.id === GROUP_ADMIN, 'wrong group echoed');
});

await test('auth: no initData rejected (403)', async () => {
  const r = await api('', GROUP_ADMIN, 'GET', '/api/auth');
  assert(r.status === 403, `status ${r.status}, expected 403`);
});

await test('auth: non-member user rejected (403)', async () => {
  const r = await api(fakeInit, GROUP_ADMIN, 'GET', '/api/auth');
  assert(r.status === 403, `status ${r.status}, expected 403`);
});

await test('auth: tampered initData rejected (403)', async () => {
  const tampered = adminInit.replace(/auth_date=\d+/, 'auth_date=1000000000');
  const r = await api(tampered, GROUP_ADMIN, 'GET', '/api/auth');
  assert(r.status === 403, `status ${r.status}, expected 403`);
});

await test('groups: admin sees both whitelisted groups with correct roles', async () => {
  const r = await api(adminInit, GROUP_ADMIN, 'GET', '/api/groups');
  assert(r.status === 200, `status ${r.status}`);
  const groups = r.data.groups || [];
  assert(groups.length === 2, `expected 2 groups, got ${groups.length}`);
  const ga = groups.find((g) => g.id === GROUP_ADMIN);
  const gm = groups.find((g) => g.id === GROUP_MEMBER);
  assert(ga?.admin === true, 'expected admin=true in Samferd group');
  assert(gm?.admin === false, 'expected admin=false in Brunstad group');
});

await test('admin rights are per-group: plain member in Brunstad group', async () => {
  const r = await api(adminInit, GROUP_MEMBER, 'GET', '/api/auth');
  assert(r.status === 200, `status ${r.status}`);
  assert(r.data.isAdmin === false, 'expected isAdmin=false in Brunstad group');
  assert(r.data.group.id === GROUP_MEMBER, 'X-Group-Id not honored');
});

// ===========================================================================
console.log('\n— Flight creation & validation —');
// ===========================================================================

await test('flights: invalid flight number rejected (400)', async () => {
  const r = await api(adminInit, GROUP_ADMIN, 'POST', '/api/flights', { flightNumber: 'XX', departureDate: FAR });
  assert(r.status === 400, `status ${r.status}, expected 400`);
});

await test('flights: invalid date rejected (400)', async () => {
  const r = await api(adminInit, GROUP_ADMIN, 'POST', '/api/flights', { flightNumber: 'ZZ100', departureDate: '10/15/2030' });
  assert(r.status === 400, `status ${r.status}, expected 400`);
});

await test('flights: create with manual legs succeeds', async () => {
  const r = await api(adminInit, GROUP_ADMIN, 'POST', '/api/flights', {
    flightNumber: 'TS100', departureDate: FAR,
    legs: [
      { origin: 'OSL', destination: 'FRA', departureTime: '08:00', arrivalTime: null },
      { origin: 'FRA', destination: 'BRU', departureTime: null, arrivalTime: '14:00' },
    ],
  });
  assert(r.status === 200, `status ${r.status}: ${JSON.stringify(r.data)}`);
  ctx.ts100 = r.data.flight.id;
  assert(r.data.flight.legs?.length === 2, 'expected 2 legs');
  assert(r.data.flight.origin === 'OSL' && r.data.flight.destination === 'BRU', 'wrong journey summary');
});

await test('flights: duplicate flight+date rejected (409)', async () => {
  const r = await api(adminInit, GROUP_ADMIN, 'POST', '/api/flights', { flightNumber: 'TS100', departureDate: FAR });
  assert(r.status === 409, `status ${r.status}, expected 409`);
});

// ===========================================================================
console.log('\n— Join / leave / one-flight-per-day —');
// ===========================================================================

await test('flights: join then leave works', async () => {
  let r = await api(adminInit, GROUP_ADMIN, 'POST', `/api/flights/${ctx.ts100}/join`);
  assert(r.status === 200 && r.data.flight.passengers.some((p) => p.id === ADMIN_USER.id), 'join failed');
  r = await api(adminInit, GROUP_ADMIN, 'POST', `/api/flights/${ctx.ts100}/leave`);
  assert(r.status === 200 && !r.data.flight.passengers.some((p) => p.id === ADMIN_USER.id), 'leave failed');
});

await test('flights: joining a second flight same day removes from the first', async () => {
  // Second flight on the SAME date.
  const c = await api(adminInit, GROUP_ADMIN, 'POST', '/api/flights', {
    flightNumber: 'TS101', departureDate: FAR,
    legs: [{ origin: 'BRU', destination: 'AMS', departureTime: '20:00', arrivalTime: '21:30' }],
  });
  ctx.ts101 = c.data.flight.id;
  await api(adminInit, GROUP_ADMIN, 'POST', `/api/flights/${ctx.ts100}/join`);
  const r = await api(adminInit, GROUP_ADMIN, 'POST', `/api/flights/${ctx.ts101}/join`);
  assert(r.status === 200, `status ${r.status}`);
  const board = await api(adminInit, GROUP_ADMIN, 'GET', '/api/board');
  const f1 = board.data.flights.find((f) => f.id === ctx.ts100);
  const f2 = board.data.flights.find((f) => f.id === ctx.ts101);
  assert(!f1.passengers.some((p) => p.id === ADMIN_USER.id), 'still on first flight');
  assert(f2.passengers.some((p) => p.id === ADMIN_USER.id), 'not on second flight');
});

// ===========================================================================
console.log('\n— Multi-leg auto-merging —');
// ===========================================================================

await test('merge: two chaining flights merge (added in order)', async () => {
  const a = await api(adminInit, GROUP_ADMIN, 'POST', '/api/flights', {
    flightNumber: 'TM201', departureDate: FAR2,
    legs: [{ origin: 'OSL', destination: 'FRA', departureTime: '08:00', arrivalTime: '10:00' }],
  });
  const b = await api(adminInit, GROUP_ADMIN, 'POST', '/api/flights', {
    flightNumber: 'TM202', departureDate: FAR2,
    legs: [{ origin: 'FRA', destination: 'BRU', departureTime: '12:00', arrivalTime: '14:00' }],
  });
  ctx.merge2 = [a.data.flight.id, b.data.flight.id];
  assert(b.data.mergedInto === 'TM201', `expected merge into TM201, got ${b.data.mergedInto}`);
  const board = await api(adminInit, GROUP_ADMIN, 'GET', '/api/board');
  const merged = board.data.flights.find((f) => f.id === a.data.flight.id);
  assert(merged, 'merged flight missing from board');
  assert(!board.data.flights.some((f) => f.id === b.data.flight.id), 'absorbed flight still on board');
  assert(merged.legs?.length === 2, `expected 2 legs, got ${merged.legs?.length}`);
  assert(merged.origin === 'OSL' && merged.destination === 'BRU', 'wrong journey endpoints');
});

await test('merge: order-independent (last leg added first)', async () => {
  const last = await api(adminInit, GROUP_ADMIN, 'POST', '/api/flights', {
    flightNumber: 'TM301', departureDate: FAR3,
    legs: [{ origin: 'FRA', destination: 'BRU', departureTime: '12:00', arrivalTime: '14:00' }],
  });
  const first = await api(adminInit, GROUP_ADMIN, 'POST', '/api/flights', {
    flightNumber: 'TM302', departureDate: FAR3,
    legs: [{ origin: 'OSL', destination: 'FRA', departureTime: '08:00', arrivalTime: '10:00' }],
  });
  ctx.merge3 = [last.data.flight.id, first.data.flight.id];
  assert(first.data.mergedInto === 'TM301', `expected merge into TM301, got ${first.data.mergedInto}`);
  const board = await api(adminInit, GROUP_ADMIN, 'GET', '/api/board');
  const merged = board.data.flights.find((f) => f.id === last.data.flight.id);
  assert(merged?.legs?.length === 2, 'expected merged 2-leg flight');
});

await test('merge: three legs chain into one itinerary (any order)', async () => {
  const c = await api(adminInit, GROUP_ADMIN, 'POST', '/api/flights', {
    flightNumber: 'TM403', departureDate: '2030-06-13',
    legs: [{ origin: 'BRU', destination: 'LUX', departureTime: '18:00', arrivalTime: '19:00' }],
  });
  const a = await api(adminInit, GROUP_ADMIN, 'POST', '/api/flights', {
    flightNumber: 'TM401', departureDate: '2030-06-13',
    legs: [{ origin: 'OSL', destination: 'FRA', departureTime: '08:00', arrivalTime: '10:00' }],
  });
  const b = await api(adminInit, GROUP_ADMIN, 'POST', '/api/flights', {
    flightNumber: 'TM402', departureDate: '2030-06-13',
    legs: [{ origin: 'FRA', destination: 'BRU', departureTime: '12:00', arrivalTime: '14:00' }],
  });
  ctx.merge4 = [c.data.flight.id, a.data.flight.id, b.data.flight.id];
  assert(b.data.mergedInto === 'TM401', `b should merge into TM401, got ${b.data.mergedInto}`);
  assert(c.data.mergedInto === 'TM401', `c should merge into TM401, got ${c.data.mergedInto}`);
  const board = await api(adminInit, GROUP_ADMIN, 'GET', '/api/board');
  const merged = board.data.flights.find((f) => f.id === a.data.flight.id);
  assert(merged?.legs?.length === 3, `expected 3 legs, got ${merged?.legs?.length}`);
  assert(merged.origin === 'OSL' && merged.destination === 'LUX', 'wrong 3-leg endpoints');
});

await test('merge: non-chaining flights stay separate', async () => {
  const a = await api(adminInit, GROUP_ADMIN, 'POST', '/api/flights', {
    flightNumber: 'TM501', departureDate: '2030-06-14',
    legs: [{ origin: 'OSL', destination: 'FRA', departureTime: '08:00', arrivalTime: '10:00' }],
  });
  const b = await api(adminInit, GROUP_ADMIN, 'POST', '/api/flights', {
    flightNumber: 'TM502', departureDate: '2030-06-14',
    legs: [{ origin: 'BRU', destination: 'AMS', departureTime: '12:00', arrivalTime: '14:00' }],
  });
  ctx.merge5 = [a.data.flight.id, b.data.flight.id];
  assert(b.data.mergedInto == null, 'flights with unlinked airports must not merge');
  const board = await api(adminInit, GROUP_ADMIN, 'GET', '/api/board');
  assert(board.data.flights.some((f) => f.id === a.data.flight.id)
    && board.data.flights.some((f) => f.id === b.data.flight.id), 'both flights should exist');
});

await test('merge: out-of-order times do not chain', async () => {
  const a = await api(adminInit, GROUP_ADMIN, 'POST', '/api/flights', {
    flightNumber: 'TM601', departureDate: '2030-06-15',
    legs: [{ origin: 'OSL', destination: 'FRA', departureTime: '14:00', arrivalTime: '16:00' }],
  });
  const b = await api(adminInit, GROUP_ADMIN, 'POST', '/api/flights', {
    flightNumber: 'TM602', departureDate: '2030-06-15',
    legs: [{ origin: 'FRA', destination: 'BRU', departureTime: '08:00', arrivalTime: '10:00' }],
  });
  ctx.merge6 = [a.data.flight.id, b.data.flight.id];
  assert(b.data.mergedInto == null, 'earlier departure must not chain after later arrival');
});

await test('merge: passengers survive the merge', async () => {
  // Join the first leg, then add a chaining second leg: the passenger must
  // end up on the merged flight.
  const a = await api(adminInit, GROUP_ADMIN, 'POST', '/api/flights', {
    flightNumber: 'TM701', departureDate: '2030-06-16',
    legs: [{ origin: 'OSL', destination: 'FRA', departureTime: '08:00', arrivalTime: '10:00' }],
  });
  await api(adminInit, GROUP_ADMIN, 'POST', `/api/flights/${a.data.flight.id}/join`);
  const b = await api(adminInit, GROUP_ADMIN, 'POST', '/api/flights', {
    flightNumber: 'TM702', departureDate: '2030-06-16',
    legs: [{ origin: 'FRA', destination: 'BRU', departureTime: '12:00', arrivalTime: '14:00' }],
  });
  ctx.merge7 = [a.data.flight.id, b.data.flight.id];
  const board = await api(adminInit, GROUP_ADMIN, 'GET', '/api/board');
  const merged = board.data.flights.find((f) => f.id === a.data.flight.id);
  assert(merged?.passengers?.some((p) => p.id === ADMIN_USER.id), 'passenger lost in merge');
});

await test('admin override: leg-edited flight is pinned and never re-merges', async () => {
  // Create a pinned single-leg flight, then add a flight that would chain.
  const a = await api(adminInit, GROUP_ADMIN, 'POST', '/api/flights', {
    flightNumber: 'TM801', departureDate: '2030-06-17',
    legs: [{ origin: 'OSL', destination: 'FRA', departureTime: '08:00', arrivalTime: '10:00' }],
  });
  const p = await api(adminInit, GROUP_ADMIN, 'PATCH', '/api/flights', {
    id: a.data.flight.id,
    legs: [{ origin: 'OSL', destination: 'FRA', departureTime: '08:00', arrivalTime: '10:00' }],
  });
  assert(p.status === 200, `PATCH failed: ${p.status}`);
  const b = await api(adminInit, GROUP_ADMIN, 'POST', '/api/flights', {
    flightNumber: 'TM802', departureDate: '2030-06-17',
    legs: [{ origin: 'FRA', destination: 'BRU', departureTime: '12:00', arrivalTime: '14:00' }],
  });
  ctx.merge8 = [a.data.flight.id, b.data.flight.id];
  assert(b.data.mergedInto == null, 'pinned flight must not auto-merge');
  const board = await api(adminInit, GROUP_ADMIN, 'GET', '/api/board');
  assert(board.data.flights.some((f) => f.id === a.data.flight.id)
    && board.data.flights.some((f) => f.id === b.data.flight.id), 'both flights should remain separate');
});

// ===========================================================================
console.log('\n— Admin flight editing & permissions —');
// ===========================================================================

await test('admin: PATCH flight info works', async () => {
  const r = await api(adminInit, GROUP_ADMIN, 'PATCH', '/api/flights', {
    id: ctx.ts100, airline: 'TestAir', terminal: '2',
  });
  assert(r.status === 200 && r.data.flight.airline === 'TestAir' && r.data.flight.terminal === '2',
    `status ${r.status}: ${JSON.stringify(r.data)}`);
});

await test('permissions: non-admin cannot PATCH flights (403)', async () => {
  const r = await api(adminInit, GROUP_MEMBER, 'PATCH', '/api/flights', { id: ctx.ts100, airline: 'Hax' });
  assert(r.status === 403, `status ${r.status}, expected 403`);
});

await test('permissions: non-admin cannot DELETE flights (403)', async () => {
  const r = await api(adminInit, GROUP_MEMBER, 'DELETE', '/api/flights', { id: ctx.ts100 });
  assert(r.status === 403, `status ${r.status}, expected 403`);
});

// ===========================================================================
console.log('\n— Cars / transport —');
// ===========================================================================

await test('cars: create with mode, seats, direction, status', async () => {
  const r = await api(adminInit, GROUP_ADMIN, 'POST', '/api/cars', {
    freeSeats: 4, direction: 'outbound', date: FAR, mode: 'rental', tripStatus: 'provisional', note: 'test car',
  });
  assert(r.status === 200, `status ${r.status}: ${JSON.stringify(r.data)}`);
  ctx.car = r.data.car.id;
  assert(r.data.car.mode === 'rental' && r.data.car.tripStatus === 'provisional', 'wrong car fields');
});

await test('cars: driver can set riders (custom names + known users)', async () => {
  const r = await api(adminInit, GROUP_ADMIN, 'POST', `/api/cars/${ctx.car}/riders`, {
    riders: [{ name: 'Custom Person' }, { id: ADMIN_USER.id, name: 'x' }],
  });
  assert(r.status === 200, `status ${r.status}: ${JSON.stringify(r.data)}`);
  assert(r.data.car.riders.length === 2, `expected 2 riders, got ${r.data.car.riders.length}`);
  assert(r.data.car.riders.some((x) => x.name === 'Custom Person'), 'custom rider missing');
});

await test('cars: riders above capacity rejected (400)', async () => {
  const r = await api(adminInit, GROUP_ADMIN, 'POST', `/api/cars/${ctx.car}/riders`, {
    riders: [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }, { name: 'e' }],
  });
  assert(r.status === 400, `status ${r.status}, expected 400`);
});

await test('cars: unknown user id rider is skipped', async () => {
  const r = await api(adminInit, GROUP_ADMIN, 'POST', `/api/cars/${ctx.car}/riders`, {
    riders: [{ id: 424242, name: 'Ghost' }],
  });
  assert(r.status === 200 && r.data.car.riders.length === 0, 'unknown rider should be skipped');
});

await test('cars: direction toggle works', async () => {
  const r = await api(adminInit, GROUP_ADMIN, 'POST', `/api/cars/${ctx.car}/direction`);
  assert(r.status === 200 && r.data.car.direction === 'return', `status ${r.status}`);
});

await test('cars: PATCH edit (seats, status, note)', async () => {
  const r = await api(adminInit, GROUP_ADMIN, 'PATCH', '/api/cars', {
    id: ctx.car, freeSeats: 3, tripStatus: 'confirmed', note: 'edited',
  });
  assert(r.status === 200 && r.data.car.freeSeats === 3 && r.data.car.note === 'edited', `status ${r.status}`);
});

await test('cars: admin can create on behalf of another user', async () => {
  const r = await api(adminInit, GROUP_ADMIN, 'POST', '/api/cars', {
    freeSeats: 2, direction: 'return', date: FAR2, mode: 'car', onBehalfId: ADMIN_USER.id,
  });
  assert(r.status === 200, `status ${r.status}`);
  assert(r.data.car.driver.id === ADMIN_USER.id, 'driver should be the on-behalf user');
  ctx.car2 = r.data.car.id;
});

await test('cars: cancelled status accepted', async () => {
  const r = await api(adminInit, GROUP_ADMIN, 'POST', `/api/cars/${ctx.car}/status`, { tripStatus: 'cancelled' });
  assert(r.status === 200 && r.data.car.tripStatus === 'cancelled', `status ${r.status}`);
});

// ===========================================================================
console.log('\n— Board & pruning —');
// ===========================================================================

await test('board: returns flights and cars for the selected group', async () => {
  const r = await api(adminInit, GROUP_ADMIN, 'GET', '/api/board');
  assert(r.status === 200, `status ${r.status}`);
  assert(Array.isArray(r.data.flights) && Array.isArray(r.data.cars), 'missing flights/cars arrays');
  assert(r.data.flights.some((f) => f.id === ctx.ts100), 'created flight missing from board');
});

await test('board: past-dated entries are pruned', async () => {
  await api(adminInit, GROUP_ADMIN, 'POST', '/api/flights', {
    flightNumber: 'TP001', departureDate: '2020-01-01',
    legs: [{ origin: 'OSL', destination: 'BRU', departureTime: '08:00', arrivalTime: '10:00' }],
  });
  const r = await api(adminInit, GROUP_ADMIN, 'GET', '/api/board');
  assert(!r.data.flights.some((f) => f.flightNumber === 'TP001'), 'past flight should be pruned');
});

await test('board: group isolation — Brunstad board is separate', async () => {
  const r = await api(adminInit, GROUP_MEMBER, 'GET', '/api/board');
  assert(r.status === 200, `status ${r.status}`);
  assert(!r.data.flights.some((f) => f.id === ctx.ts100), 'Samferd flight leaked into Brunstad board');
});

// ===========================================================================
console.log('\n— Cleanup —');
// ===========================================================================

const flightIds = [
  ctx.ts100, ctx.ts101,
  ...(ctx.merge2 || []), ...(ctx.merge3 || []), ...(ctx.merge4 || []),
  ...(ctx.merge5 || []), ...(ctx.merge6 || []), ...(ctx.merge7 || []), ...(ctx.merge8 || []),
].filter(Boolean);
for (const id of flightIds) {
  await api(adminInit, GROUP_ADMIN, 'DELETE', '/api/flights', { id });
}
for (const id of [ctx.car, ctx.car2].filter(Boolean)) {
  await api(adminInit, GROUP_ADMIN, 'DELETE', '/api/cars', { id });
}
console.log(`  (cleaned up ${flightIds.length} flights, ${[ctx.car, ctx.car2].filter(Boolean).length} cars)`);

// ===========================================================================
console.log('\n========================================');
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} scenarios passed`);
if (failed.length) {
  console.log('\nFAILED SCENARIOS:');
  for (const f of failed) console.log(`  ✗ ${f.name}\n      ${f.error}`);
  process.exit(1);
} else {
  console.log('All scenarios passed ✔');
}
