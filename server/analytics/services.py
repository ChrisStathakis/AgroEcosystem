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
        elif farm_attr == "farm":
            # Shared expenses (no farm) apply to every farm, so include them
            # whenever a farm filter is active. Totals are split by each
            # expense's basis via the helpers below instead of counting
            # the full row.
            from django.db.models import Q
            qs = qs.filter(Q(farm=farm) | Q(farm__isnull=True))
        else:
            qs = qs.filter(**{farm_attr: farm})
    return qs


def farm_tree_weights(profile) -> tuple[dict, int]:
    """Current tree counts per farm for one profile.

    Returns ``({farm_id: trees}, total_trees)``. Mirrors
    ``expenses.models.farm_tree_weights`` without importing it at module
    load time (avoids a hard dependency from analytics to expenses).
    """
    from farm.models import Farm, TreePlanting

    farms = list(Farm.objects.filter(profile=profile).values_list("pk", flat=True))
    totals = dict(
        TreePlanting.objects.filter(profile=profile, farm__profile=profile)
        .values("farm_id")
        .annotate(total=Sum("count"))
        .values_list("farm_id", "total")
    )
    weights = {pk: int(totals.get(pk) or 0) for pk in farms}
    return weights, sum(weights.values())


def _basis_cache_key(basis, tree_type_id):
    return (basis or "trees", tree_type_id)


def _basis_weights_cached(profile, basis, tree_type_id, cache):
    """Weight map + total for one split basis, memoized per request."""
    from expenses import models as expense_models

    key = _basis_cache_key(basis, tree_type_id)
    if cache is not None and key in cache:
        return cache[key]
    if basis == "area":
        result = expense_models.farm_area_weights(profile)
    elif basis == "tree_type" and tree_type_id:
        result = expense_models.farm_tree_type_weights(profile, tree_type_id)
    elif basis == "equal":
        result = expense_models.basis_weights(profile, "equal")
    else:
        result = expense_models.farm_tree_weights(profile)
    if cache is not None:
        cache[key] = result
    return result


def _basis_ratio(profile, farm, basis, tree_type_id, cache=None) -> Decimal:
    """Portion of one shared-expense group attributable to ``farm``."""
    from farm.models import Farm as FarmModel

    weights, total = _basis_weights_cached(profile, basis, tree_type_id, cache)
    farm_id = farm.pk if isinstance(farm, FarmModel) else getattr(farm, "pk", farm)
    if not weights or farm_id not in weights:
        return Decimal("0")
    total = Decimal(str(total or 0))
    if total > 0:
        return Decimal(str(weights.get(farm_id, 0))) / total
    active = len(weights)
    if not active:
        return Decimal("0")
    return Decimal("1") / Decimal(str(active))


def _shared_groups(shared_qs):
    """Shared-expense totals grouped by (split_basis, split_tree_type)."""
    return list(
        shared_qs.order_by().values("split_basis", "split_tree_type").annotate(total=Sum("amount"))
    )


def farm_share_ratio(profile, farm, weights=None, total=None) -> Decimal:
    """Portion of a shared expense attributable to ``farm``.

    Proportional to current tree counts; falls back to an equal split
    when no trees are recorded.
    """
    from farm.models import Farm as FarmModel

    if weights is None or total is None:
        weights, total = farm_tree_weights(profile)
    farm_id = farm.pk if isinstance(farm, FarmModel) else getattr(farm, "pk", farm)
    if not weights:
        return Decimal("0")
    if total and total > 0:
        return Decimal(str(weights.get(farm_id, 0))) / Decimal(str(total))
    active = len(weights)
    if not active or farm_id not in weights:
        return Decimal("0")
    return Decimal("1") / Decimal(str(active))


def _split_aware_expense_total(expenses_qs, profile, farm) -> Decimal:
    """Total of ``expenses_qs`` with shared rows split by their own basis.

    ``expenses_qs`` must already carry every non-farm filter (dates,
    category, vendor, document, tax) and, when ``farm`` is set, include
    both direct and shared rows (see ``_apply_common``).
    """
    if not farm:
        return expenses_qs.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    direct = expenses_qs.filter(farm=farm).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    cache: dict = {}
    shared_total = Decimal("0")
    for group in _shared_groups(expenses_qs.filter(farm__isnull=True)):
        group_total = group["total"] or Decimal("0")
        if not group_total:
            continue
        ratio = _basis_ratio(profile, farm, group.get("split_basis"), group.get("split_tree_type"), cache)
        shared_total += group_total * ratio
    return direct + shared_total


