"""Carpool app: Car offers, SeatRequests, cost computation."""
import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone

from . import cost


class Car(models.Model):
    """A car offered by a driving participant to the airport."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    participation = models.OneToOneField(
        "events.Participation", on_delete=models.CASCADE, related_name="car",
    )
    departure_airport = models.ForeignKey(
        "events.EventAirport", on_delete=models.CASCADE, related_name="cars",
        null=True, blank=True,
    )
    total_free_seats = models.PositiveIntegerField(default=0)
    note = models.TextField(blank=True, help_text="Departure point/time, free text.")

    # Cost inputs (event currency), all optional.
    cost_amount = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text="Flat fuel + tolls estimate.",
    )
    parking_override = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text="Optional override of the airport default parking price.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Car of {self.participation.user.username} ({self.total_free_seats} seats)"

    @property
    def riders(self):
        return self.seat_requests.filter(status="approved")

    @property
    def remaining_seats(self) -> int:
        approved = self.seat_requests.filter(status="approved").count()
        return max(0, self.total_free_seats - approved)

    def per_person_share(self):
        """Informative split = (car cost + parking) / (driver + approved riders)."""
        return cost.car_per_person_share(self)


class SeatRequest(models.Model):
    """A rider asking to join a car; the driver approves or declines."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    car = models.ForeignKey(Car, on_delete=models.CASCADE, related_name="seat_requests")
    rider = models.ForeignKey(
        "events.Participation", on_delete=models.CASCADE, related_name="seat_requests",
    )
    direction = models.CharField(
        max_length=16, default="both",
        choices=[("outbound", "Outbound"), ("return", "Return"), ("both", "Both ways")],
    )
    status = models.CharField(
        max_length=16, default="pending",
        choices=[
            ("pending", "Pending"), ("approved", "Approved"),
            ("declined", "Declined"), ("cancelled", "Cancelled"),
        ],
    )
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.rider.user.username} → {self.car.departure_airport}"

    def approve(self):
        if self.status != "pending":
            return False, "This request is no longer pending."
        if self.car.remaining_seats < 1:
            return False, "This car no longer has free seats."
        # Auto-withdraw the rider's other pending requests in the same direction.
        if self.direction == "both":
            SeatRequest.objects.filter(
                rider=self.rider, status="pending",
            ).exclude(pk=self.pk).update(status="cancelled", resolved_at=timezone.now())
        else:
            SeatRequest.objects.filter(
                rider=self.rider, status="pending", direction=self.direction,
            ).exclude(pk=self.pk).update(status="cancelled", resolved_at=timezone.now())
        self.update_status("approved")
        return True, "Seat approved."

    def update_status(self, new_status):
        from django.utils import timezone
        self.status = new_status
        self.resolved_at = timezone.now()
        self.save(update_fields=["status", "resolved_at"])