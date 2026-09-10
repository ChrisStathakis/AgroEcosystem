"""Workspace-scoped backup, restore and destroy helpers.

Everything here is strictly per-profile: only rows owned by the given
profile are exported or deleted. Other users are never touched.
"""

from django.db import transaction
from django.utils import timezone

from expenses.models import Expense, ExpenseCategory, Vendor
from farm.models import Farm, FarmTask, TaskCategory, TreePlanting, TreeType
from incomes import models as income_models

BACKUP_VERSION = 1
MAX_UPLOAD_BYTES = 5 * 1024 * 1024

COLLECTIONS = (
    "expense_categories", "income_categories", "task_categories", "tree_types",
    "farms", "vendors", "customers", "tree_plantings", "expenses", "incomes",
    "tasks",
)


class BackupError(Exception):
    """A user-facing backup/restore failure with EN + EL messages."""

    def __init__(self, en_message, el_message):
        super().__init__(en_message)
        self.en_message = en_message
        self.el_message = el_message


def workspace_counts(profile) -> dict:
    """Number of rows per collection for the given profile."""
    return {
        "farms": Farm.objects.filter(profile=profile).count(),
        "trees": TreePlanting.objects.filter(profile=profile).count(),
        "tasks": FarmTask.objects.filter(profile=profile).count(),
        "expenses": Expense.objects.filter(profile=profile).count(),
        "incomes": income_models.Income.objects.filter(profile=profile).count(),
        "vendors": Vendor.objects.filter(profile=profile).count(),
        "customers": income_models.Customer.objects.filter(profile=profile).count(),
        "expense_categories": ExpenseCategory.objects.filter(profile=profile).count(),
        "income_categories": income_models.IncomeCategory.objects.filter(profile=profile).count(),
        "tree_types": TreeType.objects.filter(profile=profile).count(),
        "task_categories": TaskCategory.objects.filter(profile=profile).count(),
    }


def build_backup(profile) -> dict:
    """Export every row owned by ``profile`` as a JSON-safe dict."""
    farms = list(Farm.objects.filter(profile=profile).order_by("pk"))
    farm_idx = {farm.pk: i for i, farm in enumerate(farms)}
    expense_categories = list(ExpenseCategory.objects.filter(profile=profile).order_by("pk"))
    expense_category_idx = {c.pk: i for i, c in enumerate(expense_categories)}
    income_categories = list(income_models.IncomeCategory.objects.filter(profile=profile).order_by("pk"))
    income_category_idx = {c.pk: i for i, c in enumerate(income_categories)}
    task_categories = list(TaskCategory.objects.filter(profile=profile).order_by("pk"))
    task_category_idx = {c.pk: i for i, c in enumerate(task_categories)}
    tree_types = list(TreeType.objects.filter(profile=profile).order_by("pk"))
    tree_type_idx = {t.pk: i for i, t in enumerate(tree_types)}
    vendors = list(Vendor.objects.filter(profile=profile).order_by("pk"))
    vendor_idx = {v.pk: i for i, v in enumerate(vendors)}
    customers = list(income_models.Customer.objects.filter(profile=profile).order_by("pk"))
    customer_idx = {c.pk: i for i, c in enumerate(customers)}
    plantings = list(TreePlanting.objects.filter(profile=profile).select_related("farm", "tree_type").order_by("pk"))
    planting_idx = {p.pk: i for i, p in enumerate(plantings)}
    expenses = list(Expense.objects.filter(profile=profile).order_by("pk"))
    expense_idx = {e.pk: i for i, e in enumerate(expenses)}

    return {
        "version": BACKUP_VERSION,
        "exported_at": timezone.now().isoformat(),
        "display_name": profile.display_name,
        "expense_categories": [{"name": c.name} for c in expense_categories],
        "income_categories": [{"name": c.name} for c in income_categories],
        "task_categories": [{"name": c.name} for c in task_categories],
        "tree_types": [{"name": t.name} for t in tree_types],
        "farms": [{"title": f.title, "size": str(f.size), "active": f.active} for f in farms],
        "vendors": [{"name": v.name, "email": v.email, "phone": v.phone,
                     "address": v.address, "notes": v.notes} for v in vendors],
        "customers": [{"name": c.name, "email": c.email, "phone": c.phone,
                       "address": c.address, "notes": c.notes} for c in customers],
        "tree_plantings": [{"farm": farm_idx[p.farm_id], "tree_type": tree_type_idx[p.tree_type_id],
                            "count": p.count,
                            "planted_on": p.planted_on.isoformat() if p.planted_on else None,
                            "notes": p.notes} for p in plantings],
        "expenses": [{"farm": farm_idx[e.farm_id], "category": expense_category_idx[e.category_id],
                      "vendor": vendor_idx[e.vendor_id] if e.vendor_id else None,
                      "title": e.title, "description": e.description, "amount": str(e.amount),
                      "date": e.date.isoformat(), "document_type": e.document_type,
                      "include_in_tax": e.include_in_tax} for e in expenses],
        "incomes": [{"farm": farm_idx[i.farm_id], "category": income_category_idx[i.category_id],
                     "customer": customer_idx[i.customer_id] if i.customer_id else None,
                     "title": i.title, "description": i.description, "amount": str(i.amount),
                     "date": i.date.isoformat(), "document_type": i.document_type,
                     "include_in_tax": i.include_in_tax}
                    for i in income_models.Income.objects.filter(profile=profile).order_by("pk")],
        "tasks": [{"farm": farm_idx[t.farm_id],
                   "planting": planting_idx[t.planting_id] if t.planting_id else None,
                   "category": task_category_idx[t.category_id],
                   "expense": expense_idx[t.expense_id] if t.expense_id else None,
                   "title": t.title, "description": t.description,
                   "date": t.date.isoformat()}
                  for t in FarmTask.objects.filter(profile=profile).order_by("pk")],
    }


