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
      // The passenger/car editors belong to a car on a specific day; close
      // them when switching days so they don't linger over unrelated content.
      closeRiderEditor();
      closeCarEditor();
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

  // Sort flights by departure time (earliest first); flights without a known
  // time sort last, in creation order.
  dayFlights.sort((a, b) => {
    const ta = a.departureTime || '99:99';
    const tb = b.departureTime || '99:99';
    return ta.localeCompare(tb) || a.id - b.id;
  });

  // Each section is a collapsible card: the title row toggles the body.
  // Sections with content start expanded; empty ones start collapsed.
  // Each title row carries its own Add button that pre-selects the form.
  const sections = [
    {
      key: 'cars-out',
      title: '🚗 Transport to the airport',
      count: carsOut.length,
      add: { form: 'car', direction: 'outbound' },
      body: carsOut.length ? carsOut.map(renderCar).join('') : '<div class="empty">No transport to the airport yet.</div>',
    },
    {
      key: 'flights',
      title: '🛫 Flights',
      count: dayFlights.length,
      add: { form: 'flight' },
      body: dayFlights.length ? dayFlights.map(renderFlight).join('') : '<div class="empty">No flights this day.</div>',
    },
    {
      key: 'cars-return',
      title: '🚗 Transport from the arrival airport',
      count: carsReturn.length,
      add: { form: 'car', direction: 'return' },
      body: carsReturn.length ? carsReturn.map(renderCar).join('') : '<div class="empty">No transport from the airport yet.</div>',
    },
  ];

  for (const s of sections) {
    const panel = $(`board-${s.key}`);
    const open = s.count > 0;
    panel.innerHTML = `
      <div class="section-head">
        <button class="section-toggle" data-section="${s.key}" aria-expanded="${open}">
          <span class="section-title">${s.title}</span>
          <span class="section-meta">${s.count ? `${s.count}` : ''}<span class="chev">${open ? '▾' : '▸'}</span></span>
        </button>
        <button class="btn small section-add" data-add-form="${s.add.form}"${s.add.direction ? ` data-add-direction="${s.add.direction}"` : ''}>＋ Add</button>
      </div>
      <div class="section-body${open ? '' : ' collapsed'}" data-body="${s.key}">${s.body}</div>`;
  }

  bindSectionToggles();
  bindSectionAddButtons();
  bindBoardActions();
}

// Per-section Add buttons: open the shared add form with the right tab
// pre-selected (flight vs car, and the car's direction).
function bindSectionAddButtons() {
  document.querySelectorAll('.section-add').forEach((btn) => {
    btn.addEventListener('click', () => {
      const form = btn.dataset.addForm;
      const addForm = $('add-form');
      const wasHidden = addForm.classList.contains('hidden');
      addForm.classList.remove('hidden');
      $('toggle-add').textContent = '－ Close';
      if (form === 'car') {
        $('car-direction').value = btn.dataset.addDirection || 'outbound';
      }
      // Scroll to the relevant sub-form heading.
      const target = form === 'car' ? $('car-direction') : $('flight-number');
      if (wasHidden || target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (target && target.focus) target.focus({ preventScroll: true });
    });
  });
}

// Toggle collapse/expand for a section card.
function bindSectionToggles() {
  document.querySelectorAll('.section-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const body = document.querySelector(`[data-body="${btn.dataset.section}"]`);
      if (!body) return;
      const collapsed = body.classList.toggle('collapsed');
      btn.setAttribute('aria-expanded', String(!collapsed));
      const chev = btn.querySelector('.chev');
      if (chev) chev.textContent = collapsed ? '▸' : '▾';
    });
  });
}

