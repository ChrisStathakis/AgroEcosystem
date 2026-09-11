import datetime
from decimal import Decimal

from django.db.models import Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from expenses.models import Expense
from incomes.models import Income, IncomeFarmAllocation


MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _year_or_current(year):
    return year if year is not None else timezone.localdate().year


def _coerce_filters(profile, year=None, filters=None):
    """Normalize the various caller conventions into one filter dict.

    Accepts the legacy ``year`` int, a dict passed as ``year``, or an
    explicit ``filters`` dict (typically form ``cleaned_data``).
    Always returns a dict with keys: year, start, end, farm,
    expense_category, income_category, vendor, customer,
    document_type, tax.
    """
    if isinstance(year, dict) and filters is None:
        filters = year
        year = None
    base = {"year": None, "start": None, "end": None, "farm": None,
            "expense_category": None, "income_category": None,
            "vendor": None, "customer": None, "document_type": "",
            "tax": "all"}
    if year is not None:
        base["year"] = year
    if filters:
        for key in base:
            if key in filters and filters[key] not in (None, ""):
                base[key] = filters[key]
        # Normalize empty-string document_type/tax back to defaults.
        if not base["document_type"]:
            base["document_type"] = ""
        if not base["tax"]:
            base["tax"] = "all"
    if base["year"] is None and base["start"] is None and base["end"] is None:
        base["year"] = _year_or_current(None)
    return base


def available_years(profile) -> list:
    """Distinct calendar years that have any income or expense."""
    years = set()
    for model in (Income, Expense):
        for row in model.objects.filter(profile=profile).dates("date", "year"):
            years.add(row.year)
    current = timezone.localdate().year
    years.add(current)
    return sorted(years, reverse=True)


def resolve_period(profile, filters) -> dict:
    """Turn filters into a concrete (start, end) date range.

    Explicit start/end win over ``year``. Open ends fall back to the
    year bounds (or the widest sensible bound when no year given).
    Returns ``{"start", "end", "label", "year"}``.
    """
    year = filters.get("year")
    start = filters.get("start")
    end = filters.get("end")
    if start is None and end is None:
        year = _year_or_current(year)
        start = datetime.date(year, 1, 1)
        end = datetime.date(year, 12, 31)
        label = str(year)
    else:
        if start is None:
            start = datetime.date((year or end.year), 1, 1)
        if end is None:
            end = datetime.date((year or start.year), 12, 31)
        if start.year == end.year and start.month == 1 and start.day == 1 \
                and end.month == 12 and end.day == 31:
            label = str(start.year)
            year = start.year
        else:
            label = f"{start.isoformat()} – {end.isoformat()}"
            year = year or (start.year if start.year == end.year else None)
    return {"start": start, "end": end, "label": label, "year": year}


def _apply_common(qs, filters, *, category_attr, contact_attr, farm_attr):
    f = filters
    if f.get("start"):
        qs = qs.filter(date__gte=f["start"])
    if f.get("end"):
        qs = qs.filter(date__lte=f["end"])
    category = f.get(category_attr)
    if category:
        qs = qs.filter(category=category)
    contact = f.get(contact_attr)
    if contact:
        qs = qs.filter(**{contact_attr: contact})
    if f.get("document_type"):
        qs = qs.filter(document_type=f["document_type"])
    if f.get("tax") == "taxed":
        qs = qs.filter(include_in_tax=True)
    elif f.get("tax") == "untaxed":
        qs = qs.filter(include_in_tax=False)
    farm = f.get("farm")
    if farm:
        if farm_attr == "allocations__farm":
            qs = qs.filter(allocations__farm=farm).distinct()
        else:
            qs = qs.filter(**{farm_attr: farm})
    return qs


def filter_expenses(profile, filters):
    qs = Expense.objects.filter(profile=profile).select_related("farm", "category", "vendor")
    return _apply_common(qs, _coerce_filters(profile, filters=filters), category_attr="expense_category",
                         contact_attr="vendor", farm_attr="farm")


