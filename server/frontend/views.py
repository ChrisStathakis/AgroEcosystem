from dataclasses import dataclass

import csv
import json

from django.contrib import messages
from django.contrib.auth import login
from django.contrib.auth.decorators import login_required, login_not_required
from django.core.paginator import Paginator
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import Q, Sum
from django.db.models.deletion import ProtectedError
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_http_methods

from analytics.services import charts_payload, farm_profit, financial_summary
from django.contrib.auth.views import LoginView
from django.utils import timezone
from django.utils.translation import get_language
from expenses.models import Expense, ExpenseCategory, Vendor
from farm.models import Farm, FarmTask, TaskCategory, TreePlanting, TreeType
from incomes.models import Customer, Income, IncomeCategory
from profiles.models import Profile
from . import backup as workspace_backup
from . import forms


@dataclass(frozen=True)
class Resource:
    model: type
    form: type
    title: str
    singular: str
    description: str
    kind: str


RESOURCES = {
    "farms": Resource(Farm, forms.FarmForm, "Your farms", "farm", "A little perspective on the land you care for.", "farm"),
    "trees": Resource(TreePlanting, forms.TreePlantingForm, "Trees", "tree group", "How many trees of each type each farm has.", "tree"),
    "tasks": Resource(FarmTask, forms.FarmTaskForm, "Tasks", "task", "History of work: watering, fertilizing, pruning and more.", "task"),
    "expenses": Resource(Expense, forms.ExpenseForm, "Expenses", "expense", "Every investment in your farm, in one place.", "transaction"),
    "incomes": Resource(Income, forms.IncomeForm, "Income", "income", "Keep track of what your hard work brings in.", "transaction"),
    "vendors": Resource(Vendor, forms.VendorForm, "Vendors", "vendor", "The people and businesses that keep your farm growing.", "contact"),
    "customers": Resource(Customer, forms.CustomerForm, "Customers", "customer", "Good relationships start with keeping the details close.", "contact"),
    "expense-categories": Resource(ExpenseCategory, forms.ExpenseCategoryForm, "Expense categories", "expense category", "Give every expense a place to belong.", "category"),
    "income-categories": Resource(IncomeCategory, forms.IncomeCategoryForm, "Income categories", "income category", "Organize your sources of income.", "category"),
    "tree-types": Resource(TreeType, forms.TreeTypeForm, "Tree types", "tree type", "The kinds of trees you grow.", "category"),
    "task-categories": Resource(TaskCategory, forms.TaskCategoryForm, "Task categories", "task category", "Kinds of work: watering, fertilizing and more.", "category"),
}


RESOURCES_EL = {
    "farms": Resource(Farm, forms.FarmForm, "Οι φάρμες μου", "φάρμα", "Μια συνοπτική εικόνα της γης που φροντίζετε.", "farm"),
    "trees": Resource(TreePlanting, forms.TreePlantingForm, "Δέντρα", "ομάδα δέντρων", "Πόσα δέντρα από κάθε είδος έχει κάθε φάρμα.", "tree"),
    "tasks": Resource(FarmTask, forms.FarmTaskForm, "Εργασίες", "εργασία", "Ιστορικό εργασιών: πότισμα, λίπανση, κλάδεμα και άλλα.", "task"),
    "expenses": Resource(Expense, forms.ExpenseForm, "Έξοδα", "έξοδο", "Κάθε επένδυση στη φάρμα σας, σε ένα μέρος.", "transaction"),
    "incomes": Resource(Income, forms.IncomeForm, "Έσοδα", "έσοδο", "Παρακολουθήστε τι σας αποδίδει η σκληρή δουλειά.", "transaction"),
    "vendors": Resource(Vendor, forms.VendorForm, "Προμηθευτές", "προμηθευτής", "Οι άνθρωποι και οι επιχειρήσεις που στηρίζουν τη φάρμα σας.", "contact"),
    "customers": Resource(Customer, forms.CustomerForm, "Πελάτες", "πελάτης", "Οι καλές σχέσεις ξεκινούν με προσοχή στη λεπτομέρεια.", "contact"),
    "expense-categories": Resource(ExpenseCategory, forms.ExpenseCategoryForm, "Κατηγορίες εξόδων", "κατηγορία εξόδου", "Δώστε σε κάθε έξοδο τη θέση του.", "category"),
    "income-categories": Resource(IncomeCategory, forms.IncomeCategoryForm, "Κατηγορίες εσόδων", "κατηγορία εσόδου", "Οργανώστε τις πηγές εσόδων σας.", "category"),
    "tree-types": Resource(TreeType, forms.TreeTypeForm, "Είδη δέντρων", "είδος δέντρου", "Τα είδη δέντρων που καλλιεργείτε.", "category"),
    "task-categories": Resource(TaskCategory, forms.TaskCategoryForm, "Κατηγορίες εργασιών", "κατηγορία εργασίας", "Είδη εργασιών: πότισμα, λίπανση και άλλα.", "category"),
}