def _split_aware_monthly_expenses(expenses_qs, profile, farm):
    """Per-month expense sums with shared rows split by their own basis."""
    rows = list(
        expenses_qs.order_by().annotate(month=TruncMonth("date")).values(
            "month", "farm", "split_basis", "split_tree_type").annotate(total=Sum("amount"))
    )
    if not farm:
        merged = {}
        for row in rows:
            key = row["month"].month + row["month"].year * 12
            merged[key] = merged.get(key, Decimal("0")) + (row["total"] or Decimal("0"))
        return merged
    cache: dict = {}
    ratios: dict = {}
    merged = {}
    for row in rows:
        key = row["month"].month + row["month"].year * 12
        total = row["total"] or Decimal("0")
        if row["farm"]:
            merged[key] = merged.get(key, Decimal("0")) + total
            continue
        group_key = (row.get("split_basis"), row.get("split_tree_type"))
        if group_key not in ratios:
            ratios[group_key] = _basis_ratio(profile, farm, group_key[0], group_key[1], cache)
        merged[key] = merged.get(key, Decimal("0")) + total * ratios[group_key]
    return merged


def _split_aware_category_totals(expenses_qs, profile, farm, category_attr="category", limit=8):
    """Category totals with shared rows split by their own basis."""
    from collections import defaultdict

    rows = list(
        expenses_qs.order_by().values(
            f"{category_attr}__name", "farm", "split_basis", "split_tree_type").annotate(total=Sum("amount"))
    )
    if not farm:
        merged = defaultdict(lambda: Decimal("0"))
        for row in rows:
            merged[row[f"{category_attr}__name"] or "—"] += row["total"] or Decimal("0")
    else:
        cache: dict = {}
        ratios: dict = {}
        merged = defaultdict(lambda: Decimal("0"))
        for row in rows:
            total = row["total"] or Decimal("0")
            if row["farm"]:
                merged[row[f"{category_attr}__name"] or "—"] += total
                continue
            group_key = (row.get("split_basis"), row.get("split_tree_type"))
            if group_key not in ratios:
                ratios[group_key] = _basis_ratio(profile, farm, group_key[0], group_key[1], cache)
            merged[row[f"{category_attr}__name"] or "—"] += total * ratios[group_key]
    items = [{"label": label, "total": total} for label, total in merged.items()]
    items.sort(key=lambda item: item["total"], reverse=True)
    if len(items) > limit:
        rest = sum((item["total"] for item in items[limit - 1:]), Decimal("0"))
        items = items[:limit - 1] + [{"label": "Other", "total": rest}]
    return items


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