def filter_incomes(profile, filters):
    qs = Income.objects.filter(profile=profile).select_related("category", "customer").prefetch_related("allocations__farm")
    return _apply_common(qs, _coerce_filters(profile, filters=filters), category_attr="income_category",
                         contact_attr="customer", farm_attr="allocations__farm")


def _month_buckets(start, end):
    buckets = []
    cursor = datetime.date(start.year, start.month, 1)
    last = datetime.date(end.year, end.month, 1)
    while cursor <= last:
        buckets.append((cursor.year, cursor.month))
        if cursor.month == 12:
            cursor = datetime.date(cursor.year + 1, 1, 1)
        else:
            cursor = datetime.date(cursor.year, cursor.month + 1, 1)
    return buckets


def _month_label(year, month, single_year=True):
    if single_year:
        return MONTH_LABELS[month - 1]
    return f"{MONTH_LABELS[month - 1]} {year}"


def _monthly_totals(incomes, expenses, buckets, single_year=True):
    income_months = {row["month"].month + row["month"].year * 12: row["total"] for row in
                     incomes.order_by().annotate(month=TruncMonth("date")).values("month").annotate(total=Sum("amount"))}
    expense_months = {row["month"].month + row["month"].year * 12: row["total"] for row in
                      expenses.order_by().annotate(month=TruncMonth("date")).values("month").annotate(total=Sum("amount"))}

    def key(y, m):
        return m + y * 12

    monthly = []
    for (y, m) in buckets:
        income = income_months.get(key(y, m), Decimal("0"))
        expense = expense_months.get(key(y, m), Decimal("0"))
        label = _month_label(y, m, single_year=single_year)
        monthly.append({"year": y, "month": m, "label": label,
                        "full_label": f"{label} {y}" if single_year else label,
                        "income": income, "expense": expense, "balance": income - expense})
    return monthly


def financial_summary(profile, year=None, filters=None) -> dict:
    """Summarize a period within one profile (year or custom range + dims)."""
    f = _coerce_filters(profile, year=year, filters=filters)
    period = resolve_period(profile, f)
    f["start"], f["end"] = period["start"], period["end"]
    expenses = filter_expenses(profile, f)
    incomes = filter_incomes(profile, f)
    expense_total = expenses.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    income_total = incomes.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    taxable_income = incomes.filter(include_in_tax=True).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    deductible_expenses = expenses.filter(include_in_tax=True).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    buckets = _month_buckets(period["start"], period["end"])
    single_year = period["start"].year == period["end"].year
    monthly = _monthly_totals(incomes, expenses, buckets, single_year=single_year)
    # Legacy bar-height keys used by the home chart partial.
    scale = max([m["income"] for m in monthly] + [m["expense"] for m in monthly] + [Decimal("1")])
    for m in monthly:
        m["income_height"] = max(0, int(m["income"] / scale * 100))
        m["expense_height"] = max(0, int(m["expense"] / scale * 100))
    return {"year": period["year"] or period["start"].year, "period_label": period["label"],
            "start": period["start"], "end": period["end"],
            "income_total": income_total, "expense_total": expense_total,
            "balance": income_total - expense_total, "monthly": monthly,
            "taxable_income": taxable_income, "deductible_expenses": deductible_expenses,
            "taxable_net": taxable_income - deductible_expenses,
            "has_activity": bool(income_total or expense_total)}


def category_breakdown(profile, year=None, filters=None, limit=8) -> dict:
    """Top categories by total for expenses and incomes in the filtered period."""
    f = _coerce_filters(profile, year=year, filters=filters)
    period = resolve_period(profile, f)
    f["start"], f["end"] = period["start"], period["end"]

    def top(qs, category_attr):
        rows = (qs.values(f"{category_attr}__name")
                  .annotate(total=Sum("amount"))
                  .order_by("-total"))
        items = [{"label": row[f"{category_attr}__name"] or "—", "total": row["total"] or Decimal("0")}
                 for row in rows]
        if len(items) > limit:
            rest = sum((item["total"] for item in items[limit - 1:]), Decimal("0"))
            items = items[:limit - 1] + [{"label": "Other", "total": rest}]
        return items

    return {
        "year": period["year"], "period_label": period["label"],
        "start": period["start"], "end": period["end"],
        "expenses": top(filter_expenses(profile, f), "category"),
        "incomes": top(filter_incomes(profile, f), "category"),
    }


