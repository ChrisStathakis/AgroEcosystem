from django.db import models
from django.utils import timezone

from farm.models import Farm
from profiles.models import Profile


class IncomeCategory(models.Model):
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="income_categories", editable=False, help_text="Profile that owns this category.")
    name = models.CharField(max_length=100, help_text="Name used to group income.")

    class Meta:
        verbose_name_plural = "income categories"
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["profile", "name"], name="unique_income_category_per_profile")]

    def __str__(self) -> str:
        return self.name


class Customer(models.Model):
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="customers", editable=False, help_text="Profile that owns this customer.")
    name = models.CharField(max_length=150, help_text="Customer or buyer name.")
    email = models.EmailField(blank=True, help_text="Optional customer email address.")
    phone = models.CharField(max_length=50, blank=True, help_text="Optional customer phone number.")
    address = models.TextField(blank=True, help_text="Optional customer postal address.")
    notes = models.TextField(blank=True, help_text="Optional notes about this customer.")

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["profile", "name"], name="unique_customer_per_profile")]

    def __str__(self) -> str:
        return self.name


class Income(models.Model):
    class DocumentType(models.TextChoices):
        INVOICE = "invoice", "Invoice"
        RECEIPT = "receipt", "Receipt"
    
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="incomes", editable=False, help_text="Profile that owns this income.")
    farms = models.ManyToManyField(Farm, through="IncomeFarmAllocation", related_name="incomes", blank=True)
    category = models.ForeignKey(IncomeCategory, on_delete=models.PROTECT, related_name="incomes", help_text="Income category.")
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="incomes", blank=True, null=True, help_text="Optional customer who provided this income.")
    title = models.CharField(max_length=150, help_text="Short description of the income.")
    description = models.TextField(blank=True, help_text="Additional details about the income.")
    amount = models.DecimalField(max_digits=12, decimal_places=2, help_text="Income amount.")
    date = models.DateField(default=timezone.localdate, help_text="Date on which the income was received.")
    document_type = models.CharField(max_length=10, choices=DocumentType.choices, help_text="Document supplied for this income.")
    include_in_tax = models.BooleanField(default=True, help_text="Include this income when calculating taxable income.")
    is_archived = models.BooleanField(default=False, help_text="Archived incomes stay in lists and reports but are hidden from selection dropdowns.")
    created_at = models.DateTimeField(auto_now_add=True, help_text="When the income was created.")
    updated_at = models.DateTimeField(auto_now=True, help_text="When the income was last changed.")

    class Meta:
        ordering = ["-date", "-id"]

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.category_id and self.profile_id and self.category.profile_id != self.profile_id:
            raise ValidationError({"category": "Category must belong to the same profile."})
        if self.customer_id and self.profile_id and self.customer.profile_id != self.profile_id:
            raise ValidationError({"customer": "Customer must belong to the same profile."})

    def __str__(self) -> str:
        return f"{self.title} ({self.amount})"

    @property
    def farm(self):
        """Compatibility/display value for templates expecting the old farm field."""
        allocations = list(self.allocations.select_related("farm").all())
        if not allocations:
            return "Unallocated"
        total = sum((allocation.amount for allocation in allocations), self.amount - self.amount)
        parts = [f"{allocation.farm} ({allocation.amount:.2f})" for allocation in allocations]
        remainder = self.amount - total
        if remainder:
            parts.append(f"Unallocated ({remainder:.2f})")
        return ", ".join(parts)


class IncomeFarmAllocation(models.Model):
    """Optional portion of an income attributed to one farm."""

    profile = models.ForeignKey(
        Profile, on_delete=models.CASCADE, related_name="income_farm_allocations", editable=False,
        help_text="Profile that owns this allocation.",
    )
    income = models.ForeignKey(Income, on_delete=models.CASCADE, related_name="allocations")
    farm = models.ForeignKey(Farm, on_delete=models.PROTECT, related_name="income_allocations")
    amount = models.DecimalField(max_digits=12, decimal_places=2, help_text="Amount attributed to this farm.")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["income", "farm"], name="unique_income_farm_allocation")]
        ordering = ["farm__title", "pk"]

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.income_id and self.profile_id and self.income.profile_id != self.profile_id:
            raise ValidationError({"income": "Income must belong to the same profile."})
        if self.farm_id and self.profile_id and self.farm.profile_id != self.profile_id:
            raise ValidationError({"farm": "Farm must belong to the same profile."})
        if self.amount is not None and self.amount <= 0:
            raise ValidationError({"amount": "Allocation must be greater than zero."})
        if self.income_id and self.amount is not None:
            from decimal import Decimal
            existing_total = (IncomeFarmAllocation.objects.filter(income_id=self.income_id)
                              .exclude(pk=self.pk).aggregate(total=models.Sum("amount"))["total"] or Decimal("0"))
            if Decimal(str(existing_total)) + Decimal(str(self.amount)) > Decimal(str(self.income.amount)):
                raise ValidationError("Farm allocations cannot exceed the income amount.")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.farm}: {self.amount}"
