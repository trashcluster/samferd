# Samferd — Full Setup Guide

A step-by-step guide from zero to a working Telegram Mini App, using **GitHub**,
**Cloudflare**, and **Telegram**. Follow each part in order.

---

## 0. What you'll end up with

```
[Telegram group members]  ──►  Mini App (web page)  ──►  Cloudflare Worker (API)
                                                             │
                                                       validates initData
                                                       checks group membership
                                                       stores board in KV
```

- **Telegram**: a bot (holds the Mini App + the API token).
- **Cloudflare**: the backend Worker (serverless API) + KV storage, and Pages
  (or any static host) for the Mini App frontend.
- **GitHub**: the repo that holds this code.

---

## Part 1 — GitHub (store the code)

1. Create a repository at <https://github.com/new> (e.g. `yourname/samferd`).
   - Keep it **private** if you prefer (you'll paste a bot token only as a
     Cloudflare secret, never in the repo — but private is still safer).
2. Push this project. In PowerShell, from the project root:

```powershell
git init
git add .
git commit -m "Samferd Mini App"
git branch -M main
git remote add origin https://github.com/yourname/samferd.git
git push -u origin main
```

> If you already have a remote, skip the `init`/`remote add` lines.

That's it for GitHub — the code is now versioned. The rest is deployment.

---

## Part 2 — Telegram (create the bot)

### 2.1 Create the bot

1. In Telegram, open **@BotFather** (<https://t.me/BotFather>).
2. Send `/newbot`.
3. Follow the prompts: choose a **name** (e.g. "Samferd") and a **username**
   ending in `bot` (e.g. `samferd_flight_bot`).
4. BotFather replies with a **token** like:

   ```
   1234567890:AAH...long-string...
   ```

   **Save this token.** You'll use it twice: as a Cloudflare secret and (implicitly)
   it's what makes the Mini App work.

### 2.2 Create / find your group

1. Create a **group** (or use an existing one).
2. Note the group's **chat id**. Easiest way:
   - Add **@RawDataBot** (or **@getidsbot**) to the group as a member.
   - It immediately posts a JSON message. Copy the `"id"` under `"chat"` — it
     looks like `-1001234567890` (negative for groups/supergroups).
   - Remove that helper bot afterward if you like.
3. **Add your Samferd bot to the group and promote it to administrator.**
   - This is required so the backend can reliably check each member's status
     with `getChatMember`.

### 2.3 Get the group invite link

1. In the group → **Group info → Invite link** (create one if none exists).
2. Copy it (e.g. `https://t.me/+AbCdEfGh`). You'll put this in `app.js` so
   non-members get a "Join the group" button.

> You'll configure the Mini App URL in @BotFather *after* deploying (Part 4),
> because you need the final frontend URL first.

---

## Part 3 — Cloudflare (backend + frontend)

### 3.1 Install Wrangler

```powershell
npm install -g wrangler
```

(Requires Node.js 18+. If `npm` is missing, install Node.js first from
<https://nodejs.org>.)

### 3.2 Log in

```powershell
wrangler login
```

This opens your browser to authorize Wrangler against your Cloudflare account.

### 3.3 Create the KV namespace

```powershell
cd backend
wrangler kv namespace create SAMFERD
```

The command prints a block with an `id`. Copy that id and paste it into
`backend/wrangler.toml`, replacing `YOUR_KV_NAMESPACE_ID`:

```toml
[[kv_namespaces]]
binding = "SAMFERD"
id = "abcd1234..."        # ← paste the real id here
```

### 3.4 Set the secrets

```powershell
wrangler secret put BOT_TOKEN
```

Paste your bot token (from Part 2.1) when prompted, press Enter.

```powershell
wrangler secret put GROUP_ID
```

Paste your group chat id (from Part 2.2, e.g. `-1001234567890`), press Enter.

> Secrets are stored encrypted in Cloudflare, never in your repo. Nothing
> sensitive goes in `wrangler.toml`.

### 3.5 Deploy the backend

```powershell
wrangler deploy
```

It prints the Worker URL, e.g.:

```
https://samferd.yourname.workers.dev
```

**Save this URL.** The Mini App frontend calls it.

### 3.6 Deploy the frontend (Cloudflare Pages)

From the **project root** (not `backend/`):

```powershell
cd ..
wrangler pages deploy miniapp --project-name samferd
```

When asked for a production branch, use `main` (any value is fine for a manual
deploy). It prints a URL like:

```
https://samferd.pages.dev
```

**Save this URL** — it's your Mini App address.

> Alternative static hosts (GitHub Pages, Netlify, Vercel) work too — just serve
> the `miniapp/` folder over HTTPS. Cloudflare Pages keeps everything in one place.

---

## Part 4 — Wire it together

### 4.1 Point the frontend at the backend

Open `miniapp/app.js` and set the `API` constant to your Worker URL:

```js
const API = 'https://samferd.yourname.workers.dev';
```

Also replace the invite-link placeholder with your real group invite link:

```js
tg.openTelegramLink('https://t.me/+AbCdEfGh');
```

Then redeploy the frontend:

```powershell
wrangler pages deploy miniapp --project-name samferd
```

> Tip: you can also override the API without redeploying by opening the app with
> `?api=https://your-worker.workers.dev` — handy for testing a local/dev Worker.

### 4.2 Configure the Mini App in Telegram

1. Open **@BotFather** → `/mybots` → select your bot.
2. **Bot Settings → Configure Mini App**.
3. Set the **Web App URL** to your frontend URL (e.g. `https://samferd.pages.dev`).
   - The URL must be **HTTPS**.
4. (Optional) **Menu Button** → set it to open your Mini App, so users see a
   button in the chat instead of typing `/start`.

### 4.3 Test it

1. In the group (or a chat with your bot), tap the **menu button** / open the app.
2. As a **group member**, you should see the board and be able to create/join flights.
3. To test the gate, ask a **non-member** (or a second account not in the group)
   to open the app — they should see the "Join the group" screen instead.

---

## Part 5 — Daily workflow (updating code)

```powershell
git add . && git commit -m "changes" && git push

# redeploy backend (if worker.js changed)
cd backend
wrangler deploy

# redeploy frontend (if miniapp/ changed)
cd ..
wrangler pages deploy miniapp --project-name samferd
```

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| App opens but shows "Members only" for a real member | Bot is not an admin of the group; or `GROUP_ID` secret is wrong. Re-check Part 2.2/2.3. |
| `initData` validation fails (403 on every request) | `BOT_TOKEN` secret doesn't match the bot; re-run `wrangler secret put BOT_TOKEN`. |
| Frontend can't reach the API | `API` in `app.js` is wrong, or CORS/URL mismatch. Check Part 4.1. |
| KV returns empty / no persistence | KV namespace id missing in `wrangler.toml`. Re-run Part 3.3. |
| "Open this app from inside Telegram" | You opened the URL in a normal browser. It must be opened via the Telegram bot/Mini App. |
| Mini App URL rejected by BotFather | It must be **https://** and a valid host. |

---

## Secrets checklist

| Secret | Where | Set how |
|---|---|---|
| Bot token | Cloudflare | `wrangler secret put BOT_TOKEN` |
| Group chat id | Cloudflare | `wrangler secret put GROUP_ID` |
| Group invite link | `miniapp/app.js` | edit the `openTelegramLink(...)` call |
| Worker URL | `miniapp/app.js` | edit the `API` constant |
| KV namespace id | `backend/wrangler.toml` | paste from `wrangler kv namespace create` |

**Never commit** the bot token or any key to GitHub.
