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


MAX_HOME_PERIODS = 6

DEFAULT_HOME_PERIODS = (
    ("Q1", 1, 3),
    ("Q2", 4, 6),
    ("Q3", 7, 9),
    ("Q4", 10, 12),
)


class HomePeriod(models.Model):
    """User-defined home-page period (month range, recurring every year, max 6)."""

    profile = models.ForeignKey(
        Profile,
        on_delete=models.CASCADE,
        related_name="home_periods",
        help_text="Workspace that owns this period.",
    )
    name = models.CharField(max_length=50, help_text="Period name shown on the home page.")
    start_month = models.PositiveSmallIntegerField(help_text="First month (1-12).")
    end_month = models.PositiveSmallIntegerField(help_text="Last month (1-12).")
    sort_order = models.PositiveIntegerField(default=0, help_text="Display order on the home page.")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["profile", "name"], name="unique_home_period_name"),
            models.CheckConstraint(condition=models.Q(start_month__gte=1, start_month__lte=12), name="home_period_start_range"),
            models.CheckConstraint(condition=models.Q(end_month__gte=1, end_month__lte=12), name="home_period_end_range"),
            models.CheckConstraint(condition=models.Q(start_month__lte=models.F("end_month")), name="home_period_order"),
        ]
        ordering = ["sort_order", "start_month", "pk"]

    def __str__(self) -> str:
        return f"{self.name} ({self.start_month}-{self.end_month})"
