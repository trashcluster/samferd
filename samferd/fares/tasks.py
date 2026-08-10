"""Celery tasks for the fares app: refresh offers and enrich bookings."""
import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task
def refresh_event(event_pk):
    from samferd.events.models import Event
    from .services import refresh_event_offers

    event = Event.objects.filter(pk=event_pk).first()
    if event is None:
        logger.warning("refresh_event: event %s not found", event_pk)
        return
    refresh_event_offers(event)


@shared_task
def enrich_all_bookings():
    from .services import enrich_pending_bookings
    enrich_pending_bookings()


@shared_task
def purge_stale_offers():
    from .services import purge_old_snapshots
    purge_old_snapshots()


@shared_task
def refresh_all_active_events():
    """Refresh every active event whose interval elapsed since last fetch."""
    from django.utils import timezone
    from samferd.events.models import Event
    from .services import refresh_event_offers

    now = timezone.now()
    for event in Event.objects.all():
        if not event.is_active:
            continue
        from samferd.fares.models import RouteQuery
        newest = (
            RouteQuery.objects.filter(event=event)
            .order_by("-last_fetched_at")
            .first()
        )
        interval = event.refresh_interval_hours
        due = newest is None or newest.last_fetched_at is None or (
            now - newest.last_fetched_at >= timezone.timedelta(hours=interval)
        )
        if due:
            refresh_event_offers(event)