# Samferd

**Etymology:** from *sam-* (“co-”) + *ferd* (“journey”).
**Noun** — *samferd*: travel, journey together with someone.

Samferd is a self-hostable, non-commercial web app that helps a group of people
coordinate a shared trip: minimize the number of cars to the airport, compare
flight prices across airports, and split car + parking costs fairly. It informs
and coordinates — it never books or charges anything.

📄 **Specification:** [docs/spec.md](docs/spec.md) · [docs/data-model.md](docs/data-model.md) · [docs/api.md](docs/api.md) · [docs/architecture.md](docs/architecture.md)

---

## Features

- **Invite-only access** — no public sign-up. Organizers generate multi-user invite
  links that expire automatically when the event passes.
- **Events** with multiple origin & destination airports, a single per-event currency
  (default EUR), and fixed dates.
- **Car pooling** — drivers offer seats; flyers request a seat; the driver approves.
  Per-person cost split (car + parking) is computed automatically.
- **Flight prices** — cached top-3 offers per route via the **Amadeus Self-Service API**,
  with flight numbers and search deep links. Scheduled + manual refresh.
- **Booked-flight tracking** — declare your flight number/date; the app enriches it via
  the Amadeus schedules API so everyone sees what flight people took.
- **Better-route email alerts** (daily digest) with a price/legs/duration comparison.
- **Multi-language** UI (default French, English included).
- **GDPR** — self-service JSON export and account deletion.

---

## Quick start (Docker Compose)

The easiest way to run Samferd is with Docker Compose (PostgreSQL + Redis + web +
Celery worker + beat).

### 1. Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Compose v2.

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` and set at least:

| Variable | Required | Purpose |
|---|---|---|
| `SECRET_KEY` | ✅ | Long random string. Generate with `python -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `ALLOWED_HOSTS` | ✅ | Your domain or `localhost,127.0.0.1` |
| `CSRF_TRUSTED_ORIGINS` | ✅ | e.g. `https://samferd.example.com` |
| `DEBUG` | ✅ | `false` in production |
| `DATABASE_URL` | ✅ | `postgres://samferd:samferd@db:5432/samferd` (matches compose) |
| `REDIS_URL` | ✅ | `redis://redis:6379/0` (matches compose) |
| `DEFAULT_LANGUAGE` | | `fr` (default) or `en` |
| `ENABLE_PASSWORD_AUTH` | | `true` to allow email/password login |

### 3. API credentials (Amadeus)

Samferd uses the **Amadeus Self-Service API** for flight prices and flight-number
enrichment. Get free credentials at <https://developers.amadeus.com> (Self-Service
products: *Flight Offers Search* and *On-Demand Flight Status*).

Set in `.env`:

```bash
FARE_PROVIDER=amadeus
AMADEUS_ENV=test          # 'test' for the sandbox, 'prod' for live prices
AMADEUS_CLIENT_ID=your_client_id
AMADEUS_CLIENT_SECRET=your_client_secret
API_MONTHLY_BUDGET=2000   # global call budget guard
```

> **Note:** with `AMADEUS_ENV=test` you get sample data. Switch to `prod` for real
> prices. The app degrades gracefully if credentials are missing — the price table
> simply shows "No offers yet".

### 4. Optional: OIDC (SSO) login

If you have an OIDC provider (Keycloak, Authentik, Google, GitHub…), set:

```bash
OIDC_RP_CLIENT_ID=...
OIDC_RP_CLIENT_SECRET=...
OIDC_OP_DISCOVERY_URL=https://your-provider/.well-known/openid-configuration
```

Account creation is still invite-only: OIDC only links an existing account to your
provider. Without OIDC, email/password signup (via invite link) is used.

### 5. Optional: email notifications

For seat-request and better-route emails, configure SMTP:

```bash
EMAIL_URL=smtp://user:pass@smtp.example.com:587/?ssl=true
DEFAULT_FROM_EMAIL=samferd@example.com
```

### 6. Run

```bash
docker compose up -d --build
```

Then:

```bash
# Create your first organizer (grants can_organize + superuser for the admin site)
docker compose exec web python manage.py create_organizer --email you@example.com --admin --password 'a-strong-password'

# Seed the built-in airport list (or pass --file airports.csv from ourairports.com)
docker compose exec web python manage.py seed_airports
```

Open <http://localhost:8000>. Log in, create an event, add airports, and generate an
invite link to share with your group.

> The admin site is at `/admin/`. The `--admin` flag above makes your user a superuser.

---

## Local development (no Docker)

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env   # set DATABASE_URL=sqlite:///db.sqlite3 for a quick start

python manage.py migrate
python manage.py seed_airports
python manage.py create_organizer --email you@example.com --admin --password 'a-strong-password'
python manage.py runserver
```

For background jobs locally, run Redis and:

```bash
celery -A samferd worker --loglevel=info
celery -A samferd beat --loglevel=info
```

---

## Project layout

```
samferd/
├── docs/                  # specification (spec, data-model, api, architecture)
├── samferd/
│   ├── settings.py        # Django settings (env-driven)
│   ├── celery.py          # Celery app
│   └── accounts/ events/ carpool/ fares/ notifications/   # feature apps
├── templates/             # server-rendered templates (HTMX)
├── static/                # static assets
├── manage.py
├── compose.yaml           # Docker Compose topology
├── Dockerfile
├── entrypoint.sh
├── requirements.txt
└── .env.example
```

## Configuration reference

All configuration is via environment variables (see `.env.example`). Key ones:

| Variable | Default | Purpose |
|---|---|---|
| `FARE_PROVIDER` | `amadeus` | Fare provider (abstraction allows adding more) |
| `AMADEUS_ENV` | `test` | `test` or `prod` |
| `API_MONTHLY_BUDGET` | `2000` | Global monthly API call budget guard |
| `TIE_TOLERANCE_PERCENT` | `5` | Better-route comparison tolerance |
| `DEFAULT_LANGUAGE` | `fr` | Instance default UI language |
| `ENABLE_PASSWORD_AUTH` | `true` | Toggle email/password login |

## License

Open source (license to be chosen — AGPL-3.0 suggested).

---

## Original brief

The original project brief is preserved below for reference.

> I want to create a webapp that will let a group of people coordinate travels.
> The use case is that I and other people are travelling from around the same place
> and would like to minimize the number of cars and to pay the lowest overall travel
> cost per person. The philosophy of the app is that we only want to coordinate the
> travel and help find the lowest air travel fare and parking cost for the car at the
> airport. The app is only a helper tool and is not designed to make money in itself.
> ... (see docs/spec.md for the full specification)