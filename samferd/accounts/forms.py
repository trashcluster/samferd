"""Forms for the accounts app."""
from django import forms
from django.contrib.auth.forms import UserCreationForm
from .models import User


class SignupForm(UserCreationForm):
    """Minimal signup used only via invite links (no public registration)."""

    email = forms.EmailField()

    class Meta:
        model = User
        fields = ("email", "username", "password1", "password2")

    def save(self, commit=True):
        user = super().save(commit=False)
        user.email = self.cleaned_data["email"]
        if commit:
            user.save()
        return user


class ProfileForm(forms.ModelForm):
    class Meta:
        model = User
        fields = [
            "email", "first_name", "home_location", "language",
            "notify_seat_events", "notify_better_route", "notify_invites",
        ]
        widgets = {
            "notify_seat_events": forms.CheckboxInput,
            "notify_better_route": forms.CheckboxInput,
            "notify_invites": forms.CheckboxInput,
        }