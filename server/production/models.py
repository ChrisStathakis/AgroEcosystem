from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from farm.models import Farm, TreeType
from profiles.models import Profile


class Production(models.Model):
    """Yearly production per farm and tree type, optionally linked to many incomes."""

    class Unit(models.TextChoices):
        KG = "kg", "Kg"
        TN = "tn", "Tn"
        L = "l", "L"

    profile = models.ForeignKey(
        Profile,
        on_delete=models.CASCADE,
        related_name="productions",
        editable=False,
        help_text="Profile that owns this production.",
    )
    farm = models.ForeignKey(
        Farm,
        on_delete=models.PROTECT,
        related_name="productions",
        help_text="Farm this production belongs to.",
    )
    tree_type = models.ForeignKey(
        TreeType,
        on_delete=models.PROTECT,
        related_name="productions",
        help_text="Tree type harvested.",
    )
    year = models.PositiveIntegerField(
        validators=[MinValueValidator(2000), MaxValueValidator(2100)],
        help_text="Harvest year.",
    )
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Harvested quantity.",
    )
    unit = models.CharField(
        max_length=2,
        choices=Unit.choices,
        default=Unit.KG,
        help_text="Quantity unit.",
    )
    incomes = models.ManyToManyField(
        "incomes.Income",
        through="ProductionIncomeLink",
        related_name="productions",
        blank=True,
    )
    notes = models.TextField(blank=True, help_text="Optional notes about this harvest.")
    created_at = models.DateTimeField(auto_now_add=True, help_text="When the record was created.")
    updated_at = models.DateTimeField(auto_now=True, help_text="When the record was last changed.")

    class Meta:
        ordering = ["-year", "farm__title", "tree_type__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["farm", "year", "tree_type"],
                name="unique_production_per_farm_year_type",
            ),
        ]

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.farm_id and self.profile_id and self.farm.profile_id != self.profile_id:
            raise ValidationError({"farm": "Farm must belong to the same profile."})
        if self.tree_type_id and self.profile_id and self.tree_type.profile_id != self.profile_id:
            raise ValidationError({"tree_type": "Tree type must belong to the same profile."})
        if self.quantity is not None and self.quantity <= 0:
            raise ValidationError({"quantity": "Quantity must be greater than zero."})

    def __str__(self) -> str:
        return f"{self.farm} — {self.tree_type} ({self.year}: {self.quantity} {self.unit})"


class ProductionIncomeLink(models.Model):
    """Optional link between one production and one income (many-to-many)."""

    profile = models.ForeignKey(
        Profile,
        on_delete=models.CASCADE,
        related_name="production_income_links",
        editable=False,
        help_text="Profile that owns this link.",
    )
    production = models.ForeignKey(
        Production,
        on_delete=models.CASCADE,
        related_name="income_links",
    )
    income = models.ForeignKey(
        "incomes.Income",
        on_delete=models.CASCADE,
        related_name="production_links",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["production", "income"],
                name="unique_production_income_link",
            ),
        ]
        ordering = ["production_id", "income_id"]

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.production_id and self.profile_id and self.production.profile_id != self.profile_id:
            raise ValidationError({"production": "Production must belong to the same profile."})
        if self.income_id and self.profile_id and self.income.profile_id != self.profile_id:
            raise ValidationError({"income": "Income must belong to the same profile."})
        if (
            self.production_id
            and self.income_id
            and self.production.profile_id != self.income.profile_id
        ):
            raise ValidationError("Production and income must belong to the same profile.")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.production} ↔ {self.income}"
