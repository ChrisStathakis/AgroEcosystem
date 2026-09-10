from django.db import models
from django.utils import timezone

from farm.models import Farm
from profiles.models import Profile


class ExpenseCategory(models.Model):
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="expense_categories", editable=False, help_text="Profile that owns this category.")
    name = models.CharField(max_length=100, help_text="Name used to group expenses.")

    class Meta:
        verbose_name_plural = "expense categories"
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["profile", "name"], name="unique_expense_category_per_profile")]

    def __str__(self) -> str:
        return self.name


class Vendor(models.Model):
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="vendors", editable=False, help_text="Profile that owns this vendor.")
    name = models.CharField(max_length=150, help_text="Vendor or supplier name.")
    email = models.EmailField(blank=True, help_text="Optional vendor email address.")
    phone = models.CharField(max_length=50, blank=True, help_text="Optional vendor phone number.")
    address = models.TextField(blank=True, help_text="Optional vendor postal address.")
    notes = models.TextField(blank=True, help_text="Optional notes about this vendor.")

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["profile", "name"], name="unique_vendor_per_profile")]

    def __str__(self) -> str:
        return self.name


class Expense(models.Model):
    class DocumentType(models.TextChoices):
        INVOICE = "invoice", "Invoice"
        RECEIPT = "receipt", "Receipt"

    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="expenses", editable=False, help_text="Profile that owns this expense.")
    farm = models.ForeignKey(Farm, on_delete=models.PROTECT, related_name="expenses", help_text="Farm this expense belongs to.")
    category = models.ForeignKey(ExpenseCategory, on_delete=models.PROTECT, related_name="expenses", help_text="Expense category.")
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name="expenses", blank=True, null=True, help_text="Optional vendor who received this payment.")
    title = models.CharField(max_length=150, help_text="Short description of the expense.")
    description = models.TextField(blank=True, help_text="Additional details about the expense.")
    amount = models.DecimalField(max_digits=12, decimal_places=2, help_text="Expense amount.")
    date = models.DateField(default=timezone.localdate, help_text="Date on which the expense occurred.")
    document_type = models.CharField(max_length=10, choices=DocumentType.choices, help_text="Document supplied for this expense.")
    include_in_tax = models.BooleanField(default=False, help_text="Include this expense when calculating tax deductions.")
    created_at = models.DateTimeField(auto_now_add=True, help_text="When the expense was created.")
    updated_at = models.DateTimeField(auto_now=True, help_text="When the expense was last changed.")

    class Meta:
        ordering = ["-date", "-id"]

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.farm_id and self.profile_id and self.farm.profile_id != self.profile_id:
            raise ValidationError({"farm": "Farm must belong to the same profile."})
        if self.category_id and self.profile_id and self.category.profile_id != self.profile_id:
            raise ValidationError({"category": "Category must belong to the same profile."})
        if self.vendor_id and self.profile_id and self.vendor.profile_id != self.profile_id:
            raise ValidationError({"vendor": "Vendor must belong to the same profile."})

    def __str__(self) -> str:
        return f"{self.title} ({self.amount})"
