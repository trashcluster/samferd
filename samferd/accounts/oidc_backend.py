"""OIDC authentication backend.

Account creation is restricted to the invite-link flow, so this backend only
links OIDC identities to *existing* users (matched by email), and never
auto-creates new users. New accounts come from `invite_redeem`.
"""
import logging
from mozilla_django_oidc.auth import OIDCAuthenticationBackend

logger = logging.getLogger(__name__)


class InviteOnlyOIDCBackend(OIDCAuthenticationBackend):
    def filter_users_by_claims(self, claims):
        """Return matching users by email. Does NOT create users."""
        email = (claims.get("email") or "").lower()
        if not email:
            return self.UserModel.objects.none()
        return self.UserModel.objects.filter(email__iexact=email, is_active=True)

    def create_user(self, claims):
        # OIDC never auto-creates: users must join through an invite link.
        logger.info("OIDC login without matching user (invite required): %s", claims.get("email"))
        return None