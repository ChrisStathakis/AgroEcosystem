from django.db import migrations, models
import django.db.models.deletion


def migrate_legacy_farms(apps, schema_editor):
    Income = apps.get_model("incomes", "Income")
    Allocation = apps.get_model("incomes", "IncomeFarmAllocation")
    for income in Income.objects.exclude(farm_id=None).iterator():
        Allocation.objects.create(
            profile_id=income.profile_id,
            income_id=income.pk,
            farm_id=income.farm_id,
            amount=income.amount,
        )


class Migration(migrations.Migration):
    dependencies = [("incomes", "0003_alter_income_category_alter_income_farm")]

    operations = [
        migrations.CreateModel(
            name="IncomeFarmAllocation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("amount", models.DecimalField(decimal_places=2, help_text="Amount attributed to this farm.", max_digits=12)),
                ("farm", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="income_allocations", to="farm.farm")),
                ("income", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="allocations", to="incomes.income")),
                ("profile", models.ForeignKey(editable=False, help_text="Profile that owns this allocation.", on_delete=django.db.models.deletion.CASCADE, related_name="income_farm_allocations", to="profiles.profile")),
            ],
            options={"ordering": ["farm__title", "pk"]},
        ),
        migrations.AddConstraint(
            model_name="incomefarmallocation",
            constraint=models.UniqueConstraint(fields=("income", "farm"), name="unique_income_farm_allocation"),
        ),
        migrations.RunPython(migrate_legacy_farms, migrations.RunPython.noop),
        migrations.RemoveField(model_name="income", name="farm"),
        migrations.AddField(
            model_name="income",
            name="farms",
            field=models.ManyToManyField(blank=True, related_name="incomes", through="incomes.IncomeFarmAllocation", to="farm.farm"),
        ),
    ]
