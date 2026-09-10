from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone

from analytics.services import (
    category_breakdown,
    charts_payload,
    cumulative_balance,
    farm_profit,
    financial_summary,
)
from expenses.models import Expense, ExpenseCategory
from farm.models import Farm
from frontend.backup import build_backup, describe_payload, destroy_workspace, restore_backup
from incomes.models import Income, IncomeCategory


def make_workspace(username="owner"):
    user = get_user_model().objects.create_user(username, password="pass12345")
    profile = user.profile
    farm = Farm.objects.create(profile=profile, title="North", size="2.00")
    expense_category = ExpenseCategory.objects.create(profile=profile, name="Seeds")
    income_category = IncomeCategory.objects.create(profile=profile, name="Sales")
    return user, profile, farm, expense_category, income_category


class FrontendAuthenticationTests(TestCase):
    def test_home_redirects_anonymous_users_to_login(self):
        response = self.client.get("/el/")
        self.assertRedirects(response, "/el/accounts/login/?next=/el/")

    def test_authenticated_user_can_open_home_and_logout(self):
        user = get_user_model().objects.create_user("owner", password="pass12345")
        self.client.force_login(user)
        self.assertEqual(self.client.get("/el/").status_code, 200)
        response = self.client.post("/el/accounts/logout/")
        self.assertRedirects(response, "/el/accounts/login/")


class SignupTests(TestCase):
    def test_signup_page_open_to_anonymous_users(self):
        self.assertEqual(self.client.get("/el/accounts/signup/").status_code, 200)

    def test_signup_creates_user_profile_and_logs_in(self):
        response = self.client.post("/el/accounts/signup/", {
            "username": "newbie", "password1": "StrongPass123", "password2": "StrongPass123",
        })
        self.assertRedirects(response, "/el/")
        user = get_user_model().objects.get(username="newbie")
        self.assertTrue(hasattr(user, "profile"))
        self.assertEqual(self.client.get("/el/").status_code, 200)

    def test_signup_redirects_authenticated_users_home(self):
        user = get_user_model().objects.create_user("owner", password="pass12345")
        self.client.force_login(user)
        self.assertRedirects(self.client.get("/el/accounts/signup/"), "/el/")


class TaxSummaryTests(TestCase):
    def test_financial_summary_separates_tax_flagged_records(self):
        user, profile, farm, expense_category, income_category = make_workspace()
        today = timezone.localdate()
        Income.objects.create(profile=profile, farm=farm, category=income_category,
                              title="Taxed sale", amount="100.00", document_type="invoice",
                              include_in_tax=True, date=today)
        Income.objects.create(profile=profile, farm=farm, category=income_category,
                              title="Untaxed sale", amount="50.00", document_type="receipt",
                              include_in_tax=False, date=today)
        Expense.objects.create(profile=profile, farm=farm, category=expense_category,
                               title="Deductible", amount="30.00", document_type="receipt",
                               include_in_tax=True, date=today)
        Expense.objects.create(profile=profile, farm=farm, category=expense_category,
                               title="Plain", amount="20.00", document_type="receipt",
                               include_in_tax=False, date=today)
        summary = financial_summary(profile)
        self.assertEqual(summary["taxable_income"], Decimal("100.00"))
        self.assertEqual(summary["deductible_expenses"], Decimal("30.00"))
        self.assertEqual(summary["taxable_net"], Decimal("70.00"))

    def test_analytics_page_shows_tax_position(self):
        user, profile, farm, expense_category, income_category = make_workspace()
        self.client.force_login(user)
        response = self.client.get("/el/analytics/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Φορολογική θέση")
        english = self.client.get("/en/analytics/")
        self.assertEqual(english.status_code, 200)
        self.assertContains(english, "Tax position")


