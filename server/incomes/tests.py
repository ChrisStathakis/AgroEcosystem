from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone

from farm.models import Farm
from .models import Customer, Income, IncomeCategory


class IncomeModelTests(TestCase):
    def test_date_and_customer(self):
        user = get_user_model().objects.create_user("owner", password="pass12345")
        farm = Farm.objects.create(profile=user.profile, title="North", size="2.00")
        category = IncomeCategory.objects.create(profile=user.profile, name="Sales")
        customer = Customer.objects.create(profile=user.profile, name="Buyer")
        income = Income.objects.create(profile=user.profile, farm=farm, category=category, customer=customer, title="Crop", amount="20", document_type="invoice")
        self.assertEqual(income.date, timezone.localdate())
        self.assertTrue(income.include_in_tax)
