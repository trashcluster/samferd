// miniapp/app.js — Samferd Mini App frontend.
//
// Talks to the backend Worker, sending Telegram initData on every request so the
// backend can validate identity and enforce group membership.

const tg = window.Telegram?.WebApp;

// --- Fullscreen + safe-area (notch / home-indicator) handling ----------------
// On iPhones with a notch, content must respect the safe-area insets. We drive
// CSS variables from Telegram's own safeAreaInset / contentSafeAreaInset, which
// are more accurate than env() alone, and update them on every size change.
function applySafeArea() {
  if (!tg) return;
  const root = document.documentElement;
  const sa = tg.safeAreaInset || {};
  const csa = tg.contentSafeAreaInset || {};
  const set = (name, v) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      root.style.setProperty(name, `${Math.round(v)}px`);
    }
  };
  // Top: the device notch/status bar → use the device safe-area top inset.
  set('--safe-top', sa.top);
  // Bottom/left/right: prefer the content safe area (accounts for Telegram's
  // own bottom bar and rounded corners in fullscreen), fall back to device inset.
  set('--safe-bottom', csa.bottom ?? sa.bottom);
  set('--safe-left', csa.left ?? sa.left);
  set('--safe-right', csa.right ?? sa.right);

  // Bottom spacer: the gap between the visible viewport height and the full
  // window height is exactly the area covered by Android's navigation bar /
  // Telegram's bottom controls. Add it as scrollable blank space so the last
  // buttons can always be scrolled clear of the overlays.
  const spacer = document.getElementById('bottom-spacer');
  if (spacer) {
    const full = window.innerHeight;
    const visible = Number(tg.viewportStableHeight) || Number(tg.viewportHeight) || full;
    const covered = Math.max(0, full - visible);
    // Covered overlay height + comfortable breathing room.
    spacer.style.height = `${Math.round(covered + 48)}px`;
  }
}

if (tg) {
  tg.ready();
  tg.expand();

  // Match the header/background to the theme so the status bar blends in.
  const headerColor = tg.themeParams?.header_bg_color
    || tg.themeParams?.secondary_bg_color
    || tg.themeParams?.bg_color;
  if (headerColor) {
    try { tg.setHeaderColor(headerColor); } catch (_) {}
    try { tg.setBackgroundColor(headerColor); } catch (_) {}
  }

  applySafeArea();

  // Enter fullscreen when available (Bot API 8.0+) for an immersive app.
  if (tg.isVersionAtLeast && tg.isVersionAtLeast('8.0') && !tg.isFullscreen) {
    try { tg.requestFullscreen(); } catch (_) {}
  }

  // Re-apply safe areas whenever the viewport, safe area, or fullscreen changes.
  ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged']
    .forEach((evt) => tg.onEvent(evt, applySafeArea));
}

// Set your backend Worker URL here (or via ?api= query param for easy testing).
const API = new URLSearchParams(location.search).get('api') || 'https://samferd.info473.workers.dev';

const $ = (id) => document.getElementById(id);

let me = null;
let isAdmin = false;
let allFlights = []; // full flight objects, kept for the admin panel
let knownUsers = []; // display info of users known to the app (for rider picker)

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Init-Data': tg ? tg.initData : '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || 'Request failed');
  return data;
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2500);
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Format a YYYY-MM-DD date into a human-friendly locale string, e.g.
// "Mon 15 Sep 2026".
function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return escapeHtml(iso);
  const dt = new Date(Date.UTC(y, m - 1, d));
  try {
    return dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return escapeHtml(iso);
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

// The travel day currently selected. `null` = auto (most recent day).
let selectedDay = null;
let allCars = [];

function renderBoard(flights, cars) {
  allCars = cars || [];

  const today = new Date().toISOString().slice(0, 10);

  // Gather all travel days: flight departure dates + car dates. Days in the
  // past are dropped here (the backend also prunes them) so an event
  // disappears once its scheduled date has passed.
  const days = new Set();
  (flights || []).forEach((f) => { if (f.departureDate >= today) days.add(f.departureDate); });
  (cars || []).forEach((c) => { if (c.date && c.date >= today) days.add(c.date); });

  // Sort ascending: soonest upcoming day first, farthest ahead last.
  const sortedDays = [...days].sort();

  // If no days, nothing to show.
  if (!sortedDays.length) {
    $('day-tabs').innerHTML = '';
    renderDayPanel('');
    return;
  }

  // The soonest upcoming day is the home/default.
  if (selectedDay === null || !days.has(selectedDay)) {
    selectedDay = sortedDays[0];
  }

  renderDayTabs(sortedDays);
  renderDayPanel(selectedDay, flights, cars);
}

function renderDayTabs(sortedDays) {
  // Left→right = soonest upcoming first, farthest ahead last.
  $('day-tabs').innerHTML = sortedDays.map((d) => {
    const label = tabLabel(d);
    const active = d === selectedDay ? ' active' : '';
    return `<button class="day-tab${active}" data-day="${escapeHtml(d)}">${escapeHtml(label)}</button>`;
  }).join('');

  $('day-tabs').querySelectorAll('.day-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedDay = btn.dataset.day;
      renderDayTabs(sortedDays);
      renderDayPanel(selectedDay, allFlights, allCars);
    });
  });
}