def farm_profit(profile, year=None, filters=None) -> dict:
    """Per-farm income, expenses and net for the filtered period."""
    from farm.models import Farm

    f = _coerce_filters(profile, year=year, filters=filters)
    period = resolve_period(profile, f)
    f["start"], f["end"] = period["start"], period["end"]
    farms_qs = Farm.objects.filter(profile=profile).order_by("title")
    if f.get("farm"):
        farms_qs = farms_qs.filter(pk=f["farm"].pk)
    rows = []
    for farm in farms_qs:
        sub = dict(f)
        sub["farm"] = farm
        # Income per farm uses allocation amounts (not full income amounts).
        alloc_qs = IncomeFarmAllocation.objects.filter(profile=profile, farm=farm, income__profile=profile)
        if sub["start"]:
            alloc_qs = alloc_qs.filter(income__date__gte=sub["start"])
        if sub["end"]:
            alloc_qs = alloc_qs.filter(income__date__lte=sub["end"])
        if sub.get("income_category"):
            alloc_qs = alloc_qs.filter(income__category=sub["income_category"])
        if sub.get("customer"):
            alloc_qs = alloc_qs.filter(income__customer=sub["customer"])
        if sub.get("document_type"):
            alloc_qs = alloc_qs.filter(income__document_type=sub["document_type"])
        if sub.get("tax") == "taxed":
            alloc_qs = alloc_qs.filter(income__include_in_tax=True)
        elif sub.get("tax") == "untaxed":
            alloc_qs = alloc_qs.filter(income__include_in_tax=False)
        income_total = alloc_qs.aggregate(total=Sum("amount"))["total"] or Decimal("0")
        expense_total = (filter_expenses(profile, {**sub, "farm": None}).filter(farm=farm)
                         .aggregate(total=Sum("amount"))["total"] or Decimal("0"))
        rows.append({"farm": farm.title, "income": income_total, "expense": expense_total,
                     "net": income_total - expense_total})
    if not f.get("farm"):
        total_income = (filter_incomes(profile, f).aggregate(total=Sum("amount"))["total"] or Decimal("0"))
        alloc_qs = IncomeFarmAllocation.objects.filter(profile=profile, income__profile=profile,
                                                       income__in=filter_incomes(profile, f).only("pk"))
        allocated_income = alloc_qs.aggregate(total=Sum("amount"))["total"] or Decimal("0")
        unallocated = total_income - allocated_income
        if unallocated:
            rows.append({"farm": "Unallocated", "income": unallocated,
                         "expense": Decimal("0"), "net": unallocated})
    rows.sort(key=lambda row: row["net"], reverse=True)
    return {"year": period["year"], "period_label": period["label"],
            "start": period["start"], "end": period["end"], "farms": rows}


def cumulative_balance(profile, year=None, filters=None) -> dict:
    """Running net total after each month of the filtered period."""
    f = _coerce_filters(profile, year=year, filters=filters)
    period = resolve_period(profile, f)
    f["start"], f["end"] = period["start"], period["end"]
    buckets = _month_buckets(period["start"], period["end"])
    single_year = period["start"].year == period["end"].year
    monthly = _monthly_totals(filter_incomes(profile, f), filter_expenses(profile, f),
                              buckets, single_year=single_year)
    running = Decimal("0")
    cumulative = []
    labels = []
    for m in monthly:
        running += m["balance"]
        cumulative.append(running)
        labels.append(m["label"])
    return {"year": period["year"], "period_label": period["label"],
            "start": period["start"], "end": period["end"],
            "labels": labels, "cumulative": cumulative, "monthly": monthly}


