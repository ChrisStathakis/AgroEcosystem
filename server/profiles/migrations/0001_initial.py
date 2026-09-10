from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def create_profiles(apps, schema_editor):
    Profile = apps.get_model("profiles", "Profile")
    User = apps.get_model(*settings.AUTH_USER_MODEL.split("."))
    for user in User.objects.all().iterator():
        Profile.objects.get_or_create(user_id=user.pk)


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(
            name="Profile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("display_name", models.CharField(blank=True, help_text="Optional name shown for this workspace.", max_length=150)),
                ("created_at", models.DateTimeField(auto_now_add=True, help_text="When the profile was created.")),
                ("updated_at", models.DateTimeField(auto_now=True, help_text="When the profile was last changed.")),
                ("user", models.OneToOneField(help_text="User who owns this profile.", on_delete=django.db.models.deletion.CASCADE, related_name="profile", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.RunPython(create_profiles, migrations.RunPython.noop),
    ]
