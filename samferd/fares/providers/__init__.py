"""Provider factory — resolves the configured FARE_PROVIDER."""
from django.conf import settings
from .base import BaseFareProvider


def get_provider() -> BaseFareProvider:
    provider = settings.FARE_PROVIDER
    if provider == "amadeus" or provider is None:
        from .amadeus import AmadeusProvider
        return AmadeusProvider(
            client_id=settings.AMADEUS_CLIENT_ID,
            client_secret=settings.AMADEUS_CLIENT_SECRET,
            env=settings.AMADEUS_ENV,
            monthly_budget=settings.API_MONTHLY_BUDGET,
        )
    # Extension point: add more providers here (e.g. `skyscanner`).
    raise ValueError(f"Unknown fare provider: {provider}")