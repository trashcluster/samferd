"""Notification API exposed to other apps.

Usage:
    from samferd.notifications import notify
    notify.seat_requested(car, rider)

The `services` module is imported lazily so package import never triggers the
Django app registry during INSTALLED_APPS population.
"""
import importlib


def __getattr__(name):
    if name == "notify":
        return importlib.import_module("samferd.notifications.services")
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")