def destroy_workspace(profile):
    """Delete every workspace row owned by ``profile`` (user kept)."""
    # Reverse dependency order: tasks reference plantings/expenses, which
    # reference farms/categories — delete leaves first.
    FarmTask.objects.filter(profile=profile).delete()
    Expense.objects.filter(profile=profile).delete()
    income_models.Income.objects.filter(profile=profile).delete()
    TreePlanting.objects.filter(profile=profile).delete()
    Vendor.objects.filter(profile=profile).delete()
    income_models.Customer.objects.filter(profile=profile).delete()
    ExpenseCategory.objects.filter(profile=profile).delete()
    income_models.IncomeCategory.objects.filter(profile=profile).delete()
    TaskCategory.objects.filter(profile=profile).delete()
    TreeType.objects.filter(profile=profile).delete()
    Farm.objects.filter(profile=profile).delete()


def _require_list(payload, key):
    value = payload.get(key, [])
    if not isinstance(value, list):
        raise BackupError(f"Backup section '{key}' must be a list.",
                          f"Η ενότητα '{key}' του αντιγράφου πρέπει να είναι λίστα.")
    return value


def _require_index(items, idx, section, field):
    if not isinstance(idx, int) or idx < 0 or idx >= len(items):
        raise BackupError(f"Backup item '{field}' in '{section}' points to a missing record.",
                          f"Η αναφορά '{field}' στην ενότητα '{section}' δείχνει σε εγγραφή που λείπει.")
    return items[idx]


def describe_payload(payload) -> dict:
    """Validate the shape of a parsed backup and count its records."""
    if not isinstance(payload, dict):
        raise BackupError("This file is not a valid backup.",
                          "Αυτό το αρχείο δεν είναι έγκυρο αντίγραφο ασφαλείας.")
    if payload.get("version") != BACKUP_VERSION:
        raise BackupError("This backup was made by an unsupported app version.",
                          "Αυτό το αντίγραφο έγινε από μη υποστηριζόμενη έκδοση.")
    counts = {}
    for key in COLLECTIONS:
        counts[key] = len(_require_list(payload, key))
    return counts