// Short label for a tab: "15 Oct" (or "Today"/"Tomorrow").
function tabLabel(iso) {
  if (!iso) return '';
  const today = new Date().toISOString().slice(0, 10);
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const short = dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  if (iso === today) return 'Today';
  // Tomorrow
  const tm = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10) === today ? null : null;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (iso === tomorrow) return 'Tomorrow';
  return short;
}

function renderDayPanel(day, flights, cars) {
  flights = flights || allFlights;
  cars = cars || allCars;

  const dayFlights = flights.filter((f) => f.departureDate === day);
  const dayCars = cars.filter((c) => c.date === day);
  const carsOut = dayCars.filter((c) => c.direction !== 'return');
  const carsReturn = dayCars.filter((c) => c.direction === 'return');

  $('board-cars-out').innerHTML =
    '<h2 class="section-title">🚗 Cars to the airport</h2>' +
    (carsOut.length ? carsOut.map(renderCar).join('') : '<div class="empty">No cars to the airport yet.</div>');

  $('board-flights').innerHTML =
    '<h2 class="section-title">🛫 Flights</h2>' +
    (dayFlights.length ? dayFlights.map(renderFlight).join('') : '<div class="empty">No flights this day.</div>');

  $('board-cars-return').innerHTML =
    '<h2 class="section-title">🚗 Cars from the arrival airport</h2>' +
    (carsReturn.length ? carsReturn.map(renderCar).join('') : '<div class="empty">No cars from the airport yet.</div>');

  document.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => handleAction(btn.dataset.act, Number(btn.dataset.id)));
  });
}

function renderFlight(f) {
  const route = f.origin && f.destination
    ? `<span class="route-origin">${escapeHtml(f.origin)}</span> → <span class="route-dest">${escapeHtml(f.destination)}</span>`
    : '<span class="route-na">route n/a</span>';
  const status = f.status ? ` · ${escapeHtml(f.status)}` : '';

  const dateLine = formatDate(f.departureDate);
  const timeParts = [f.departureTime, f.terminal ? `T${escapeHtml(f.terminal)}` : '', f.gate ? `G${escapeHtml(f.gate)}` : ''].filter(Boolean).join(' ');
  const timeLine = timeParts ? ` · ${escapeHtml(timeParts)}` : '';

  const onFlight = f.passengers.some((p) => p.id === me);
  const isCreator = f.createdBy === me;

  const people = f.passengers.length
    ? f.passengers.map((p) => `<li><span>${escapeHtml(p.name)}</span></li>`).join('')
    : '<li class="empty">(no passengers yet)</li>';

  const actions = [
    onFlight
      ? `<button class="btn small" data-act="leave-flight" data-id="${f.id}">Leave</button>`
      : `<button class="btn small primary" data-act="join-flight" data-id="${f.id}">Join</button>`,
    isCreator
      ? `<button class="btn small danger" data-act="del-flight" data-id="${f.id}">Delete</button>`
      : '',
  ].join('');

  return `
    <div class="flight">
      <div class="flight-head">
        <span class="flight-number">${escapeHtml(f.flightNumber)}</span>
        <span class="flight-date">${escapeHtml(dateLine)}${timeLine}</span>
      </div>
      <div class="flight-route">${route}${status}</div>
      <ul class="passengers">${people}</ul>
      <div class="flight-actions">${actions}</div>
    </div>`;
}

