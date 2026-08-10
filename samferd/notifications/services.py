"""Notifications app: email helper with per-user opt-outs and a daily digest
gate for better-route alerts."""
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone

from .models import NotificationLog

# Notification kinds (kept in sync with NotificationLog.kind).
SEAT_REQUEST = "seat_request"
SEAT_RESOLUTION = "seat_resolution"
BETTER_ROUTE = "better_route"
INVITE = "invite"

# Which NotificationLog.kind gates the better-route digest rate limit.
_DIGEST_WINDOW_HOURS = 24


def _should_notify(user, kind) -> bool:
    if kind in (SEAT_REQUEST, SEAT_RESOLUTION) and not user.notify_seat_events:
        return False
    if kind == BETTER_ROUTE and not user.notify_better_route:
        return False
    if kind == INVITE and not user.notify_invites:
        return False
    # Don't email inactive/anonymized accounts.
    return user.is_active and not user.anonymized and bool(user.email)


def _send(user, subject, message, kind, event=None):
    if not _should_notify(user, kind):
        return False
    send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [user.email])
    NotificationLog.objects.create(user=user, event=event, kind=kind)
    return True


def seat_requested(car, rider):
    driver = car.participation.user
    _send(
        driver,
        subject=f"[Samferd] Car seat request from {rider.user.username}",
        message=(
            f"{rider.user.username} requests a seat in your car to the airport "
            f"for '{car.participation.event.name}'.\n"
            f"Log in to approve or decline."
        ),
        kind=SEAT_REQUEST,
        event=car.participation.event,
    )


def seat_resolution(req, approved=True):
    verb = "approved" if approved else "declined"
    _send(
        req.rider.user,
        subject=f"[Samferd] Seat request {verb}",
        message=f"Your seat request was {verb} by the driver {req.car.participation.user.username}.",
        kind=SEAT_RESOLUTION,
        event=req.car.participation.event,
    )


def seat_cancelled(req):
    # Notify the driver when a rider cancels.
    _send(
        req.car.participation.user,
        subject="[Samferd] A rider cancelled their seat request",
        message=f"{req.rider.user.username} cancelled their seat request on your car.",
        kind=SEAT_RESOLUTION,
        event=req.car.participation.event,
    )


def already_sent_recently(user, event) -> bool:
    """True if a better-route digest was sent to this user/event within the window."""
    since = timezone.now() - timezone.timedelta(hours=_DIGEST_WINDOW_HOURS)
    return NotificationLog.objects.filter(
        user=user, event=event, kind=BETTER_ROUTE, sent_at__gte=since,
    ).exists()


def better_route(user, event, detail_lines):
    if already_sent_recently(user, event):
        return False
    subject = f"[Samferd] A better route was found for '{event.name}'"
    body = "\n".join(detail_lines)
    return _send(user, subject, body, kind=BETTER_ROUTE, event=event)