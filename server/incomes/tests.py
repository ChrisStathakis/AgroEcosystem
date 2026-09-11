from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db.models import Sum
from django.utils import timezone

from farm.models import Farm
from .models import Customer, Income, IncomeCategory, IncomeFarmAllocation


class IncomeModelTests(TestCase):
    def test_date_and_customer(self):
        user = get_user_model().objects.create_user("owner", password="pass12345")
        farm = Farm.objects.create(profile=user.profile, title="North", size="2.00")
        category = IncomeCategory.objects.create(profile=user.profile, name="Sales")
        customer = Customer.objects.create(profile=user.profile, name="Buyer")
        income = Income.objects.create(profile=user.profile, category=category, customer=customer, title="Crop", amount="20", document_type="invoice")
        allocation = IncomeFarmAllocation.objects.create(profile=user.profile, income=income, farm=farm, amount="20")
        self.assertEqual(income.date, timezone.localdate())
        self.assertTrue(income.include_in_tax)
        self.assertEqual(income.farms.get(), farm)
        self.assertEqual(allocation.amount, 20)

    def test_income_can_be_fully_unallocated(self):
        user = get_user_model().objects.create_user("owner", password="pass12345")
        category = IncomeCategory.objects.create(profile=user.profile, name="Sales")
        income = Income.objects.create(profile=user.profile, category=category, title="Direct sale", amount="20", document_type="receipt")
        self.assertFalse(income.allocations.exists())

    def test_multi_farm_partial_allocations_and_remainder(self):
        user = get_user_model().objects.create_user("owner", password="pass12345")
        north = Farm.objects.create(profile=user.profile, title="North", size="2.00")
        south = Farm.objects.create(profile=user.profile, title="South", size="1.00")
        category = IncomeCategory.objects.create(profile=user.profile, name="Sales")
        income = Income.objects.create(profile=user.profile, category=category, title="Mixed sale", amount="100", document_type="invoice")
        IncomeFarmAllocation.objects.create(profile=user.profile, income=income, farm=north, amount="60")
        IncomeFarmAllocation.objects.create(profile=user.profile, income=income, farm=south, amount="25")
        self.assertEqual(income.allocations.aggregate(total=Sum('amount'))['total'], 85)

    def test_allocation_rejects_duplicate_or_cross_profile_or_over_total(self):
        owner = get_user_model().objects.create_user("owner", password="pass12345")
        other = get_user_model().objects.create_user("other", password="pass12345")
        farm = Farm.objects.create(profile=owner.profile, title="North", size="2.00")
        second_farm = Farm.objects.create(profile=owner.profile, title="South", size="2.00")
        other_farm = Farm.objects.create(profile=other.profile, title="Other", size="2.00")
        category = IncomeCategory.objects.create(profile=owner.profile, name="Sales")
        income = Income.objects.create(profile=owner.profile, category=category, title="Sale", amount="10", document_type="receipt")
        first = IncomeFarmAllocation(profile=owner.profile, income=income, farm=farm, amount="7")
        first.full_clean(); first.save()
        with self.assertRaises(ValidationError):
            IncomeFarmAllocation(profile=owner.profile, income=income, farm=other_farm, amount="1").full_clean()
        with self.assertRaises(ValidationError):
            IncomeFarmAllocation(profile=owner.profile, income=income, farm=farm, amount="1").full_clean()
        with self.assertRaises(ValidationError):
            IncomeFarmAllocation(profile=owner.profile, income=income, farm=second_farm, amount="4").full_clean()
