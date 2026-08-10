"""Fares views: manual refresh and booking declaration."""
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden
from django.shortcuts import redirect
from django.views.decorators.http import require_POST
from django.utils import timezone

from samferd.events.models import Event
from .models import Booking
from .forms import BookingForm
from .services import refresh_event_offers


@login_required
@require_POST
def manual_refresh(request, event_pk):
    event = Event.objects.filter(pk=event_pk).first()
    if event is None:
        return redirect("events:home")
    if event.user_participation(request.user) is None and not request.user.is_superuser:
        return HttpResponseForbidden("You are not part of this event.")

    # Cooldown check.
    rq = event.route_queries.order_by("-last_manual_refresh_at").first()
    if rq and rq.last_manual_refresh_at:
        elapsed = (timezone.now() - rq.last_manual_refresh_at).total_seconds() / 60
        if elapsed < event.manual_refresh_cooldown_minutes:
            messages.error(
                request,
                f"Please wait {int(event.manual_refresh_cooldown_minutes - elapsed)} min "
                "before refreshing again.",
            )
            return redirect("events:detail", pk=event.pk)

    refresh_event_offers(event)
    messages.success(request, "Prices refreshed.")
    return redirect("events:detail", pk=event.pk)


@login_required
def booking_edit(request, event_pk, direction):
    event = Event.objects.filter(pk=event_pk).first()
    if event is None:
        return redirect("events:home")
    participation = event.user_participation(request.user)
    if participation is None and not request.user.is_superuser:
        return HttpResponseForbidden("You are not part of this event.")

    booking, _ = Booking.objects.get_or_create(
        participation=participation, direction=direction,
    )
    form = BookingForm(request.POST or None, instance=booking)
    if request.method == "POST" and form.is_valid():
        form.save()
        messages.success(request, "Booking saved.")
        return redirect("events:detail", pk=event.pk)
    return render_booking_form(request, event, booking, form)


def render_booking_form(request, event, booking, form):
    from django.shortcuts import render
    return render(
        request, "fares/booking_form.html",
        {"form": form, "event": event, "booking": booking},
    )