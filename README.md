# Samferd — group travel coordination (Telegram Mini App)

**Samferd** is a Telegram Mini App that lets a group coordinate travel to/from an
airport: a shared board of upcoming **flights** and **transport** (cars, trains,
shuttles…), organized by day, restricted to members of whitelisted Telegram groups.

All interaction happens inside the Mini App. The bot itself is **not interactive** —
it exists only to host the Mini App and to authenticate members.

---

## Features

- **Members only** — every request is validated server-side: Telegram `initData`
  HMAC check + live `getChatMember` lookup against a **whitelist of groups**
  (comma-separated `GROUP_ID`; membership in any of them grants access).
- **Day tabs** — one tab per travel day, soonest upcoming first; past days
  disappear automatically (planning only, no archive).
- **Three sections per day** — *Transport to the airport*, *Flights*,
  *Transport from the arrival airport* — each collapsible, with its own Add button.
- **Flights** — enter just a flight number + date; the schedule is auto-fetched
  (departure/arrival airports, times, terminal, gate, airline) via
  [AeroDataBox](https://www.aerodatabox.com/) and cached. Sorted by departure time.
- **Transport** — any mode (private/rental car, train, bus, shuttle, taxi, pickup),
  with driver, total seats, note, and a **status** (Confirmed / Provisional /
  Cancelled). Free seats are derived automatically (capacity − passengers).
- **Driver-managed passengers** — no self-registration in a car: the driver (or an
  admin) records passengers via a search-as-you-type picker that also accepts
  custom names (people not yet in the group).
- **My journey** — a personal per-day summary of your flights and rides, with
  status badges, so missing legs are obvious.
- **Admin powers** — admins can edit/delete anything, and create transport
  *on behalf of* another member (for less tech-savvy friends).
- **French UI** — auto-localized from the Telegram user's language (English
  fallback; more languages are just one dictionary entry away).

---

## Architecture

| Piece | What it is | Where it runs |
|---|---|---|
| **Frontend** | `miniapp/` — HTML/CSS/JS, talks to Telegram via `Telegram.WebApp` | Cloudflare Pages (or any static HTTPS host) |
| **Backend** | `backend/` — a single Cloudflare Worker (HTTP API) | Cloudflare Workers (serverless, free tier) |
| **Storage** | Board + caches | Cloudflare KV |

The backend validates `initData`, checks group membership, stores the board in KV,
and proxies flight-schedule lookups. There is no always-on server and no bot
message handling.

---

## Setup

### 1. Create the bot and Mini App

1. Create a bot with @BotFather.
2. @BotFather → your bot → **Bot Settings → Configure Mini App** → set the Mini App
   URL (your static frontend URL, from step 3 below). Enable the Mini App.

### 2. Deploy the backend

```bash
cd backend
npm install -g wrangler      # Cloudflare Workers CLI

# Create the KV namespace and paste its id into wrangler.toml
wrangler kv namespace create SAMFERD

# Set secrets (never committed to the repo)
wrangler secret put BOT_TOKEN              # bot token from @BotFather
wrangler secret put GROUP_ID               # comma-separated group ids, e.g. -100123,-100456
wrangler secret put FLIGHT_API_PROVIDER    # aerodatabox (or none)
wrangler secret put RAPIDAPI_KEY           # AeroDataBox key (if provider = aerodatabox)

wrangler deploy
```

Note the Worker URL (e.g. `https://samferd.yourname.workers.dev`).

### 3. Host the frontend

```bash
wrangler pages deploy miniapp --project-name samferd --branch main
```

This publishes to the stable `https://<project>.pages.dev` URL. Set that URL as
the Mini App URL in @BotFather (and as `API` in `miniapp/app.js` if different from
the default).

### 4. Add the bot to the group(s)

Add the bot as an **administrator** of every whitelisted group (required for
`getChatMember` to resolve statuses). Members open the app via the bot's menu
button or `https://t.me/<bot>?startapp`.

---

## Flight schedule enrichment

Set `FLIGHT_API_PROVIDER=aerodatabox` and store your RapidAPI key in
`RAPIDAPI_KEY`. The Worker calls

```
GET https://aerodatabox.p.rapidapi.com/flights/number/{number}/{date}?dateLocalRole=Both
```

once per (flight number, date) pair and caches the result in KV:

- **Found** → cached permanently (a schedule for a given date doesn't change).
- **Not found** (e.g. date beyond the provider's schedule horizon) → cached 6 h,
  then retried automatically as the date approaches.

Flights can also be edited manually by an admin (departure/arrival city, times,
airline) via the ⚙️ Admin panel — useful when the API has no data yet.

---

## Security model

- `initData` is validated server-side with HMAC-SHA256 (bot token as key), with a
  freshness check on `auth_date`.
- Group membership is checked **live on every request** via `getChatMember`
  (`creator`/`administrator`/`member` allowed; `restricted` only if `is_member`),
  across all whitelisted groups. No caching — access changes take effect instantly.
- Only the creator of a flight/transport (or an admin) can modify or delete it.
- All secrets (`BOT_TOKEN`, `GROUP_ID`, `RAPIDAPI_KEY`, …) are Worker secrets —
  never in client code or the repo.

---

## Project layout

```
backend/
├─ worker.js       # Cloudflare Worker: initData validation, membership gate, board API,
│                  #   flight enrichment (AeroDataBox/AirLabs), admin endpoints
└─ wrangler.toml   # Worker + KV config (secrets set via `wrangler secret put`)
miniapp/
├─ index.html      # Mini App shell
├─ app.js          # frontend logic (Telegram WebApp SDK, i18n, board/journey views)
└─ app.css         # mobile-first, Telegram-themed styling
IMPROVEMENTS.md    # community feedback backlog (items 1–15 implemented)
```

---

## License

Open source (AGPL-3.0 suggested).