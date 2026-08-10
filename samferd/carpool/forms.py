"""Forms for the carpool app."""
from django import forms
from .models import Car


class CarForm(forms.ModelForm):
    class Meta:
        model = Car
        fields = ["departure_airport", "total_free_seats", "note", "cost_amount", "parking_override"]
        widgets = {
            "note": forms.Textarea(attrs={"rows": 2}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # A car drives to the airport, so only origin airports of the event
        # are valid departure points.
        if self.instance.pk and self.instance.participation and self.instance.participation.event_id:
            event = self.instance.participation.event
            qs = event.airports.filter(role="origin").select_related("airport")
            self.fields["departure_airport"].queryset = qs
            self.fields["departure_airport"].label_from_instance = (
                lambda ea: f"{ea.airport.iata_code} — {ea.airport.name}"
            )