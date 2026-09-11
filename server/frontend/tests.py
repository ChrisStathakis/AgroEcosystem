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
from expenses.models import Expense, ExpenseCategory, Vendor
from farm.models import Farm, TreeInventoryMovement, TreePlanting, TreeType
from farm.services import record_tree_movement
from frontend.backup import build_backup, describe_payload, destroy_workspace, restore_backup
from incomes.models import Income, IncomeCategory, IncomeFarmAllocation


def make_income(profile, category, amount, title, farm=None, **kwargs):
    income = Income.objects.create(profile=profile, category=category, title=title, amount=amount,
                                   document_type=kwargs.pop("document_type", "invoice"), **kwargs)
    if farm is not None:
        IncomeFarmAllocation.objects.create(profile=profile, income=income, farm=farm, amount=amount)
    return income


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
        make_income(profile, income_category, "100.00", "Taxed sale", farm=farm,
                    include_in_tax=True, date=today)
        make_income(profile, income_category, "50.00", "Untaxed sale", farm=farm,
                    document_type="receipt", include_in_tax=False, date=today)
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

    def test_income_export_and_farm_filter_use_allocation_summary(self):
        user, profile, north, expense_category, income_category = make_workspace()
        south = Farm.objects.create(profile=profile, title="South", size="1.00")
        make_income(profile, income_category, "100.00", "Shared sale", include_in_tax=True,
                    date=timezone.localdate())
        income = Income.objects.get(profile=profile, title="Shared sale")
        IncomeFarmAllocation.objects.create(profile=profile, income=income, farm=north, amount="60.00")
        IncomeFarmAllocation.objects.create(profile=profile, income=income, farm=south, amount="20.00")
        self.client.force_login(user)
        listing = self.client.get("/el/incomes/")
        self.assertContains(listing, "North (60.00), South (20.00), Unallocated (20.00)")
        filtered = self.client.get(f"/el/incomes/?farm={south.pk}")
        self.assertContains(filtered, "Shared sale")
        export = self.client.get(f"/el/incomes/export/?farm={south.pk}")
        body = export.content.decode()
        self.assertIn("farms,unallocated", body)
        self.assertIn("20.00", body)


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
    make_income(profile, income_category, "40.00", "Harvest", farm=farm,
                date=today)
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
        make_income(profile, income_category, "50.00", "Sale", farm=other_farm,
                    date=today)
        result = farm_profit(profile, today.year)
        self.assertEqual([row["farm"] for row in result["farms"]], ["South", "North"])
        self.assertEqual(result["farms"][0]["net"], Decimal("50.00"))

    def test_farm_profit_reconciles_partial_income_as_unallocated(self):
        user, profile, north, expense_category, income_category = make_workspace()
        today = timezone.localdate()
        make_income(profile, income_category, "100.00", "Partial", farm=north, date=today)
        income = Income.objects.get(profile=profile, title="Partial")
        IncomeFarmAllocation.objects.filter(income=income).update(amount="40.00")
        result = farm_profit(profile, today.year)
        by_name = {row["farm"]: row for row in result["farms"]}
        self.assertEqual(by_name["North"]["income"], Decimal("40.00"))
        self.assertEqual(by_name["Unallocated"]["income"], Decimal("60.00"))

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
        self.assertEqual(payload["version"], 3)
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

    def test_legacy_income_backup_restores_full_farm_allocation(self):
        user, profile, farm = make_full_workspace()
        payload = build_backup(profile)
        income = payload["incomes"][0]
        income["farm"] = income["allocations"][0]["farm"]
        income.pop("allocations")
        payload["version"] = 2
        destroy_workspace(profile)
        restore_backup(profile, payload, mode="replace")
        restored = Income.objects.get(profile=profile)
        self.assertEqual(restored.allocations.get().farm.title, "North")
        self.assertEqual(restored.allocations.get().amount, restored.amount)

    def test_restore_merge_skips_existing(self):
        user, profile, farm = make_full_workspace()
        payload = build_backup(profile)
        counts = restore_backup(profile, payload, mode="merge")
        self.assertEqual(Expense.objects.filter(profile=profile).count(), 1)
        self.assertEqual(Farm.objects.filter(profile=profile).count(), 1)

    def test_legacy_v1_restore_creates_opening_tree_movement(self):
        user, profile, farm = make_full_workspace()
        tree_type = TreeType.objects.create(profile=profile, name="Olive")
        record_tree_movement(profile=profile, farm=farm, tree_type=tree_type, action="add", quantity=12)
        payload = build_backup(profile)
        payload["version"] = 1
        payload.pop("tree_movements")
        destroy_workspace(profile)
        restore_backup(profile, payload, mode="replace")
        planting = TreePlanting.objects.get(profile=profile)
        self.assertEqual(planting.count, 12)
        self.assertEqual(TreeInventoryMovement.objects.filter(profile=profile).count(), 1)

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


