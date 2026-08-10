from django.http import JsonResponse
from rest_framework import viewsets, permissions
from .models import User


class MeViewSet(viewsets.ViewSet):
    """Feeds /api/me for the dynamic parts (profile, preferences)."""

    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        u = request.user
        return JsonResponse(
            {
                "email": u.email,
                "display_name": u.first_name or u.username,
                "home_location": u.home_location,
                "language": u.language,
                "can_organize": u.can_organize,
                "notify_seat_events": u.notify_seat_events,
                "notify_better_route": u.notify_better_route,
                "notify_invites": u.notify_invites,
            }
        )