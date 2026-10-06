from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from expenses.models import ExpenseCategory
from farm.models import Farm, TreeType
from incomes.models import Income, IncomeCategory
from production.models import Production, ProductionIncomeLink


def make_workspace(username="producer"):
    user = get_user_model().objects.create_user(username, password="pass12345")
    profile = user.profile
    farm = Farm.objects.create(profile=profile, title="North", size="2.00")
    tree_type = TreeType.objects.create(profile=profile, name="Olive")
    income_category = IncomeCategory.objects.create(profile=profile, name="Sales")
    income = Income.objects.create(
        profile=profile, category=income_category, title="Sale",
        amount="100.00", document_type="invoice", date=timezone.localdate(),
    )
    return user, profile, farm, tree_type, income


class ProductionModelTests(TestCase):
    def test_create_with_many_incomes(self):
        _, profile, farm, tree_type, income = make_workspace()
        production = Production.objects.create(
            profile=profile, farm=farm, tree_type=tree_type,
            year=2026, quantity="1500.00", unit="kg",
        )
        ProductionIncomeLink.objects.create(profile=profile, production=production, income=income)
        self.assertEqual(production.incomes.count(), 1)
        # Deleting the income removes only the link.
        income.delete()
        self.assertEqual(Production.objects.filter(profile=profile).count(), 1)
        self.assertEqual(ProductionIncomeLink.objects.count(), 0)

    def test_unique_per_farm_year_type(self):
        from django.db import IntegrityError

        _, profile, farm, tree_type, _ = make_workspace()
        Production.objects.create(
            profile=profile, farm=farm, tree_type=tree_type,
            year=2026, quantity="10.00", unit="kg",
        )
        with self.assertRaises(IntegrityError):
            Production.objects.create(
                profile=profile, farm=farm, tree_type=tree_type,
                year=2026, quantity="20.00", unit="kg",
            )

    def test_cross_profile_rejected(self):
        from django.core.exceptions import ValidationError

        _, profile, farm, tree_type, _ = make_workspace("a")
        other_user = get_user_model().objects.create_user("b", password="pass12345")
        production = Production(
            profile=other_user.profile, farm=farm, tree_type=tree_type,
            year=2026, quantity="10.00", unit="kg",
        )
        with self.assertRaises(ValidationError):
            production.full_clean()

    def test_crud_views_require_login_and_round_trip(self):
        user, profile, farm, tree_type, income = make_workspace()
        self.client.force_login(user)
        response = self.client.post("/el/productions/new/", {
            "farm": str(farm.pk),
            "tree_type": str(tree_type.pk),
            "year": "2026",
            "quantity": "500.00",
            "unit": "kg",
            "notes": "Good year",
            "incomes": [str(income.pk)],
        })
        self.assertRedirects(response, "/el/productions/")
        production = Production.objects.get(profile=profile, year=2026)
        self.assertEqual(production.incomes.count(), 1)
        listing = self.client.get("/el/productions/")
        self.assertContains(listing, "500.00")
        filtered = self.client.get(f"/el/productions/?year=2026&farm={farm.pk}")
        self.assertContains(filtered, "500.00")
        export = self.client.get("/el/productions/export/")
        self.assertEqual(export["Content-Type"], "text/csv")
        self.assertIn("500.00", export.content.decode())
