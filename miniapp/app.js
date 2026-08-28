// miniapp/app.js — Samferd Mini App frontend.
//
// Talks to the backend Worker, sending Telegram initData on every request so the
// backend can validate identity and enforce group membership.

const tg = window.Telegram?.WebApp;

// --- i18n --------------------------------------------------------------------
// UI language: French by default (the group's language), English fallback.
// Telegram reports the user's language_code; we auto-localize when we have a
// translation for it, otherwise we fall back to French.
const STRINGS = {
  fr: {
    title: '✈️ Samferd',
    loading: 'Chargement…',
    membersOnly: '🔒 Réservé aux membres',
    membersOnlyText: "Samferd est sur invitation. Vous devez être membre de notre groupe Telegram pour l'utiliser.",
    askAdmin: "Demandez à un administrateur du groupe de vous inviter.",
    openInTelegram: "Ouvrez cette application depuis Telegram.",
    board: '🗓️ Tableau',
    myJourney: '🧭 Mon trajet',
    transportTo: '🚗 Transport vers l’aéroport',
    flights: '🛫 Vols',
    transportFrom: '🚗 Transport depuis l’aéroport d’arrivée',
    noTransportTo: 'Pas encore de transport vers l’aéroport.',
    noFlights: 'Aucun vol ce jour.',
    noTransportFrom: 'Pas encore de transport depuis l’aéroport.',
    add: '＋ Ajouter',
    addFlightCar: '＋ Ajouter un vol / transport',
    close: '－ Fermer',
    addFlight: 'Ajouter un vol',
    flightNumber: 'Numéro de vol',
    departureDate: 'Date de départ',
    createFlight: 'Créer le vol',
    offerTransport: 'Proposer un transport',
    mode: 'Mode de transport',
    direction: 'Sens',
    toAirport: "Vers l'aéroport de départ",
    fromAirport: "Depuis l'aéroport d'arrivée",
    travelDate: 'Date de trajet',
    totalSeats: 'Places totales (conducteur inclus)',
    statusLabel: 'Statut',
    confirmed: 'Confirmé',
    provisional: 'Provisoire',
    cancelled: 'Annulé',
    note: 'Note (point / heure de départ)',
    offerTransportBtn: 'Proposer le transport',
    admin: '⚙️ Admin',
    closeAdmin: '⚙️ Fermer admin',
    adminManage: 'Admin — gérer les vols',
    editFlight: 'Modifier le vol',
    saveFlight: 'Enregistrer le vol',
    destCity: "Ville / aéroport d'arrivée",
    depCity: 'Ville / aéroport de départ',
    depTime: 'Heure de départ (HH:MM)',
    passengers: 'Passagers',
    passengerHint: 'Recherchez et cochez les personnes qui voyagent avec vous, ou saisissez un nom personnalisé. Les places se règlent avec le conducteur en dehors de l’app.',
    searchPlaceholder: 'Rechercher ou ajouter un nom…',
    typeLetter: 'Saisissez au moins une lettre pour rechercher.',
    noMatches: 'Aucun résultat.',
    addCustom: 'Ajouter',
    selected: 'Sélectionnés',
    noSelected: 'Aucun passager sélectionné.',
    savePassengers: 'Enregistrer les passagers',
    closeBtn: 'Fermer',
    modify: 'Modifier',
    editTransport: 'Modifier le transport',
    save: 'Enregistrer',
    delete: 'Supprimer',
    editPassengers: 'Modifier les passagers',
    addedByAdmin: 'ajouté par un admin',
    noPassengers: '(aucun passager)',
    seatsFree: 'place libre',
    seatsFreePlural: 'places libres',
    full: 'Complet',
    youDrive: 'vous conduisez',
    with: 'avec',
    nothingPlanned: 'Rien de prévu pour l’instant.<br/>Rejoignez un vol ou un transport depuis le Tableau.',
    routeNa: 'trajet inconnu',
    today: "Aujourd'hui",
    tomorrow: 'Demain',
    pickDate: 'Choisissez une date de trajet.',
    enterFlightAndDate: 'Saisissez un numéro de vol et une date.',
    saved: 'Enregistré.',
    transportUpdated: 'Transport mis à jour.',
    flightUpdated: 'Vol mis à jour.',
    noteSaved: 'Note enregistrée.',
    pickFlight: 'Choisissez un vol.',
    enterFlightId: 'Saisissez un identifiant de vol.',
    onBehalf: 'Au nom de (conducteur / propriétaire)',
    myself: '— moi-même —',
    noOtherUsers: "Aucun autre utilisateur n'a encore ouvert l'app.",
    you: 'vous',
  },
  en: {
    title: '✈️ Samferd',
    loading: 'Loading…',
    membersOnly: '🔒 Members only',
    membersOnlyText: 'Samferd is invite-only. You must be a member of our Telegram group to use it.',
    askAdmin: 'Ask a group admin to invite you.',
    openInTelegram: 'Open this app from inside Telegram.',
    board: '🗓️ Board',
    myJourney: '🧭 My journey',
    transportTo: '🚗 Transport to the airport',
    flights: '🛫 Flights',
    transportFrom: '🚗 Transport from the arrival airport',
    noTransportTo: 'No transport to the airport yet.',
    noFlights: 'No flights this day.',
    noTransportFrom: 'No transport from the airport yet.',
    add: '＋ Add',
    addFlightCar: '＋ Add flight / transport',
    close: '－ Close',
    addFlight: 'Add a flight',
    flightNumber: 'Flight number',
    departureDate: 'Departure date',
    createFlight: 'Create flight',
    offerTransport: 'Offer transport',
    mode: 'Mode of transport',
    direction: 'Direction',
    toAirport: 'To the departure airport',
    fromAirport: 'From the arrival airport',
    travelDate: 'Travel date',
    totalSeats: 'Total seats (including driver)',
    statusLabel: 'Status',
    confirmed: 'Confirmed',
    provisional: 'Provisional',
    cancelled: 'Cancelled',
    note: 'Note (departure point / time)',
    offerTransportBtn: 'Offer transport',
    admin: '⚙️ Admin',
    closeAdmin: '⚙️ Close admin',
    adminManage: 'Admin — manage flights',
    editFlight: 'Edit flight',
    saveFlight: 'Save flight',
    destCity: 'Destination city / airport',
    depCity: 'Departure city / airport',
    depTime: 'Departure time (HH:MM)',
    passengers: 'Passengers',
    passengerHint: 'Search and tick the people travelling with you, or type a custom name. Seats are arranged with the driver outside the app.',
    searchPlaceholder: 'Search people or add a custom name…',
    typeLetter: 'Type at least one letter to search.',
    noMatches: 'No matches.',
    addCustom: 'Add',
    selected: 'Selected',
    noSelected: 'No passengers selected.',
    savePassengers: 'Save passengers',
    closeBtn: 'Close',
    modify: 'Modify',
    editTransport: 'Modify transport',
    save: 'Save',
    delete: 'Delete',
    editPassengers: 'Edit passengers',
    addedByAdmin: 'added by admin',
    noPassengers: '(no passengers yet)',
    seatsFree: 'seat free',
    seatsFreePlural: 'seats free',
    full: 'Full',
    youDrive: 'you drive',
    with: 'with',
    nothingPlanned: 'Nothing planned yet.<br/>Join a flight or transport from the Board tab.',
    routeNa: 'route n/a',
    today: 'Today',
    tomorrow: 'Tomorrow',
    pickDate: 'Pick a travel date for the car.',
    enterFlightAndDate: 'Enter a flight number and date.',
    saved: 'Saved.',
    transportUpdated: 'Transport updated.',
    flightUpdated: 'Flight updated.',
    noteSaved: 'Note saved.',
    pickFlight: 'Pick a flight first.',
    enterFlightId: 'Enter a flight id.',
    onBehalf: 'On behalf of (driver/owner)',
    myself: '— myself —',
    noOtherUsers: 'No other users have opened the app yet.',
    you: 'you',
  },
  no: {
    title: '✈️ Samferd',
    loading: 'Laster…',
    membersOnly: '🔒 Kun for medlemmer',
    membersOnlyText: 'Samferd er kun på invitasjon. Du må være medlem av Telegram-gruppen vår for å bruke den.',
    askAdmin: 'Spør en gruppeadmin om å invitere deg.',
    openInTelegram: 'Åpne denne appen fra innsiden av Telegram.',
    board: '🗓️ Tavle',
    myJourney: '🧭 Min reise',
    transportTo: '🚗 Transport til flyplassen',
    flights: '🛫 Flyvninger',
    transportFrom: '🚗 Transport fra ankomstflyplassen',
    noTransportTo: 'Ingen transport til flyplassen ennå.',
    noFlights: 'Ingen flyvninger denne dagen.',
    noTransportFrom: 'Ingen transport fra flyplassen ennå.',
    add: '＋ Legg til',
    addFlightCar: '＋ Legg til flyvning / transport',
    close: '－ Lukk',
    addFlight: 'Legg til en flyvning',
    flightNumber: 'Flynummer',
    departureDate: 'Avreisedato',
    createFlight: 'Opprett flyvning',
    offerTransport: 'Tilby transport',
    mode: 'Transportmiddel',
    direction: 'Retning',
    toAirport: 'Til avreiseflyplassen',
    fromAirport: 'Fra ankomstflyplassen',
    travelDate: 'Reisedato',
    totalSeats: 'Totalt antall seter (inkludert sjåfør)',
    statusLabel: 'Status',
    confirmed: 'Bekreftet',
    provisional: 'Foreløpig',
    cancelled: 'Avlyst',
    note: 'Merknad (avreisested / tid)',
    offerTransportBtn: 'Tilby transport',
    admin: '⚙️ Admin',
    closeAdmin: '⚙️ Lukk admin',
    adminManage: 'Admin — administrer flyvninger',
    editFlight: 'Rediger flyvning',
    saveFlight: 'Lagre flyvning',
    destCity: 'Ankomstby / flyplass',
    depCity: 'Avreiseby / flyplass',
    depTime: 'Avgangstid (TT:MM)',
    passengers: 'Passasjerer',
    passengerHint: 'Søk og huk av de som reiser med deg, eller skriv inn et eget navn. Setene avtales med sjåføren utenfor appen.',
    searchPlaceholder: 'Søk etter personer eller legg til et navn…',
    typeLetter: 'Skriv minst én bokstav for å søke.',
    noMatches: 'Ingen treff.',
    addCustom: 'Legg til',
    selected: 'Valgt',
    noSelected: 'Ingen passasjerer valgt.',
    savePassengers: 'Lagre passasjerer',
    closeBtn: 'Lukk',
    modify: 'Endre',
    editTransport: 'Endre transport',
    save: 'Lagre',
    delete: 'Slett',
    editPassengers: 'Rediger passasjerer',
    addedByAdmin: 'lagt til av admin',
    noPassengers: '(ingen passasjerer ennå)',
    seatsFree: 'sete ledig',
    seatsFreePlural: 'seter ledig',
    full: 'Fullt',
    youDrive: 'du kjører',
    with: 'med',
    nothingPlanned: 'Ingenting planlagt ennå.<br/>Bli med på en flyvning eller transport fra Tavle-fanen.',
    routeNa: 'rute ukjent',
    today: 'I dag',
    tomorrow: 'I morgen',
    pickDate: 'Velg en reisedato for bilen.',
    enterFlightAndDate: 'Skriv inn flynummer og dato.',
    saved: 'Lagret.',
    transportUpdated: 'Transport oppdatert.',
    flightUpdated: 'Flyvning oppdatert.',
    noteSaved: 'Merknad lagret.',
    pickFlight: 'Velg en flyvning først.',
    enterFlightId: 'Skriv inn en fly-id.',
    onBehalf: 'På vegne av (sjåfør / eier)',
    myself: '— meg selv —',
    noOtherUsers: 'Ingen andre brukere har åpnet appen ennå.',
    you: 'deg',
  },
  de: {
    title: '✈️ Samferd',
    loading: 'Wird geladen…',
    membersOnly: '🔒 Nur für Mitglieder',
    membersOnlyText: 'Samferd ist nur auf Einladung. Du musst Mitglied unserer Telegram-Gruppe sein, um die App zu nutzen.',
    askAdmin: 'Bitte einen Gruppen-Admin, dich einzuladen.',
    openInTelegram: 'Öffne diese App aus Telegram heraus.',
    board: '🗓️ Übersicht',
    myJourney: '🧭 Meine Reise',
    transportTo: '🚗 Transport zum Flughafen',
    flights: '🛫 Flüge',
    transportFrom: '🚗 Transport vom Ankunftsflughafen',
    noTransportTo: 'Noch kein Transport zum Flughafen.',
    noFlights: 'Keine Flüge an diesem Tag.',
    noTransportFrom: 'Noch kein Transport vom Flughafen.',
    add: '＋ Hinzufügen',
    addFlightCar: '＋ Flug / Transport hinzufügen',
    close: '－ Schließen',
    addFlight: 'Flug hinzufügen',
    flightNumber: 'Flugnummer',
    departureDate: 'Abreisedatum',
    createFlight: 'Flug anlegen',
    offerTransport: 'Transport anbieten',
    mode: 'Verkehrsmittel',
    direction: 'Richtung',
    toAirport: 'Zum Abflugflughafen',
    fromAirport: 'Vom Ankunftsflughafen',
    travelDate: 'Reisedatum',
    totalSeats: 'Gesamtplätze (inkl. Fahrer)',
    statusLabel: 'Status',
    confirmed: 'Bestätigt',
    provisional: 'Vorläufig',
    cancelled: 'Abgesagt',
    note: 'Notiz (Abfahrtsort / -zeit)',
    offerTransportBtn: 'Transport anbieten',
    admin: '⚙️ Admin',
    closeAdmin: '⚙️ Admin schließen',
    adminManage: 'Admin — Flüge verwalten',
    editFlight: 'Flug bearbeiten',
    saveFlight: 'Flug speichern',
    destCity: 'Ankunftsstadt / -flughafen',
    depCity: 'Abfahrtsstadt / -flughafen',
    depTime: 'Abfahrtszeit (HH:MM)',
    passengers: 'Passagiere',
    passengerHint: 'Suche und wähle die Personen aus, die mit dir reisen, oder gib einen eigenen Namen ein. Plätze werden mit dem Fahrer außerhalb der App vereinbart.',
    searchPlaceholder: 'Personen suchen oder Namen eingeben…',
    typeLetter: 'Mindestens einen Buchstaben eingeben, um zu suchen.',
    noMatches: 'Keine Treffer.',
    addCustom: 'Hinzufügen',
    selected: 'Ausgewählt',
    noSelected: 'Keine Passagiere ausgewählt.',
    savePassengers: 'Passagiere speichern',
    closeBtn: 'Schließen',
    modify: 'Ändern',
    editTransport: 'Transport ändern',
    save: 'Speichern',
    delete: 'Löschen',
    editPassengers: 'Passagiere bearbeiten',
    addedByAdmin: 'von einem Admin hinzugefügt',
    noPassengers: '(noch keine Passagiere)',
    seatsFree: 'Platz frei',
    seatsFreePlural: 'Plätze frei',
    full: 'Voll',
    youDrive: 'du fährst',
    with: 'mit',
    nothingPlanned: 'Noch nichts geplant.<br/>Tritt einem Flug oder Transport in der Übersicht bei.',
    routeNa: 'Strecke unbekannt',
    today: 'Heute',
    tomorrow: 'Morgen',
    pickDate: 'Wähle ein Reisedatum für das Auto.',
    enterFlightAndDate: 'Flugnummer und Datum eingeben.',
    saved: 'Gespeichert.',
    transportUpdated: 'Transport aktualisiert.',
    flightUpdated: 'Flug aktualisiert.',
    noteSaved: 'Notiz gespeichert.',
    pickFlight: 'Wähle zuerst einen Flug.',
    enterFlightId: 'Flug-ID eingeben.',
    onBehalf: 'Im Namen von (Fahrer/Eigentümer)',
    myself: '— ich selbst —',
    noOtherUsers: 'Noch keine anderen Nutzer haben die App geöffnet.',
    you: 'dir',
  },
};

