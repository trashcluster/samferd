# Samferd — API & External Integrations

**Related docs:** [spec.md](spec.md) · [data-model.md](data-model.md) · [architecture.md](architecture.md)

## 1. Internal API

The frontend is server-rendered (Django templates + HTMX), so most interactions are
standard views returning HTML fragments. A small **DRF REST API** exists for dynamic parts
and future clients. All endpoints require an authenticated session; event endpoints require
participation in the event (or site-admin).

### Auth & account

| Method & path | Purpose |
|---|---|
| `GET /auth/oidc/login` / `/callback` | OIDC flow (mozilla-django-oidc or similar) |
| `POST /auth/login` | email/password fallback |
| `GET /invite/<token>` | invite landing: login-or-signup, then join event |
| `POST /invite/<token>/redeem` | create account (if needed) + Participation |
| `GET /api/me` / `PATCH /api/me` | profile, language, notification opt-outs, criteria ranking |
| `POST /api/me/export` | GDPR JSON export (async, emailed link) |
| `POST /api/me/delete` | GDPR erasure (anonymization) |

### Events

| Method & path | Purpose | Who |
|---|---|---|
| `GET /api/events` | list my events | user |
| `POST /api/events` | create event | organizer |
| `GET/PATCH /api/events/<id>` | details / edit (dates, currency*, refresh policy) | organizer |
| `POST /api/events/<id>/airports` | add origin/destination airport (any time) | organizer |
| `DELETE /api/events/<id>/airports/<iata>` | remove airport (only if unreferenced) | organizer |
| `POST /api/events/<id>/invites` | create multi-use invite link | organizer |
| `DELETE /api/events/<id>/invites/<token>` | revoke link | organizer |
| `DELETE /api/events/<id>/participants/<uid>` | remove participant | organizer |

\* currency editable only while no monetary values exist on the event.

### Participation, cars, seats

| Method & path | Purpose |
|---|---|
| `PATCH /api/events/<id>/me` | set travel mode, airport preference ranking |
| `POST/PATCH /api/events/<id>/cars` | offer/update my car (seats, cost, parking override) |
| `POST /api/cars/<id>/requests` | request a seat (direction) |
| `PATCH /api/requests/<id>` | approve / decline (driver), cancel (either side) |

### Prices & bookings

| Method & path | Purpose |
|---|---|
| `GET /api/events/<id>/offers` | cached price table (top 3 per route, with fetched_at) |
| `POST /api/events/<id>/refresh` | manual refresh; 429 with retry-after during cooldown |
| `PUT /api/events/<id>/bookings/<direction>` | set status/flight number/date/refundable/price |
| `GET /api/events/<id>/costs` | computed cost overview |

## 2. Fare provider abstraction

All external fare access goes through a single interface so providers are swappable
(Skyscanner later, if partner access is ever granted):

```python
class FareProvider(Protocol):
    def search_offers(
        self, origin: str, destination: str, date: date,
        currency: str, max_results: int = 3,
    ) -> list[Offer]: ...

    def enrich_flight(
        self, flight_number: str, date: date,
    ) -> FlightDetails | None: ...
```

`Offer` = price, legs, duration, segments (carrier, flight number, times), booking deep
link, provider id. Provider selected via settings (`FARE_PROVIDER=google_flights`).

## 3. Google Flights integration (v1 provider)

- **Auth**: none. Uses the open-source [`fast-flights`](https://github.com/AWeirdDev/flights)
  scraper against the Google Flights web UI (no API key).
- **Search**: one `create_query(...)` per RouteQuery (event × origin × destination ×
  direction), `trip="one-way"`, `seat="economy"`, `adults=1`, `currency=<event currency>`.
  The scraper returns every itinerary Google shows; the provider keeps only priced
  results, sorts ascending by price, and slices to `max_results` (3).
- **Consent bypass**: the provider pre-seeds Google's EU `CONSENT`/`SOCS` cookies so the
  scraper is not redirected to `consent.google.com` (required when running from EU IPs).
- **Enrichment**: **not supported** — there is no flight-status endpoint. `enrich_flight`
  returns `None`; bookings stay flagged `unverified` and are not retried.
- **Booking links**: the provider uses `query.url()`, the exact Google Flights search
  deep link for the itinerary, clearly labeled as "search this flight".
- **Politeness**: a 1.5 s delay is inserted between route queries to avoid Google
  rate-limiting/blocking.

Per event refresh cost = `origins × destinations × 2 directions` calls.

Example — worst expected case, 3 concurrent events, each 4 origins × 2 destinations:

| Item | Calls/month |
|---|---|
| Scheduled: 3 events × 16 calls × 2/day (12 h) × 30 d | 2 880 |
| Manual refreshes (est. 2/day/event × 16) | ~960 |
| Enrichment (≤ 30 bookings × ~2 calls) | ~60 |

→ ~3 900/month: slightly above free tier at absolute worst case, comfortably under it with
1–2 events or 24 h refresh. **Mitigations (implemented in v1):**

- Global instance rate limiter (token bucket, monthly budget in settings).
- Only active events refreshed (not past, ≥ 1 participant).
- When budget is 80 % consumed: scheduled refreshes degrade to 24 h and manual refresh is
  disabled, with a banner explaining why.
- Paid tier is a config change, not a code change.

## 4. Other external services

| Service | Use | Notes |
|---|---|---|
| **Geocoding** — Nominatim (OSM) | one-shot geocode of optional home city | cached; respects usage policy (1 req/s) |
| **Airport dataset** — OurAirports (public domain) | seed `Airport` table (IATA, name, coords) | management command, re-runnable |
| **Currency conversion** — ECB daily reference rates | display airport parking defaults (stored in their own currency) in the event currency | daily fetch, cached; informative only |
| **SMTP** | all notifications | instance-provided credentials |

## 5. Better-route alert job (contract)

Runs after each scheduled refresh, per active event, per participant:

1. Skip if `Booking.status == confirmed and refundable == false` (any direction ⇒ skip that
   direction only).
2. Reference = booked `price_paid` + booked itinerary if `booked/confirmed`, else best
   previous-snapshot offer.
3. Candidate = best current offer under the user's lexicographic criteria ranking with the
   5 % tie tolerance (legs: exact tie only).
4. If candidate strictly better → queue for the user's **daily digest** (max 1 email /
   user / event / 24 h, enforced via `NotificationLog`).
