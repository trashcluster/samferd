"""NotificationLog model for auditing + digest rate limiting."""
import uuid
from django.conf import settings
from django.db import models


class NotificationLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notification_logs",
    )
    event = models.ForeignKey(
        "events.Event", on_delete=models.CASCADE, related_name="notification_logs",
        null=True, blank=True,
    )
    kind = models.CharField(max_length=32)
    sent_at = models.DateTimeField(auto_now_add=True)
    payload = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-sent_at"]

    def __str__(self):
        return f"{self.user.username} — {self.kind} — {self.sent_at:%Y-%m-%d %H:%M}"