def is_greek(request=None):
    """Greek is the default language; English is served under /en/."""
    if request is None:
        return get_language() == "el"
    lang = getattr(request, "LANGUAGE_CODE", None) or get_language()
    return lang == "el" or lang.startswith("el")


def el_template(request, en_path):
    """Map an English template path to its Greek duplicate when Greek is active.

    e.g. 'frontend/home.html' -> 'frontend_el/home_el.html',
    'registration/login.html' -> 'registration_el/login_el.html'.
    """
    if not is_greek(request):
        return en_path
    if en_path.startswith("frontend/partials/"):
        name = en_path.split("frontend/partials/")[1].replace(".html", "_el.html")
        return f"frontend_el/partials/{name}"
    if en_path.startswith("frontend/"):
        name = en_path.split("frontend/")[1].replace(".html", "_el.html")
        return f"frontend_el/{name}"
    if en_path.startswith("registration/"):
        name = en_path.split("registration/")[1].replace(".html", "_el.html")
        return f"registration_el/{name}"
    return en_path


def localized_resources(request):
    return RESOURCES_EL if is_greek(request) else RESOURCES


def flash(request, en_message, el_message):
    messages.success(request, el_message if is_greek(request) else en_message)


EL_MONTH_LABELS = {"Jan": "Ιαν", "Feb": "Φεβ", "Mar": "Μαρ", "Apr": "Απρ", "May": "Μάι", "Jun": "Ιουν",
                   "Jul": "Ιουλ", "Aug": "Αυγ", "Sep": "Σεπ", "Oct": "Οκτ", "Nov": "Νοε", "Dec": "Δεκ"}


def localized_summary(request, summary):
    """Swap English month abbreviations for Greek ones when Greek is active."""
    if not is_greek(request):
        return summary
    summary = dict(summary)
    summary["monthly"] = [{**m, "label": EL_MONTH_LABELS.get(m["label"], m["label"])} for m in summary["monthly"]]
    return summary


def workspace(request):
    profile, _ = Profile.objects.get_or_create(user=request.user)
    return profile


def resource_for(slug, request=None):
    table = localized_resources(request) if request is not None else RESOURCES
    if slug not in table:
        # Fall back to the English table so unknown slugs still 404 consistently.
        if slug not in RESOURCES:
            raise Http404
        return RESOURCES[slug]
    return table[slug]


def context_for(request, slug="dashboard", **extra):
    table = localized_resources(request)
    return {"active": slug, "navigation": [(key, value.title) for key, value in table.items()], **extra}


@login_not_required
@require_http_methods(["GET", "POST"])
def signup(request):
    if request.user.is_authenticated:
        return redirect("home")
    form = forms.SignupForm(request.POST if request.method == "POST" else None)
    if request.method == "POST" and form.is_valid():
        user = form.save()
        login(request, user)
        flash(request, "Welcome! Your workspace is ready.", "Καλώς ήρθατε! Ο χώρος εργασίας σας είναι έτοιμος.")
        return redirect("home")
    return render(request, el_template(request, "registration/signup.html"), {"form": form})


