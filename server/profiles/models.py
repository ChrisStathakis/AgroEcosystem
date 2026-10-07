from django.conf import settings
from django.db import models


class Profile(models.Model):
    """The private workspace that owns a user's farm and financial records."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
        help_text="User who owns this profile.",
    )
    display_name = models.CharField(
        max_length=150,
        blank=True,
        help_text="Optional name shown for this workspace.",
    )
    dropbox_refresh_token = models.TextField(
        blank=True,
        default="",
        help_text="Dropbox OAuth refresh token for manual backup uploads.",
    )
    dropbox_app_key = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Dropbox app key entered in Settings.",
    )
    dropbox_app_secret = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Dropbox app secret entered in Settings.",
    )
    dropbox_account = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Connected Dropbox account label.",
    )
    dropbox_last_sync = models.DateTimeField(
        blank=True,
        null=True,
        help_text="When the last manual Dropbox upload succeeded.",
    )
    created_at = models.DateTimeField(auto_now_add=True, help_text="When the profile was created.")
    updated_at = models.DateTimeField(auto_now=True, help_text="When the profile was last changed.")

    def __str__(self) -> str:
        return self.display_name or self.user.get_username()