def _monthly_totals(incomes, expenses, buckets, single_year=True, expense_profile=None, expense_farm=None):
    income_months = {row["month"].month + row["month"].year * 12: row["total"] for row in
                     incomes.order_by().annotate(month=TruncMonth("date")).values("month").annotate(total=Sum("amount"))}
    if expense_farm:
        expense_months = _split_aware_monthly_expenses(expenses, expense_profile, expense_farm)
    else:
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
    farm = f.get("farm")
    expense_total = _split_aware_expense_total(expenses, profile, farm)
    income_total = incomes.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    taxable_income = incomes.filter(include_in_tax=True).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    if farm:
        deductible_expenses = _split_aware_expense_total(expenses.filter(include_in_tax=True), profile, farm)
    else:
        deductible_expenses = expenses.filter(include_in_tax=True).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    buckets = _month_buckets(period["start"], period["end"])
    single_year = period["start"].year == period["end"].year
    monthly = _monthly_totals(incomes, expenses, buckets, single_year=single_year,
                              expense_profile=profile, expense_farm=farm)
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
        "expenses": _split_aware_category_totals(filter_expenses(profile, f), profile, f.get("farm"), "category", limit),
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
    farms = list(farms_qs)
    # Shared expenses matching every non-farm filter, grouped by split basis.
    shared_base = filter_expenses(profile, {**f, "farm": None}).filter(farm__isnull=True)
    shared_groups = _shared_groups(shared_base)
    shared_total = sum((g["total"] or Decimal("0") for g in shared_groups), Decimal("0"))
    cache: dict = {}
    rows = []
    for farm in farms:
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
        direct_expense = (filter_expenses(profile, {**sub, "farm": None}).filter(farm=farm)
                          .aggregate(total=Sum("amount"))["total"] or Decimal("0"))
        shared_expense = sum(
            ((g["total"] or Decimal("0"))
             * _basis_ratio(profile, farm, g.get("split_basis"), g.get("split_tree_type"), cache)
             for g in shared_groups),
            Decimal("0"))
        expense_total = direct_expense + shared_expense
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
        if not farms and shared_total:
            rows.append({"farm": "Unallocated", "income": Decimal("0"),
                         "expense": shared_total, "net": -shared_total})
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
                              buckets, single_year=single_year,
                              expense_profile=profile, expense_farm=f.get("farm"))
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
    farm = taxed.get("farm")
    if farm:
        direct = sum((e.amount for e in expenses if e.farm_id), Decimal("0"))
        cache: dict = {}
        shared = Decimal("0")
        for e in expenses:
            if e.farm_id is None:
                shared += e.amount * _basis_ratio(
                    profile, farm, e.split_basis, e.split_tree_type_id, cache)
        expense_total = direct + shared
    else:
        expense_total = sum((e.amount for e in expenses), Decimal("0"))
    period = resolve_period(profile, _coerce_filters(profile, filters=f))
    return {"filters": f, "period_label": period["label"],
            "start": period["start"], "end": period["end"], "year": period["year"],
            "incomes": incomes, "expenses": expenses,
            "income_total": income_total, "expense_total": expense_total,
            "net": income_total - expense_total}


def obligations_report(profile, filters=None) -> dict:
    """Unpaid expenses: totals + per-farm split + line items.

    Payment status never affects tax figures; this report simply lists
    what is still owed. Shared (farm-less) expenses split by their own
    basis (trees, variety, area or equal), like every per-farm figure.
    """
    from farm.models import Farm

    f = _coerce_filters(profile, filters=filters)
    period = resolve_period(profile, f)
    f["start"], f["end"] = period["start"], period["end"]
    base = filter_expenses(profile, f).filter(is_paid=False)
    farm = f.get("farm")
    unpaid_total = _split_aware_expense_total(base, profile, farm)
    today = timezone.localdate()
    overdue_qs = base.filter(date__lt=today)
    overdue_total = _split_aware_expense_total(overdue_qs, profile, farm)
    items = list(base.order_by("date", "pk"))
    for item in items:
        item.is_overdue = item.date < today
    farms_qs = Farm.objects.filter(profile=profile).order_by("title")
    if farm:
        farms_qs = farms_qs.filter(pk=farm.pk)
    farms = list(farms_qs)
    cache: dict = {}
    shared_groups = _shared_groups(base.filter(farm__isnull=True))
    shared_overdue_groups = _shared_groups(overdue_qs.filter(farm__isnull=True))
    rows = []
    for one in farms:
        direct = base.filter(farm=one).aggregate(total=Sum("amount"))["total"] or Decimal("0")
        direct_overdue = overdue_qs.filter(farm=one).aggregate(total=Sum("amount"))["total"] or Decimal("0")
        shared = sum(
            ((g["total"] or Decimal("0"))
             * _basis_ratio(profile, one, g.get("split_basis"), g.get("split_tree_type"), cache)
             for g in shared_groups),
            Decimal("0"))
        shared_over = sum(
            ((g["total"] or Decimal("0"))
             * _basis_ratio(profile, one, g.get("split_basis"), g.get("split_tree_type"), cache)
             for g in shared_overdue_groups),
            Decimal("0"))
        rows.append({"farm": one.title,
                     "unpaid": direct + shared,
                     "overdue": direct_overdue + shared_over})
    rows.sort(key=lambda row: row["unpaid"], reverse=True)
    return {"filters": f, "period_label": period["label"],
            "start": period["start"], "end": period["end"], "year": period["year"],
            "items": items, "unpaid_total": unpaid_total, "overdue_total": overdue_total,
            "count": len(items), "farms": rows}


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


def _shift_year(value, delta):
    """Shift a date by whole years, mapping Feb 29 to Feb 28 when needed."""
    try:
        return value.replace(year=value.year + delta)
    except ValueError:
        return value.replace(year=value.year + delta, day=28)


