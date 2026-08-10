"""Account views: login, signup-via-invite, profile, GDPR export/delete."""
import json
from django.conf import settings
from django.contrib import messages
from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.core.mail import send_mail
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render, redirect, get_object_or_404
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_POST

from .forms import SignupForm, ProfileForm
from .models import User, InviteLink, InviteRedemption
from samferd.events.models import Event, Participation


def login_view(request):
    if request.user.is_authenticated:
        return redirect("events:home")
    from django.contrib.auth.forms import AuthenticationForm
    form = AuthenticationForm(request, data=request.POST or None)
    oidc_enabled = bool(getattr(settings, "OIDC_RP_CLIENT_ID", ""))
    password_enabled = getattr(settings, "ENABLE_PASSWORD_AUTH", True)
    if request.method == "POST" and password_enabled:
        if form.is_valid():
            login(request, form.get_user())
            nxt = request.POST.get("next") or "events:home"
            return redirect(nxt)
    return render(
        request, "accounts/login.html",
        {
            "form": form,
            "oidc_enabled": oidc_enabled,
            "password_enabled": password_enabled,
        },
    )


def invite_redeem(request, token):
    """Join (creating an account if needed) via an invite link."""
    invite = get_object_or_404(InviteLink, id=token)
    if not invite.is_valid():
        messages.error(request, "This invite link is expired or revoked.")
        return redirect("accounts:login")
    event = invite.event

    if request.user.is_authenticated:
        user = request.user
        Participation.objects.get_or_create(event=event, user=user)
        InviteRedemption.objects.create(invite=invite, user=user)
        messages.success(request, f"You joined '{event.name}'.")
        return redirect("events:detail", pk=event.pk)

    form = SignupForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        user = form.save(commit=False)
        user.set_password(form.cleaned_data["password1"])
        user.save()
        login(request, user)
        Participation.objects.get_or_create(event=event, user=user)
        InviteRedemption.objects.create(invite=invite, user=user)
        messages.success(request, f"Account created and joined '{event.name}'.")
        return redirect("events:detail", pk=event.pk)

    return render(
        request, "accounts/signup.html",
        {
            "form": form,
            "event": event,
            "invite": invite,
            "oidc_enabled": bool(getattr(settings, "OIDC_RP_CLIENT_ID", "")),
        },
    )


def signup_view(request):
    """Standalone signup is disabled — signup goes through an invite link."""
    return redirect("events:home")


@login_required
def profile_view(request):
    form = ProfileForm(request.POST or None, instance=request.user)
    if request.method == "POST" and form.is_valid():
        form.save()
        messages.success(request, "Profile updated.")
        return redirect("accounts:profile")
    return render(request, "accounts/profile.html", {"form": form})


@login_required
def export_data(request):
    u = request.user
    data = {
        "user": {
            "email": u.email,
            "display_name": u.first_name or u.username,
            "home_location": u.home_location,
            "language": u.language,
            "notification_prefs": {
                "seat_events": u.notify_seat_events,
                "better_route": u.notify_better_route,
                "invites": u.notify_invites,
            },
        },
        "participations": [
            {
                "event": p.event.name,
                "mode": p.travel_mode,
                "joined_at": p.joined_at.isoformat() if p.joined_at else None,
            }
            for p in u.participations.all()
        ],
        "exported_at": timezone.now().isoformat(),
    }
    filename = f"samferd-export-{u.username}.json"
    response = HttpResponse(json.dumps(data, indent=2), content_type="application/json")
    response["Content-Disposition"] = f"attachment; filename={filename}"
    return response


@login_required
@require_POST
def delete_account(request):
    u = request.user
    anon_username = f"anonymized-{str(u.pk)[:8]}"
    # Anonymize (GDPR erasure): keep rows coherent for events, clear personal data.
    u.email = f"{anon_username}@anonymized.invalid"
    u.username = anon_username
    u.first_name = "Ancien membre"
    u.last_name = ""
    u.home_location = ""
    u.geocoded_lat = None
    u.geocoded_lon = None
    u.oidc_subject = None
    u.password = None
    u.is_active = False
    u.anonymized = True
    u.save(update_fields=[
        "email", "username", "first_name", "last_name", "home_location",
        "geocoded_lat", "geocoded_lon", "oidc_subject", "password",
        "is_active", "anonymized",
    ])
    messages.success(request, "Your account has been deleted.")
    return redirect("accounts:login")


@login_required
def api_me(request):
    """Lightweight JSON profile endpoint (used by dynamic UI)."""
    u = request.user
    return JsonResponse(
        {
            "email": u.email,
            "display_name": u.first_name or u.username,
            "home_location": u.home_location,
            "language": u.language,
            "can_organize": u.can_organize,
            "notify_seat_events": u.notify_seat_events,
            "notify_better_route": u.notify_better_route,
            "notify_invites": u.notify_invites,
        }
    )