"""WSGI config for the samferd project."""
import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "samferd.settings")
application = get_wsgi_application()