// Norwegian has two codes (no / nb); map both to the same dictionary.
STRINGS.nb = STRINGS.no;

const userLang = (tg?.initDataUnsafe?.user?.language_code || 'fr').slice(0, 2);
const t = STRINGS[userLang] || STRINGS.fr;

// Mode-of-transport labels/icons for transport cards.
const MODE_LABELS = {
  car: '🚗 ' + (userLang === 'fr' ? 'Voiture perso' : 'Private car'),
  rental: '🚙 ' + (userLang === 'fr' ? 'Voiture de location' : 'Rental car'),
  train: '🚆 ' + (userLang === 'fr' ? 'Train' : 'Train'),
  bus: '🚌 ' + (userLang === 'fr' ? 'Bus' : 'Bus'),
  shuttle: '🚐 ' + (userLang === 'fr' ? 'Navette' : 'Shuttle'),
  taxi: '🚕 ' + (userLang === 'fr' ? 'Taxi' : 'Taxi'),
  pickup: '🤝 ' + (userLang === 'fr' ? 'Covoiturage' : 'Pickup'),
  other: '✈️ ' + (userLang === 'fr' ? 'Transport' : 'Transport'),
};

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

  // Follow live theme switches (user changes Telegram day/night mode) — the
  // CSS variables are bound to Telegram's themeParams, so re-sync the header
  // and background colors to the new palette.
  tg.onEvent('themeChanged', () => {
    const hc = tg.themeParams?.header_bg_color
      || tg.themeParams?.secondary_bg_color
      || tg.themeParams?.bg_color;
    if (hc) {
      try { tg.setHeaderColor(hc); } catch (_) {}
      try { tg.setBackgroundColor(hc); } catch (_) {}
    }
  });

  // Add to home screen (Bot API 8.0+ on supported clients): offer the native
  // install prompt once the app is up. The button stays hidden on clients
  // that don't expose the method, and disappears permanently once the icon
  // has been added (event) or is already present (status check).
  if (typeof tg.addToHomeScreen === 'function') {
    const homeBtn = document.getElementById('add-home');
    const hideHomeBtn = () => { if (homeBtn) homeBtn.classList.add('hidden'); };
    // Already added (or unsupported status)? Don't show the button at all.
    try {
      if (typeof tg.checkHomeScreenStatus === 'function') {
        tg.checkHomeScreenStatus((status) => {
          // status.status: 'unsupported' | 'unknown' | 'added' | 'missed'
          if (status?.status === 'added') hideHomeBtn();
        });
      }
    } catch (_) { hideHomeBtn(); } // unsure → don't show it
    if (homeBtn) {
      homeBtn.classList.remove('hidden');
      homeBtn.addEventListener('click', () => {
        try { tg.addToHomeScreen(); } catch (_) { hideHomeBtn(); }
      });
    }
    // The client confirms the icon was added → remove the button.
    tg.onEvent('homeScreenAdded', hideHomeBtn);
  }
}

