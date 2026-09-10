from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


def assign_profiles(apps, schema_editor):
    Expense = apps.get_model("expenses", "Expense")
    Category = apps.get_model("expenses", "ExpenseCategory")
    Profile = apps.get_model("profiles", "Profile")
    profile = Profile.objects.order_by("id").first()
    if profile:
        Category.objects.filter(profile__isnull=True).update(profile=profile)
        for expense in Expense.objects.filter(profile__isnull=True).select_related("farm"):
            expense.profile_id = expense.farm.profile_id
            expense.save(update_fields=["profile"])


class Migration(migrations.Migration):
    dependencies = [("expenses", "0001_initial"), ("farm", "0002_profile"), ("profiles", "0001_initial")]
    operations = [
        migrations.CreateModel(
            name="Vendor",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(help_text="Vendor or supplier name.", max_length=150)),
                ("email", models.EmailField(blank=True, help_text="Optional vendor email address.", max_length=254)),
                ("phone", models.CharField(blank=True, help_text="Optional vendor phone number.", max_length=50)),
                ("address", models.TextField(blank=True, help_text="Optional vendor postal address.")),
                ("notes", models.TextField(blank=True, help_text="Optional notes about this vendor.")),
                ("profile", models.ForeignKey(editable=False, help_text="Profile that owns this vendor.", on_delete=django.db.models.deletion.CASCADE, related_name="vendors", to="profiles.profile")),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.AddField(model_name="expensecategory", name="profile", field=models.ForeignKey(editable=False, help_text="Profile that owns this category.", null=True, on_delete=django.db.models.deletion.CASCADE, related_name="expense_categories", to="profiles.profile")),
        migrations.AddField(model_name="expense", name="profile", field=models.ForeignKey(editable=False, help_text="Profile that owns this expense.", null=True, on_delete=django.db.models.deletion.CASCADE, related_name="expenses", to="profiles.profile")),
        migrations.AddField(model_name="expense", name="vendor", field=models.ForeignKey(blank=True, help_text="Optional vendor who received this payment.", null=True, on_delete=django.db.models.deletion.PROTECT, related_name="expenses", to="expenses.vendor")),
        migrations.RenameField(model_name="expense", old_name="incurred_on", new_name="date"),
        migrations.RenameField(model_name="expense", old_name="is_tax_deductible", new_name="include_in_tax"),
        migrations.AlterModelOptions(name="expense", options={"ordering": ["-date", "-id"]}),
        migrations.RunPython(assign_profiles, migrations.RunPython.noop),
        migrations.AlterField(model_name="expensecategory", name="profile", field=models.ForeignKey(editable=False, help_text="Profile that owns this category.", on_delete=django.db.models.deletion.CASCADE, related_name="expense_categories", to="profiles.profile")),
        migrations.AlterField(model_name="expense", name="profile", field=models.ForeignKey(editable=False, help_text="Profile that owns this expense.", on_delete=django.db.models.deletion.CASCADE, related_name="expenses", to="profiles.profile")),
        migrations.AlterField(model_name="expense", name="title", field=models.CharField(help_text="Short description of the expense.", max_length=150)),
        migrations.AlterField(model_name="expense", name="description", field=models.TextField(blank=True, help_text="Additional details about the expense.")),
        migrations.AlterField(model_name="expense", name="amount", field=models.DecimalField(decimal_places=2, help_text="Expense amount.", max_digits=12)),
        migrations.AlterField(model_name="expense", name="date", field=models.DateField(default=django.utils.timezone.localdate, help_text="Date on which the expense occurred.")),
        migrations.AlterField(model_name="expense", name="document_type", field=models.CharField(choices=[("invoice", "Invoice"), ("receipt", "Receipt")], help_text="Document supplied for this expense.", max_length=10)),
        migrations.AlterField(model_name="expense", name="include_in_tax", field=models.BooleanField(default=False, help_text="Include this expense when calculating tax deductions.")),
        migrations.AlterField(model_name="expense", name="created_at", field=models.DateTimeField(auto_now_add=True, help_text="When the expense was created.")),
        migrations.AlterField(model_name="expense", name="updated_at", field=models.DateTimeField(auto_now=True, help_text="When the expense was last changed.")),
        migrations.AlterField(model_name="expensecategory", name="name", field=models.CharField(help_text="Name used to group expenses.", max_length=100)),
        migrations.AddConstraint(model_name="expensecategory", constraint=models.UniqueConstraint(fields=("profile", "name"), name="unique_expense_category_per_profile")),
        migrations.AddConstraint(model_name="vendor", constraint=models.UniqueConstraint(fields=("profile", "name"), name="unique_vendor_per_profile")),
    ]
