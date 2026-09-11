from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from .models import TreeInventoryMovement, TreePlanting, TreeType
from .services import record_tree_movement
from farm.models import Farm


class TreeInventoryMovementTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("tree-owner", password="pass12345")
        self.profile = self.user.profile
        self.farm = Farm.objects.create(profile=self.profile, title="North", size="2.00")
        self.tree_type = TreeType.objects.create(profile=self.profile, name="Olive")

    def test_add_and_remove_keep_ledger_and_current_balance(self):
        add = record_tree_movement(profile=self.profile, farm=self.farm, tree_type=self.tree_type,
                                   action="add", quantity=10, effective_date=timezone.localdate(), notes="Planting")
        remove = record_tree_movement(profile=self.profile, farm=self.farm, tree_type=self.tree_type,
                                      action="remove", quantity=3, effective_date=timezone.localdate(), notes="Loss")
        planting = TreePlanting.objects.get(farm=self.farm, tree_type=self.tree_type)
        self.assertEqual(planting.count, 7)
        self.assertEqual(TreeInventoryMovement.objects.count(), 2)
        with self.assertRaises(ValueError):
            add.quantity = 2
            add.save()
        self.assertEqual(remove.action, "remove")

    def test_removal_cannot_exceed_balance_or_create_unknown_group(self):
        with self.assertRaises(ValidationError):
            record_tree_movement(profile=self.profile, farm=self.farm, tree_type=self.tree_type,
                                 action="remove", quantity=1)
        record_tree_movement(profile=self.profile, farm=self.farm, tree_type=self.tree_type,
                             action="add", quantity=2)
        with self.assertRaises(ValidationError):
            record_tree_movement(profile=self.profile, farm=self.farm, tree_type=self.tree_type,
                                 action="remove", quantity=3)

    def test_zero_balance_is_retained(self):
        record_tree_movement(profile=self.profile, farm=self.farm, tree_type=self.tree_type,
                             action="add", quantity=2)
        record_tree_movement(profile=self.profile, farm=self.farm, tree_type=self.tree_type,
                             action="remove", quantity=2)
        planting = TreePlanting.objects.get(farm=self.farm, tree_type=self.tree_type)
        self.assertEqual(planting.count, 0)
        self.assertEqual(planting.movements.count(), 2)
