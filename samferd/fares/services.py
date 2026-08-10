"""Service layer for fares: refresh, enrichment, better-route detection."""
import logging
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from .models import RouteQuery, FlightOffer, Booking
from .providers import get_provider
from . import comparison
from samferd.notifications import notify

logger = logging.getLogger(__name__)

MAX_OFFERS_PER_ROUTE = 3


def build_route_queries(event):
    """Ensure a RouteQuery row exists for every origin×destination×direction."""

    origins = list(event.airports.filter(role="origin").select_related("airport"))
    destinations = list(event.airports.filter(role="destination").select_related("airport"))
    target = {
        "outbound": event.outbound_date,
        "return": event.return_date,
    }
    created = []
    for o in origins:
        for d in destinations:
            for direction, date in target.items():
                rq, made = RouteQuery.objects.get_or_create(
                    event=event, origin=o.airport, destination=d.airport,
                    direction=direction,
                    defaults={"travel_date": date},
                )
                if made:
                    created.append(rq)
                # Keep travel_date fresh in case event dates moved.
                if rq.travel_date != date:
                    rq.travel_date = date
                    rq.save(update_fields=["travel_date"])
    return created


def refresh_event_offers(event):
    """Fetch fresh offers for all route queries of an event."""
    rqs = list(event.route_queries.all())
    if not rqs:
        rqs = build_route_queries(event)

    provider = get_provider()
    for rq in rqs:
        if rq.travel_date is None:
            continue
        try:
            offers = provider.search_offers(
                origin=rq.origin.iata_code,
                destination=rq.destination.iata_code,
                date=rq.travel_date.isoformat(),
                currency=event.currency,
                max_results=MAX_OFFERS_PER_ROUTE,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Fare fetch failed for %s: %s", rq, exc)
            rq.last_fetched_at = timezone.now()
            rq.save(update_fields=["last_fetched_at"])
            continue

        # Replace top offers for this route.
        rq.flight_offers.all().delete()
        for rank, offer in enumerate(offers, start=1):
            FlightOffer.objects.create(
                route_query=rq,
                rank=rank,
                price_amount=Decimal(str(offer.price_amount)),
                currency=offer.currency,
                legs_count=offer.legs_count,
                total_duration_minutes=offer.total_duration_minutes,
                segments=offer.to_segments_json(),
                booking_link=offer.booking_link,
                provider=provider.name,
            )
        rq.last_fetched_at = timezone.now()
        rq.save(update_fields=["last_fetched_at"])

    notify_better_routes(event)


def notify_better_routes(event):
    """Compare each participant's reference against the newest offers."""
    from samferd.events.models import Participation

    participations = Participation.objects.filter(event=event, user__is_active=True)
    for participation in participations:
        user = participation.user
        if not user.notify_better_route:
            continue

        # Find the cheapest new offer and the best previous snapshot for each
        # direction the participant cares about.
        for direction in ("outbound", "return"):
            # Reference is the participant's booking if booked, else cheapest previous.
            booking = Booking.objects.filter(participation=participation, direction=direction).first()
            if booking and booking.alerts_suppressed:
                continue

            new_offers = FlightOffer.objects.filter(
                route_query__event=event, route_query__direction=direction,
            ).order_by("price_amount")
            if not new_offers:
                continue

            # Reference price: booking price or cheapest currently stored.
            ref_price = booking.price_paid if booking and booking.price_paid is not None else new_offers.first().price_amount
            ref_legs = booking.enrichment.get("legs_count") if booking and booking.enrichment else new_offers.first().legs_count

            best = new_offers.first()
            # Default ranking; a per-user CriteriaRanking model could override
            # this (spec §10) — kept simple for v1.
            ranking = ["price", "legs", "duration"]
            new_dict = {
                "price": best.price_amount,
                "legs": best.legs_count,
                "duration": best.total_duration_minutes,
            }
            ref_dict = {"price": ref_price, "legs": ref_legs, "duration": None}

            if comparison.is_better(new_dict, ref_dict, ranking):
                detail = [
                    f"A cheaper/better route for {direction} was found for '{event.name}':",
                    f"  {best.route_query.origin} → {best.route_query.destination} "
                    f"at {best.price_amount} {best.currency}.",
                ]
                notify.better_route(user, event, detail)


def enrich_pending_bookings():
    """Enrich bookings that are booked and unverified."""
    bookings = Booking.objects.filter(
        status__in=["booked", "confirmed"], enrichment_status__in=["pending", "failed"],
    )
    provider = get_provider()
    for booking in bookings:
        if not booking.flight_number or not booking.flight_date:
            continue
        try:
            result = provider.enrich_flight(booking.flight_number, booking.flight_date.isoformat())
        except Exception as exc:  # noqa: BLE001
            logger.warning("Enrichment failed for %s: %s", booking, exc)
            booking.enrichment_status = "failed"
            booking.save(update_fields=["enrichment_status"])
            continue
        if result:
            booking.enrichment = result
            booking.enrichment_status = "ok"
        else:
            booking.enrichment_status = "failed"
        booking.save(update_fields=["enrichment", "enrichment_status"])


def purge_old_snapshots():
    """Drop offers for past events and stale routes."""
    cutoff = timezone.now() - timedelta(days=1)
    # Delete offers linked to past events.
    past_ids = RouteQuery.objects.filter(
        event__return_date__lt=timezone.localdate(),
    ).values_list("id", flat=True)
    FlightOffer.objects.filter(route_query_id__in=past_ids).delete()
    # Keep only the newest MAX_OFFERS_PER_ROUTE per route (defensive).
    for rq in RouteQuery.objects.all():
        for extra in FlightOffer.objects.filter(route_query=rq).order_by("-fetched_at")[MAX_OFFERS_PER_ROUTE:]:
            extra.delete()
    return cutoff