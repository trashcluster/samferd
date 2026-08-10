"""Fare provider abstraction.

A provider implements `search_offers` and optional `enrich_flight`, returning
plain data objects (no ORM dependency) so providers are swappable.
"""
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class Segment:
    carrier: str
    flight_number: str
    departure_airport: str
    arrival_airport: str
    departure_time: Optional[str] = None
    arrival_time: Optional[str] = None


@dataclass
class Offer:
    price_amount: float
    currency: str
    legs_count: int
    total_duration_minutes: Optional[int]
    segments: List[Segment] = field(default_factory=list)
    booking_link: str = ""

    def to_segments_json(self) -> list:
        return [
            {
                "carrier": s.carrier,
                "flight_number": s.flight_number,
                "departure_airport": s.departure_airport,
                "arrival_airport": s.arrival_airport,
                "departure_time": s.departure_time,
                "arrival_time": s.arrival_time,
            }
            for s in self.segments
        ]


class BaseFareProvider:
    """Subclasses must implement search_offers; enrich_flight is optional."""

    name = "base"

    def search_offers(self, origin: str, destination: str, date: str,
                      currency: str, max_results: int = 3) -> List[Offer]:
        raise NotImplementedError

    def enrich_flight(self, flight_number: str, date: str):
        # Optional; base returns nothing.
        return None