class AnalyticsFilterReportTests(TestCase):
    def setUp(self):
        import datetime

        self.user, self.profile, self.north, self.expense_category, self.income_category = make_workspace()
        self.south = Farm.objects.create(profile=self.profile, title="South", size="1.00")
        self.other_category = ExpenseCategory.objects.create(profile=self.profile, name="Fuel")
        self.vendor = Vendor.objects.create(profile=self.profile, name="AgroShop")
        year = timezone.localdate().year
        self.year = year
        Expense.objects.create(profile=self.profile, farm=self.north, category=self.expense_category,
                               title="Seeds north", amount="10.00", document_type="receipt",
                               include_in_tax=True, date=datetime.date(year, 3, 5))
        Expense.objects.create(profile=self.profile, farm=self.south, category=self.other_category,
                               title="Fuel south", amount="20.00", document_type="invoice",
                               vendor=self.vendor, include_in_tax=False, date=datetime.date(year, 4, 5))
        make_income(self.profile, self.income_category, Decimal("100.00"), "Harvest",
                    farm=self.north, include_in_tax=True, date=datetime.date(year, 3, 10))
        self.client.force_login(self.user)

    def test_overview_filter_by_farm(self):
        response = self.client.get(f"/en/analytics/?farm={self.south.pk}")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Profit &amp; loss")
        summary = response.context["summary"]
        self.assertEqual(summary["expense_total"], Decimal("20.00"))
        # Income follows allocations: south has none allocated.
        self.assertEqual(summary["income_total"], Decimal("0"))

    def test_overview_filter_by_tax_flag(self):
        response = self.client.get("/en/analytics/?tax=taxed")
        summary = response.context["summary"]
        self.assertEqual(summary["expense_total"], Decimal("10.00"))
        self.assertEqual(summary["income_total"], Decimal("100.00"))

    def test_overview_filter_by_document_type(self):
        response = self.client.get("/en/analytics/?document_type=invoice")
        summary = response.context["summary"]
        self.assertEqual(summary["expense_total"], Decimal("20.00"))

    def test_overview_custom_date_range(self):
        response = self.client.get(f"/en/analytics/?start={self.year}-04-01&end={self.year}-04-30")
        summary = response.context["summary"]
        self.assertEqual(summary["expense_total"], Decimal("20.00"))
        self.assertEqual(summary["income_total"], Decimal("0"))

    def test_invalid_filter_yields_empty_result(self):
        other, _, _, _, _ = make_workspace("stranger")
        other_farm = Farm.objects.filter(profile=other.profile).get()
        response = self.client.get(f"/en/analytics/?farm={other_farm.pk}")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Apply filters")
        summary = response.context["summary"]
        self.assertEqual(summary["expense_total"], Decimal("0"))
        self.assertEqual(summary["income_total"], Decimal("0"))

    def test_report_pages_render_both_languages(self):
        for path, heading in [("/en/analytics/profit-loss/", "Profit"),
                              ("/en/analytics/cash-flow/", "Cash flow"),
                              ("/en/analytics/tax/", "Tax report")]:
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200, path)
            self.assertContains(response, heading)
        self.assertContains(self.client.get("/el/analytics/profit-loss/"), "Κέρδη")
        self.assertContains(self.client.get("/el/analytics/cash-flow/"), "Ταμειακή ροή")
        self.assertContains(self.client.get("/el/analytics/tax/"), "Φορολογική αναφορά")

    def test_report_pages_honor_filters(self):
        response = self.client.get(f"/en/analytics/profit-loss/?farm={self.north.pk}")
        report = response.context["report"]
        self.assertEqual(report["expense_total"], Decimal("10.00"))
        self.assertEqual(report["income_total"], Decimal("100.00"))
        tax = self.client.get("/en/analytics/tax/")
        self.assertContains(tax, "Taxable income")
        self.assertEqual(tax.context["report"]["income_total"], Decimal("100.00"))
        self.assertEqual(tax.context["report"]["expense_total"], Decimal("10.00"))

    def test_exports_respect_filters_and_profile(self):
        body = self.client.get(f"/en/analytics/export/pl/?farm={self.south.pk}").content.decode()
        self.assertIn("South", body)
        self.assertIn("Fuel", body)
        self.assertNotIn("Seeds", body)
        self.assertNotIn("Harvest", body)
        cash = self.client.get("/en/analytics/export/cf/")
        self.assertEqual(cash["Content-Type"], "text/csv")
        self.assertIn("running", cash.content.decode())
        tax = self.client.get("/en/analytics/export/tax/")
        content = tax.content.decode()
        self.assertIn("Harvest", content)
        self.assertNotIn("Fuel south", content)  # untaxed expense excluded
        self.assertEqual(self.client.get("/en/analytics/export/nope/").status_code, 404)

    def test_print_mode_renders(self):
        response = self.client.get("/en/analytics/cash-flow/?print=1")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.context["print_mode"])


