"""Django's settings for the samferd project."""
import environ
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY", default="django-insecure-dev-only-change-me")
DEBUG = env.bool("DEBUG", default=False)
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])
CSRF_TRUSTED_ORIGINS = env.list(
    "CSRF_TRUSTED_ORIGINS", default=["http://localhost", "http://127.0.0.1"]
)

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Applications
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "django_htmx",
    "mozilla_django_oidc",
    # Local
    "samferd.accounts",
    "samferd.events",
    "samferd.carpool",
    "samferd.fares",
    "samferd.notifications",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "django_htmx.middleware.HtmxMiddleware",
]

ROOT_URLCONF = "samferd.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "samferd.wsgi.application"
ASGI_APPLICATION = "samferd.asgi.application"

# Database
DATABASES = {"default": env.db("DATABASE_URL", default="sqlite:///db.sqlite3")}

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

AUTH_USER_MODEL = "accounts.User"

# Internationalization
LANGUAGE_CODE = env("DEFAULT_LANGUAGE", default="fr")
LANGUAGES = [("fr", "Français"), ("en", "English")]
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
LOCALE_PATHS = [BASE_DIR / "locale"]

# Static files
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
LOGIN_URL = "accounts:login"
LOGIN_REDIRECT_URL = "events:home"
LOGOUT_REDIRECT_URL = "accounts:login"

# Authentication / OIDC
ENABLE_PASSWORD_AUTH = env.bool("ENABLE_PASSWORD_AUTH", default=True)
AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
]
if env("OIDC_RP_CLIENT_ID", default=""):
    AUTHENTICATION_BACKENDS.append("samferd.accounts.oidc_backend.InviteOnlyOIDCBackend")
    OIDC_RP_CLIENT_ID = env("OIDC_RP_CLIENT_ID")
    OIDC_RP_CLIENT_SECRET = env("OIDC_RP_CLIENT_SECRET")
    OIDC_OP_DISCOVERY_URL = env("OIDC_OP_DISCOVERY_URL")
    OIDC_RP_SIGN_ALGO = "RS256"
    OIDC_OP_AUTHORIZATION_ENDPOINT = env("OIDC_OP_AUTHORIZATION_ENDPOINT", default="")
    OIDC_OP_TOKEN_ENDPOINT = env("OIDC_OP_TOKEN_ENDPOINT", default="")
    OIDC_OP_USER_ENDPOINT = env("OIDC_OP_USER_ENDPOINT", default="")
    OIDC_CREATE_USER = False

# Django REST Framework
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

# Celery
CELERY_BROKER_URL = env("REDIS_URL", default="redis://localhost:6379/0")
CELERY_RESULT_BACKEND = CELERY_BROKER_URL
CELERY_TIMEZONE = "UTC"
CELERY_BEAT_SCHEDULE = {
    "refresh-active-events": {
        "task": "samferd.fares.tasks.refresh_all_active_events",
        "schedule": 900,  # every 15 minutes; each event respects its own interval
    },
    "enrich-bookings": {
        "task": "samferd.fares.tasks.enrich_all_bookings",
        "schedule": 86400,  # daily
    },
    "purge-stale-offers": {
        "task": "samferd.fares.tasks.purge_stale_offers",
        "schedule": 86400,  # daily
    },
}

# Fare provider
FARE_PROVIDER = env("FARE_PROVIDER", default="google_flights")
# Language hint passed to Google Flights (affects airline/airport display names).
FARE_PROVIDER_LANGUAGE = env("FARE_PROVIDER_LANGUAGE", default="en")

# Notifications
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="samferd@example.com")
if env("EMAIL_URL", default=""):
    EMAIL_CONFIG = env.email_url("EMAIL_URL")
    vars().update(EMAIL_CONFIG)

# Better-route comparison
TIE_TOLERANCE_PERCENT = env.float("TIE_TOLERANCE_PERCENT", default=5.0)

# Logging
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}