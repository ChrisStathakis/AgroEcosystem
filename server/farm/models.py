from django.db import models
from django.utils import timezone

from profiles.models import Profile


class Farm(models.Model):
    """A farm whose operational and financial data is tracked by the system."""

    profile = models.ForeignKey(
        Profile,
        on_delete=models.CASCADE,
        related_name="farms",
        editable=False,
        help_text="Profile that owns this farm.",
    )
    title = models.CharField(max_length=150, help_text="Name used to identify the farm.")
    size = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="Farm size in hectares.",
    )
    active = models.BooleanField(default=True, help_text="Whether this farm is currently active.")
    created_at = models.DateTimeField(auto_now_add=True, help_text="When the farm was created.")
    updated_at = models.DateTimeField(auto_now=True, help_text="When the farm was last changed.")

    class Meta:
        ordering = ["title"]
        constraints = [
            models.UniqueConstraint(fields=["profile", "title"], name="unique_farm_title_per_profile"),
        ]

    def __str__(self) -> str:
        return self.title


class TreeType(models.Model):
    """A reusable tree type owned by a profile (e.g. Olive, Orange)."""

    profile = models.ForeignKey(
        Profile,
        on_delete=models.CASCADE,
        related_name="tree_types",
        editable=False,
        help_text="Profile that owns this tree type.",
    )
    name = models.CharField(max_length=100, help_text="Name used to group trees.")
    created_at = models.DateTimeField(auto_now_add=True, help_text="When the tree type was created.")

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["profile", "name"], name="unique_tree_type_per_profile"),
        ]

    def __str__(self) -> str:
        return self.name


class TreePlanting(models.Model):
    """How many trees of one type a farm has."""

    profile = models.ForeignKey(
        Profile,
        on_delete=models.CASCADE,
        related_name="tree_plantings",
        editable=False,
        help_text="Profile that owns this record.",
    )
    farm = models.ForeignKey(
        Farm,
        on_delete=models.PROTECT,
        related_name="tree_plantings",
        help_text="Farm these trees belong to.",
    )
    tree_type = models.ForeignKey(
        TreeType,
        on_delete=models.PROTECT,
        related_name="plantings",
        help_text="Type of tree.",
    )
    count = models.PositiveIntegerField(help_text="Number of trees of this type on the farm.")
    planted_on = models.DateField(blank=True, null=True, help_text="Optional planting date.")
    notes = models.TextField(blank=True, help_text="Optional notes about these trees.")
    created_at = models.DateTimeField(auto_now_add=True, help_text="When the record was created.")
    updated_at = models.DateTimeField(auto_now=True, help_text="When the record was last changed.")

    class Meta:
        ordering = ["farm__title", "tree_type__name"]
        constraints = [
            models.UniqueConstraint(fields=["farm", "tree_type"], name="unique_tree_type_per_farm"),
        ]

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.farm_id and self.profile_id and self.farm.profile_id != self.profile_id:
            raise ValidationError({"farm": "Farm must belong to the same profile."})
        if self.tree_type_id and self.profile_id and self.tree_type.profile_id != self.profile_id:
            raise ValidationError({"tree_type": "Tree type must belong to the same profile."})

    def __str__(self) -> str:
        return f"{self.farm} — {self.tree_type} ({self.count})"


class TaskCategory(models.Model):
    """A reusable task category owned by a profile (e.g. Potisma, Lipasma)."""

    profile = models.ForeignKey(
        Profile,
        on_delete=models.CASCADE,
        related_name="task_categories",
        editable=False,
        help_text="Profile that owns this task category.",
    )
    name = models.CharField(max_length=100, help_text="Name used to group tasks.")
    created_at = models.DateTimeField(auto_now_add=True, help_text="When the task category was created.")

    class Meta:
        verbose_name_plural = "task categories"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["profile", "name"], name="unique_task_category_per_profile"),
        ]

    def __str__(self) -> str:
        return self.name


class FarmTask(models.Model):
    """History of work done on a farm, optionally on one tree group."""

    profile = models.ForeignKey(
        Profile,
        on_delete=models.CASCADE,
        related_name="farm_tasks",
        editable=False,
        help_text="Profile that owns this task.",
    )
    farm = models.ForeignKey(
        Farm,
        on_delete=models.PROTECT,
        related_name="tasks",
        help_text="Farm this task belongs to.",
    )
    planting = models.ForeignKey(
        TreePlanting,
        on_delete=models.SET_NULL,
        related_name="tasks",
        blank=True,
        null=True,
        help_text="Optional tree group this task targets.",
    )
    category = models.ForeignKey(
        TaskCategory,
        on_delete=models.PROTECT,
        related_name="tasks",
        help_text="Task category.",
    )
    expense = models.ForeignKey(
        "expenses.Expense",
        on_delete=models.SET_NULL,
        related_name="linked_tasks",
        blank=True,
        null=True,
        help_text="Optional expense linked to this task.",
    )
    title = models.CharField(max_length=150, help_text="Short description of the task.")
    description = models.TextField(blank=True, help_text="Additional details about the task.")
    date = models.DateField(default=timezone.localdate, help_text="Date on which the task occurred.")
    created_at = models.DateTimeField(auto_now_add=True, help_text="When the task was created.")
    updated_at = models.DateTimeField(auto_now=True, help_text="When the task was last changed.")

    class Meta:
        ordering = ["-date", "-id"]

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.farm_id and self.profile_id and self.farm.profile_id != self.profile_id:
            raise ValidationError({"farm": "Farm must belong to the same profile."})
        if self.category_id and self.profile_id and self.category.profile_id != self.profile_id:
            raise ValidationError({"category": "Category must belong to the same profile."})
        if self.planting_id:
            if self.planting.profile_id != self.profile_id:
                raise ValidationError({"planting": "Tree group must belong to the same profile."})
            if self.farm_id and self.planting.farm_id != self.farm_id:
                raise ValidationError({"planting": "Tree group must belong to the selected farm."})
        if self.expense_id:
            if self.expense.profile_id != self.profile_id:
                raise ValidationError({"expense": "Expense must belong to the same profile."})
            if self.farm_id and self.expense.farm_id != self.farm_id:
                raise ValidationError({"expense": "Expense must belong to the selected farm."})

    def __str__(self) -> str:
        return f"{self.title} ({self.date})"
