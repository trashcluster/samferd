"""Events app: Event, Airport, EventAirport, Participation, Preferences."""
import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone

# Travel modes members of an event can declare.
TRAVEL_UNDECIDED = "undecided"
TRAVEL_FLYING = "flying"
TRAVEL_DRIVING = "driving"
TRAVEL_MODE_CHOICES = [
    (TRAVEL_UNDECIDED, "Undecided"),
    (TRAVEL_FLYING, "Flying"),
    (TRAVEL_DRIVING, "Driving"),
]


class Airport(models.Model):
    """An airport, seeded from a public dataset (IATA, name, coordinates)."""

    iata_code = models.CharField(max_length=3, primary_key=True)
    name = models.CharField(max_length=255)
    city = models.CharField(max_length=255, blank=True)
    country = models.CharField(max_length=255, blank=True)
    lat = models.FloatField(null=True, blank=True)
    lon = models.FloatField(null=True, blank=True)

    def __str__(self):
        return f"{self.iata_code} — {self.name or self.city}"


class ParkingPrice(models.Model):
    """Admin-maintained default airport parking price (per day or flat)."""

    airport = models.OneToOneField(Airport, on_delete=models.CASCADE, related_name="parking")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="EUR")
    mode = models.CharField(
        max_length=16, default="per_day",
        choices=[("per_day", "Per day"), ("flat", "Flat total")],
    )
    updated_at = models.DateTimeField(auto_now=True)


class Event(models.Model):
    """A coordinated group trip with fixed dates and multiple airports."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    organizer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name="organized_events",
    )
    outbound_date = models.DateField()
    return_date = models.DateField()
    currency = models.CharField(max_length=3, default="EUR")

    # Refresh policy
    refresh_interval_hours = models.IntegerField(default=12)
    manual_refresh_cooldown_minutes = models.IntegerField(default=60)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["outbound_date"]

    def __str__(self):
        return self.name

    @property
    def is_past(self) -> bool:
        return self.return_date < timezone.localdate()

    @property
    def is_active(self) -> bool:
        return not self.is_past and self.participations.exists()

    def user_participation(self, user):
        try:
            return self.participations.get(user=user)
        except Participation.DoesNotExist:
            return None


class EventAirport(models.Model):
    """Link between an event and one of its origin/destination airports."""

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="airports")
    airport = models.ForeignKey(Airport, on_delete=models.CASCADE, related_name="event_uses")
    role = models.CharField(
        max_length=16, choices=[("origin", "Origin"), ("destination", "Destination")],
    )
    position = models.IntegerField(default=0, help_text="Organizer display order / default rank")
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("event", "airport", "role")
        ordering = ["role", "position"]

    def __str__(self):
        return f"{self.event} — {self.airport} ({self.role})"


class Participation(models.Model):
    """A user's membership & declared travel mode in an event."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="participations")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="participations",
    )
    travel_mode = models.CharField(max_length=16, choices=TRAVEL_MODE_CHOICES, default=TRAVEL_UNDECIDED)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("event", "user")

    def __str__(self):
        return f"{self.user.username} @ {self.event.name}"


class AirportPreference(models.Model):
    """Per-participant manual ranking of origin airports."""

    participation = models.ForeignKey(
        Participation, on_delete=models.CASCADE, related_name="airport_preferences",
    )
    airport = models.ForeignKey(
        EventAirport, on_delete=models.CASCADE, related_name="preferences",
    )
    rank = models.IntegerField(default=0)

    class Meta:
        unique_together = ("participation", "airport")