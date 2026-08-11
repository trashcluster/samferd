# Migration plan: Amadeus API → `fast-flights` (Google Flights scraper)

> **Audience:** an LLM/developer performing the groundwork. Follow every step in order.
> Each step lists the exact file, what to change, and complete replacement code where relevant.
>
> **Context:** Amadeus discontinued their Self-Service API. We replace it with
> [`fast-flights` v3](https://github.com/AWeirdDev/flights) (PyPI: `fast-flights`), a
> scraper of the Google Flights web UI. No API key is needed.

---

## 0. Key differences you must understand before editing

| Aspect | Amadeus (old) | fast-flights (new) |
|---|---|---|
| Auth | OAuth2 client id/secret | **None** (scraper) |
| Currency | Exact, guaranteed (`currencyCode` param) | Best-effort `currency=` hint to Google; prices are `int` (no cents) |
| Price type | `float` with decimals | **`int`** (whole units); may be `None`-ish/0 if not parsed |
| Result ordering | API-ranked, `max` param | Returns *all* parsed itineraries; **we must sort & slice ourselves** |
| Date/time format | ISO-8601 strings | `SimpleDatetime` with `date: tuple[int,int,int]` and `time: tuple[int,int]` — **must be converted to ISO strings** |
| Segments | carrier code + flight number per segment | `SingleFlight` has airports/times/duration but **no per-segment carrier code or flight number** — only itinerary-level `airlines: list[str]` (display names) |
| Duration | ISO duration per itinerary | `duration: int` minutes per segment; sum them per itinerary |
| Legs/stops | `itineraries` count | one `Flights` object = one itinerary for the requested direction; `len(f.flights)` = segment count. `legs_count` for us = **1** per one-way search (we search each direction separately) |
| Flight-status enrichment | `/v2/schedule/flights` endpoint | **Not available.** Enrichment must be disabled (return `None`) |
| Failure modes | HTTP errors, quotas | `FlightsNotFound` exception, scraping/parsing errors, potential Google rate-limiting/blocking |
| Booking link | hand-built Google Flights URL | `query.url()` gives the exact Google Flights search URL |

**Library API surface used (fast-flights v3.x):**

```python
from fast_flights import FlightQuery, Passengers, create_query, get_flights, FlightsNotFound

query = create_query(
    flights=[FlightQuery(date="2026-09-09", from_airport="CDG", to_airport="LIS")],
    trip="one-way",
    seat="economy",
    passengers=Passengers(adults=1),
    currency="EUR",     # hint; Google may ignore for some locales
    language="en",
)
result = get_flights(query)          # -> ResultList (a list[Flights]) — raises FlightsNotFound if none
url = query.url()                     # Google Flights deep link for this exact search
```

Result data model (from `fast_flights.model`):

```python
Flights:        type: str, price: int, airlines: list[str], flights: list[SingleFlight], carbon: CarbonEmission
SingleFlight:   from_airport: Airport, to_airport: Airport, departure: SimpleDatetime,
                arrival: SimpleDatetime, duration: int (minutes), plane_type: str
Airport:        name: str, code: str
SimpleDatetime: date: tuple[int, int, int], time: tuple[int, int]
```

---

## 1. `requirements.txt` — add the dependency

Add one line (keep everything else):

```
fast-flights>=3.0,<4
```

> `fast-flights` pulls in `primp`, `selectolax`, and `protobuf` transitively. Do not add
> those explicitly. The `requests` line stays (used elsewhere).

---

## 2. Create `samferd/fares/providers/google_flights.py` (new file)

Create this file with **exactly** the following content:

```python
"""Google Flights fare provider via the fast-flights scraper library.

Replaces the discontinued Amadeus Self-Service API. No credentials required.
Notes:
- Prices come back as whole integers in the (hinted) currency; no cents.
- fast-flights returns every itinerary Google shows; we sort by price and slice.
- There is no flight-status/schedule endpoint, so enrich_flight returns None
  and bookings stay 'unverified' (enrichment_status = 'failed').
"""
import logging
from typing import List, Optional

from fast_flights import (
    FlightQuery,
    FlightsNotFound,
    Passengers,
    create_query,
    get_flights,
)

from .base import BaseFareProvider, Offer, Segment

logger = logging.getLogger(__name__)


def _fmt_datetime(sdt) -> Optional[str]:
    """Convert a fast-flights SimpleDatetime to an ISO-8601 string.

    SimpleDatetime.date is (year, month, day); .time is (hour, minute).
    Returns None if data is missing/malformed.
    """
    try:
        y, m, d = sdt.date
        hh, mm = sdt.time
        return f"{y:04d}-{m:02d}-{d:02d}T{hh:02d}:{mm:02d}:00"
    except (TypeError, ValueError, AttributeError):
        return None


class GoogleFlightsProvider(BaseFareProvider):
    name = "google_flights"

    def __init__(self, language: str = "en"):
        self.language = language

    def search_offers(self, origin: str, destination: str, date: str,
                      currency: str, max_results: int = 3) -> List[Offer]:
        query = create_query(
            flights=[
                FlightQuery(
                    date=date,
                    from_airport=origin,
                    to_airport=destination,
                ),
            ],
            trip="one-way",
            seat="economy",
            passengers=Passengers(adults=1),
            currency=currency,
            language=self.language,
        )
        booking_link = query.url()

        try:
            result = get_flights(query)
        except FlightsNotFound:
            logger.info("No flights found for %s-%s on %s", origin, destination, date)
            return []

        # Keep only itineraries with a usable price, sort ascending, slice.
        priced = [f for f in result if getattr(f, "price", 0) and f.price > 0]
        priced.sort(key=lambda f: f.price)

        offers: List[Offer] = []
        for flight in priced[:max_results]:
            segments = []
            duration_min = 0
            for seg in flight.flights:
                duration_min += seg.duration or 0
                segments.append(
                    Segment(
                        # fast-flights exposes itinerary-level airline display
                        # names only; use the first as the carrier label and
                        # leave flight_number empty (not provided).
                        carrier=(flight.airlines[0] if flight.airlines else ""),
                        flight_number="",
                        departure_airport=seg.from_airport.code,
                        arrival_airport=seg.to_airport.code,
                        departure_time=_fmt_datetime(seg.departure),
                        arrival_time=_fmt_datetime(seg.arrival),
                    )
                )
            offers.append(
                Offer(
                    price_amount=float(flight.price),
                    currency=currency,
                    legs_count=1,  # one-way search = one itinerary/leg
                    total_duration_minutes=duration_min or None,
                    segments=segments,
                    booking_link=booking_link,
                )
            )
        return offers

    def enrich_flight(self, flight_number: str, date: str):
        """Not supported by Google Flights scraping. Always returns None."""
        return None
```

**Do not deviate from the above** except to fix a demonstrable import/runtime error.

---

## 3. `samferd/fares/providers/__init__.py` — update the factory

Replace the whole file body with:

```python
"""Provider factory — resolves the configured FARE_PROVIDER."""
from django.conf import settings
from .base import BaseFareProvider


def get_provider() -> BaseFareProvider:
    provider = settings.FARE_PROVIDER
    if provider in ("google_flights", None):
        from .google_flights import GoogleFlightsProvider
        return GoogleFlightsProvider(language=settings.FARE_PROVIDER_LANGUAGE)
    # Extension point: add more providers here.
    raise ValueError(f"Unknown fare provider: {provider}")
```

Notes:
- The `amadeus` branch is **removed**. If `FARE_PROVIDER=amadeus` is still configured,
  the factory raises `ValueError` — this is intentional to surface stale config.

---

## 4. Delete/retire `samferd/fares/providers/amadeus.py`

Delete the file `samferd/fares/providers/amadeus.py`. (If the team prefers keeping it
for reference, it may instead be left in place — it is no longer imported — but the
default action is deletion.)

---

## 5. `samferd/settings.py` — replace Amadeus settings

Find this block (around lines 158–161):

```python
FARE_PROVIDER = env("FARE_PROVIDER", default="amadeus")
AMADEUS_ENV = env("AMADEUS_ENV", default="test")
AMADEUS_CLIENT_ID = env("AMADEUS_CLIENT_ID", default="")
AMADEUS_CLIENT_SECRET = env("AMADEUS_CLIENT_SECRET", default="")
```

Replace it with:

```python
FARE_PROVIDER = env("FARE_PROVIDER", default="google_flights")
# Language hint passed to Google Flights (affects airline/airport display names).
FARE_PROVIDER_LANGUAGE = env("FARE_PROVIDER_LANGUAGE", default="en")
```

Also search `settings.py` for any other `AMADEUS` references and remove them.
Do **not** remove `API_MONTHLY_BUDGET` if other code references it; if it is only used
by the old Amadeus provider, remove it too (verify with a project-wide search first).

---

## 6. `.env.example` — update environment template

Find:

```
# Fare provider (amadeus)
FARE_PROVIDER=amadeus
AMADEUS_ENV=test
AMADEUS_CLIENT_ID=
AMADEUS_CLIENT_SECRET=
```

Replace with:

```
# Fare provider (google_flights via fast-flights scraper; no credentials needed)
FARE_PROVIDER=google_flights
FARE_PROVIDER_LANGUAGE=en
```

---

## 7. `samferd/fares/models.py` — change the provider default

Find (around line 44):

```python
    provider = models.CharField(max_length=32, default="amadeus")
```

Replace with:

```python
    provider = models.CharField(max_length=32, default="google_flights")
```

Then generate a migration:

```
python manage.py makemigrations fares
```

(This produces a simple `AlterField` migration — no data migration needed; existing rows
keep their stored `amadeus` value, which is fine for historical snapshots.)

---

## 8. `samferd/fares/services.py` — adjust enrichment behaviour (small edit)

The provider's `enrich_flight` now always returns `None`, and `enrich_pending_bookings()`
would mark every booking `failed` and retry forever on the Celery beat schedule.
Make it short-circuit when the provider does not support enrichment.

In `enrich_pending_bookings()`, after `provider = get_provider()`, add an early exit:

```python
def enrich_pending_bookings():
    """Enrich bookings that are booked and unverified."""
    bookings = Booking.objects.filter(
        status__in=["booked", "confirmed"], enrichment_status__in=["pending", "failed"],
    )
    provider = get_provider()
    if type(provider).enrich_flight is BaseFareProvider.enrich_flight:
        # Provider doesn't implement enrichment (e.g. google_flights); mark as
        # unsupported once instead of retrying forever.
        bookings.update(enrichment_status="failed")
        return
    ...  # existing loop unchanged
```

This requires adding the import at the top of `services.py`:

```python
from .providers.base import BaseFareProvider
```

Leave the rest of `refresh_event_offers`, `notify_better_routes`, and
`purge_old_snapshots` **unchanged** — they only depend on the `Offer`/`Segment`
abstraction, which is preserved.

> ⚠️ One behavioural check: `FlightOffer.price_amount` is created via
> `Decimal(str(offer.price_amount))`. `float(int)` round-trips exactly (e.g. `"123.0"`),
> so no change is needed there.

---

## 9. Rate-limiting / politeness guard (recommended, small)

Scraping Google too aggressively can get the host IP temporarily blocked. Add a small
delay between route queries in `refresh_event_offers` in `samferd/fares/services.py`:

At the top of the file add:

```python
import time
```

Inside the `for rq in rqs:` loop in `refresh_event_offers`, add as the **last statement
of each iteration** (after `rq.save(...)`):

```python
        time.sleep(1.5)  # politeness delay between scraper calls
```

Keep it simple — no config knob needed for v1.

---

## 10. Documentation updates

### 10.1 `README.md`
- Replace the "API credentials (Amadeus)" section (§3) with a short note:
  - Fare data now comes from **Google Flights** via the open-source
    [`fast-flights`](https://github.com/AWeirdDev/flights) scraper.
  - **No API credentials are required.**
  - Env vars: `FARE_PROVIDER=google_flights`, `FARE_PROVIDER_LANGUAGE=en`.
  - Caveats: prices are whole-unit integers, best-effort currency, and flight-number
    enrichment is not available (bookings show as unverified).
- Update the env-var table rows: remove `AMADEUS_ENV`/`AMADEUS_CLIENT_ID`/`AMADEUS_CLIENT_SECRET`,
  change `FARE_PROVIDER` default to `google_flights`, add `FARE_PROVIDER_LANGUAGE`.
- Update the two feature bullets (~lines 23–26) that mention Amadeus.

### 10.2 `docs/api.md`
- §"Amadeus integration (v1 provider)": rewrite as "Google Flights integration
  (fast-flights)". Mention: no auth, `search_offers` maps `Flights` → `Offer`,
  `enrich_flight` unsupported (returns `None`), booking link = `query.url()`.
- Update `FARE_PROVIDER=amadeus` mention to `google_flights`.

### 10.3 `docs/architecture.md`
- Change the mermaid node `worker --> amadeus["Amadeus API"]` to
  `worker --> gflights["Google Flights (fast-flights scraper)"]`.
- Update the env-var table (same changes as README).
- Update the fares app description line and the testing note (record fixtures of
  fast-flights `Flights` objects instead of Amadeus responses).

### 10.4 `docs/spec.md` and `docs/data-model.md`
- `docs/spec.md` line ~127: change the v1 provider sentence to fast-flights/Google Flights.
- `docs/spec.md` line ~160: note that flight-number enrichment is **no longer available**
  with this provider; the field remains user-declared and unverified.
- `docs/data-model.md` line ~171: change provider example from `amadeus` to `google_flights`.

---

## 11. Verification checklist (run all of these)

1. `pip install -r requirements.txt` — `fast-flights` installs cleanly.
2. `python manage.py check` — no errors.
3. `python manage.py makemigrations fares && python manage.py migrate` — the
   `AlterField` migration for `provider` default applies.
4. Grep check — `grep -ri amadeus --include='*.py' .` returns **no matches** in
   `samferd/` source (migrations `0001_initial.py` keeping the historic default is fine
   and must NOT be edited).
5. Smoke test the provider in a Django shell (`python manage.py shell`):

   ```python
   from samferd.fares.providers import get_provider
   p = get_provider()
   offers = p.search_offers("CDG", "LIS", "2026-10-01", "EUR", max_results=3)
   for o in offers:
       print(o.price_amount, o.currency, o.total_duration_minutes, o.booking_link)
       for s in o.segments:
           print("  ", s.departure_airport, "->", s.arrival_airport, s.departure_time)
   ```

   Expect ≤3 offers, ascending prices, ISO timestamps on segments, and a
   `https://www.google.com/travel/flights/search?tfs=...` booking link.
6. Trigger a manual event refresh through the UI (or call
   `refresh_event_offers(event)`) and confirm `FlightOffer` rows appear with
   `provider="google_flights"`.
7. Confirm `enrich_pending_bookings()` completes instantly and marks pending bookings
   `failed` without exceptions.

---

## 12. Known limitations to record (do not "fix" these)

- **No flight-number enrichment.** The Booking flow keeps working; entries just stay
  unverified. Do not attempt to scrape flight status.
- **Integer prices.** Google Flights shows whole units; cents are lost. Comparison
  logic (5% tolerance) is unaffected.
- **Currency is a hint.** Google may return prices in a locale-default currency in rare
  cases; we store the event currency as declared. Acceptable for v1.
- **Scraper fragility.** If Google changes their page, `get_flights` may raise parsing
  errors. `refresh_event_offers` already catches all exceptions per-route and logs a
  warning — this is the intended degradation path.
- **`multi-city` and round-trip queries are not used.** We keep the existing
  one-search-per-direction model (outbound/return as separate one-way searches).
