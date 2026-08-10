"""Samferd — travel together with someone.

We import the Celery app so it is loaded whenever Django starts.
"""
from .celery import app as celery_app

__version__ = "0.1.0"

__all__ = ("celery_app",)