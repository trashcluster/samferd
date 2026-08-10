from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, InviteLink


@admin.register(User)
class UserAdmin(UserAdmin):
    list_display = ("email", "display_name", "can_organize", "is_site_admin", "anonymized")
    search_fields = ("email", "username", "display_name")
    filter_horizontal = ()

    @admin.display(description="Display name")
    def display_name(self, obj):
        return obj.first_name or obj.username

    @admin.display(boolean=True, description="Site admin")
    def is_site_admin(self, obj):
        return obj.is_superuser


@admin.register(InviteLink)
class InviteLinkAdmin(admin.ModelAdmin):
    list_display = ("event", "id", "created_at", "revoked")
    list_filter = ("event",)

    @admin.display(description="Revoked")
    def revoked(self, obj):
        return obj.revoked_at is not None