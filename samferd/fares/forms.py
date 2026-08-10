"""Forms for the fares app."""
from django import forms
from .models import Booking


class BookingForm(forms.ModelForm):
    class Meta:
        model = Booking
        fields = ["status", "flight_number", "flight_date", "refundable", "price_paid"]
        widgets = {
            "flight_date": forms.DateInput(attrs={"type": "date"}),
        }

    def clean(self):
        cleaned = super().clean()
        status = cleaned.get("status")
        if status in ("booked", "confirmed"):
            if not cleaned.get("flight_number"):
                self.add_error("flight_number", "Flight number is required when booked.")
        return cleaned