function renderCar(c) {
  const remaining = c.freeSeats - c.riders.length;
  const isDriver = c.driver.id === me;

  // Riders are managed by the driver only — no self-registration.
  const riders = c.riders.length
    ? c.riders.map((r) => `<li><span>${escapeHtml(r.name)}</span></li>`).join('')
    : '<li class="empty">(no passengers yet)</li>';

  const actions = [
    isDriver
      ? `<button class="btn small primary" data-act="edit-riders" data-id="${c.id}">Edit passengers</button>`
      : '',
    isDriver
      ? `<button class="btn small danger" data-act="del-car" data-id="${c.id}">Delete</button>`
      : '',
    isDriver
      ? `<button class="btn small" data-act="toggle-car-direction" data-id="${c.id}">⇄ Switch</button>`
      : '',
  ].join('');

  return `
    <div class="flight">
      <div class="flight-head">
        <span class="flight-number">🚗 ${escapeHtml(c.driver.name)}</span>
        <span class="flight-date">${remaining} free seat${remaining === 1 ? '' : 's'}</span>
      </div>
      ${c.note ? `<div class="flight-route">${escapeHtml(c.note)}</div>` : ''}
      <ul class="passengers">${riders}</ul>
      <div class="flight-actions">${actions}</div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function handleAction(act, id) {
  try {
    if (act === 'join-flight') await call('POST', `/api/flights/${id}/join`);
    if (act === 'leave-flight') await call('POST', `/api/flights/${id}/leave`);
    if (act === 'del-flight') await call('DELETE', '/api/flights', { id });
    if (act === 'del-car') await call('DELETE', '/api/cars', { id });
    if (act === 'toggle-car-direction') await call('POST', `/api/cars/${id}/direction`);
    if (act === 'edit-riders') { openRiderEditor(id); return; }
    await refresh();
    if (tg) tg.HapticFeedback.notificationOccurred('success');
  } catch (e) {
    toast(e.message);
  }
}

// --- Rider editor (driver/admin only) ---------------------------------------

let riderCarId = null;
let riderSelection = new Set();

function openRiderEditor(carId) {
  const car = allCars.find((c) => c.id === carId);
  if (!car) return;
  riderCarId = carId;
  riderSelection = new Set(car.riders.map((r) => r.id));

  // Candidate passengers: everyone known to the app except the driver.
  const candidates = knownUsers.filter((u) => u.id !== car.driver.id);

  $('rider-editor-title').textContent = `Passengers — ${car.driver.name}`;
  $('rider-list').innerHTML = candidates.length
    ? candidates.map((u) => `
        <label class="rider-row">
          <input type="checkbox" data-rider="${u.id}" ${riderSelection.has(u.id) ? 'checked' : ''} />
          <span>${escapeHtml(u.name)}</span>
        </label>`).join('')
    : '<div class="empty">No other users have opened the app yet.</div>';

  $('rider-editor').classList.remove('hidden');
  $('rider-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });

  $('rider-list').querySelectorAll('[data-rider]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const rid = Number(cb.dataset.rider);
      if (cb.checked) riderSelection.add(rid); else riderSelection.delete(rid);
    });
  });
}

async function saveRiders() {
  if (riderCarId === null) return;
  const riders = [...riderSelection].map((id) => ({ id }));
  try {
    await call('POST', `/api/cars/${riderCarId}/riders`, { riders });
    toast('Passengers saved.');
    $('rider-editor').classList.add('hidden');
    riderCarId = null;
    await refresh();
    if (tg) tg.HapticFeedback.notificationOccurred('success');
  } catch (e) {
    toast(e.message);
  }
}

async function refresh() {
  try {
    const { flights, cars, known } = await call('GET', '/api/board');
    allFlights = flights;
    knownUsers = known || [];
    renderBoard(flights, cars);
    if (isAdmin) renderAdminList();
  } catch (e) {
    toast(e.message);
  }
}

async function createFlight() {
  const flightNumber = $('flight-number').value.trim();
  const departureDate = $('departure-date').value;
  if (!flightNumber || !departureDate) {
    toast('Enter a flight number and date.');
    return;
  }
  try {
    await call('POST', '/api/flights', { flightNumber, departureDate });
    $('flight-number').value = '';
    $('departure-date').value = '';
    selectedDay = departureDate; // show the newly added day
    await refresh();
    if (tg) tg.HapticFeedback.notificationOccurred('success');
  } catch (e) {
    toast(e.message);
  }
}

async function createCar() {
  const freeSeats = Number($('car-seats').value) || 3;
  const note = $('car-note').value.trim();
  const direction = $('car-direction').value;
  const date = $('car-date').value;
  if (!date) {
    toast('Pick a travel date for the car.');
    return;
  }
  try {
    await call('POST', '/api/cars', { freeSeats, note, direction, date });
    $('car-note').value = '';
    selectedDay = date; // show the newly added day
    await refresh();
    if (tg) tg.HapticFeedback.notificationOccurred('success');
  } catch (e) {
    toast(e.message);
  }
}

// --- Admin panel ------------------------------------------------------------

// Render the tappable list of flights in the admin panel.
function renderAdminList() {
  const list = $('admin-flight-list');
  if (!allFlights.length) {
    list.innerHTML = '<div class="empty">No flights.</div>';
    return;
  }
  list.innerHTML = allFlights.map((f) => {
    const route = (f.origin && f.destination)
      ? `${escapeHtml(f.origin)} → ${escapeHtml(f.destination)}`
      : '<span class="route-na">no route</span>';
    const time = f.departureTime ? ` · ${escapeHtml(f.departureTime)}` : '';
    return `
      <button class="admin-row" data-edit="${f.id}">
        <span class="admin-row-main">${escapeHtml(f.flightNumber)} — ${escapeHtml(f.departureDate)}</span>
        <span class="admin-row-sub">${route}${time}</span>
      </button>`;
  }).join('');

  list.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openAdminEditor(Number(btn.dataset.edit)));
  });
}

// Populate the editor with a flight's current values and reveal it.
function openAdminEditor(id) {
  const f = allFlights.find((x) => x.id === id);
  if (!f) return;
  $('admin-flight-id').value = f.id;
  $('admin-flight-number').value = f.flightNumber || '';
  $('admin-departure-date').value = f.departureDate || '';
  $('admin-origin').value = f.origin || '';
  $('admin-destination').value = f.destination || '';
  $('admin-departure-time').value = f.departureTime || '';
  $('admin-editor').classList.remove('hidden');
  // Scroll the editor into view on small screens.
  $('admin-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function adminSaveFlight() {
  const id = Number($('admin-flight-id').value);
  if (!id) {
    toast('Pick a flight first.');
    return;
  }
  const body = { id };
  const flightNumber = $('admin-flight-number').value.trim();
  const departureDate = $('admin-departure-date').value;
  const origin = $('admin-origin').value.trim();
  const destination = $('admin-destination').value.trim();
  const departureTime = $('admin-departure-time').value.trim();
  if (flightNumber) body.flightNumber = flightNumber;
  if (departureDate) body.departureDate = departureDate;
  if (origin) body.origin = origin;
  if (destination) body.destination = destination;
  if (departureTime) body.departureTime = departureTime;
  try {
    await call('PATCH', '/api/flights', body);
    toast('Flight updated.');
    $('admin-editor').classList.add('hidden');
    await refresh();
    if (tg) tg.HapticFeedback.notificationOccurred('success');
  } catch (e) {
    toast(e.message);
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function init() {
  // Telegram WebApp is required for identity. Allow a fallback note for web preview.
  if (!tg) {
    $('loading').textContent = 'Open this app from inside Telegram.';
    return;
  }

  try {
    const auth = await call('GET', '/api/auth');
    me = auth.user.id;
    isAdmin = !!auth.isAdmin;
    $('loading').classList.add('hidden');
    $('app').classList.remove('hidden');
    await refresh();
  } catch (e) {
    // 403 → not a member
    $('loading').classList.add('hidden');
    $('denied').classList.remove('hidden');
  }

  // Toggle the add form.
  const toggle = $('toggle-add');
  const addForm = $('add-form');
  toggle.addEventListener('click', () => {
    const hidden = addForm.classList.toggle('hidden');
    toggle.textContent = hidden ? '＋ Add flight / car' : '－ Close';
  });

  // Admin button + panel (visible only to admins).
  if (isAdmin) {
    $('toggle-admin').classList.remove('hidden');
    const adminToggle = $('toggle-admin');
    const adminPanel = $('admin-panel');
    adminToggle.addEventListener('click', () => {
      const hidden = adminPanel.classList.toggle('hidden');
      adminToggle.textContent = hidden ? '⚙️ Admin' : '⚙️ Close admin';
    });
    $('admin-save-flight').addEventListener('click', adminSaveFlight);
  }

  // Invite-only: no public join link. Non-members are told to contact an admin.
  $('create-flight').addEventListener('click', createFlight);
  $('create-car').addEventListener('click', createCar);
  $('save-riders').addEventListener('click', saveRiders);
}

init();
