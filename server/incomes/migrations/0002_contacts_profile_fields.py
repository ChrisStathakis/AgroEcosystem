from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


def assign_profiles(apps, schema_editor):
    Income = apps.get_model("incomes", "Income")
    Category = apps.get_model("incomes", "IncomeCategory")
    Profile = apps.get_model("profiles", "Profile")
    profile = Profile.objects.order_by("id").first()
    if profile:
        Category.objects.filter(profile__isnull=True).update(profile=profile)
        for income in Income.objects.filter(profile__isnull=True).select_related("farm"):
            income.profile_id = income.farm.profile_id
            income.save(update_fields=["profile"])


class Migration(migrations.Migration):
    dependencies = [("incomes", "0001_initial"), ("farm", "0002_profile"), ("profiles", "0001_initial")]
    operations = [
        migrations.CreateModel(
            name="Customer",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(help_text="Customer or buyer name.", max_length=150)),
                ("email", models.EmailField(blank=True, help_text="Optional customer email address.", max_length=254)),
                ("phone", models.CharField(blank=True, help_text="Optional customer phone number.", max_length=50)),
                ("address", models.TextField(blank=True, help_text="Optional customer postal address.")),
                ("notes", models.TextField(blank=True, help_text="Optional notes about this customer.")),
                ("profile", models.ForeignKey(editable=False, help_text="Profile that owns this customer.", on_delete=django.db.models.deletion.CASCADE, related_name="customers", to="profiles.profile")),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.AddField(model_name="incomecategory", name="profile", field=models.ForeignKey(editable=False, help_text="Profile that owns this category.", null=True, on_delete=django.db.models.deletion.CASCADE, related_name="income_categories", to="profiles.profile")),
        migrations.AddField(model_name="income", name="profile", field=models.ForeignKey(editable=False, help_text="Profile that owns this income.", null=True, on_delete=django.db.models.deletion.CASCADE, related_name="incomes", to="profiles.profile")),
        migrations.AddField(model_name="income", name="customer", field=models.ForeignKey(blank=True, help_text="Optional customer who provided this income.", null=True, on_delete=django.db.models.deletion.PROTECT, related_name="incomes", to="incomes.customer")),
        migrations.RenameField(model_name="income", old_name="received_on", new_name="date"),
        migrations.RenameField(model_name="income", old_name="is_taxable", new_name="include_in_tax"),
        migrations.AlterModelOptions(name="income", options={"ordering": ["-date", "-id"]}),
        migrations.RunPython(assign_profiles, migrations.RunPython.noop),
        migrations.AlterField(model_name="incomecategory", name="profile", field=models.ForeignKey(editable=False, help_text="Profile that owns this category.", on_delete=django.db.models.deletion.CASCADE, related_name="income_categories", to="profiles.profile")),
        migrations.AlterField(model_name="income", name="profile", field=models.ForeignKey(editable=False, help_text="Profile that owns this income.", on_delete=django.db.models.deletion.CASCADE, related_name="incomes", to="profiles.profile")),
        migrations.AlterField(model_name="income", name="title", field=models.CharField(help_text="Short description of the income.", max_length=150)),
        migrations.AlterField(model_name="income", name="description", field=models.TextField(blank=True, help_text="Additional details about the income.")),
        migrations.AlterField(model_name="income", name="amount", field=models.DecimalField(decimal_places=2, help_text="Income amount.", max_digits=12)),
        migrations.AlterField(model_name="income", name="date", field=models.DateField(default=django.utils.timezone.localdate, help_text="Date on which the income was received.")),
        migrations.AlterField(model_name="income", name="document_type", field=models.CharField(choices=[("invoice", "Invoice"), ("receipt", "Receipt")], help_text="Document supplied for this income.", max_length=10)),
        migrations.AlterField(model_name="income", name="include_in_tax", field=models.BooleanField(default=True, help_text="Include this income when calculating taxable income.")),
        migrations.AlterField(model_name="income", name="created_at", field=models.DateTimeField(auto_now_add=True, help_text="When the income was created.")),
        migrations.AlterField(model_name="income", name="updated_at", field=models.DateTimeField(auto_now=True, help_text="When the income was last changed.")),
        migrations.AlterField(model_name="incomecategory", name="name", field=models.CharField(help_text="Name used to group income.", max_length=100)),
        migrations.AddConstraint(model_name="incomecategory", constraint=models.UniqueConstraint(fields=("profile", "name"), name="unique_income_category_per_profile")),
        migrations.AddConstraint(model_name="customer", constraint=models.UniqueConstraint(fields=("profile", "name"), name="unique_customer_per_profile")),
    ]