// Set your backend Worker URL here (or via ?api= query param for easy testing).
const API = new URLSearchParams(location.search).get('api') || 'https://samferd.info473.workers.dev';

const $ = (id) => document.getElementById(id);

let me = null;
let isAdmin = false;
let allFlights = []; // full flight objects, kept for the admin panel
let knownUsers = []; // display info of users known to the app (for rider picker)
let allCars = [];
let currentGroup = null; // { id, title, photoUrl, admin }
let myGroups = []; // groups the user belongs to

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

// The selected group id is sent with every request so the backend loads the
// right group's board and derives admin rights for that group.
let selectedGroupId = Number(localStorage.getItem('samferdGroupId')) || null;

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Init-Data': tg ? tg.initData : '',
      ...(selectedGroupId ? { 'X-Group-Id': String(selectedGroupId) } : {}),
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
  if (iso === today) return t.today;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (iso === tomorrow) return t.tomorrow;
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
      title: t.transportTo,
      count: carsOut.length,
      add: { form: 'car', direction: 'outbound' },
      body: carsOut.length ? carsOut.map(renderCar).join('') : `<div class="empty">${t.noTransportTo}</div>`,
    },
    {
      key: 'flights',
      title: t.flights,
      count: dayFlights.length,
      add: { form: 'flight' },
      body: dayFlights.length ? dayFlights.map(renderFlight).join('') : `<div class="empty">${t.noFlights}</div>`,
    },
    {
      key: 'cars-return',
      title: t.transportFrom,
      count: carsReturn.length,
      add: { form: 'car', direction: 'return' },
      body: carsReturn.length ? carsReturn.map(renderCar).join('') : `<div class="empty">${t.noTransportFrom}</div>`,
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
        <button class="btn small section-add" data-add-form="${s.add.form}"${s.add.direction ? ` data-add-direction="${s.add.direction}"` : ''}>${t.add}</button>
      </div>
      <div class="section-body${open ? '' : ' collapsed'}" data-body="${s.key}">${s.body}</div>`;
  }

  bindSectionToggles();
  bindSectionAddButtons();
  bindBoardActions();
}

// Per-section Add buttons: open the add form showing ONLY the relevant
// sub-form (flight or transport), with the direction pre-filled from the
// section — no manual direction selection needed.
let addCarDirection = 'outbound'; // set by the section's Add button

function bindSectionAddButtons() {
  document.querySelectorAll('.section-add').forEach((btn) => {
    btn.addEventListener('click', () => {
      const form = btn.dataset.addForm;
      const addForm = $('add-form');
      addForm.classList.remove('hidden');

      // Show only the relevant sub-form.
      const isFlight = form === 'flight';
      $('add-flight-form').classList.toggle('hidden', !isFlight);
      $('add-car-form').classList.toggle('hidden', isFlight);

      if (!isFlight) {
        // Direction comes from the section (no field in the form).
        addCarDirection = btn.dataset.addDirection || 'outbound';
        // Default the travel date to the currently selected day.
        if (selectedDay) $('car-date').value = selectedDay;
      } else if (selectedDay) {
        $('departure-date').value = selectedDay;
      }

      const target = isFlight ? $('flight-number') : $('car-mode');
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (target.focus) target.focus({ preventScroll: true });
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

// --- My journey view ---------------------------------------------------------
// A personal summary: for each upcoming day, the transport the user drives or
// rides in, and the flights they are on — so missing legs are obvious.

let currentView = 'board';

function setView(view) {
  currentView = view;
  const board = view === 'board';
  $('view-board').classList.toggle('active', board);
  $('view-journey').classList.toggle('active', !board);
  $('journey-view').classList.toggle('hidden', board);
  for (const id of ['board-cars-out', 'board-flights', 'board-cars-return']) {
    $(id).classList.toggle('hidden', !board);
  }
  $('day-tabs').classList.toggle('hidden', !board);
  if (!board) renderJourney();
}

function renderJourney() {
  const today = new Date().toISOString().slice(0, 10);
  const box = $('journey-view');

  // Collect the user's involvement per day.
  const byDay = new Map();
  const add = (date, entry) => {
    if (!byDay.has(date)) byDay.set(date, []);
    byDay.get(date).push(entry);
  };

  for (const f of allFlights) {
    if (f.departureDate < today) continue;
    if (f.passengers.some((p) => p.id === me)) {
      add(f.departureDate, {
        icon: '🛫',
        main: `${f.flightNumber}${f.departureTime ? ` · ${f.departureTime}` : ''}`,
        sub: f.origin && f.destination ? `${f.origin} → ${f.destination}` : t.routeNa,
        ok: true,
      });
    }
  }
  for (const c of allCars) {
    if (!c.date || c.date < today) continue;
    const driving = c.driver.id === me;
    const riding = c.riders.some((r) => r.id === me);
    if (!driving && !riding) continue;
    const mode = MODE_LABELS[c.mode] || MODE_LABELS.other;
    const status = c.tripStatus === 'cancelled' ? 'cancelled'
      : c.tripStatus === 'provisional' ? 'provisional' : 'confirmed';
    add(c.date, {
      icon: '🚗',
      main: driving ? `${mode} — ${t.youDrive}` : `${mode} ${t.with} ${c.driver.name}`,
      sub: c.note || '',
      ok: status === 'confirmed',
      warn: status === 'provisional',
      bad: status === 'cancelled',
    });
  }

  const days = [...byDay.keys()].sort();
  if (!days.length) {
    box.innerHTML = `<section class="panel"><div class="empty">${t.nothingPlanned}</div></section>`;
    return;
  }

  box.innerHTML = days.map((d) => {
    const items = byDay.get(d).map((e) => `
      <div class="journey-item${e.bad ? ' cancelled' : ''}">
        <span class="journey-icon">${e.icon}</span>
        <span class="journey-main">
          <span>${escapeHtml(e.main)}</span>
          ${e.sub ? `<span class="journey-sub">${escapeHtml(e.sub)}</span>` : ''}
        </span>
        <span class="badge ${e.bad ? 'bad' : e.warn ? 'warn' : 'ok'}">${e.bad ? t.cancelled : e.warn ? t.provisional : t.confirmed}</span>
      </div>`).join('');
    return `
      <section class="panel">
        <h2 class="section-title">${escapeHtml(formatDate(d))}</h2>
        ${items}
      </section>`;
  }).join('');
}

function renderFlight(f) {
  const route = f.origin && f.destination
    ? `<span class="route-origin">${escapeHtml(f.origin)}</span> → <span class="route-dest">${escapeHtml(f.destination)}</span>`
    : `<span class="route-na">${t.routeNa}</span>`;
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
    : `<li class="empty">${t.noPassengers}</li>`;

  const actions = [
    onFlight
      ? `<button class="btn small" data-act="leave-flight" data-id="${f.id}">${t.closeBtn === 'Fermer' ? 'Quitter' : 'Leave'}</button>`
      : `<button class="btn small primary" data-act="join-flight" data-id="${f.id}">${t.closeBtn === 'Fermer' ? 'Rejoindre' : 'Join'}</button>`,
    isCreator
      ? `<button class="btn small danger" data-act="del-flight" data-id="${f.id}">${t.delete}</button>`
      : (isAdmin ? `<button class="btn small danger" data-act="del-flight" data-id="${f.id}">${t.delete} 🔒</button>` : ''),
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

// Mode-of-transport labels/icons for transport cards (i18n-aware, see top).
const MODE_LABELS_UNUSED = null;

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
    confirmed: `<span class="badge ok">${t.confirmed}</span>`,
    provisional: `<span class="badge warn">${t.provisional}</span>`,
    cancelled: `<span class="badge bad">${t.cancelled}</span>`,
  }[tripStatus] || '';
  const fullBadge = isFull && !isCancelled ? `<span class="badge bad">${t.full}</span>` : '';
  const seatsLine = isCancelled
    ? ''
    : `<span class="flight-date">${remaining} ${remaining === 1 ? t.seatsFree : t.seatsFreePlural}</span>`;

  // Riders are managed by the driver only — no self-registration.
  const riders = c.riders.length
    ? c.riders.map((r) => `<li><span>${escapeHtml(r.name)}</span></li>`).join('')
    : `<li class="empty">${t.noPassengers}</li>`;

  const actions = isDriver || isAdmin
    ? [
        `<button class="btn small primary" data-act="edit-riders" data-id="${c.id}">${t.editPassengers}</button>`,
        `<button class="btn small" data-act="edit-car" data-id="${c.id}">${t.modify}</button>`,
        `<button class="btn small danger" data-act="del-car" data-id="${c.id}">${t.delete}${isAdmin && !isDriver ? ' 🔒' : ''}</button>`,
      ].join('')
    : '';

  // Show who created it when an admin added it on behalf of someone else.
  const onBehalf = c.createdBy && c.createdBy !== c.driver.id
    ? `<div class="flight-airline">${t.addedByAdmin}</div>`
    : '';

  return `
    <div class="flight${isCancelled ? ' cancelled' : ''}">
      <div class="flight-head">
        <span class="flight-number">${escapeHtml(modeLabel)} · ${escapeHtml(c.driver.name)}</span>
        ${seatsLine}
      </div>
      <div class="flight-badges">${statusBadge}${fullBadge}</div>
      ${c.note ? `<div class="flight-route">${escapeHtml(c.note)}</div>` : ''}
      ${onBehalf}
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
    toast(t.transportUpdated);
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
    box.innerHTML = `<div class="empty">${t.typeLetter}</div>`;
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
        <span class="rider-action">${sel ? '✓' : '+ ' + t.addCustom}</span>
      </button>`;
  }).join('');

  // Offer a custom entry when the typed name isn't an exact known match.
  if (!exactKnown && !alreadySelected) {
    html += `
      <button class="rider-row custom" data-pick-name="${escapeHtml(query.trim())}">
        <span>➕ ${t.addCustom} “${escapeHtml(query.trim())}”</span>
        <span class="rider-action">${t.addCustom}</span>
      </button>`;
  }

  box.innerHTML = html || `<div class="empty">${t.noMatches}</div>`;

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
    : `<div class="empty">${t.noSelected}</div>`;

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
    toast(t.saved);
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
    toast(t.enterFlightAndDate);
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
  const direction = addCarDirection; // set by the section's Add button
  const date = $('car-date').value;
  const tripStatus = $('car-trip-status').value;
  const mode = $('car-mode').value;
  const onBehalfId = isAdmin ? (Number($('car-on-behalf').value) || null) : null;
  if (!date) {
    toast(t.pickDate);
    return;
  }
  try {
    await call('POST', '/api/cars', { freeSeats, note, direction, date, tripStatus, mode, onBehalfId });
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
    toast(t.pickFlight);
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
    toast(t.flightUpdated);
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

// Apply localized labels to the static HTML (labels, buttons, headings).
function applyStaticI18n() {
  document.title = t.title;
  document.querySelector('.topbar h1').textContent = t.title;
  $('loading').textContent = t.loading;
  document.querySelector('#denied h2').textContent = t.membersOnly;
  document.querySelector('#denied p').textContent = t.membersOnlyText;
  document.querySelector('#denied .empty').textContent = t.askAdmin;
  $('view-board').textContent = t.board;
  $('view-journey').textContent = t.myJourney;
  document.querySelector('#add-flight-form h2').textContent = t.addFlight;
  const flightLabels = document.querySelectorAll('#add-flight-form label');
  if (flightLabels[0]) flightLabels[0].firstChild.textContent = t.flightNumber;
  if (flightLabels[1]) flightLabels[1].firstChild.textContent = t.departureDate;
  $('create-flight').textContent = t.createFlight;
  document.querySelector('#add-car-form h2').textContent = t.offerTransport;
  const carLabels = document.querySelectorAll('#add-car-form label');
  // Order: mode, on-behalf, travel date, status, seats, note
  if (carLabels[0]) carLabels[0].firstChild.textContent = t.mode;
  if (carLabels[1]) carLabels[1].firstChild.textContent = t.onBehalf;
  if (carLabels[2]) carLabels[2].firstChild.textContent = t.travelDate;
  if (carLabels[3]) carLabels[3].firstChild.textContent = t.statusLabel;
  if (carLabels[4]) carLabels[4].firstChild.textContent = t.totalSeats;
  if (carLabels[5]) carLabels[5].firstChild.textContent = t.note;
  $('create-car').textContent = t.offerTransportBtn;
  $('close-add').textContent = t.closeBtn;
  const statusSel = $('car-trip-status');
  if (statusSel) {
    statusSel.options[0].textContent = t.confirmed;
    statusSel.options[1].textContent = t.provisional;
  }
  $('toggle-admin').textContent = t.admin;
  document.querySelector('#admin-panel h2').textContent = t.adminManage;
  document.querySelector('#admin-editor h2').textContent = t.editFlight;
  const adminLabels = document.querySelectorAll('#admin-editor label');
  if (adminLabels[0]) adminLabels[0].firstChild.textContent = t.flightNumber;
  if (adminLabels[1]) adminLabels[1].firstChild.textContent = t.departureDate;
  if (adminLabels[2]) adminLabels[2].firstChild.textContent = t.depCity;
  if (adminLabels[3]) adminLabels[3].firstChild.textContent = t.destCity;
  if (adminLabels[4]) adminLabels[4].firstChild.textContent = t.depTime;
  $('admin-save-flight').textContent = t.saveFlight;
  document.querySelector('#rider-editor h2').textContent = t.passengers;
  document.querySelector('#rider-editor .hint').textContent = t.passengerHint;
  $('rider-search').placeholder = t.searchPlaceholder;
  const selHeading = document.querySelector('#rider-editor h2.mt');
  if (selHeading) selHeading.innerHTML = `${t.selected} (<span id="rider-count">0</span>)`;
  $('save-riders').textContent = t.savePassengers;
  $('close-riders').textContent = t.closeBtn;
  document.querySelector('#car-editor h2').textContent = t.editTransport;
  const carEditorLabels = document.querySelectorAll('#car-editor label');
  if (carEditorLabels[0]) carEditorLabels[0].firstChild.textContent = t.travelDate;
  if (carEditorLabels[1]) carEditorLabels[1].firstChild.textContent = t.direction;
  if (carEditorLabels[2]) carEditorLabels[2].firstChild.textContent = t.totalSeats;
  if (carEditorLabels[3]) carEditorLabels[3].firstChild.textContent = t.statusLabel;
  if (carEditorLabels[4]) carEditorLabels[4].firstChild.textContent = t.note;
  $('car-edit-save').textContent = t.save;
  $('car-edit-close').textContent = t.closeBtn;
  const carDirSel = $('car-edit-direction');
  if (carDirSel) {
    carDirSel.options[0].textContent = t.toAirport;
    carDirSel.options[1].textContent = t.fromAirport;
  }
  const carStatusSel = $('car-edit-status');
  if (carStatusSel) {
    carStatusSel.options[0].textContent = t.confirmed;
    carStatusSel.options[1].textContent = t.provisional;
    carStatusSel.options[2].textContent = t.cancelled;
  }
}

// --- Group picker / group context -------------------------------------------

function showGroupPicker(groups) {
  $('loading').classList.add('hidden');
  $('app').classList.add('hidden');
  $('group-picker').classList.remove('hidden');
  const list = $('group-list');
  list.innerHTML = groups.map((g) => `
    <button class="group-row" data-group="${g.id}">
      ${g.photoUrl
        ? `<img class="group-photo" src="${escapeHtml(g.photoUrl)}" alt="" />`
        : '<span class="group-photo-fallback">✈️</span>'}
      <span class="group-row-name">${escapeHtml(g.title)}</span>
      ${g.admin ? '<span class="badge ok">admin</span>' : ''}
    </button>`).join('');

  list.querySelectorAll('[data-group]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedGroupId = Number(btn.dataset.group);
      localStorage.setItem('samferdGroupId', String(selectedGroupId));
      $('group-picker').classList.add('hidden');
      startApp();
    });
  });

  // The picker is a complete, interactive screen — safe to reveal now.
  if (tg) { try { tg.ready(); } catch (_) {} }
}

function renderGroupHeader() {
  if (!currentGroup) return;
  $('group-header').classList.remove('hidden');
  $('group-name').textContent = currentGroup.title;
  const img = $('group-photo');
  const fb = $('group-photo-fallback');
  if (currentGroup.photoUrl) {
    img.src = currentGroup.photoUrl;
    img.classList.remove('hidden');
    fb.classList.add('hidden');
  } else {
    img.classList.add('hidden');
    fb.classList.remove('hidden');
  }
  // Admins get a lock badge next to the group name.
  const lock = document.getElementById('group-admin-lock');
  if (lock) lock.remove();
  if (isAdmin) {
    const span = document.createElement('span');
    span.id = 'group-admin-lock';
    span.className = 'admin-lock';
    span.title = 'Admin';
    span.textContent = ' 🔒';
    $('group-name').appendChild(span);
  }
}

async function startApp() {
  try {
    const auth = await call('GET', '/api/auth');
    me = auth.user.id;
    isAdmin = !!auth.isAdmin;
    currentGroup = auth.group || null;
    myGroups = auth.groups || [];
    $('loading').classList.add('hidden');
    $('group-picker').classList.add('hidden');
    $('denied').classList.add('hidden');
    $('app').classList.remove('hidden');
    renderGroupHeader();
    await refresh();
    // All required data (auth, board, cars, users) is loaded AND fully
    // rendered. Give the browser a couple of frames plus a short settle so
    // layout, day tabs and section cards are painted before revealing the
    // app — the user must never see a half-painted board.
    await settleBeforeReady();
    if (tg) { try { tg.ready(); } catch (_) {} }
  } catch (e) {
    // 403 → not a member of any whitelisted group
    showDenied(t.membersOnly, t.membersOnlyText, t.askAdmin);
    if (tg) { try { tg.ready(); } catch (_) {} }
  }
}

// Wait until the DOM is painted and stable: two animation frames guarantee
// layout/paint, then a short delay lets images (group photo) and fonts settle.
function settleBeforeReady() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(async () => {
      // Wait for any <img> that is still loading (group photo, etc.), max 1.5s.
      const imgs = [...document.querySelectorAll('#app img, #group-header img')]
        .filter((i) => !i.complete);
      if (imgs.length) {
        await Promise.race([
          Promise.all(imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r; }))),
          new Promise((r) => setTimeout(r, 1500)),
        ]);
      }
      setTimeout(resolve, 250);
    }));
  });
}

/**
 * Show the blocked screen. When the bot is not an admin of any group the user
 * belongs to, show the specific "give the bot admin rights" warning.
 */
async function showDenied(title, text, hint) {
  $('loading').classList.add('hidden');
  $('group-picker').classList.add('hidden');
  $('app').classList.add('hidden');
  $('denied').classList.remove('hidden');
  $('denied-title').textContent = title;
  $('denied-text').textContent = text;
  // Build tag: proves which version the webview is actually running.
  const build = document.getElementById('build-tag');
  $('denied-hint').textContent = (hint ? hint + ' · ' : '') + (build ? build.textContent : '');
  // The blocked screen is final content — reveal the app.
  if (tg) { try { tg.ready(); } catch (_) {} }

  // Distinguish "not a member" from "bot lost admin": ask the backend which
  // whitelisted groups the bot can still see.
  try {
    const status = await call('GET', '/api/bot-status');
    const botGroups = (status.groups || []).filter((g) => g.botAdmin);
    const userInBotAdminGroup = botGroups.some((g) => myGroups.some((m) => m.id === g.id));
    if (myGroups.length > 0 && !userInBotAdminGroup) {
      // The user is a member of whitelisted group(s), but the bot is not an
      // admin in any of them → the specific warning requested.
      $('denied-title').textContent = '🤖 ' + (userLang === 'fr'
        ? 'Droits du bot manquants'
        : userLang === 'de' ? 'Bot-Rechte fehlen'
        : userLang === 'no' || userLang === 'nb' ? 'Botrettigheter mangler'
        : 'Bot permissions missing');
      $('denied-text').textContent = userLang === 'fr'
        ? "Le bot du mini app n'a trouvé aucun groupe dont vous êtes membre où il possède les droits d'administrateur. Veuillez donner les droits d'administrateur à ce bot."
        : userLang === 'de'
        ? 'Der Mini-App-Bot hat keine Gruppe gefunden, in der Sie Mitglied sind und wo er Admin-Rechte hat. Bitte geben Sie diesem Bot Admin-Rechte.'
        : userLang === 'no' || userLang === 'nb'
        ? 'Mini-app-boten fant ingen gruppe du er medlem av der den har adminrettigheter. Vennligst gi denne boten adminrettigheter.'
        : 'The mini app bot did not find a group you are member of where it has admin rights, please give admin rights to this bot.';
      $('denied-hint').textContent = userLang === 'fr'
        ? 'Groupes configurés : ' + (status.groups || []).map((g) => g.title).join(', ')
        : userLang === 'de'
        ? 'Konfigurierte Gruppen: ' + (status.groups || []).map((g) => g.title).join(', ')
        : 'Configured groups: ' + (status.groups || []).map((g) => g.title).join(', ');
    }
  } catch { /* keep the generic message */ }
}

async function init() {
  // Telegram WebApp is required for identity. Allow a fallback note for web preview.
  if (!tg) {
    $('loading').textContent = t.openInTelegram;
    return;
  }
  // If Telegram did not provide signed initData (e.g. the URL was opened
  // directly in a browser), nothing can authenticate — say so clearly
  // instead of the misleading "members only" screen.
  if (!tg.initData) {
    $('loading').classList.add('hidden');
    $('denied').classList.remove('hidden');
    $('denied-title').textContent = '⚠️ ' + (userLang === 'fr'
      ? 'Ouvrir dans Telegram'
      : userLang === 'de' ? 'In Telegram öffnen'
      : userLang === 'no' || userLang === 'nb' ? 'Åpne i Telegram'
      : 'Open in Telegram');
    $('denied-text').textContent = userLang === 'fr'
      ? "Cette page doit être ouverte depuis Telegram pour pouvoir vous identifier. Ouvrez le mini app via le bouton du bot (pas dans un navigateur)."
      : userLang === 'de'
      ? 'Diese Seite muss aus Telegram geöffnet werden, damit du identifiziert werden kannst. Öffne die Mini App über die Bot-Schaltfläche (nicht im Browser).'
      : userLang === 'no' || userLang === 'nb'
      ? 'Denne siden må åpnes fra Telegram for at du kan identifiseres. Åpne mini-appen via bot-knappen (ikke i en nettleser).'
      : 'This page must be opened from Telegram so you can be identified. Open the mini app via the bot button (not in a browser).';
    $('denied-hint').textContent = userLang === 'fr'
      ? `URL actuelle : ${location.host}`
      : userLang === 'de'
      ? `Aktuelle URL: ${location.host}`
      : `Current URL: ${location.host}`;
    if (tg) { try { tg.ready(); } catch (_) {} }
    return;
  }

  // Resolve the user's groups first: one group → straight in; several → picker.
  try {
    const probe = await call('GET', '/api/groups');
    myGroups = probe.groups || [];
    if (probe.current) selectedGroupId = probe.current;
  } catch (e) {
    await showDenied(t.membersOnly, t.membersOnlyText, t.askAdmin);
    return;
  }

  // Validate the remembered group against the current membership list; a stale
  // id (bot removed from that group, etc.) must not block access.
  if (selectedGroupId && !myGroups.some((g) => g.id === selectedGroupId)) {
    selectedGroupId = null;
    localStorage.removeItem('samferdGroupId');
  }

  if (myGroups.length > 1 && !selectedGroupId) {
    showGroupPicker(myGroups);
  } else {
    if (!selectedGroupId && myGroups.length) selectedGroupId = myGroups[0].id;
    await startApp();
  }

  // Apply localized static labels.
  applyStaticI18n();

  // Close button for the add form.
  $('close-add').addEventListener('click', () => {
    $('add-form').classList.add('hidden');
  });

  // Group switcher: re-open the picker.
  $('switch-group').addEventListener('click', () => {
    selectedGroupId = null;
    localStorage.removeItem('samferdGroupId');
    $('app').classList.add('hidden');
    showGroupPicker(myGroups);
  });

  // Admin button + panel (visible only to admins of the selected group).
  if (isAdmin) {
    // Admins can create transport on behalf of a known user.
    $('on-behalf-label').classList.remove('hidden');
    const sel = $('car-on-behalf');
    const fillOnBehalf = () => {
      const current = sel.value;
      sel.innerHTML = `<option value="">${t.myself}</option>`
        + knownUsers.filter((u) => u.id !== me).map((u) =>
          `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
      if (current) sel.value = current;
    };
    fillOnBehalf();
    // Keep the list fresh each time the board refreshes.
    const origRefresh = refresh;
    refresh = async function () { await origRefresh(); fillOnBehalf(); };

    $('toggle-admin').classList.remove('hidden');
    const adminToggle = $('toggle-admin');
    adminToggle.textContent = `${t.admin} 🔒`;
    const adminPanel = $('admin-panel');
    adminToggle.addEventListener('click', () => {
      const hidden = adminPanel.classList.toggle('hidden');
      adminToggle.textContent = hidden ? t.admin : t.closeAdmin;
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
  $('view-board').addEventListener('click', () => setView('board'));
  $('view-journey').addEventListener('click', () => setView('journey'));
}

init();
