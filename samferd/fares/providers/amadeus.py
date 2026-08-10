"""Amadeus Self-Service fare provider."""
import logging
from datetime import datetime, timedelta
from typing import List, Optional

import requests

from .base import BaseFareProvider, Offer, Segment

logger = logging.getLogger(__name__)

_ENV_BASES = {"test": "https://test.api.amadeus.com", "prod": "https://api.amadeus.com"}


class AmadeusProvider(BaseFareProvider):
    name = "amadeus"

    def __init__(self, client_id: str, client_secret: str, env: str = "test",
                 monthly_budget: int = 2000):
        self.client_id = client_id
        self.client_secret = client_secret
        self.base = _ENV_BASES.get(env, _ENV_BASES["test"])
        self._token = None
        self._token_expiry = None

    # -- Token management -------------------------------------------------
    def _get_token(self) -> str:
        if self._token and self._token_expiry and datetime.utcnow() < self._token_expiry:
            return self._token
        resp = requests.post(
            f"{self.base}/v1/security/oauth2/token",
            data={
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        self._token = data["access_token"]
        self._token_expiry = datetime.utcnow() + timedelta(seconds=data.get("expires_in", 1800))
        return self._token

    # -- Search -----------------------------------------------------------
    def search_offers(self, origin: str, destination: str, date: str,
                      currency: str, max_results: int = 3) -> List[Offer]:
        headers = {"Authorization": f"Bearer {self._get_token()}"}
        params = {
            "originLocationCode": origin,
            "destinationLocationCode": destination,
            "departureDate": date,
            "adults": 1,
            "currencyCode": currency,
            "max": max_results,
        }
        resp = requests.get(
            f"{self.base}/v2/shopping/flight-offers",
            headers=headers, params=params, timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        offers = []
        for it in data.get("data", [])[:max_results]:
            price = float(it["price"]["total"])
            itineraries = it.get("itineraries", [])
            segments = []
            duration_min = 0
            for itinerary in itineraries:
                duration_min += _iso_duration_minutes(itinerary.get("duration", ""))
                for seg in itinerary.get("segments", []):
                    segments.append(
                        Segment(
                            carrier=seg["carrierCode"],
                            flight_number=seg["number"],
                            departure_airport=seg["departure"]["iataCode"],
                            arrival_airport=seg["arrival"]["iataCode"],
                            departure_time=seg["departure"].get("at"),
                            arrival_time=seg["arrival"].get("at"),
                        )
                    )
            offers.append(
                Offer(
                    price_amount=price,
                    currency=currency,
                    legs_count=len(itineraries),
                    total_duration_minutes=duration_min or None,
                    segments=segments,
                    booking_link=_build_deep_link(origin, destination, date, segments),
                )
            )
        return offers

    # -- Enrichment -------------------------------------------------------
    def enrich_flight(self, flight_number: str, date: str):
        """Validate/enrich a booked flight via the On-Demand Flight Status API."""
        carrier = flight_number[:2]
        number = flight_number[2:]
        headers = {"Authorization": f"Bearer {self._get_token()}"}
        url = f"{self.base}/v2/schedule/flights"
        resp = requests.get(
            url,
            headers=headers,
            params={
                "carrierCode": carrier,
                "flightNumber": number,
                "scheduledDepartureDate": date,
            },
            timeout=30,
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        data = resp.json()
        records = data.get("data", [])
        if not records:
            return None
        rec = records[0]
        segments = rec.get("flightPoints", [])
        dep = segments[0] if segments else {}
        arr = segments[-1] if segments else {}
        return {
            "carrier": rec.get("carrierCode", carrier),
            "flight_number": flight_number,
            "departure_airport": dep.get("iataCode"),
            "arrival_airport": arr.get("iataCode"),
            "departure_time": dep.get("departure", {}).get("timing", [{}])[0].get("value"),
            "arrival_time": arr.get("arrival", {}).get("timing", [{}])[0].get("value"),
        }


def _iso_duration_minutes(duration: str = "") -> int:
    """Convert an ISO-8601 duration ('PT2H30M') to minutes."""
    if not duration:
        return 0
    dur = duration.replace("PT", "").replace("P", "")
    minutes = 0
    try:
        if "H" in dur:
            hours, dur = dur.split("H", 1)
            minutes += int(hours) * 60
        if dur.startswith("M"):
            minutes += int(dur[1:].replace("S", ""))
    except (ValueError, TypeError):
        return 0
    return minutes


def _build_deep_link(origin: str, destination: str, date: str,
                     segments: List[Segment]):
    """Build a search deep link from the first segment (best-effort label)."""
    first = segments[0] if segments else None
    q = f"{origin}-{destination}/{date}"
    if first:
        q = f"{first.carrier}{first.flight_number}-{origin}-{first.arrival_airport}/{date}"
    return f"https://www.google.com/flights?hl=en#flt={q}"