from decimal import Decimal

from django.db.models import Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from expenses.models import Expense
from incomes.models import Income


def financial_summary(profile) -> dict:
    """Summarize the current calendar year within one profile."""
    today = timezone.localdate()
    expenses = Expense.objects.filter(profile=profile, date__year=today.year)
    incomes = Income.objects.filter(profile=profile, date__year=today.year)
    expense_total = expenses.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    income_total = incomes.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    taxable_income = incomes.filter(include_in_tax=True).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    deductible_expenses = expenses.filter(include_in_tax=True).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    monthly = []
    income_months = {row["month"].month: row["total"] for row in incomes.order_by().annotate(month=TruncMonth("date")).values("month").annotate(total=Sum("amount"))}
    expense_months = {row["month"].month: row["total"] for row in expenses.order_by().annotate(month=TruncMonth("date")).values("month").annotate(total=Sum("amount"))}
    scale = max([*income_months.values(), *expense_months.values(), Decimal("1")])
    for month, label in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1):
        income = income_months.get(month, Decimal("0"))
        expense = expense_months.get(month, Decimal("0"))
        monthly.append({"label": label, "income": income, "expense": expense, "balance": income - expense,
                        "income_height": max(0, int(income / scale * 100)), "expense_height": max(0, int(expense / scale * 100))})
    return {"year": today.year, "income_total": income_total, "expense_total": expense_total,
            "balance": income_total - expense_total, "monthly": monthly,
            "taxable_income": taxable_income, "deductible_expenses": deductible_expenses,
            "taxable_net": taxable_income - deductible_expenses,
            "has_activity": bool(income_total or expense_total)}


MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _year_or_current(year):
    return year if year is not None else timezone.localdate().year


def category_breakdown(profile, year=None, limit=8) -> dict:
    """Top categories by total for expenses and incomes in a calendar year.

    Returns ``{"year": ..., "expenses": [{"label", "total"}], "incomes": [...]}``
    ordered by total descending; beyond ``limit`` the remainder is folded
    into a single ``"Other"`` bucket per side.
    """
    year = _year_or_current(year)

    def top(qs, category_attr):
        rows = (qs.filter(profile=profile, date__year=year)
                  .values(f"{category_attr}__name")
                  .annotate(total=Sum("amount"))
                  .order_by("-total"))
        items = [{"label": row[f"{category_attr}__name"] or "—", "total": row["total"] or Decimal("0")}
                 for row in rows]
        if len(items) > limit:
            rest = sum((item["total"] for item in items[limit - 1:]), Decimal("0"))
            items = items[:limit - 1] + [{"label": "Other", "total": rest}]
        return items

    return {
        "year": year,
        "expenses": top(Expense.objects.all(), "category"),
        "incomes": top(Income.objects.all(), "category"),
    }


def farm_profit(profile, year=None) -> dict:
    """Per-farm income, expenses and net for a calendar year.

    Returns ``{"year": ..., "farms": [{"farm", "income", "expense", "net"}]}``
    ordered by net descending.
    """
    from farm.models import Farm

    year = _year_or_current(year)
    rows = []
    for farm in Farm.objects.filter(profile=profile).order_by("title"):
        income = (Income.objects.filter(profile=profile, farm=farm, date__year=year)
                  .aggregate(total=Sum("amount"))["total"] or Decimal("0"))
        expense = (Expense.objects.filter(profile=profile, farm=farm, date__year=year)
                   .aggregate(total=Sum("amount"))["total"] or Decimal("0"))
        rows.append({"farm": farm.title, "income": income, "expense": expense,
                     "net": income - expense})
    rows.sort(key=lambda row: row["net"], reverse=True)
    return {"year": year, "farms": rows}


def cumulative_balance(profile, year=None) -> dict:
    """Running net total after each month of a calendar year.

    Returns ``{"year": ..., "labels": [...], "cumulative": [Decimal, ...]}``.
    """
    year = _year_or_current(year)
    income_months = {row["month"].month: row["total"] for row in
                     Income.objects.filter(profile=profile, date__year=year)
                     .order_by().annotate(month=TruncMonth("date"))
                     .values("month").annotate(total=Sum("amount"))}
    expense_months = {row["month"].month: row["total"] for row in
                      Expense.objects.filter(profile=profile, date__year=year)
                      .order_by().annotate(month=TruncMonth("date"))
                      .values("month").annotate(total=Sum("amount"))}
    running = Decimal("0")
    cumulative = []
    for month in range(1, 13):
        running += (income_months.get(month) or Decimal("0")) - (expense_months.get(month) or Decimal("0"))
        cumulative.append(running)
    return {"year": year, "labels": list(MONTH_LABELS), "cumulative": cumulative}


def charts_payload(profile, year=None) -> dict:
    """JSON-safe bundle for the Chart.js charts on the analytics page."""
    year = _year_or_current(year)
    categories = category_breakdown(profile, year)
    farms = farm_profit(profile, year)
    cumulative = cumulative_balance(profile, year)
    return {
        "year": year,
        "expenseCategories": {"labels": [item["label"] for item in categories["expenses"]],
                              "totals": [float(item["total"]) for item in categories["expenses"]]},
        "incomeCategories": {"labels": [item["label"] for item in categories["incomes"]],
                             "totals": [float(item["total"]) for item in categories["incomes"]]},
        "farmProfit": {"labels": [row["farm"] for row in farms["farms"]],
                       "income": [float(row["income"]) for row in farms["farms"]],
                       "expense": [float(row["expense"]) for row in farms["farms"]],
                       "net": [float(row["net"]) for row in farms["farms"]]},
        "cumulative": {"labels": cumulative["labels"],
                       "totals": [float(value) for value in cumulative["cumulative"]]},
    }
