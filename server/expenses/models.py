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
    farm = models.ForeignKey(Farm, on_delete=models.PROTECT, related_name="expenses", blank=True, null=True, help_text="Farm this expense belongs to. Leave empty to split across all farms by tree count.")
    category = models.ForeignKey(ExpenseCategory, on_delete=models.PROTECT, related_name="expenses", help_text="Expense category.")
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name="expenses", blank=True, null=True, help_text="Optional vendor who received this payment.")
    title = models.CharField(max_length=150, help_text="Short description of the expense.")
    description = models.TextField(blank=True, help_text="Additional details about the expense.")
    amount = models.DecimalField(max_digits=12, decimal_places=2, help_text="Expense amount.")
    date = models.DateField(default=timezone.localdate, help_text="Date on which the expense occurred.")
    document_type = models.CharField(max_length=10, choices=DocumentType.choices, help_text="Document supplied for this expense.")
    include_in_tax = models.BooleanField(default=False, help_text="Include this expense when calculating tax deductions.")
    is_paid = models.BooleanField(default=True, help_text="Unpaid expenses appear under obligations.")
    is_archived = models.BooleanField(default=False, help_text="Archived expenses stay in lists and reports but are hidden from task dropdowns.")
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

    @property
    def is_shared(self) -> bool:
        """A shared expense has no farm and is split across farms by tree count."""
        return self.farm_id is None

    @property
    def farm_display(self) -> str:
        if self.farm_id:
            return str(self.farm)
        return "All farms (split by trees)"


def farm_tree_weights(profile) -> tuple[dict, int]:
    """Current tree counts per farm for one profile.

    Returns ``({farm_id: trees}, total_trees)``. Farms without plantings
    are included with zero so equal-split fallbacks still cover them.
    """
    from django.db.models import Sum

    from farm.models import Farm, TreePlanting

    farms = list(Farm.objects.filter(profile=profile).order_by("title"))
    totals = dict(
        TreePlanting.objects.filter(profile=profile, farm__profile=profile)
        .values("farm_id")
        .annotate(total=Sum("count"))
        .values_list("farm_id", "total")
    )
    weights = {farm.pk: int(totals.get(farm.pk) or 0) for farm in farms}
    return weights, sum(weights.values())


def split_amount_by_trees(amount, weights: dict) -> dict:
    """Split ``amount`` proportionally to ``weights`` ({farm_id: trees}).

    Falls back to an equal split when every weight is zero. Rounds each
    share to cents and assigns the rounding remainder to the largest
    farm so the shares always sum to ``amount``.
    """
    from decimal import Decimal, ROUND_DOWN

    amount = Decimal(str(amount))
    farm_ids = list(weights.keys())
    if not farm_ids:
        return {}
    total = sum(weights.values())
    if total <= 0:
        equal = (amount / len(farm_ids)).quantize(Decimal("0.01"), rounding=ROUND_DOWN)
        shares = {fid: equal for fid in farm_ids}
    else:
        shares = {
            fid: (amount * Decimal(str(weights[fid])) / Decimal(str(total))).quantize(
                Decimal("0.01"), rounding=ROUND_DOWN
            )
            for fid in farm_ids
        }
    remainder = amount - sum(shares.values(), Decimal("0"))
    if remainder:
        largest = max(farm_ids, key=lambda fid: (weights.get(fid, 0), fid))
        shares[largest] += remainder
    return shares
