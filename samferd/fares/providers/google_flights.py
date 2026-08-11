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
from fast_flights.integrations.base import FetchIntegration
from primp import Client

from .base import BaseFareProvider, Offer, Segment

logger = logging.getLogger(__name__)

# Google Flights URL used by the scraper.
_GOOGLE_FLIGHTS_URL = "https://www.google.com/travel/flights"

# EU consent cookies that prevent Google from redirecting to consent.google.com.
# Without these, scraping from EU-region IPs returns the consent page instead of
# flight results. Values are the standard "accepted" consent markers.
_CONSENT_COOKIES = {
    "CONSENT": "YES+cb.20210328-17-p0.en+FX+000",
    "SOCS": "CAISNQgQEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjMwODI5LjA3X3AwGgJlbiACGgYIgLC_pwY",
}


class _GoogleFlightsFetch(FetchIntegration):
    """Fetch Google Flights HTML, pre-seeding the EU consent cookies."""

    def fetch_html(self, q, /) -> str:
        client = Client(
            impersonate="chrome_145",
            impersonate_os="macos",
            referer=True,
            cookie_store=True,
        )
        client.set_cookies("https://www.google.com", _CONSENT_COOKIES)
        params = q.params() if hasattr(q, "params") else {"q": q}
        res = client.get(_GOOGLE_FLIGHTS_URL, params=params)
        return res.text


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
            result = get_flights(query, integration=_GoogleFlightsFetch())
        except FlightsNotFound:
            logger.info("No flights found for %s-%s on %s", origin, destination, date)
            return []
        except Exception as exc:  # noqa: BLE001
            # fast-flights' parser is fragile: Google occasionally returns a page
            # it cannot parse (e.g. IndexError on a malformed itinerary). Treat
            # this as "no offers" rather than crashing the whole refresh.
            logger.warning(
                "Google Flights parse failed for %s-%s on %s: %s",
                origin, destination, date, exc,
            )
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