function bindBoardActions() {
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
  // Departure time is the primary reading cue; arrival time shown when known.
  const timeParts = [
    f.departureTime,
    f.arrivalTime ? `→ ${f.arrivalTime}` : '',
    f.terminal ? `T${escapeHtml(f.terminal)}` : '',
    f.gate ? `G${escapeHtml(f.gate)}` : '',
  ].filter(Boolean).join(' ');
  const timeLine = timeParts ? ` · ${escapeHtml(timeParts)}` : '';
  const airlineLine = f.airline ? `<div class="flight-airline">${escapeHtml(f.airline)}</div>` : '';

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
      ${airlineLine}
      <ul class="passengers">${people}</ul>
      <div class="flight-actions">${actions}</div>
    </div>`;
}

// Mode-of-transport labels/icons for transport cards.
const MODE_LABELS = {
  car: '🚗 Private car',
  rental: '🚙 Rental car',
  train: '🚆 Train',
  bus: '🚌 Bus',
  shuttle: '🚐 Shuttle',
  taxi: '🚕 Taxi',
  pickup: '🤝 Pickup',
  other: '✈️ Transport',
};

function renderCar(c) {
  // Free seats are derived, never stored: capacity minus confirmed passengers.
  const remaining = Math.max(0, c.freeSeats - c.riders.length);
  const isDriver = c.driver.id === me;
  const tripStatus = c.tripStatus || 'confirmed';
  const isCancelled = tripStatus === 'cancelled';
  const isFull = remaining <= 0;
  const modeLabel = MODE_LABELS[c.mode] || MODE_LABELS.other;

  // Status badge: shows certainty at a glance.
  const statusBadge = {
    confirmed: '<span class="badge ok">Confirmed</span>',
    provisional: '<span class="badge warn">Provisional</span>',
    cancelled: '<span class="badge bad">Cancelled</span>',
  }[tripStatus] || '';
  const fullBadge = isFull && !isCancelled ? '<span class="badge bad">Full</span>' : '';
  const seatsLine = isCancelled
    ? ''
    : `<span class="flight-date">${remaining} of ${c.freeSeats} seat${c.freeSeats === 1 ? '' : 's'} free</span>`;

  // Riders are managed by the driver only — no self-registration.
  const riders = c.riders.length
    ? c.riders.map((r) => `<li><span>${escapeHtml(r.name)}</span></li>`).join('')
    : '<li class="empty">(no passengers yet)</li>';

  const actions = isDriver || isAdmin
    ? [
        `<button class="btn small primary" data-act="edit-riders" data-id="${c.id}">Edit passengers</button>`,
        `<button class="btn small" data-act="edit-car" data-id="${c.id}">Modify</button>`,
        `<button class="btn small danger" data-act="del-car" data-id="${c.id}">Delete</button>`,
      ].join('')
    : '';

  return `
    <div class="flight${isCancelled ? ' cancelled' : ''}">
      <div class="flight-head">
        <span class="flight-number">${escapeHtml(modeLabel)} · ${escapeHtml(c.driver.name)}</span>
        ${seatsLine}
      </div>
      <div class="flight-badges">${statusBadge}${fullBadge}</div>
      ${c.note ? `<div class="flight-route">${escapeHtml(c.note)}</div>` : ''}
      <ul class="passengers">${riders}</ul>
      ${actions ? `<div class="flight-actions">${actions}</div>` : ''}
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
    if (act === 'edit-car') { openCarEditor(id); return; }
    if (act === 'edit-riders') { openRiderEditor(id); return; }
    await refresh();
    if (tg) tg.HapticFeedback.notificationOccurred('success');
  } catch (e) {
    toast(e.message);
  }
}

// --- Car editor (driver/admin only) -----------------------------------------