@transaction.atomic
def restore_backup(profile, payload, mode="replace") -> dict:
    """Import ``payload`` into ``profile``; returns per-collection counts.

    ``mode="replace"`` wipes the workspace first; ``mode="merge"`` keeps
    existing rows and skips records that already exist (matched by natural
    key). Everything runs in one transaction: any failure rolls back.
    """
    if mode not in ("replace", "merge"):
        raise BackupError("Unknown restore mode.", "Άγνωστη λειτουργία επαναφοράς.")
    counts = describe_payload(payload)
    if mode == "replace":
        destroy_workspace(profile)

    expense_categories = [_get_or_create(ExpenseCategory, profile, {"name": item["name"]}, mode)
                          for item in _require_list(payload, "expense_categories")]
    income_categories = [_get_or_create(income_models.IncomeCategory, profile, {"name": item["name"]}, mode)
                         for item in _require_list(payload, "income_categories")]
    task_categories = [_get_or_create(TaskCategory, profile, {"name": item["name"]}, mode)
                       for item in _require_list(payload, "task_categories")]
    tree_types = [_get_or_create(TreeType, profile, {"name": item["name"]}, mode)
                  for item in _require_list(payload, "tree_types")]
    farms = [_get_or_create(Farm, profile,
                            {"title": item["title"], "size": item["size"], "active": item.get("active", True)},
                            mode)
             for item in _require_list(payload, "farms")]
    vendors = [_get_or_create(Vendor, profile,
                              {"name": item["name"], "email": item.get("email", ""),
                               "phone": item.get("phone", ""), "address": item.get("address", ""),
                               "notes": item.get("notes", "")}, mode)
               for item in _require_list(payload, "vendors")]
    customers = [_get_or_create(income_models.Customer, profile,
                                {"name": item["name"], "email": item.get("email", ""),
                                 "phone": item.get("phone", ""), "address": item.get("address", ""),
                                 "notes": item.get("notes", "")}, mode)
                 for item in _require_list(payload, "customers")]

    plantings = []
    for num, item in enumerate(_require_list(payload, "tree_plantings")):
        farm = _require_index(farms, item.get("farm"), "tree_plantings", "farm")
        tree_type = _require_index(tree_types, item.get("tree_type"), "tree_plantings", "tree_type")
        if mode == "merge":
            existing = TreePlanting.objects.filter(profile=profile, farm=farm, tree_type=tree_type).first()
            if existing is not None:
                plantings.append(existing)
                continue
        planting = TreePlanting(profile=profile, farm=farm, tree_type=tree_type,
                                count=item.get("count", 0),
                                planted_on=item.get("planted_on") or None,
                                notes=item.get("notes", ""))
        planting.full_clean()
        planting.save()
        plantings.append(planting)

    expenses = []
    for item in _require_list(payload, "expenses"):
        farm = _require_index(farms, item.get("farm"), "expenses", "farm")
        category = _require_index(expense_categories, item.get("category"), "expenses", "category")
        vendor = None
        if item.get("vendor") is not None:
            vendor = _require_index(vendors, item.get("vendor"), "expenses", "vendor")
        if mode == "merge" and Expense.objects.filter(
                profile=profile, farm=farm, title=item.get("title", ""),
                date=item.get("date"), amount=item.get("amount", 0)).exists():
            expenses.append(Expense.objects.filter(
                profile=profile, farm=farm, title=item.get("title", ""),
                date=item.get("date"), amount=item.get("amount", 0)).first())
            continue
        expense = Expense(profile=profile, farm=farm, category=category, vendor=vendor,
                          title=item.get("title", ""), description=item.get("description", ""),
                          amount=item.get("amount", 0), date=item.get("date"),
                          document_type=_checked_document(item.get("document_type"), "expenses"),
                          include_in_tax=bool(item.get("include_in_tax", False)))
        expense.full_clean()
        expense.save()
        expenses.append(expense)

    incomes = []
    for item in _require_list(payload, "incomes"):
        farm = _require_index(farms, item.get("farm"), "incomes", "farm")
        category = _require_index(income_categories, item.get("category"), "incomes", "category")
        customer = None
        if item.get("customer") is not None:
            customer = _require_index(customers, item.get("customer"), "incomes", "customer")
        if mode == "merge" and income_models.Income.objects.filter(
                profile=profile, farm=farm, title=item.get("title", ""),
                date=item.get("date"), amount=item.get("amount", 0)).exists():
            incomes.append(income_models.Income.objects.filter(
                profile=profile, farm=farm, title=item.get("title", ""),
                date=item.get("date"), amount=item.get("amount", 0)).first())
            continue
        income = income_models.Income(
            profile=profile, farm=farm, category=category, customer=customer,
            title=item.get("title", ""), description=item.get("description", ""),
            amount=item.get("amount", 0), date=item.get("date"),
            document_type=_checked_document(item.get("document_type"), "incomes"),
            include_in_tax=bool(item.get("include_in_tax", True)))
        income.full_clean()
        income.save()
        incomes.append(income)

    created_tasks = 0
    for item in _require_list(payload, "tasks"):
        farm = _require_index(farms, item.get("farm"), "tasks", "farm")
        category = _require_index(task_categories, item.get("category"), "tasks", "category")
        planting = None
        if item.get("planting") is not None:
            planting = _require_index(plantings, item.get("planting"), "tasks", "planting")
        expense = None
        if item.get("expense") is not None:
            expense = _require_index(expenses, item.get("expense"), "tasks", "expense")
        if mode == "merge" and FarmTask.objects.filter(
                profile=profile, farm=farm, title=item.get("title", ""),
                date=item.get("date")).exists():
            continue
        task = FarmTask(profile=profile, farm=farm, planting=planting, category=category,
                        expense=expense, title=item.get("title", ""),
                        description=item.get("description", ""), date=item.get("date"))
        task.full_clean()
        task.save()
        created_tasks += 1

    if payload.get("display_name") and mode == "replace":
        profile.display_name = payload["display_name"]
        profile.save(update_fields=["display_name", "updated_at"])

    counts["tasks"] = created_tasks if mode == "merge" else len(_require_list(payload, "tasks"))
    return counts


def _checked_document(value, section):
    if value not in ("invoice", "receipt"):
        raise BackupError(f"Backup item in '{section}' has an invalid document type.",
                          f"Εγγραφή στην ενότητα '{section}' έχει μη έγκυρο τύπο παραστατικού.")
    return value


def _get_or_create(model, profile, fields, mode):
    """Fetch or create a natural-keyed row (name/title unique per profile)."""
    key_field = "name" if "name" in fields else "title"
    lookup = {key_field: fields.get(key_field, "")}
    existing = model.objects.filter(profile=profile, **lookup).first()
    if existing is not None:
        return existing
    obj = model(profile=profile, **fields)
    try:
        obj.full_clean()
    except Exception as error:
        raise BackupError(f"Backup record is invalid: {error}.",
                          f"Εγγραφή αντιγράφου μη έγκυρη: {error}.") from error
    obj.save()
    return obj