class RecordExportTests(TestCase):
    def test_expense_export_requires_login(self):
        response = self.client.get("/el/expenses/export/")
        self.assertEqual(response.status_code, 302)
        self.assertIn("/el/accounts/login/", response["Location"])

    def test_expense_export_returns_filtered_csv(self):
        user, profile, farm, expense_category, income_category = make_workspace()
        today = timezone.localdate()
        Expense.objects.create(profile=profile, farm=farm, category=expense_category,
                               title="Seed purchase", amount="10.00", document_type="receipt", date=today)
        Expense.objects.create(profile=profile, farm=farm, category=expense_category,
                               title="Fuel", amount="20.00", document_type="invoice", date=today)
        self.client.force_login(user)
        response = self.client.get("/el/expenses/export/")
        self.assertEqual(response["Content-Type"], "text/csv")
        content = response.content.decode()
        self.assertIn("title,date,farm,category,vendor", content)
        self.assertIn("Seed purchase", content)
        filtered = self.client.get("/el/expenses/export/?q=Seed")
        body = filtered.content.decode()
        self.assertIn("Seed purchase", body)
        self.assertNotIn("Fuel", body)

    def test_export_excludes_other_profiles_and_rejects_contacts(self):
        user, profile, farm, expense_category, income_category = make_workspace()
        other, other_profile, other_farm, other_expense_category, _ = make_workspace("other")
        Expense.objects.create(profile=other_profile, farm=other_farm, category=other_expense_category,
                               title="Other secret", amount="99.00", document_type="receipt")
        self.client.force_login(user)
        body = self.client.get("/el/expenses/export/").content.decode()
        self.assertNotIn("Other secret", body)
        self.assertEqual(self.client.get("/el/farms/export/").status_code, 404)


class GreekLocalizationTests(TestCase):
    def test_greek_templates_render_by_default(self):
        user = get_user_model().objects.create_user("owner", password="pass12345")
        self.client.force_login(user)
        response = self.client.get("/el/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Καλώς ήρθατε πίσω")
        self.assertContains(response, "Έξοδα")

    def test_english_templates_still_available(self):
        user = get_user_model().objects.create_user("owner", password="pass12345")
        self.client.force_login(user)
        response = self.client.get("/en/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Welcome back")


def make_full_workspace(username="owner"):
    """Workspace with one farm, one category of each kind and one transaction."""
    user, profile, farm, expense_category, income_category = make_workspace(username)
    today = timezone.localdate()
    Expense.objects.create(profile=profile, farm=farm, category=expense_category,
                           title="Seeds", amount="10.00", document_type="receipt", date=today)
    Income.objects.create(profile=profile, farm=farm, category=income_category,
                          title="Harvest", amount="40.00", document_type="invoice", date=today)
    return user, profile, farm


class AnalyticsServicesTests(TestCase):
    def test_category_breakdown_groups_by_category(self):
        user, profile, farm, expense_category, income_category = make_workspace()
        today = timezone.localdate()
        Expense.objects.create(profile=profile, farm=farm, category=expense_category,
                               title="A", amount="10.00", document_type="receipt", date=today)
        Expense.objects.create(profile=profile, farm=farm, category=expense_category,
                               title="B", amount="30.00", document_type="receipt", date=today)
        breakdown = category_breakdown(profile, today.year)
        self.assertEqual(len(breakdown["expenses"]), 1)
        self.assertEqual(breakdown["expenses"][0], {"label": "Seeds", "total": Decimal("40.00")})

    def test_farm_profit_orders_by_net(self):
        user, profile, farm, expense_category, income_category = make_workspace()
        other_farm = Farm.objects.create(profile=profile, title="South", size="1.00")
        today = timezone.localdate()
        Expense.objects.create(profile=profile, farm=farm, category=expense_category,
                               title="Cost", amount="10.00", document_type="receipt", date=today)
        Income.objects.create(profile=profile, farm=other_farm, category=income_category,
                              title="Sale", amount="50.00", document_type="invoice", date=today)
        result = farm_profit(profile, today.year)
        self.assertEqual([row["farm"] for row in result["farms"]], ["South", "North"])
        self.assertEqual(result["farms"][0]["net"], Decimal("50.00"))

    def test_cumulative_balance_has_twelve_running_points(self):
        user, profile, farm = make_full_workspace()
        result = cumulative_balance(profile, timezone.localdate().year)
        self.assertEqual(len(result["cumulative"]), 12)
        self.assertEqual(result["cumulative"][-1], Decimal("30.00"))

    def test_charts_payload_is_json_safe(self):
        import json

        user, profile, farm = make_full_workspace()
        payload = charts_payload(profile)
        decoded = json.loads(json.dumps(payload))
        self.assertIn("expenseCategories", decoded)
        self.assertIn("farmProfit", decoded)
        self.assertIn("cumulative", decoded)

    def test_analytics_page_contains_new_charts(self):
        user, profile, farm = make_full_workspace()
        self.client.force_login(user)
        greek = self.client.get("/el/analytics/")
        self.assertContains(greek, "chart-expense-cats")
        self.assertContains(greek, "Κέρδος ανά φάρμα")
        english = self.client.get("/en/analytics/")
        self.assertContains(english, "Profit per farm")


