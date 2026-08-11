"""Provider factory — resolves the configured FARE_PROVIDER."""
from django.conf import settings
from .base import BaseFareProvider


def get_provider() -> BaseFareProvider:
    provider = settings.FARE_PROVIDER
    if provider in ("google_flights", None):
        from .google_flights import GoogleFlightsProvider
        return GoogleFlightsProvider(language=settings.FARE_PROVIDER_LANGUAGE)
    # Extension point: add more providers here.
    raise ValueError(f"Unknown fare provider: {provider}")