@login_required
def home(request):
    profile = workspace(request)
    recent = list(Expense.objects.filter(profile=profile).select_related("farm")[:5]) + list(Income.objects.filter(profile=profile).select_related("farm")[:5])
    recent.sort(key=lambda item: (item.date, item.created_at), reverse=True)
    transactions = [{"record": item, "slug": "expenses" if isinstance(item, Expense) else "incomes"} for item in recent[:6]]
    return render(request, el_template(request, "frontend/home.html"), context_for(request, summary=localized_summary(request, financial_summary(profile)),
                  farm_count=Farm.objects.filter(profile=profile).count(), recent=transactions, profile=profile))


@login_required
def analytics(request):
    profile = workspace(request)
    summary = localized_summary(request, financial_summary(profile))
    payload = charts_payload(profile)
    if is_greek(request):
        payload["cumulative"]["labels"] = [
            EL_MONTH_LABELS.get(label, label) for label in payload["cumulative"]["labels"]]
        for side in ("expenseCategories", "incomeCategories"):
            payload[side]["labels"] = [
                "Άλλα" if label == "Other" else label for label in payload[side]["labels"]]
    farms = farm_profit(profile)
    return render(request, el_template(request, "frontend/analytics.html"), context_for(
        request, "analytics", summary=summary,
        chart_data=json.dumps(payload, cls=DjangoJSONEncoder), farm_rows=farms["farms"]))


@login_required
def record_list(request, resource):
    spec = resource_for(resource, request)
    profile = workspace(request)
    records = spec.model.objects.filter(profile=profile)
    filters = None
    query = request.GET.get("q", "").strip()
    total = None
    if spec.kind == "transaction":
        records, filters = filtered_transactions(request, resource, spec, profile)
        total = records.aggregate(total=Sum("amount"))["total"] or 0
    elif spec.kind == "tree":
        records, filters, query = filtered_trees(request, profile)
    elif spec.kind == "task":
        records, filters = filtered_tasks(request, profile)
    elif query:
        field = "title" if spec.kind == "farm" else "name"
        records = records.filter(**{field + "__icontains": query})
    if spec.kind == "farm":
        records = records.annotate(tree_total=Sum("tree_plantings__count"))
    page = Paginator(records.order_by(*(spec.model._meta.ordering + ["pk"])), 12).get_page(request.GET.get("page"))
    params = request.GET.copy()
    params.pop("page", None)
    return render(request, el_template(request, "frontend/record_list.html"), context_for(request, resource,
                  spec=spec, resource=resource, page=page, filters=filters, query=query, total=total, query_params=params.urlencode()))


def filtered_transactions(request, resource, spec, profile):
    """Apply the transaction filter form; invalid filters yield no records."""
    records = spec.model.objects.filter(profile=profile).select_related(
        "farm", "category", "vendor" if resource == "expenses" else "customer")
    filters = forms.TransactionFilterForm(request.GET, profile=profile)
    if filters.is_valid():
        data = filters.cleaned_data
        if data["q"]:
            records = records.filter(Q(title__icontains=data["q"]) | Q(description__icontains=data["q"]))
        if data["farm"]:
            records = records.filter(farm=data["farm"])
        if data["start"]:
            records = records.filter(date__gte=data["start"])
        if data["end"]:
            records = records.filter(date__lte=data["end"])
    else:
        records = records.none()
    return records, filters


def filtered_trees(request, profile):
    """Filter tree groups by farm and search text."""
    records = TreePlanting.objects.filter(profile=profile).select_related("farm", "tree_type")
    farm_id = request.GET.get("farm", "").strip()
    query = request.GET.get("q", "").strip()
    filters = None
    if farm_id:
        try:
            records = records.filter(farm_id=int(farm_id), farm__profile=profile)
        except (ValueError, TypeError):
            records = records.none()
    if query:
        records = records.filter(
            Q(tree_type__name__icontains=query) | Q(farm__title__icontains=query) | Q(notes__icontains=query)
        )
    return records, filters, query