def charts_payload(profile, year=None, filters=None) -> dict:
    """JSON-safe bundle for the Chart.js charts on the analytics page."""
    f = _coerce_filters(profile, year=year, filters=filters)
    categories = category_breakdown(profile, filters=f)
    farms = farm_profit(profile, filters=f)
    cumulative = cumulative_balance(profile, filters=f)
    period = resolve_period(profile, f)
    return {
        "year": period["year"], "period_label": period["label"],
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


def profit_loss_report(profile, filters=None) -> dict:
    """P&L detail: totals + monthly + per-farm + per-category tables."""
    f = _coerce_filters(profile, filters=filters)
    summary = financial_summary(profile, filters=f)
    farms = farm_profit(profile, filters=f)
    categories = category_breakdown(profile, filters=f)
    return {"filters": f, "period_label": summary["period_label"],
            "start": summary["start"], "end": summary["end"], "year": summary["year"],
            "income_total": summary["income_total"], "expense_total": summary["expense_total"],
            "net": summary["balance"], "monthly": summary["monthly"],
            "farms": farms["farms"],
            "expense_categories": categories["expenses"],
            "income_categories": categories["incomes"]}


def cash_flow_report(profile, filters=None) -> dict:
    """Monthly in/out/net plus running balance."""
    f = _coerce_filters(profile, filters=filters)
    cumulative = cumulative_balance(profile, filters=f)
    summary = financial_summary(profile, filters=f)
    rows = []
    running = Decimal("0")
    for m, total in zip(cumulative["monthly"], cumulative["cumulative"]):
        running = total
        rows.append({**m, "running": running})
    return {"filters": f, "period_label": summary["period_label"],
            "start": summary["start"], "end": summary["end"], "year": summary["year"],
            "rows": rows, "labels": cumulative["labels"], "cumulative": cumulative["cumulative"],
            "income_total": summary["income_total"], "expense_total": summary["expense_total"],
            "net": summary["balance"]}


def tax_report(profile, filters=None) -> dict:
    """Tax-flagged line items plus totals for the filtered period."""
    f = _coerce_filters(profile, filters=filters)
    taxed = dict(f, tax="taxed")
    incomes = list(filter_incomes(profile, taxed).order_by("date", "pk"))
    expenses = list(filter_expenses(profile, taxed).order_by("date", "pk"))
    income_total = sum((i.amount for i in incomes), Decimal("0"))
    expense_total = sum((e.amount for e in expenses), Decimal("0"))
    period = resolve_period(profile, _coerce_filters(profile, filters=f))
    return {"filters": f, "period_label": period["label"],
            "start": period["start"], "end": period["end"], "year": period["year"],
            "incomes": incomes, "expenses": expenses,
            "income_total": income_total, "expense_total": expense_total,
            "net": income_total - expense_total}


def describe_filters(profile, filters) -> str:
    """Human-readable summary of active filters for print headers."""
    f = _coerce_filters(profile, filters=filters)
    period = resolve_period(profile, f)
    parts = [f"Period: {period['label']}"]
    if f.get("farm"):
        parts.append(f"Farm: {f['farm']}")
    if f.get("expense_category"):
        parts.append(f"Expense category: {f['expense_category']}")
    if f.get("income_category"):
        parts.append(f"Income category: {f['income_category']}")
    if f.get("vendor"):
        parts.append(f"Vendor: {f['vendor']}")
    if f.get("customer"):
        parts.append(f"Customer: {f['customer']}")
    if f.get("document_type"):
        parts.append(f"Document: {dict([('invoice', 'Invoice'), ('receipt', 'Receipt')]).get(f['document_type'], f['document_type'])}")
    if f.get("tax") and f["tax"] != "all":
        parts.append(f"Tax: {'Taxed only' if f['tax'] == 'taxed' else 'Untaxed only'}")
    return " · ".join(parts)