def _pct_change(current, previous):
    current = Decimal(str(current or 0))
    previous = Decimal(str(previous or 0))
    delta = current - previous
    if not previous:
        return None if not current else Decimal("100")
    return (delta / abs(previous) * Decimal("100")).quantize(Decimal("0.1"))


def compare_years(profile, filters=None) -> dict:
    """Current period vs the same period one year earlier.

    Returns ``{"current", "previous", "rows"}`` where rows is a 3-row
    table (income/expenses/net) with ``current``, ``previous``,
    ``delta`` and ``pct`` (None when not computable).
    """
    f = _coerce_filters(profile, filters=filters)
    current = financial_summary(profile, filters=f)
    prev_filters = dict(f)
    prev_filters["year"] = None
    prev_filters["start"] = _shift_year(current["start"], -1)
    prev_filters["end"] = _shift_year(current["end"], -1)
    previous = financial_summary(profile, filters=prev_filters)

    def row(cur, prev):
        return {"current": cur, "previous": prev, "delta": cur - prev,
                "pct": _pct_change(cur, prev)}

    return {
        "current": current, "previous": previous,
        "current_label": current["period_label"], "previous_label": previous["period_label"],
        "rows": [
            {"key": "income", "current": current["income_total"],
             "previous": previous["income_total"],
             "delta": current["income_total"] - previous["income_total"],
             "pct": _pct_change(current["income_total"], previous["income_total"])},
            {"key": "expenses", "current": current["expense_total"],
             "previous": previous["expense_total"],
             "delta": current["expense_total"] - previous["expense_total"],
             "pct": _pct_change(current["expense_total"], previous["expense_total"])},
            {"key": "net", "current": current["balance"],
             "previous": previous["balance"],
             "delta": current["balance"] - previous["balance"],
             "pct": _pct_change(current["balance"], previous["balance"])},
        ],
    }


def default_periods(year=None) -> list:
    """Default reporting ranges: Q1-Q4 + H1-H2 for ``year`` (current year default)."""
    import calendar

    year = year or timezone.localdate().year

    def month_end(m):
        return calendar.monthrange(year, m)[1]

    def rng(label, sm, sd, em, ed):
        import datetime

        return {"key": label,
                "label": label,
                "start": datetime.date(year, sm, sd),
                "end": datetime.date(year, em, ed)}

    return [
        rng("Q1", 1, 1, 3, month_end(3)),
        rng("Q2", 4, 1, 6, month_end(6)),
        rng("Q3", 7, 1, 9, month_end(9)),
        rng("Q4", 10, 1, 12, month_end(12)),
        rng("H1", 1, 1, 6, month_end(6)),
        rng("H2", 7, 1, 12, month_end(12)),
    ]


def period_comparison(profile, filters=None) -> dict:
    """Per-period income/expenses split by tax flag plus net differences.

    Uses the default trimester/semester ranges for the active year,
    honoring farm/category/contact/document filters (tax filter is
    ignored so both taxed and untaxed columns can be shown).
    """
    base = _coerce_filters(profile, filters=filters)
    period = resolve_period(profile, base)
    year = period["start"].year if period["start"].year == period["end"].year else None
    if year is None:
        year = timezone.localdate().year
    rows = []
    for spec in default_periods(year):
        sub = dict(base)
        sub["year"] = None
        sub["start"], sub["end"] = spec["start"], spec["end"]
        sub["tax"] = "all"
        summary = financial_summary(profile, filters=sub)
        income_taxed = summary["taxable_income"]
        expense_taxed = summary["deductible_expenses"]
        rows.append({
            "label": spec["label"], "start": spec["start"], "end": spec["end"],
            "income_total": summary["income_total"],
            "income_taxed": income_taxed,
            "income_untaxed": summary["income_total"] - income_taxed,
            "expense_total": summary["expense_total"],
            "expense_taxed": expense_taxed,
            "expense_untaxed": summary["expense_total"] - expense_taxed,
            "net": summary["balance"],
            "taxable_net": summary["taxable_net"],
        })
    totals = {
        key: sum((r[key] for r in rows[:4]), Decimal("0"))
        for key in ("income_total", "income_taxed", "income_untaxed",
                    "expense_total", "expense_taxed", "expense_untaxed",
                    "net", "taxable_net")
    }
    return {"year": year, "rows": rows, "totals": totals}
