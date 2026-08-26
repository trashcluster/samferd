// miniapp/app.js — Samferd Mini App frontend.
//
// Talks to the backend Worker, sending Telegram initData on every request so the
// backend can validate identity and enforce group membership.

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// Set your backend Worker URL here (or via ?api= query param for easy testing).
const API = new URLSearchParams(location.search).get('api') || 'https://samferd.info473.workers.dev';

const $ = (id) => document.getElementById(id);

let me = null;

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

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderBoard(flights) {
  const board = $('board');
  if (!flights.length) {
    board.innerHTML = '<div class="empty">No upcoming flights yet.<br/>Add one below. ✈️</div>';
    return;
  }

  board.innerHTML = flights.map((f) => {
    const route = f.origin && f.destination
      ? `${escapeHtml(f.origin)} → ${escapeHtml(f.destination)}`
      : 'route n/a';
    const status = f.status ? ` · ${escapeHtml(f.status)}` : '';
    const onFlight = f.passengers.some((p) => p.id === me);
    const isCreator = f.createdBy === me;

    const people = f.passengers.length
      ? f.passengers.map((p) => {
          const note = p.note ? `<span class="passenger-note">${escapeHtml(p.note)}</span>` : '';
          return `<li><span>${escapeHtml(p.name)}</span>${note}</li>`;
        }).join('')
      : '<li class="empty">(no passengers yet)</li>';

    const actions = [
      onFlight
        ? `<button class="btn small" data-act="leave" data-id="${f.id}">Leave</button>`
        : `<button class="btn small primary" data-act="join" data-id="${f.id}">Join</button>`,
      isCreator
        ? `<button class="btn small danger" data-act="del" data-id="${f.id}">Delete</button>`
        : '',
    ].join('');

    return `
      <div class="flight">
        <div class="flight-head">
          <span class="flight-number">${escapeHtml(f.flightNumber)}</span>
          <span class="flight-date">${escapeHtml(f.departureDate)}</span>
        </div>
        <div class="flight-route">${route}${status}</div>
        <ul class="passengers">${people}</ul>
        <div class="flight-actions">${actions}</div>
      </div>`;
  }).join('');

  board.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => handleAction(btn.dataset.act, Number(btn.dataset.id)));
  });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function handleAction(act, id) {
  try {
    if (act === 'join') await call('POST', `/api/flights/${id}/join`);
    if (act === 'leave') await call('POST', `/api/flights/${id}/leave`);
    if (act === 'del') await call('DELETE', '/api/flights', { id });
    await refresh();
    if (tg) tg.HapticFeedback.notificationOccurred('success');
  } catch (e) {
    toast(e.message);
  }
}

async function refresh() {
  try {
    const { flights } = await call('GET', '/api/board');
    renderBoard(flights);
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
    await refresh();
    if (tg) tg.HapticFeedback.notificationOccurred('success');
  } catch (e) {
    toast(e.message);
  }
}

async function saveNote() {
  try {
    await call('POST', '/api/note', { note: $('note').value });
    await refresh();
    toast('Note saved.');
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
    $('loading').classList.add('hidden');
    $('app').classList.remove('hidden');
    await refresh();
  } catch (e) {
    // 403 → not a member
    $('loading').classList.add('hidden');
    $('denied').classList.remove('hidden');
  }

  // Invite-only: no public join link. Non-members are told to contact an admin.
  $('create-flight').addEventListener('click', createFlight);
  $('save-note').addEventListener('click', saveNote);
}

init();