function openCarEditor(carId) {
  const car = allCars.find((c) => c.id === carId);
  if (!car) return;
  $('car-edit-id').value = car.id;
  $('car-edit-date').value = car.date || '';
  $('car-edit-direction').value = car.direction === 'return' ? 'return' : 'outbound';
  $('car-edit-seats').value = car.freeSeats;
  $('car-edit-status').value = car.tripStatus || 'confirmed';
  $('car-edit-note').value = car.note || '';
  $('car-editor').classList.remove('hidden');
  $('car-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeCarEditor() {
  $('car-editor').classList.add('hidden');
}

async function saveCarEdits() {
  const id = Number($('car-edit-id').value);
  if (!id) return;
  const body = {
    id,
    date: $('car-edit-date').value,
    direction: $('car-edit-direction').value,
    freeSeats: Number($('car-edit-seats').value),
    tripStatus: $('car-edit-status').value,
    note: $('car-edit-note').value.trim(),
  };
  try {
    await call('PATCH', '/api/cars', body);
    toast('Transport updated.');
    closeCarEditor();
    await refresh();
    if (tg) tg.HapticFeedback.notificationOccurred('success');
  } catch (e) {
    toast(e.message);
  }
}

// --- Rider editor (driver/admin only) ---------------------------------------

let riderCarId = null;
// Selected riders: { id?: number, name: string }. Known users keep their id;
// custom entries have only a name.
let riderSelection = [];

function openRiderEditor(carId) {
  const car = allCars.find((c) => c.id === carId);
  if (!car) return;
  riderCarId = carId;
  riderSelection = car.riders.map((r) => ({ id: r.id, name: r.name }));

  $('rider-editor-title').textContent = `Passengers — ${car.driver.name}`;
  $('rider-search').value = '';
  renderRiderResults('');
  renderRiderSelected();

  $('rider-editor').classList.remove('hidden');
  $('rider-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Search results: shown only when at least one letter is typed. Matching known
// users appear as tappable rows; if the exact typed name isn't among them, a
// "add custom" row is offered.
function renderRiderResults(query) {
  const q = query.trim().toLowerCase();
  const box = $('rider-search-results');

  if (q.length < 1) {
    box.innerHTML = '<div class="empty">Type at least one letter to search.</div>';
    return;
  }

  const driverId = riderCarId !== null
    ? (allCars.find((c) => c.id === riderCarId)?.driver.id ?? null)
    : null;

  const matches = knownUsers.filter((u) =>
    u.id !== driverId && u.name.toLowerCase().includes(q));

  const exactKnown = matches.some((u) => u.name.toLowerCase() === q);
  const alreadySelected = riderSelection.some((r) => r.name.toLowerCase() === q);

  let html = matches.map((u) => {
    const sel = riderSelection.some((r) => r.id === u.id);
    return `
      <button class="rider-row${sel ? ' selected' : ''}" data-pick-id="${u.id}">
        <span>${escapeHtml(u.name)}</span>
        <span class="rider-action">${sel ? '✓ remove' : '+ add'}</span>
      </button>`;
  }).join('');

  // Offer a custom entry when the typed name isn't an exact known match.
  if (!exactKnown && !alreadySelected) {
    html += `
      <button class="rider-row custom" data-pick-name="${escapeHtml(query.trim())}">
        <span>➕ Add “${escapeHtml(query.trim())}”</span>
        <span class="rider-action">custom</span>
      </button>`;
  }

  box.innerHTML = html || '<div class="empty">No matches.</div>';

  box.querySelectorAll('[data-pick-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.pickId);
      const u = knownUsers.find((x) => x.id === id);
      if (!u) return;
      const idx = riderSelection.findIndex((r) => r.id === id);
      if (idx >= 0) riderSelection.splice(idx, 1);
      else riderSelection.push({ id: u.id, name: u.name });
      renderRiderResults($('rider-search').value);
      renderRiderSelected();
    });
  });

  box.querySelectorAll('[data-pick-name]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.pickName;
      if (!name) return;
      riderSelection.push({ name });
      $('rider-search').value = '';
      renderRiderResults('');
      renderRiderSelected();
    });
  });
}

function renderRiderSelected() {
  $('rider-count').textContent = String(riderSelection.length);
  const box = $('rider-selected');
  box.innerHTML = riderSelection.length
    ? riderSelection.map((r, i) => `
        <button class="rider-row selected" data-remove="${i}">
          <span>${escapeHtml(r.name)}</span>
          <span class="rider-action">✕</span>
        </button>`).join('')
    : '<div class="empty">No passengers selected.</div>';

  box.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      riderSelection.splice(Number(btn.dataset.remove), 1);
      renderRiderResults($('rider-search').value);
      renderRiderSelected();
    });
  });
}

function closeRiderEditor() {
  $('rider-editor').classList.add('hidden');
  riderCarId = null;
  riderSelection = [];
}

async function saveRiders() {
  if (riderCarId === null) return;
  const riders = riderSelection.map((r) => ({ id: r.id ?? null, name: r.name }));
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
  const tripStatus = $('car-trip-status').value;
  const mode = $('car-mode').value;
  if (!date) {
    toast('Pick a travel date for the car.');
    return;
  }
  try {
    await call('POST', '/api/cars', { freeSeats, note, direction, date, tripStatus, mode });
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
  $('close-riders').addEventListener('click', closeRiderEditor);
  $('rider-search').addEventListener('input', (e) => renderRiderResults(e.target.value));
  $('car-edit-save').addEventListener('click', saveCarEdits);
  $('car-edit-close').addEventListener('click', closeCarEditor);
}

init();
