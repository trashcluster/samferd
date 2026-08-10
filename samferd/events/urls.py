from django.urls import path
from . import views

app_name = "events"

urlpatterns = [
    path("", views.home, name="home"),
    path("events", views.home, name="event_list"),
    path("events/new", views.event_create, name="event_create"),
    path("events/<uuid:pk>", views.event_detail, name="detail"),
    path("events/<uuid:pk>/edit", views.event_edit, name="event_edit"),
    path("events/<uuid:pk>/airports/add", views.event_add_airport, name="event_add_airport"),
    path("events/<uuid:pk>/invites", views.event_invites, name="event_invites"),
    path("events/<uuid:pk>/invites/create", views.invites_create, name="invites_create"),
    path("invites/<uuid:pk>/revoke", views.invites_revoke, name="invites_revoke"),
]