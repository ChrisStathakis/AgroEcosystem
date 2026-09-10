from django.contrib.auth import get_user_model
from django.test import TestCase

from .models import Profile


class ProfileTests(TestCase):
    def test_profile_is_created_for_new_user(self):
        user = get_user_model().objects.create_user("owner", password="pass12345")
        self.assertIsInstance(user.profile, Profile)
