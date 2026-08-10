"""Celery beat schedule for periodic tasks."""
from celery.schedules import crontab

try:
    from django.conf import settings

    if settings is not None and hasattr(settings, "CELERY_BEAT_SCHEDULE"):
        pass
except Exception:
    pass