class WorkspaceBackupTests(TestCase):
    def test_backup_download_contains_only_own_data(self):
        import json

        user, profile, farm = make_full_workspace("owner")
        make_full_workspace("other")
        self.client.force_login(user)
        response = self.client.get("/el/workspace/backup/")
        self.assertEqual(response["Content-Type"], "application/json")
        payload = json.loads(response.content.decode())
        self.assertEqual(payload["version"], 1)
        self.assertEqual(len(payload["farms"]), 1)
        self.assertEqual(payload["farms"][0]["title"], "North")
        self.assertEqual(len(payload["expenses"]), 1)

    def test_restore_round_trip_replace(self):
        user, profile, farm = make_full_workspace()
        payload = build_backup(profile)
        destroy_workspace(profile)
        self.assertEqual(Expense.objects.filter(profile=profile).count(), 0)
        counts = restore_backup(profile, payload, mode="replace")
        self.assertEqual(Expense.objects.filter(profile=profile).count(), 1)
        self.assertEqual(Income.objects.filter(profile=profile).count(), 1)
        self.assertEqual(counts["farms"], 1)

    def test_restore_merge_skips_existing(self):
        user, profile, farm = make_full_workspace()
        payload = build_backup(profile)
        counts = restore_backup(profile, payload, mode="merge")
        self.assertEqual(Expense.objects.filter(profile=profile).count(), 1)
        self.assertEqual(Farm.objects.filter(profile=profile).count(), 1)

    def test_restore_rejects_bad_version_atomically(self):
        from frontend.backup import BackupError

        user, profile, farm = make_full_workspace()
        with self.assertRaises(BackupError):
            restore_backup(profile, {"version": 999}, mode="replace")
        self.assertEqual(Expense.objects.filter(profile=profile).count(), 1)

    def test_destroy_requires_exact_username_and_keeps_others(self):
        owner, owner_profile, farm = make_full_workspace("owner")
        other, other_profile, other_farm = make_full_workspace("other")
        self.client.force_login(owner)
        # GET never deletes.
        self.assertEqual(self.client.get("/el/workspace/destroy/").status_code, 200)
        self.assertEqual(Expense.objects.filter(profile=owner_profile).count(), 1)
        # Wrong confirmation does nothing.
        self.client.post("/el/workspace/destroy/", {"confirmation": "nope"})
        self.assertEqual(Expense.objects.filter(profile=owner_profile).count(), 1)
        # Correct confirmation wipes only the owner's workspace.
        response = self.client.post("/el/workspace/destroy/", {"confirmation": "owner"})
        self.assertRedirects(response, "/el/")
        self.assertEqual(Expense.objects.filter(profile=owner_profile).count(), 0)
        self.assertEqual(Farm.objects.filter(profile=owner_profile).count(), 0)
        self.assertEqual(Expense.objects.filter(profile=other_profile).count(), 1)
        # Account itself survives.
        self.assertTrue(get_user_model().objects.filter(username="owner").exists())

    def test_restore_view_two_step_flow(self):
        import json

        user, profile, farm = make_full_workspace()
        payload = build_backup(profile)
        destroy_workspace(profile)
        self.client.force_login(user)
        upload = SimpleUploadedFile("agro-backup.json", json.dumps(payload).encode(),
                                    content_type="application/json")
        preview = self.client.post("/el/workspace/restore/", {"backup_file": upload, "mode": "replace"})
        self.assertEqual(preview.status_code, 200)
        self.assertContains(preview, "Επιβεβαίωση επαναφοράς")
        done = self.client.post("/el/workspace/restore/", {"confirm": "1", "mode": "replace"})
        self.assertRedirects(done, "/el/")
        self.assertEqual(Expense.objects.filter(profile=profile).count(), 1)

    def test_restore_view_rejects_invalid_file(self):
        self.client.force_login(make_full_workspace()[0])
        upload = SimpleUploadedFile("agro-backup.json", b"not json at all",
                                    content_type="application/json")
        response = self.client.post("/el/workspace/restore/", {"backup_file": upload, "mode": "replace"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Expense.objects.count(), 1)

    def test_profile_page_links_backup(self):
        user, profile, farm = make_full_workspace()
        self.client.force_login(user)
        self.assertContains(self.client.get("/el/profile/"), "workspace/backup")
        english = self.client.get("/en/profile/")
        self.assertContains(english, "workspace/backup")
