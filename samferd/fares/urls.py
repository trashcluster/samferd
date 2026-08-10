from django.urls import path
from . import views

app_name = "fares"

urlpatterns = [
    path("events/<uuid:event_pk>/refresh", views.manual_refresh, name="manual_refresh"),
    path("events/<uuid:event_pk>/bookings/<str:direction>", views.booking_edit, name="booking_edit"),
]