from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone

from farm.models import Farm
from .models import Expense, ExpenseCategory, Vendor


class ExpenseModelTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("owner", password="pass12345")
        self.profile = self.user.profile
        self.farm = Farm.objects.create(profile=self.profile, title="North", size="2.00")
        self.category = ExpenseCategory.objects.create(profile=self.profile, name="Seeds")

    def test_date_defaults_and_vendor_are_editable(self):
        vendor = Vendor.objects.create(profile=self.profile, name="Supplier")
        expense = Expense.objects.create(
            profile=self.profile, farm=self.farm, category=self.category,
            vendor=vendor, title="Seed", amount="10.00", document_type="receipt",
        )
        self.assertEqual(expense.date, timezone.localdate())
        self.assertFalse(expense.include_in_tax)

    def test_related_objects_must_share_profile(self):
        other = get_user_model().objects.create_user("other", password="pass12345")
        other_farm = Farm.objects.create(profile=other.profile, title="South", size="1.00")
        expense = Expense(profile=self.profile, farm=other_farm, category=self.category, title="Bad", amount="1", document_type="receipt")
        with self.assertRaises(ValidationError):
            expense.full_clean()
