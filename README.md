# Samferd — shared flight board (Telegram Mini App)

**Samferd** is a Telegram Mini App that lets a group keep one shared, always-in-sync
board of everyone's upcoming flights. Members add their flight (number + departure
date), the board shows everyone read-only, and each person can set their own note.

All interaction happens inside the Mini App. The bot itself is **not interactive** —
it exists only to host the Mini App and to authenticate members.

---

## What it does

- **Members only** — every request is validated against your group membership,
  server-side, using Telegram's `initData` HMAC check + `getChatMember`.
- **Create flights** — flight number + departure date, from inside the app.
- **Join / leave** — add or remove yourself on any flight.
- **Your own note** — a short note next to your name (e.g. "window seat please").
- **Shared read-only board** — everyone sees the same synced list.
- **Optional auto-enrichment** — see below.

---

## Architecture

A Mini App is a web page, so it needs two pieces:

| Piece | What it is | Where it runs |
|---|---|---|
| **Frontend** | `miniapp/` — HTML/CSS/JS, talks to Telegram via `Telegram.WebApp` | Any static HTTPS host (see below) |
| **Backend** | `backend/` — a single Cloudflare Worker (HTTP API) | Cloudflare Workers (serverless, free tier) |

The backend validates `initData`, checks group membership, and stores the board in
Cloudflare KV. There is no always-on server and no bot message handling.

---

## Requirements

- A [Telegram bot](https://core.telegram.org/bots#how-do-i-create-a-bot) (via
  [@BotFather](https://t.me/botfather)) — used for the Mini App + the Bot API token.
- A group/supergroup the bot is **an administrator of** (for reliable membership checks).
- A [Cloudflare](https://cloudflare.com) account (free) for the backend Worker + KV.

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
wrangler secret put BOT_TOKEN      # your bot token from @BotFather
wrangler secret put GROUP_ID       # the group chat id, e.g. -100123456789

wrangler deploy
```

Note the Worker URL (e.g. `https://samferd.yourname.workers.dev`).

### 3. Host the frontend

Serve the `miniapp/` folder on any static HTTPS host — GitHub Pages, Cloudflare
Pages, Netlify, Vercel, etc. Then set the backend URL:

- Edit `miniapp/app.js` → `API` to your Worker URL, **or**
- Open the app with `?api=https://your-worker.workers.dev`.

Point the Mini App URL in @BotFather at your frontend URL.

### 4. Add the bot to the group

Add the bot as an **administrator** of your group, and share the Mini App
(`https://t.me/<bot>?startapp` or a direct link). Only group members get in;
everyone else sees a "Join the group" button (edit the invite link in `app.js`).

---

## Optional flight-data enrichment

The board stores flight number + date as entered. To auto-fetch origin/destination/
status, extend `backend/worker.js` in `createFlight` to call a flight API (e.g.
[Aviationstack](https://aviationstack.com)) before saving — the fields `origin`,
`destination`, and `status` are already in the schema.

---

## Security model

- `initData` is validated server-side with HMAC-SHA256 (bot token as key), with a
  freshness check on `auth_date`.
- Group membership is checked via `getChatMember` (`creator`/`administrator`/
  `member` allowed; `restricted` only if `is_member`), cached 5 minutes in KV.
- Only a flight's creator can delete it.
- The bot token and group id are Worker secrets — never in client code.

---

## Project layout

```
backend/
├─ worker.js       # Cloudflare Worker: initData validation, membership gate, board API
└─ wrangler.toml   # Worker + KV config (secrets set via `wrangler secret put`)
miniapp/
├─ index.html      # Mini App shell
├─ app.js          # frontend logic (Telegram WebApp SDK + API calls)
└─ app.css         # mobile-first, Telegram-themed styling
```

---

## License

Open source (AGPL-3.0 suggested).