class QuickCreateTests(TestCase):
    def test_login_required(self):
        response = self.client.get("/el/farms/quick-add/")
        self.assertEqual(response.status_code, 302)
        self.assertIn("/el/accounts/login/", response["Location"])

    def test_get_returns_form_html_and_title(self):
        user = get_user_model().objects.create_user("owner", password="pass12345")
        self.client.force_login(user)
        response = self.client.get("/el/task-categories/quick-add/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("html", payload)
        self.assertIn("name", payload["html"])
        english = self.client.get("/en/farms/quick-add/")
        self.assertIn("Add", english.json()["title"])

    def test_post_creates_farm_and_category(self):
        user = get_user_model().objects.create_user("owner", password="pass12345")
        self.client.force_login(user)
        farm_resp = self.client.post("/el/farms/quick-add/", {"title": "Hill", "size": "3.50", "active": "on"})
        self.assertEqual(farm_resp.status_code, 201)
        farm_data = farm_resp.json()
        self.assertEqual(farm_data["label"], "Hill")
        self.assertTrue(Farm.objects.filter(pk=farm_data["id"], profile=user.profile).exists())
        cat_resp = self.client.post("/el/task-categories/quick-add/", {"name": "Watering"})
        self.assertEqual(cat_resp.status_code, 201)
        self.assertEqual(cat_resp.json()["label"], "Watering")

    def test_post_invalid_returns_errors_without_creating(self):
        user = get_user_model().objects.create_user("owner", password="pass12345")
        self.client.force_login(user)
        bad = self.client.post("/el/task-categories/quick-add/", {"name": ""})
        self.assertEqual(bad.status_code, 400)
        self.assertIn("html", bad.json())
        from farm.models import TaskCategory
        self.assertEqual(TaskCategory.objects.filter(profile=user.profile).count(), 0)

    def test_post_duplicate_name_returns_400(self):
        user, profile, farm, expense_category, income_category = make_workspace()
        self.client.force_login(user)
        from farm.models import TaskCategory
        TaskCategory.objects.create(profile=profile, name="Watering")
        dup = self.client.post("/el/task-categories/quick-add/", {"name": "Watering"})
        self.assertEqual(dup.status_code, 400)

    def test_unknown_resource_404(self):
        user = get_user_model().objects.create_user("owner", password="pass12345")
        self.client.force_login(user)
        self.assertEqual(self.client.get("/el/tasks/quick-add/").status_code, 404)

    def test_task_form_embeds_quick_add_modal(self):
        user = get_user_model().objects.create_user("owner", password="pass12345")
        self.client.force_login(user)
        for path in ("/el/tasks/new/", "/en/tasks/new/", "/el/expenses/new/"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200, path)
            self.assertContains(response, "quickAddModal")
            self.assertContains(response, "quick-add")

    def test_prerequisites_links_open_popup_not_new_page(self):
        user = get_user_model().objects.create_user("owner", password="pass12345")
        self.client.force_login(user)
        # Empty workspace: prerequisites warning must be present on tasks/new/.
        response = self.client.get("/el/tasks/new/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "data-prerequisites-warning")
        self.assertContains(response, 'data-quick-add="farms"')
        self.assertContains(response, 'data-quick-add="task-categories"')
        self.assertContains(response, 'data-quick-target="id_farm"')
        self.assertContains(response, 'data-quick-target="id_category"')
        english = self.client.get("/en/tasks/new/")
        self.assertContains(english, 'data-quick-add="farms"')
        self.assertContains(english, 'data-quick-add="task-categories"')


class ArchivedTransactionTests(TestCase):
    def _workspace_with_task_setup(self, username="owner"):
        from farm.models import TaskCategory
        user, profile, farm, expense_category, income_category = make_workspace(username)
        task_category = TaskCategory.objects.create(profile=profile, name="Watering")
        return user, profile, farm, expense_category, income_category, task_category

    def _expense_data(self, farm, category, title="Seeds"):
        return {"title": title, "date": timezone.localdate().isoformat(), "amount": "10.00",
                "farm": str(farm.pk), "category": str(category.pk),
                "document_type": "receipt"}

    def test_expense_form_saves_archived_flag(self):
        user, profile, farm, expense_category, _, _ = self._workspace_with_task_setup()
        self.client.force_login(user)
        response = self.client.post("/el/expenses/new/",
                                    {**self._expense_data(farm, expense_category), "is_archived": "on"})
        self.assertRedirects(response, "/el/expenses/")
        expense = Expense.objects.get(profile=profile, title="Seeds")
        self.assertTrue(expense.is_archived)

    def test_income_form_saves_archived_flag(self):
        user, profile, _, _, income_category, _ = self._workspace_with_task_setup()
        self.client.force_login(user)
        prefix = self.client.get("/el/incomes/new/").context["allocation_formset"].prefix
        response = self.client.post("/el/incomes/new/",
                                    {"title": "Sale", "date": timezone.localdate().isoformat(),
                                     "amount": "40.00", "category": str(income_category.pk),
                                     "document_type": "invoice", "is_archived": "on",
                                     f"{prefix}-TOTAL_FORMS": "3", f"{prefix}-INITIAL_FORMS": "0",
                                     f"{prefix}-MIN_NUM_FORMS": "0", f"{prefix}-MAX_NUM_FORMS": "1000"})
        self.assertRedirects(response, "/el/incomes/")
        self.assertTrue(Income.objects.get(profile=profile, title="Sale").is_archived)

    def test_forms_show_greek_archived_label(self):
        user, _, _, _, _, _ = self._workspace_with_task_setup()
        self.client.force_login(user)
        self.assertContains(self.client.get("/el/expenses/new/"), "Αρχειοθετημένο")
        self.assertContains(self.client.get("/el/incomes/new/"), "Αρχειοθετημένο")

    def test_archived_expense_hidden_from_task_dropdown_but_kept_in_list_and_reports(self):
        user, profile, farm, expense_category, _, task_category = self._workspace_with_task_setup()
        today = timezone.localdate()
        visible = Expense.objects.create(profile=profile, farm=farm, category=expense_category,
                                         title="Visible", amount="10.00",
                                         document_type="receipt", date=today)
        hidden = Expense.objects.create(profile=profile, farm=farm, category=expense_category,
                                        title="Hidden", amount="20.00", document_type="receipt",
                                        date=today, is_archived=True)
        self.client.force_login(user)
        form = self.client.get("/el/tasks/new/").context["form"]
        queryset = form.fields["expense"].queryset
        self.assertIn(visible, queryset)
        self.assertNotIn(hidden, queryset)
        # Still in the record list and still counted in analytics.
        listing = self.client.get("/el/expenses/")
        self.assertContains(listing, "Visible")
        self.assertContains(listing, "Hidden")
        summary = self.client.get("/en/analytics/").context["summary"]
        self.assertEqual(summary["expense_total"], Decimal("30.00"))

    def test_edit_task_keeps_archived_linked_expense_selectable(self):
        from farm.models import FarmTask
        user, profile, farm, expense_category, _, task_category = self._workspace_with_task_setup()
        today = timezone.localdate()
        expense = Expense.objects.create(profile=profile, farm=farm, category=expense_category,
                                         title="Linked", amount="10.00",
                                         document_type="receipt", date=today, is_archived=True)
        task = FarmTask.objects.create(profile=profile, farm=farm, category=task_category,
                                       expense=expense, title="Pruning", date=today)
        self.client.force_login(user)
        form = self.client.get(f"/el/tasks/{task.pk}/edit/").context["form"]
        self.assertIn(expense, form.fields["expense"].queryset)

    def test_backup_round_trip_preserves_archived_flag(self):
        from frontend.backup import build_backup, destroy_workspace, restore_backup
        user, profile, farm, expense_category, income_category, _ = self._workspace_with_task_setup()
        today = timezone.localdate()
        Expense.objects.create(profile=profile, farm=farm, category=expense_category,
                               title="Old cost", amount="10.00", document_type="receipt",
                               date=today, is_archived=True)
        make_income(profile, income_category, "40.00", "Old sale", farm=farm,
                    date=today)
        Income.objects.filter(profile=profile, title="Old sale").update(is_archived=True)
        payload = build_backup(profile)
        self.assertTrue(payload["expenses"][0]["is_archived"])
        self.assertTrue(payload["incomes"][0]["is_archived"])
        destroy_workspace(profile)
        restore_backup(profile, payload, mode="replace")
        self.assertTrue(Expense.objects.get(profile=profile, title="Old cost").is_archived)
        self.assertTrue(Income.objects.get(profile=profile, title="Old sale").is_archived)

    def test_legacy_backup_without_flag_restores_as_not_archived(self):
        from frontend.backup import build_backup, destroy_workspace, restore_backup
        user, profile, farm, expense_category, income_category, _ = self._workspace_with_task_setup()
        Expense.objects.create(profile=profile, farm=farm, category=expense_category,
                               title="Cost", amount="10.00", document_type="receipt",
                               date=timezone.localdate())
        make_income(profile, income_category, "40.00", "Sale", farm=farm,
                    date=timezone.localdate())
        payload = build_backup(profile)
        for section in ("expenses", "incomes"):
            for item in payload[section]:
                item.pop("is_archived")
        destroy_workspace(profile)
        restore_backup(profile, payload, mode="replace")
        self.assertFalse(Expense.objects.get(profile=profile).is_archived)
        self.assertFalse(Income.objects.get(profile=profile).is_archived)
