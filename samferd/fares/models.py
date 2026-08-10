"""Fares app: RouteQuery, FlightOffer (caching) and Booking."""
import uuid
from django.db import models


class RouteQuery(models.Model):
    """One refresh target: event × origin × destination × direction."""

    event = models.ForeignKey("events.Event", on_delete=models.CASCADE, related_name="route_queries")
    origin = models.ForeignKey("events.Airport", on_delete=models.CASCADE, related_name="as_origin")
    destination = models.ForeignKey("events.Airport", on_delete=models.CASCADE, related_name="as_destination")
    direction = models.CharField(
        max_length=16, default="outbound",
        choices=[("outbound", "Outbound"), ("return", "Return")],
    )
    last_fetched_at = models.DateTimeField(null=True, blank=True)
    last_manual_refresh_at = models.DateTimeField(null=True, blank=True)
    travel_date = models.DateField(null=True, blank=True)

    class Meta:
        unique_together = ("event", "origin", "destination", "direction")
        ordering = ["origin__iata_code", "destination__iata_code"]

    def __str__(self):
        return f"{self.origin} → {self.destination} ({self.direction})"

    @property
    def top_offers(self):
        return self.flight_offers.order_by("rank")


class FlightOffer(models.Model):
    """A cached fare offer (top N per RouteQuery kept)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    route_query = models.ForeignKey(RouteQuery, on_delete=models.CASCADE, related_name="flight_offers")
    rank = models.PositiveIntegerField(default=1)
    price_amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="EUR")
    legs_count = models.IntegerField(default=1)
    total_duration_minutes = models.IntegerField(null=True, blank=True)
    segments = models.JSONField(default=list)  # per leg: carrier, flight, times, airports
    booking_link = models.URLField(max_length=1000, blank=True)
    provider = models.CharField(max_length=32, default="amadeus")
    fetched_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["route_query", "rank"]

    def __str__(self):
        return f"{self.route_query} #{self.rank} {self.price_amount}"


class Booking(models.Model):
    """A participant's declared flight for one direction."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    participation = models.ForeignKey(
        "events.Participation", on_delete=models.CASCADE, related_name="bookings",
    )
    direction = models.CharField(
        max_length=16, default="outbound",
        choices=[("outbound", "Outbound"), ("return", "Return")],
    )
    status = models.CharField(
        max_length=16, default="searching",
        choices=[("searching", "Searching"), ("booked", "Booked"), ("confirmed", "Confirmed")],
    )
    flight_number = models.CharField(max_length=16, blank=True)
    flight_date = models.DateField(null=True, blank=True)
    refundable = models.BooleanField(null=True, blank=True)
    price_paid = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    enrichment = models.JSONField(default=dict, blank=True)
    enrichment_status = models.CharField(
        max_length=16, default="pending",
        choices=[("pending", "Pending"), ("ok", "OK"), ("failed", "Unverified")],
    )

    class Meta:
        unique_together = ("participation", "direction")

    @property
    def alerts_suppressed(self):
        """Alerts stop for confirmed, non-refundable bookings."""
        return self.status == "confirmed" and self.refundable is False