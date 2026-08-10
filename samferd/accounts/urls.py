from django.urls import path
from django.contrib.auth import views as auth_views
from django.conf import settings
from . import views

app_name = "accounts"

urlpatterns = [
    path("login", views.login_view, name="login"),
    path("logout", auth_views.LogoutView.as_view(), name="logout"),
    path(
        "password-reset/",
        auth_views.PasswordResetView.as_view(),
        name="password_reset",
    ),
    path(
        "password-reset/done/",
        auth_views.PasswordResetDoneView.as_view(),
        name="password_reset_done",
    ),
    path(
        "reset/<uidb64>/<token>/",
        auth_views.PasswordResetConfirmView.as_view(),
        name="password_reset_confirm",
    ),
    path(
        "reset/done/",
        auth_views.PasswordResetCompleteView.as_view(),
        name="password_reset_complete",
    ),
    path("invite/<uuid:token>", views.invite_redeem, name="invite_redeem"),
    path("signup", views.signup_view, name="signup"),
    path("api/me", views.api_me, name="api_me"),
    path("profile", views.profile_view, name="profile"),
    path("profile/export", views.export_data, name="profile_export"),
    path("profile/delete", views.delete_account, name="profile_delete"),
]