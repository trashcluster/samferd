from django.contrib import admin
from .models import RouteQuery, FlightOffer, Booking


@admin.register(RouteQuery)
class RouteQueryAdmin(admin.ModelAdmin):
    list_display = ("event", "origin", "destination", "direction", "travel_date", "last_fetched_at")
    list_filter = ("event", "direction")


@admin.register(FlightOffer)
class FlightOfferAdmin(admin.ModelAdmin):
    list_display = ("route_query", "rank", "price_amount", "currency", "legs_count", "fetched_at")
    list_filter = ("provider",)


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ("participation", "direction", "status", "flight_number", "refundable")
    list_filter = ("status", "direction")