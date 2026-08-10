"""Accounts app: custom User, profile, invites, GDPR, OIDC adapter."""
import uuid
from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.mail import send_mail
from django.db import models


class User(AbstractUser):
    """Custom user with Samferd-specific profile fields."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    oidc_subject = models.CharField(
        max_length=255, unique=True, null=True, blank=True,
        help_text="OIDC 'sub' claim, if account was created via OIDC.",
    )
    home_location = models.CharField(
        max_length=255, blank=True,
        help_text="Optional home city / postal code used to rank nearby airports.",
    )
    geocoded_lat = models.FloatField(null=True, blank=True)
    geocoded_lon = models.FloatField(null=True, blank=True)

    language = models.CharField(
        max_length=8, blank=True,
        help_text="Leave empty to use the instance default language.",
    )

    can_organize = models.BooleanField(
        default=False, help_text="May create events (granted by a site admin).",
    )

    # Notification opt-outs (all default on).
    notify_seat_events = models.BooleanField(default=True)
    notify_better_route = models.BooleanField(default=True)
    notify_invites = models.BooleanField(default=True)

    # GDPR soft-delete marker.
    anonymized = models.BooleanField(default=False)

    @property
    def effective_language(self) -> str:
        return self.language or getattr(settings, "DEFAULT_LANGUAGE", "fr")


class InviteLink(models.Model):
    """A multi-use invite to a single event, expiring when the event passes."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(
        "events.Event", on_delete=models.CASCADE, related_name="invite_links",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name="created_invite_links",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def is_valid(self) -> bool:
        from django.utils import timezone
        if self.revoked_at is not None:
            return False
        if self.event.is_past:
            return False
        return True

    @property
    def is_used_for_account(self) -> bool:
        # A link can create many accounts/participations (multi-user).
        return False


class InviteRedemption(models.Model):
    """Tracks who redeemed which invite link (audit + joining)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invite = models.ForeignKey(
        InviteLink, on_delete=models.CASCADE, related_name="redemptions",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="invite_redemptions",
    )
    created_at = models.DateTimeField(auto_now_add=True)


def send_invite_email(event, invitee_email, invite_link, from_email=None):
    """Send an invitation email to a single address (organizer-triggered)."""
    subject = f"[Samferd] Invitation: {event.name}"
    body = (
        f"You have been invited to join the event '{event.name}'.\n"
        f"Open the following link to access it:\n\n{invite_link}\n\n"
        "Samferd — travel together."
    )
    send_mail(subject, body, from_email, [invitee_email])