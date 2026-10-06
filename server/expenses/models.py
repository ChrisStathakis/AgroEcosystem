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

    class SplitBasis(models.TextChoices):
        TREES = "trees", "Trees"
        TREE_TYPE = "tree_type", "Tree variety"
        AREA = "area", "Area (stremmata)"
        EQUAL = "equal", "Equal"

    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="expenses", editable=False, help_text="Profile that owns this expense.")
    farm = models.ForeignKey(Farm, on_delete=models.PROTECT, related_name="expenses", blank=True, null=True, help_text="Farm this expense belongs to. Leave empty to split across all farms by the selected basis.")
    split_basis = models.CharField(max_length=9, choices=SplitBasis.choices, default=SplitBasis.TREES, help_text="How a shared (farm-less) expense is split across farms.")
    split_tree_type = models.ForeignKey("farm.TreeType", on_delete=models.PROTECT, related_name="split_expenses", blank=True, null=True, help_text="Tree variety used when the split basis is a single variety.")
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
        if self.split_tree_type_id and self.profile_id and self.split_tree_type.profile_id != self.profile_id:
            raise ValidationError({"split_tree_type": "Tree variety must belong to the same profile."})
        if self.split_basis == self.SplitBasis.TREE_TYPE and not self.split_tree_type_id:
            raise ValidationError({"split_tree_type": "Choose a tree variety for this split basis."})
        if self.farm_id and (self.split_basis != self.SplitBasis.TREES or self.split_tree_type_id):
            # Split settings only apply to shared (farm-less) expenses; reset silently.
            self.split_basis = self.SplitBasis.TREES
            self.split_tree_type = None

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
        return "All farms (split)"


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


def farm_area_weights(profile) -> tuple[dict, object]:
    """Farm sizes (stremmata) per farm for one profile."""
    from decimal import Decimal

    from farm.models import Farm

    farms = list(Farm.objects.filter(profile=profile).order_by("title"))
    weights = {farm.pk: Decimal(str(farm.size)) for farm in farms}
    return weights, sum(weights.values(), Decimal("0"))


def farm_tree_type_weights(profile, tree_type) -> tuple[dict, int]:
    """Tree counts of one variety per farm for one profile."""
    from django.db.models import Sum

    from farm.models import Farm, TreePlanting

    tree_type_id = tree_type.pk if hasattr(tree_type, "pk") else tree_type
    farms = list(Farm.objects.filter(profile=profile).order_by("title"))
    totals = dict(
        TreePlanting.objects.filter(profile=profile, farm__profile=profile, tree_type_id=tree_type_id)
        .values("farm_id")
        .annotate(total=Sum("count"))
        .values_list("farm_id", "total")
    )
    weights = {farm.pk: int(totals.get(farm.pk) or 0) for farm in farms}
    return weights, sum(weights.values())


def basis_weights(profile, basis, tree_type=None) -> tuple[dict, object]:
    """Weight map + total for a split basis.

    ``basis`` is one of ``trees``/``tree_type``/``area``/``equal``.
    Returns ``({farm_id: weight}, total)``.
    """
    from decimal import Decimal

    from farm.models import Farm

    if basis == "area":
        return farm_area_weights(profile)
    if basis == "tree_type":
        if tree_type is None:
            raise ValueError("A tree variety is required for this split basis.")
        return farm_tree_type_weights(profile, tree_type)
    if basis == "equal":
        farms = list(Farm.objects.filter(profile=profile).values_list("pk", flat=True))
        weights = {pk: 1 for pk in farms}
        return weights, len(weights)
    return farm_tree_weights(profile)


def _weight_ratio(weights: dict, total, farm_id) -> object:
    """Portion of a weight map attributable to one farm (equal fallback at zero)."""
    from decimal import Decimal

    if not weights or farm_id not in weights:
        return Decimal("0")
    if total and Decimal(str(total)) > 0:
        return Decimal(str(weights.get(farm_id, 0))) / Decimal(str(total))
    active = len(weights)
    if not active:
        return Decimal("0")
    return Decimal("1") / Decimal(str(active))


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
