from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


def create_opening_movements(apps, schema_editor):
    TreePlanting = apps.get_model("farm", "TreePlanting")
    Movement = apps.get_model("farm", "TreeInventoryMovement")
    for planting in TreePlanting.objects.all().iterator():
        Movement.objects.create(
            profile_id=planting.profile_id,
            planting_id=planting.pk,
            action="add",
            quantity=planting.count,
            effective_date=planting.planted_on or planting.created_at.date(),
            notes="Opening balance from the previous tree inventory.",
        )


class Migration(migrations.Migration):
    dependencies = [("farm", "0003_taskcategory_treeplanting_farmtask_treetype_and_more")]

    operations = [
        migrations.CreateModel(
            name="TreeInventoryMovement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("action", models.CharField(choices=[("add", "Add"), ("remove", "Remove")], help_text="Whether trees were added or removed.", max_length=6)),
                ("quantity", models.PositiveIntegerField(help_text="Number of trees moved.")),
                ("effective_date", models.DateField(help_text="Date on which the movement occurred.")),
                ("notes", models.TextField(blank=True, help_text="Optional explanation for this movement.")),
                ("created_at", models.DateTimeField(auto_now_add=True, help_text="When this movement was recorded.")),
                ("planting", models.ForeignKey(help_text="Tree group whose balance changed.", on_delete=django.db.models.deletion.PROTECT, related_name="movements", to="farm.treeplanting")),
                ("profile", models.ForeignKey(editable=False, help_text="Profile that owns this movement.", on_delete=django.db.models.deletion.CASCADE, related_name="tree_inventory_movements", to="profiles.profile")),
            ],
            options={"ordering": ["-effective_date", "-created_at", "-pk"]},
        ),
        migrations.RunPython(create_opening_movements, migrations.RunPython.noop),
    ]
