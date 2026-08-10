"""Forms for the events app."""
from django import forms
from .models import Event


class EventForm(forms.ModelForm):
    """Create/edit an event. At least one origin and one destination airport
    is required — we keep the airport management on its own view for clarity,
    but validate basic coherence here."""

    class Meta:
        model = Event
        fields = [
            "name", "description", "outbound_date", "return_date", "currency",
            "refresh_interval_hours", "manual_refresh_cooldown_minutes",
        ]
        widgets = {
            "outbound_date": forms.DateInput(attrs={"type": "date"}),
            "return_date": forms.DateInput(attrs={"type": "date"}),
        }

    def clean(self):
        cleaned = super().clean()
        outbound = cleaned.get("outbound_date")
        return_date = cleaned.get("return_date")
        if outbound and return_date and return_date < outbound:
            self.add_error("return_date", "Return date must be after outbound date.")
        return cleaned


class AddAirportForm(forms.Form):
    airport = forms.CharField(label="Airport IATA code", max_length=3)
    role = forms.ChoiceField(choices=[("origin", "Origin"), ("destination", "Destination")])