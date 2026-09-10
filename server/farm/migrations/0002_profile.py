from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def assign_profiles(apps, schema_editor):
    Farm = apps.get_model("farm", "Farm")
    Profile = apps.get_model("profiles", "Profile")
    User = apps.get_model(*settings.AUTH_USER_MODEL.split("."))
    user = User.objects.order_by("id").first()
    if user is None:
        # Historical models have no managers/methods (e.g. set_unusable_password),
        # so store a raw unusable-password marker ("!" prefix) directly.
        user = User.objects.create(username="legacy-owner", is_active=True, password="!")
    profile, _ = Profile.objects.get_or_create(user=user)
    Farm.objects.filter(profile__isnull=True).update(profile=profile)


class Migration(migrations.Migration):
    dependencies = [("farm", "0001_initial"), ("profiles", "0001_initial")]
    operations = [
        migrations.AddField(
            model_name="farm",
            name="profile",
            field=models.ForeignKey(editable=False, help_text="Profile that owns this farm.", null=True, on_delete=django.db.models.deletion.CASCADE, related_name="farms", to="profiles.profile"),
        ),
        migrations.RunPython(assign_profiles, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="farm",
            name="profile",
            field=models.ForeignKey(editable=False, help_text="Profile that owns this farm.", on_delete=django.db.models.deletion.CASCADE, related_name="farms", to="profiles.profile"),
        ),
        migrations.AlterField(model_name="farm", name="title", field=models.CharField(help_text="Name used to identify the farm.", max_length=150)),
        migrations.AlterField(model_name="farm", name="size", field=models.DecimalField(decimal_places=2, help_text="Farm size in hectares.", max_digits=10)),
        migrations.AlterField(model_name="farm", name="active", field=models.BooleanField(default=True, help_text="Whether this farm is currently active.")),
        migrations.AlterField(model_name="farm", name="created_at", field=models.DateTimeField(auto_now_add=True, help_text="When the farm was created.")),
        migrations.AlterField(model_name="farm", name="updated_at", field=models.DateTimeField(auto_now=True, help_text="When the farm was last changed.")),
        migrations.AddConstraint(model_name="farm", constraint=models.UniqueConstraint(fields=("profile", "title"), name="unique_farm_title_per_profile")),
    ]
