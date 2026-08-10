from django.urls import path
from . import views

app_name = "carpool"

urlpatterns = [
    path("events/<uuid:event_pk>/car", views.car_offer, name="car_offer"),
    path("cars/<uuid:car_pk>/request", views.car_request_seat, name="request_seat"),
    path("requests/<uuid:req_pk>/<str:action>", views.seat_resolve, name="seat_resolve"),
]