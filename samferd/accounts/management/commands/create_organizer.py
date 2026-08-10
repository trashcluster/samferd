"""Create (or elevate) a site admin / organizer user. Idempotent.

Usage:
  python manage.py create_organizer --email a@b.c --name Alice
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create an organizer user (grants can_organize). Idempotent."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--name", default="")
        parser.add_argument("--admin", action="store_true", help="Also make a site admin/superuser")
        parser.add_argument("--password", default="")

    def handle(self, *args, **options):
        User = get_user_model()
        email = options["email"]
        user, created = User.objects.get_or_create(
            email=email, defaults={"username": email.split("@")[0]},
        )
        if options["name"]:
            user.first_name = options["name"]
        if options["password"]:
            user.set_password(options["password"])
        user.can_organize = True
        if options["admin"]:
            user.is_staff = True
            user.is_superuser = True
        user.save()
        self.stdout.write(
            self.style.SUCCESS(
                f"{'Created' if created else 'Updated'} organizer "
                f"{user.email} (admin={options['admin']})"
            )
        )