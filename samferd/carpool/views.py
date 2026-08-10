"""Carpool views: offer a car, edit it, request a seat, resolve requests."""
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden, JsonResponse
from django.shortcuts import render, redirect, get_object_or_404
from django.views.decorators.http import require_POST

from samferd.events.models import Event, Participation
from samferd.notifications import notify
from .models import Car, SeatRequest
from .forms import CarForm


def _guard_event_participation(event, user):
    participation = event.user_participation(user)
    if participation is None and not user.is_superuser:
        return None, HttpResponseForbidden("You are not part of this event.")
    return participation, None


@login_required
def car_offer(request, event_pk):
    event = get_object_or_404(Event, pk=event_pk)
    participation = event.user_participation(request.user)
    if participation is None:
        return HttpResponseForbidden("You are not part of this event.")

    car, created = Car.objects.get_or_create(participation=participation)
    form = CarForm(request.POST or None, instance=car)
    if request.method == "POST" and form.is_valid():
        car = form.save(commit=False)
        car.participation = participation
        car.save()
        participation.travel_mode = "driving"
        participation.save(update_fields=["travel_mode"])
        messages.success(request, "Car offer saved.")
        return redirect("events:detail", pk=event.pk)
    return render(request, "carpool/car_form.html", {"form": form, "event": event, "car": car})


@login_required
@require_POST
def car_request_seat(request, car_pk):
    car = get_object_or_404(Car, pk=car_pk)
    event = car.participation.event
    rider = event.user_participation(request.user)
    if rider is None and not request.user.is_superuser:
        return HttpResponseForbidden("You are not part of this event.")
    if rider is None:
        return HttpResponseForbidden

    direction = request.POST.get("direction", "both")
    if car.remaining_seats < 1:
        messages.error(request, "This car has no free seats left.")
        return redirect("events:detail", pk=event.pk)

    existing = SeatRequest.objects.filter(car=car, rider=rider, status="pending")
    if existing.exists():
        messages.info(request, "You already have a pending request on this car.")
        return redirect("events:detail", pk=event.pk)

    SeatRequest.objects.create(car=car, rider=rider, direction=direction)
    notify.seat_requested(car, rider)
    messages.success(request, "Seat request sent to the driver.")
    return redirect("events:detail", pk=event.pk)


@login_required
@require_POST
def seat_resolve(request, req_pk, action):
    """action in {approve, decline} (driver) or {cancel} (either side)."""
    req = get_object_or_404(SeatRequest, pk=req_pk)
    car = req.car
    event = car.participation.event
    driver = car.participation.user
    is_driver = (driver.id == request.user.id) or request.user.is_superuser
    is_rider = req.rider.user_id == request.user.id

    if action == "cancel" and (is_rider or is_driver):
        req.update_status("cancelled")
        notify.seat_cancelled(req)
        messages.success(request, "Seat request cancelled.")
    elif action == "approve" and is_driver:
        ok, msg = req.approve()
        if ok:
            notify.seat_resolution(req, approved=True)
            messages.success(request, msg)
        else:
            messages.error(request, msg)
    elif action == "decline" and is_driver:
        req.update_status("declined")
        notify.seat_resolution(req, approved=False)
        messages.success(request, "Request declined.")
    else:
        return HttpResponseForbidden("Not allowed.")

    return redirect("events:detail", pk=event.pk)