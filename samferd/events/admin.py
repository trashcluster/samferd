from django.contrib import admin
from .models import Event, EventAirport, Participation, Airport, ParkingPrice


class EventAirportInline(admin.TabularInline):
    model = EventAirport
    extra = 0


class ParticipationInline(admin.TabularInline):
    model = Participation
    extra = 0
    readonly_fields = ("joined_at",)


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ("name", "organizer", "outbound_date", "return_date", "currency")
    list_filter = ("currency",)
    search_fields = ("name", "description")
    inlines = [EventAirportInline, ParticipationInline]


@admin.register(Airport)
class AirportAdmin(admin.ModelAdmin):
    list_display = ("iata_code", "name", "city", "country")
    search_fields = ("iata_code", "name", "city")


@admin.register(EventAirport)
class EventAirportAdmin(admin.ModelAdmin):
    list_display = ("event", "airport", "role", "position")


@admin.register(Participation)
class ParticipationAdmin(admin.ModelAdmin):
    list_display = ("event", "user", "travel_mode", "joined_at")


@admin.register(ParkingPrice)
class ParkingPriceAdmin(admin.ModelAdmin):
    list_display = ("airport", "amount", "currency", "mode")