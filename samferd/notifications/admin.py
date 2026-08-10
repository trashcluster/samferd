from django.contrib import admin
from .models import NotificationLog


@admin.register(NotificationLog)
class NotificationLogAdmin(admin.ModelAdmin):
    list_display = ("user", "event", "kind", "sent_at")
    list_filter = ("kind", "event")
    search_fields = ("user__email",)