def filtered_tasks(request, profile):
    """Apply the task filter form; invalid filters yield no records."""
    records = FarmTask.objects.filter(profile=profile).select_related(
        "farm", "planting", "planting__tree_type", "category", "expense")
    filters = forms.TaskFilterForm(request.GET, profile=profile)
    if filters.is_valid():
        data = filters.cleaned_data
        if data["q"]:
            records = records.filter(Q(title__icontains=data["q"]) | Q(description__icontains=data["q"]))
        if data["farm"]:
            records = records.filter(farm=data["farm"])
        if data["planting"]:
            records = records.filter(planting=data["planting"])
        if data["category"]:
            records = records.filter(category=data["category"])
        if data["start"]:
            records = records.filter(date__gte=data["start"])
        if data["end"]:
            records = records.filter(date__lte=data["end"])
    else:
        records = records.none()
    return records, filters


@login_required
def record_export(request, resource):
    if resource not in ("expenses", "incomes"):
        raise Http404
    spec = resource_for(resource, request)
    profile = workspace(request)
    records, _ = filtered_transactions(request, resource, spec, profile)
    records = records.order_by(*(spec.model._meta.ordering + ["pk"]))
    contact_attr = "vendor" if resource == "expenses" else "customer"
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{resource}.csv"'
    writer = csv.writer(response)
    writer.writerow(["title", "date", "farm", "category", contact_attr, "document_type",
                     "include_in_tax", "amount", "description"])
    for item in records.iterator():
        contact = getattr(item, contact_attr)
        writer.writerow([item.title, item.date.isoformat(), str(item.farm), str(item.category),
                         str(contact) if contact else "", item.document_type,
                         "yes" if item.include_in_tax else "no", f"{item.amount:.2f}", item.description])
    return response


@login_required
@require_http_methods(["GET", "POST"])
def record_form(request, resource, pk=None):
    spec = resource_for(resource, request)
    profile = workspace(request)
    instance = get_object_or_404(spec.model, pk=pk, profile=profile) if pk else None
    form = spec.form(request.POST if request.method == "POST" else None, instance=instance, profile=profile)
    if request.method == "POST" and form.is_valid():
        form.save()
        flash(request,
              f"{spec.singular.capitalize()} {'updated' if pk else 'created'} successfully.",
              f"Η {spec.singular} {'ενημερώθηκε' if pk else 'δημιουργήθηκε'} με επιτυχία.")
        return redirect("record-list", resource=resource)
    prerequisites = False
    if spec.kind == "transaction":
        prerequisites = not Farm.objects.filter(profile=profile).exists() or not form.fields["category"].queryset.exists()
    elif spec.kind == "tree":
        prerequisites = not Farm.objects.filter(profile=profile).exists() or not TreeType.objects.filter(profile=profile).exists()
    elif spec.kind == "task":
        prerequisites = not Farm.objects.filter(profile=profile).exists() or not TaskCategory.objects.filter(profile=profile).exists()
    return render(request, el_template(request, "frontend/record_form.html"), context_for(request, resource,
                  form=form, spec=spec, resource=resource, editing=bool(pk), prerequisites=prerequisites))


@login_required
@require_http_methods(["GET", "POST"])
def record_delete(request, resource, pk):
    spec = resource_for(resource, request)
    instance = get_object_or_404(spec.model, pk=pk, profile=workspace(request))
    blocked = False
    if request.method == "POST":
        try:
            instance.delete()
        except ProtectedError:
            blocked = True
        else:
            flash(request, f"{spec.singular.capitalize()} deleted.", f"Η {spec.singular} διαγράφηκε.")
            return redirect("record-list", resource=resource)
    return render(request, el_template(request, "frontend/record_delete.html"), context_for(request, resource,
                  spec=spec, resource=resource, record=instance, blocked=blocked))


