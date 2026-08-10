#!/usr/bin/env bash
set -e

echo "Waiting for database..."
python -c "
import os, time, psycopg
from django.conf import settings
" 2>/dev/null || true

python manage.py migrate --noinput
python manage.py collectstatic --noinput

exec gunicorn samferd.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${WEB_CONCURRENCY:-3}" \
    --timeout 120