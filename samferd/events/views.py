"""Event views: home, detail (HTMX), create, edit, manage."""
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden
from django.shortcuts import render, redirect, get_object_or_404
from django.views.decorators.http import require_POST

from .models import Event, EventAirport, Participation, Airport
from .forms import EventForm, AddAirportForm
from samferd.carpool.models import Car
from samferd.fares.models import RouteQuery, FlightOffer
from samferd.accounts.models import InviteLink


@login_required
def home(request):
    participations = request.user.participations.select_related("event").order_by(
        "event__outbound_date"
    )
    events = [p.event for p in participations]
    return render(request, "events/home.html", {"events": events})


def _event_context(event, user):
    """Shared context used by the event detail page."""
    participations = (
        event.participations.select_related("user").order_by("joined_at")
    )
    cars = Car.objects.filter(
        participation__event=event, participation__travel_mode="driving"
    ).select_related("participation", "participation__user", "departure_airport")

    origins = list(event.airports.filter(role="origin").select_related("airport"))
    destinations = list(event.airports.filter(role="destination").select_related("airport"))

    route_queries = RouteQuery.objects.filter(event=event)
    offers = {
        rq.id: list(FlightOffer.objects.filter(route_query=rq).order_by("rank"))
        for rq in route_queries
    }

    me = event.user_participation(user)
    return {
        "event": event,
        "participations": participations,
        "cars": cars,
        "origins": origins,
        "destinations": destinations,
        "route_queries": route_queries,
        "offers": offers,
        "me": me,
        "is_organizer": event.organizer_id == user.id or user.is_superuser,
    }


@login_required
def event_detail(request, pk):
    event = get_object_or_404(Event, pk=pk)
    participation = event.user_participation(request.user)
    if participation is None and not request.user.is_superuser:
        return HttpResponseForbidden("You are not part of this event.")
    return render(request, "events/detail.html", _event_context(event, request.user))


@login_required
def event_create(request):
    if not (request.user.can_organize or request.user.is_superuser):
        return HttpResponseForbidden("Only organizers can create events.")
    form = EventForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        event = form.save(commit=False)
        event.organizer = request.user
        event.save()
        # The organizer automatically participates.
        Participation.objects.get_or_create(event=event, user=request.user)
        messages.success(request, f"Event '{event.name}' created.")
        return redirect("events:detail", pk=event.pk)
    return render(request, "events/event_form.html", {"form": form, "is_create": True})


@login_required
def event_edit(request, pk):
    event = get_object_or_404(Event, pk=pk)
    if event.organizer_id != request.user.id and not request.user.is_superuser:
        return HttpResponseForbidden("Only the organizer can edit this event.")
    form = EventForm(request.POST or None, instance=event)
    if request.method == "POST" and form.is_valid():
        form.save()
        messages.success(request, "Event updated.")
        return redirect("events:detail", pk=event.pk)
    return render(request, "events/event_form.html", {"form": form, "event": event, "is_create": False})


@login_required
@require_POST
def event_add_airport(request, pk):
    event = get_object_or_404(Event, pk=pk)
    if event.organizer_id != request.user.id and not request.user.is_superuser:
        return HttpResponseForbidden("Only the organizer can add airports.")
    form = AddAirportForm(request.POST)
    airport = get_object_or_404(Airport, iata_code=form.data.get("airport"))
    role = form.data.get("role")
    if form.is_valid():
        EventAirport.objects.get_or_create(
            event=event, airport=airport, role=role,
            defaults={"position": event.airports.filter(role=role).count()},
        )
        messages.success(request, f"Airport {airport} added.")
    return redirect("events:detail", pk=event.pk)


@login_required
def event_invites(request, pk):
    event = get_object_or_404(Event, pk=pk)
    if event.organizer_id != request.user.id and not request.user.is_superuser:
        return HttpResponseForbidden("Only the organizer can manage invites.")
    links = event.invite_links.all()
    return render(request, "events/invites.html", {"event": event, "links": links})


@login_required
@require_POST
def invites_create(request, pk):
    event = get_object_or_404(Event, pk=pk)
    if event.organizer_id != request.user.id and not request.user.is_superuser:
        return HttpResponseForbidden("Only the organizer can create invites.")
    link = InviteLink.objects.create(event=event, created_by=request.user)
    messages.success(request, "Invite link created.")
    return redirect("events:event_invites", pk=event.pk)


@login_required
@require_POST
def invites_revoke(request, pk):
    from django.utils import timezone
    link = get_object_or_404(InviteLink, pk=pk)
    event = link.event
    if event.organizer_id != request.user.id and not request.user.is_superuser:
        return HttpResponseForbidden("Only the organizer can revoke invites.")
    link.revoked_at = timezone.now()
    link.save(update_fields=["revoked_at"])
    messages.success(request, "Invite link revoked.")
    return redirect("events:event_invites", pk=event.pk)