@login_required
@require_http_methods(["GET", "POST"])
def profile_settings(request):
    form = forms.ProfileForm(request.POST if request.method == "POST" else None, instance=workspace(request))
    if request.method == "POST" and form.is_valid():
        form.save()
        flash(request, "Your workspace name has been updated.", "Το όνομα του χώρου εργασίας σας ενημερώθηκε.")
        return redirect("profile-settings")
    return render(request, el_template(request, "frontend/profile.html"), context_for(request, "profile", form=form))


class LocalizedLoginView(LoginView):
    def get_template_names(self):
        return [el_template(self.request, "registration/login.html")]


@login_required
def backup_download(request):
    """Download the current workspace as a JSON file."""
    profile = workspace(request)
    payload = workspace_backup.build_backup(profile)
    filename = f"agro-backup-{timezone.localdate().isoformat()}.json"
    return HttpResponse(json.dumps(payload, cls=DjangoJSONEncoder, indent=2),
                        content_type="application/json",
                        headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@login_required
@require_http_methods(["GET", "POST"])
def backup_restore(request):
    """Two-step restore: upload + inspect, then confirm the import."""
    if request.method == "POST" and "confirm" in request.POST:
        payload = request.session.pop("pending_backup", None)
        mode = request.POST.get("mode", "replace")
        if payload is None:
            flash(request, "Upload a backup file first.", "Ανεβάστε πρώτα ένα αντίγραφο ασφαλείας.")
            return redirect("workspace-restore")
        try:
            counts = workspace_backup.restore_backup(workspace(request), payload, mode=mode)
        except workspace_backup.BackupError as error:
            messages.error(request, error.el_message if is_greek(request) else error.en_message)
            return redirect("workspace-restore")
        total = sum(counts.values())
        flash(request, f"Restore complete: {total} records imported.",
              f"Η επαναφορά ολοκληρώθηκε: εισήχθησαν {total} εγγραφές.")
        return redirect("home")

    preview = None
    if request.method == "POST":
        form = forms.BackupUploadForm(request.POST, request.FILES)
        if form.is_valid():
            upload = form.cleaned_data["backup_file"]
            try:
                payload = json.loads(upload.read().decode("utf-8"))
                preview = workspace_backup.describe_payload(payload)
            except (UnicodeDecodeError, ValueError) as error:
                form.add_error("backup_file", str(error))
            except workspace_backup.BackupError as error:
                form.add_error("backup_file",
                               error.el_message if is_greek(request) else error.en_message)
            else:
                request.session["pending_backup"] = payload
                return render(request, el_template(request, "frontend/backup_restore.html"),
                              context_for(request, "profile", form=form, preview=preview,
                                          counts=workspace_backup.workspace_counts(workspace(request))))
    else:
        form = forms.BackupUploadForm()
    return render(request, el_template(request, "frontend/backup_restore.html"),
                  context_for(request, "profile", form=form, preview=preview,
                              counts=workspace_backup.workspace_counts(workspace(request))))


@login_required
@require_http_methods(["GET", "POST"])
def backup_destroy(request):
    """Hidden danger-zone: delete every row in the current workspace.

    Deliberately unlinked from the navigation; reachable only via the
    profile danger-zone panel (or direct URL). Requires typing your own
    username to confirm. GET never deletes.
    """
    expected = request.user.get_username()
    if request.method == "POST":
        confirmation = (request.POST.get("confirmation") or "").strip()
        if confirmation != expected:
            messages.error(request, "Type your username exactly to confirm." if not is_greek(request)
                           else "Πληκτρολογήστε ακριβώς το όνομα χρήστη σας για επιβεβαίωση.")
        else:
            workspace_backup.destroy_workspace(workspace(request))
            flash(request, "Your workspace data has been deleted.",
                  "Τα δεδομένα του χώρου εργασίας σας διαγράφηκαν.")
            return redirect("home")
    return render(request, el_template(request, "frontend/backup_destroy.html"),
                  context_for(request, "profile", expected=expected,
                              counts=workspace_backup.workspace_counts(workspace(request))))
