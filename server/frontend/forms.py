from django import forms
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm
from django.core.exceptions import ValidationError
from django.db.models import Q
from django.utils import timezone
from django.utils.translation import get_language

from expenses.models import Expense, ExpenseCategory, Vendor
from farm.models import Farm, FarmTask, TaskCategory, TreeInventoryMovement, TreePlanting, TreeType
from incomes.models import Customer, Income, IncomeCategory, IncomeFarmAllocation
from production.models import Production, ProductionIncomeLink
from profiles.models import Profile


def style_fields(fields):
    for field in fields.values():
        widget = field.widget
        css = "form-control"
        if isinstance(widget, forms.CheckboxInput):
            css = "form-check-input"
        elif isinstance(widget, forms.Select):
            css = "form-select"
        widget.attrs["class"] = css
        if isinstance(widget, forms.Textarea):
            widget.attrs["rows"] = 3


def in_greek():
    lang = get_language() or ""
    return lang == "el" or lang.startswith("el")


EL_FIELD_LABELS = {
    "username": "Όνομα χρήστη",
    "password": "Κωδικός πρόσβασης",
    "password1": "Κωδικός πρόσβασης",
    "password2": "Επιβεβαίωση κωδικού",
    "title": "Τίτλος",
    "date": "Ημερομηνία",
    "amount": "Ποσό",
    "quantity": "Ποσότητα",
    "unit": "Μονάδα",
    "year": "Έτος",
    "farm": "Φάρμα",
    "category": "Κατηγορία",
    "vendor": "Προμηθευτής",
    "customer": "Πελάτης",
    "document_type": "Τύπος παραστατικού",
    "include_in_tax": "Συμπερίληψη στην εφορία",
    "is_paid": "Πληρωμένο",
    "is_archived": "Αρχειοθετημένο",
    "description": "Περιγραφή",
    "name": "Όνομα",
    "email": "Email",
    "phone": "Τηλέφωνο",
    "address": "Διεύθυνση",
    "notes": "Σημειώσεις",
    "size": "Έκταση (στρέμματα)",
    "active": "Ενεργή",
    "tree_type": "Είδος δέντρου/καλλιέργειας",
    "count": "Πλήθος δέντρων",
    "action": "Κίνηση",
    "quantity": "Πλήθος",
    "effective_date": "Ημερομηνία κίνησης",
    "planted_on": "Ημερομηνία φύτευσης",
    "planting": "Ομάδα δέντρων",
    "expense": "Σχετικό έξοδο",
    "display_name": "Όνομα χώρου εργασίας",
    "q": "Αναζήτηση",
    "start": "Από",
    "end": "Έως",
    "year": "Έτος",
    "expense_category": "Κατηγορία εξόδων",
    "income_category": "Κατηγορία εσόδων",
    "vendor": "Προμηθευτής",
    "customer": "Πελάτης",
    "document_type": "Τύπος παραστατικού",
    "tax": "Εφορία",
    "paid": "Πληρωμή",
}

EL_DOCUMENT_CHOICES = [("invoice", "Τιμολόγιο"), ("receipt", "Απόδειξη")]


def apply_greek_labels(form):
    """Translate visible labels/placeholders/empty options when Greek is active."""
    if not in_greek():
        return form
    for name, field in form.fields.items():
        if name in EL_FIELD_LABELS:
            field.label = EL_FIELD_LABELS[name]
        if name == "q":
            placeholder = "Αναζήτηση συναλλαγών…" if "transaction" in str(type(form).__name__).lower() or type(form).__name__ == "TransactionFilterForm" else "Αναζήτηση…"
            if type(form).__name__ == "TaskFilterForm":
                placeholder = "Αναζήτηση εργασιών…"
            field.widget.attrs["placeholder"] = placeholder
        if isinstance(field, forms.ModelChoiceField) and field.required is False:
            if name == "farm":
                field.empty_label = "Όλες οι φάρμες"
            elif name == "planting":
                field.empty_label = "Όλες οι ομάδες δέντρων"
            elif name in ("category", "expense_category", "income_category"):
                field.empty_label = "Όλες οι κατηγορίες"
            elif name in ("vendor", "customer", "expense"):
                field.empty_label = "— Καμία επιλογή —"
        if name == "document_type" and isinstance(field, forms.ChoiceField):
            field.choices = [c for c in field.choices if not c[0]] + EL_DOCUMENT_CHOICES if any(not c[0] for c in field.choices) else EL_DOCUMENT_CHOICES
        if name == "tax" and isinstance(field, forms.ChoiceField):
            has_empty = any(not c[0] or c[0] == "all" for c in field.choices)
            field.choices = ([("all", "Όλα")] if has_empty else []) + [("taxed", "Μόνο με σήμανση"), ("untaxed", "Χωρίς σήμανση")]
        if name == "preset" and isinstance(field, forms.ChoiceField):
            field.choices = [("custom", "Custom / Χειροκίνητα"), ("today", "Σήμερα / Today"),
                             ("last_30", "Τελευταίες 30 ημ. / Last 30 days"),
                             ("month", "Μήνας / Month"), ("quarter", "Τρίμηνο / Quarter"),
                             ("semester", "Εξάμηνο / Semester"), ("year", "Έτος / Year")]
            field.label = "Περίοδος" if in_greek() else "Period"
    return form


def preset_date_range(preset):
    """Return (start, end) for a date preset, or (None, None) for custom."""
    import calendar

    today = timezone.localdate()
    if preset == "today":
        return today, today
    if preset == "last_30":
        return today - timezone.timedelta(days=29), today
    if preset == "month":
        last = calendar.monthrange(today.year, today.month)[1]
        return today.replace(day=1), today.replace(day=last)
    if preset == "quarter":
        q = (today.month - 1) // 3
        start_month = q * 3 + 1
        end_month = start_month + 2
        last = calendar.monthrange(today.year, end_month)[1]
        return today.replace(month=start_month, day=1), today.replace(month=end_month, day=last)
    if preset == "semester":
        if today.month <= 6:
            return today.replace(month=1, day=1), today.replace(month=6, day=30)
        return today.replace(month=7, day=1), today.replace(month=12, day=31)
    if preset == "year":
        return today.replace(month=1, day=1), today.replace(month=12, day=31)
    return None, None


DATE_PRESET_CHOICES = [("custom", "Custom"), ("today", "Today"), ("last_30", "Last 30 days"),
                       ("month", "Month"), ("quarter", "Quarter"),
                       ("semester", "Semester"), ("year", "Year")]


def apply_preset_to_cleaned(data):
    """Override start/end from preset when a non-custom preset is chosen."""
    preset = (data.get("preset") or "custom")
    if preset and preset != "custom":
        start, end = preset_date_range(preset)
        if start and end:
            data["start"], data["end"] = start, end
    return data


class LoginForm(AuthenticationForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        style_fields(self.fields)
        apply_greek_labels(self)
        self.fields["username"].widget.attrs["autocomplete"] = "username"
        self.fields["password"].widget.attrs["autocomplete"] = "current-password"


class SignupForm(UserCreationForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        style_fields(self.fields)
        apply_greek_labels(self)
        self.fields["username"].widget.attrs["autocomplete"] = "username"
        self.fields["password1"].widget.attrs["autocomplete"] = "new-password"
        self.fields["password2"].widget.attrs["autocomplete"] = "new-password"


class OwnedForm(forms.ModelForm):
    """Attach ownership before validation and restrict related selections."""

    def __init__(self, *args, profile, **kwargs):
        super().__init__(*args, **kwargs)
        self.instance.profile = profile
        for field in self.fields.values():
            if isinstance(field, forms.ModelChoiceField):
                field.queryset = field.queryset.filter(profile=profile)
        style_fields(self.fields)
        apply_greek_labels(self)

    def _post_clean(self):
        super()._post_clean()
        # ModelForm excludes non-editable ownership from constraint validation.
        if not self.errors:
            try:
                self.instance.validate_constraints()
            except ValidationError as error:
                self.add_error(None, error)

    def clean_amount(self):
        amount = self.cleaned_data["amount"]
        if amount <= 0:
            raise ValidationError("Εισάγετε ποσό μεγαλύτερο του μηδενός." if in_greek() else "Enter an amount greater than zero.")
        return amount


class FarmForm(OwnedForm):
    class Meta:
        model = Farm
        fields = ["title", "size", "active"]

    def clean_size(self):
        size = self.cleaned_data["size"]
        if size <= 0:
            raise ValidationError("Εισάγετε έκταση μεγαλύτερη του μηδενός." if in_greek() else "Enter a size greater than zero.")
        return size


class ExpenseForm(OwnedForm):
    class Meta:
        model = Expense
        fields = ["title", "date", "amount", "farm", "split_basis", "split_tree_type", "category", "vendor", "document_type", "include_in_tax", "is_paid", "is_archived", "description"]
        widgets = {"date": forms.DateInput(format="%Y-%m-%d", attrs={"type": "date"})}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if "farm" in self.fields:
            self.fields["farm"].required = False
            self.fields["farm"].empty_label = (
                "Όλες οι φάρμες — αυτόματος επιμερισμός" if in_greek()
                else "All farms — auto split"
            )
        if "split_tree_type" in self.fields:
            self.fields["split_tree_type"].required = False
            self.fields["split_basis"].required = False
            if in_greek():
                self.fields["split_basis"].label = "Βάση επιμερισμού"
                self.fields["split_basis"].choices = [
                    ("trees", "Δέντρα (σύνολο)"), ("tree_type", "Δέντρο/Καλλιέργεια (ποικιλία)"),
                    ("area", "Στρέμματα"), ("equal", "Ίσα"),
                ]
                self.fields["split_tree_type"].label = "Δέντρο/Καλλιέργεια"
            else:
                self.fields["split_basis"].choices = [
                    ("trees", "Trees (total)"), ("tree_type", "Tree/Crop (variety)"),
                    ("area", "Stremmata"), ("equal", "Equal"),
                ]

    def clean(self):
        data = super().clean()
        if not data.get("split_basis"):
            data["split_basis"] = "trees"
        if data.get("farm") and data.get("split_basis") == "tree_type" and not data.get("split_tree_type"):
            # Farm-bound expenses ignore split settings; clear them.
            data["split_basis"] = "trees"
        if not data.get("farm") and data.get("split_basis") == "tree_type" and not data.get("split_tree_type"):
            raise ValidationError({"split_tree_type": "Διαλέξτε δέντρο/καλλιέργεια." if in_greek() else "Choose a tree/crop."})
        return data


class IncomeForm(OwnedForm):
    allocation_basis = forms.ChoiceField(
        required=False, label="Auto split",
        choices=[("", "Manual allocations"), ("trees", "Trees (total)"), ("tree_type", "Tree/Crop (variety)"),
                 ("area", "Stremmata"), ("equal", "Equal")],
        help_text="Fill farm allocations automatically when no manual rows are given.",
    )
    allocation_tree_type = forms.ModelChoiceField(queryset=TreeType.objects.none(), required=False)

    class Meta:
        model = Income
        fields = ["title", "date", "amount", "quantity", "unit", "unit_price",
                  "category", "customer", "document_type", "include_in_tax", "is_archived", "description"]
        widgets = {"date": forms.DateInput(format="%Y-%m-%d", attrs={"type": "date"})}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        profile = self.instance.profile
        self.fields["allocation_tree_type"].queryset = TreeType.objects.filter(profile=profile)
        for name in ("quantity", "unit_price"):
            self.fields[name].required = False
        self.fields["unit"].required = False
        self.fields["unit"].choices = [("", "—"), ("kg", "Kg"), ("tn", "Tn"), ("l", "L")]
        self.fields["quantity"].help_text = "Optional, informational only."
        self.fields["unit_price"].help_text = "Optional, informational only."
        if in_greek():
            self.fields["quantity"].label = "Ποσότητα (προαιρετικά)"
            self.fields["unit"].label = "Μονάδα (προαιρετικά)"
            self.fields["unit"].choices = [("", "—"), ("kg", "Κιλά"), ("tn", "Τόνοι"), ("l", "Λίτρα")]
            self.fields["unit_price"].label = "Τιμή μονάδας (προαιρετικά)"
        if in_greek():
            self.fields["allocation_basis"].label = "Αυτόματη κατανομή"
            self.fields["allocation_basis"].choices = [
                ("", "Χειροκίνητες κατανομές"), ("trees", "Δέντρα (σύνολο)"),
                ("tree_type", "Δέντρο/Καλλιέργεια (ποικιλία)"),
                ("area", "Στρέμματα"), ("equal", "Ίσα"),
            ]
            self.fields["allocation_basis"].help_text = "Συμπληρώνει αυτόματα τις κατανομές όταν δεν δώσετε χειροκίνητες γραμμές."
            self.fields["allocation_tree_type"].label = "Δέντρο/Καλλιέργεια"

    def clean(self):
        data = super().clean()
        if data.get("allocation_basis") == "tree_type" and not data.get("allocation_tree_type"):
            raise ValidationError({"allocation_tree_type": "Διαλέξτε δέντρο/καλλιέργεια." if in_greek() else "Choose a tree/crop."})
        for name in ("quantity", "unit_price"):
            value = data.get(name)
            if value is not None and value <= 0:
                msg = "Εισάγετε τιμή μεγαλύτερη του μηδενός." if in_greek() else "Enter a value greater than zero."
                raise ValidationError({name: msg})
        return data


class IncomeAllocationForm(forms.ModelForm):
    class Meta:
        model = IncomeFarmAllocation
        fields = ["farm", "amount"]

    def __init__(self, *args, profile, **kwargs):
        super().__init__(*args, **kwargs)
        self.profile = profile
        self.instance.profile = profile
        self.fields["farm"].queryset = Farm.objects.filter(profile=profile)
        style_fields(self.fields)
        apply_greek_labels(self)

    def clean_amount(self):
        amount = self.cleaned_data["amount"]
        if amount <= 0:
            raise ValidationError("Εισάγετε ποσό κατανομής μεγαλύτερο του μηδενός." if in_greek() else "Enter an allocation greater than zero.")
        return amount


class BaseIncomeAllocationFormSet(forms.BaseInlineFormSet):
    def __init__(self, *args, **kwargs):
        self.profile = kwargs.get("form_kwargs", {}).get("profile")
        super().__init__(*args, **kwargs)

    def clean(self):
        super().clean()
        if any(self.errors):
            return
        farms = set()
        total = 0
        for form in self.forms:
            if not form.cleaned_data or form.cleaned_data.get("DELETE"):
                continue
            farm = form.cleaned_data.get("farm")
            amount = form.cleaned_data.get("amount")
            if farm in farms:
                raise ValidationError("Each farm can be selected only once." if not in_greek() else "Κάθε φάρμα μπορεί να επιλεγεί μόνο μία φορά.")
            if farm:
                farms.add(farm)
            if amount:
                total += amount
        income_amount = self.instance.amount or 0
        if total > income_amount:
            raise ValidationError("Farm allocations cannot exceed the income amount." if not in_greek() else "Οι κατανομές δεν μπορούν να ξεπερνούν το ποσό του εσόδου.")

    def save_new(self, form, commit=True):
        obj = super().save_new(form, commit=False)
        obj.profile = self.profile
        if commit:
            obj.save()
        return obj


IncomeAllocationFormSet = forms.inlineformset_factory(
    Income, IncomeFarmAllocation, form=IncomeAllocationForm,
    formset=BaseIncomeAllocationFormSet, extra=3, can_delete=True,
)


class VendorForm(OwnedForm):
    class Meta:
        model = Vendor
        fields = ["name", "email", "phone", "address", "notes"]


class CustomerForm(OwnedForm):
    class Meta:
        model = Customer
        fields = ["name", "email", "phone", "address", "notes"]


class ExpenseCategoryForm(OwnedForm):
    class Meta:
        model = ExpenseCategory
        fields = ["name"]


class IncomeCategoryForm(OwnedForm):
    class Meta:
        model = IncomeCategory
        fields = ["name"]


class TreeTypeForm(OwnedForm):
    class Meta:
        model = TreeType
        fields = ["name"]


class TreePlantingForm(OwnedForm):
    class Meta:
        model = TreePlanting
        fields = ["farm", "tree_type", "count", "planted_on", "notes"]
        widgets = {"planted_on": forms.DateInput(format="%Y-%m-%d", attrs={"type": "date"})}

    def clean_count(self):
        count = self.cleaned_data["count"]
        if count < 0:
            raise ValidationError("Εισάγετε αριθμό δέντρων μη αρνητικό." if in_greek() else "Enter a non-negative number of trees.")
        return count


class TreeMovementForm(forms.Form):
    farm = forms.ModelChoiceField(queryset=Farm.objects.none())
    tree_type = forms.ModelChoiceField(queryset=TreeType.objects.none())
    action = forms.ChoiceField(choices=TreeInventoryMovement.ACTIONS)
    quantity = forms.IntegerField(min_value=1)
    effective_date = forms.DateField(widget=forms.DateInput(format="%Y-%m-%d", attrs={"type": "date"}),
                                     initial=timezone.localdate)
    notes = forms.CharField(required=False, widget=forms.Textarea)

    def __init__(self, *args, profile, **kwargs):
        super().__init__(*args, **kwargs)
        self.profile = profile
        self.fields["farm"].queryset = Farm.objects.filter(profile=profile)
        self.fields["tree_type"].queryset = TreeType.objects.filter(profile=profile)
        style_fields(self.fields)
        apply_greek_labels(self)
        if in_greek():
            self.fields["action"].choices = [("add", "Προσθήκη"), ("remove", "Αφαίρεση")]

    def clean_quantity(self):
        quantity = self.cleaned_data["quantity"]
        if quantity <= 0:
            raise ValidationError("Εισάγετε πλήθος μεγαλύτερο του μηδενός." if in_greek() else "Enter a quantity greater than zero.")
        return quantity


class TaskCategoryForm(OwnedForm):
    class Meta:
        model = TaskCategory
        fields = ["name"]


class FarmTaskForm(OwnedForm):
    class Meta:
        model = FarmTask
        fields = ["title", "date", "farm", "planting", "category", "expense", "description"]
        widgets = {"date": forms.DateInput(format="%Y-%m-%d", attrs={"type": "date"})}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        farm = None
        data_farm = (self.data.get("farm") if self.data else None) or getattr(self.instance, "farm_id", None)
        try:
            farm = Farm.objects.get(pk=data_farm) if data_farm else None
        except (Farm.DoesNotExist, ValueError, TypeError):
            farm = None
        if "planting" in self.fields:
            queryset = TreePlanting.objects.select_related("farm", "tree_type").filter(count__gt=0)
            if self.instance.planting_id:
                queryset = TreePlanting.objects.select_related("farm", "tree_type").filter(
                    Q(count__gt=0) | Q(pk=self.instance.planting_id))
            if farm is not None:
                queryset = queryset.filter(farm=farm)
            self.fields["planting"].queryset = queryset.filter(profile=self.instance.profile)
            self.fields["planting"].required = False
        if "expense" in self.fields:
            expenses = Expense.objects.select_related("farm").filter(
                Q(is_archived=False) | Q(pk=getattr(self.instance, "expense_id", None)))
            if farm is not None:
                expenses = expenses.filter(Q(farm=farm) | Q(farm__isnull=True))
            self.fields["expense"].queryset = expenses.filter(profile=self.instance.profile)
            self.fields["expense"].required = False
        apply_greek_labels(self)

    def clean(self):
        data = super().clean()
        farm = data.get("farm")
        planting = data.get("planting")
        if farm and planting and planting.farm_id != farm.id:
            raise ValidationError({"planting": "Η ομάδα δέντρων πρέπει να ανήκει στην επιλεγμένη φάρμα." if in_greek() else "Tree group must belong to the selected farm."})
        expense = data.get("expense")
        if farm and expense and expense.farm_id and expense.farm_id != farm.id:
            raise ValidationError({"expense": "Το έξοδο πρέπει να ανήκει στην επιλεγμένη φάρμα." if in_greek() else "Expense must belong to the selected farm."})
        return data


class ProfileForm(forms.ModelForm):
    class Meta:
        model = Profile
        fields = ["display_name"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        style_fields(self.fields)
        apply_greek_labels(self)


class DropboxSettingsForm(forms.ModelForm):
    class Meta:
        model = Profile
        fields = ["dropbox_app_key", "dropbox_app_secret"]
        widgets = {
            "dropbox_app_key": forms.TextInput(attrs={"autocomplete": "off"}),
            "dropbox_app_secret": forms.PasswordInput(render_value=True, attrs={"autocomplete": "off"}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            field.required = False
        style_fields(self.fields)
        if in_greek():
            self.fields["dropbox_app_key"].label = "Dropbox App Key"
            self.fields["dropbox_app_secret"].label = "Dropbox App Secret"
            self.fields["dropbox_app_key"].help_text = "Από dropbox.com/developers → το app σου."
            self.fields["dropbox_app_secret"].help_text = "Μυστικό κλειδί του app (αποθηκεύεται στον χώρο εργασίας)."
        else:
            self.fields["dropbox_app_key"].label = "Dropbox App Key"
            self.fields["dropbox_app_secret"].label = "Dropbox App Secret"
            self.fields["dropbox_app_key"].help_text = "From dropbox.com/developers → your app."
            self.fields["dropbox_app_secret"].help_text = "App secret (stored in your workspace)."

    def clean(self):
        data = super().clean()
        key = (data.get("dropbox_app_key") or "").strip()
        secret = (data.get("dropbox_app_secret") or "").strip()
        if bool(key) != bool(secret):
            msg = "Συμπληρώστε και τα δύο πεδία (key + secret) ή κανένα." if in_greek() else "Fill both fields (key + secret) or neither."
            raise ValidationError(msg)
        data["dropbox_app_key"] = key
        data["dropbox_app_secret"] = secret
        return data


class ProductionForm(OwnedForm):
    incomes = forms.ModelMultipleChoiceField(
        queryset=Income.objects.none(), required=False,
        help_text="Optional incomes linked to this harvest.",
    )

    class Meta:
        model = Production
        fields = ["farm", "year", "tree_type", "quantity", "unit", "incomes", "notes"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        profile = self.instance.profile
        self.fields["farm"].queryset = Farm.objects.filter(profile=profile)
        self.fields["tree_type"].queryset = TreeType.objects.filter(profile=profile)
        self.fields["incomes"].queryset = Income.objects.filter(profile=profile).order_by("-date", "-id")
        if in_greek():
            self.fields["incomes"].label = "Έσοδα (προαιρετικά)"
            self.fields["year"].label = "Έτος"
            self.fields["quantity"].label = "Ποσότητα"
            self.fields["unit"].label = "Μονάδα"
            self.fields["unit"].choices = [("kg", "Κιλά"), ("tn", "Τόνοι"), ("l", "Λίτρα")]
            self.fields["tree_type"].label = "Είδος δέντρου"
        else:
            self.fields["unit"].choices = [("kg", "Kg"), ("tn", "Tn"), ("l", "L")]

    def clean_year(self):
        year = self.cleaned_data["year"]
        if year < 2000 or year > 2100:
            raise ValidationError("Enter a year between 2000 and 2100." if not in_greek() else "Εισάγετε έτος από 2000 έως 2100.")
        return year

    def clean_quantity(self):
        quantity = self.cleaned_data["quantity"]
        if quantity <= 0:
            raise ValidationError("Enter a quantity greater than zero." if not in_greek() else "Εισάγετε ποσότητα μεγαλύτερη του μηδενός.")
        return quantity

    def clean_incomes(self):
        incomes = self.cleaned_data.get("incomes")
        profile = self.instance.profile
        for income in incomes or []:
            if income.profile_id != profile.pk:
                raise ValidationError("Income must belong to the same profile." if not in_greek() else "Το έσοδο πρέπει να ανήκει στον ίδιο χώρο.")
        return incomes

    def save(self, commit=True):
        instance = super().save(commit=False)
        incomes = list(self.cleaned_data.get("incomes") or [])
        if commit:
            instance.save()
            self._save_income_links(instance, incomes)
        else:
            self._pending_incomes = incomes
        return instance

    def _save_m2m(self):
        incomes = list(self.cleaned_data.get("incomes") or [])
        self._save_income_links(self.instance, incomes)

    def _save_income_links(self, instance, incomes):
        profile = instance.profile
        existing = set(instance.income_links.values_list("income_id", flat=True))
        wanted = {income.pk for income in incomes}
        for income_id in wanted - existing:
            ProductionIncomeLink.objects.create(profile=profile, production=instance, income_id=income_id)
        if wanted - existing or existing - wanted:
            ProductionIncomeLink.objects.filter(production=instance).exclude(income_id__in=wanted).delete()

    def _post_clean(self):
        super()._post_clean()
        # _pending_incomes saved on commit=False is applied by save()/ _save_m2m.


class ProductionFilterForm(forms.Form):
    q = forms.CharField(required=False, label="Search", widget=forms.TextInput(attrs={"placeholder": "Search production…"}))
    farm = forms.ModelChoiceField(queryset=Farm.objects.none(), required=False, empty_label="All farms")
    tree_type = forms.ModelChoiceField(queryset=TreeType.objects.none(), required=False, empty_label="All tree types")
    year = forms.IntegerField(required=False, label="Year", min_value=2000, max_value=2100)
    unit = forms.ChoiceField(required=False, label="Unit",
                             choices=[("", "All units"), ("kg", "Kg"), ("tn", "Tn"), ("l", "L")])
    linked = forms.ChoiceField(required=False, label="Income link",
                               choices=[("all", "All"), ("linked", "Linked only"), ("unlinked", "Unlinked only")])

    def __init__(self, *args, profile, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["farm"].queryset = Farm.objects.filter(profile=profile)
        self.fields["tree_type"].queryset = TreeType.objects.filter(profile=profile)
        style_fields(self.fields)
        apply_greek_labels(self)
        if in_greek():
            self.fields["tree_type"].empty_label = "Όλα τα είδη"
            self.fields["unit"].choices = [("", "Όλες οι μονάδες"), ("kg", "Κιλά"), ("tn", "Τόνοι"), ("l", "Λίτρα")]
            self.fields["linked"].choices = [("all", "Όλα"), ("linked", "Μόνο συνδεδεμένα"), ("unlinked", "Χωρίς σύνδεση")]


class TransactionFilterForm(forms.Form):
    q = forms.CharField(required=False, label="Search", widget=forms.TextInput(attrs={"placeholder": "Search transactions…"}))
    preset = forms.ChoiceField(required=False, label="Period", choices=DATE_PRESET_CHOICES, initial="custom")
    farm = forms.ModelChoiceField(queryset=Farm.objects.none(), required=False, empty_label="All farms")
    category = forms.ModelChoiceField(queryset=ExpenseCategory.objects.none(), required=False, empty_label="All categories")
    contact = forms.ModelChoiceField(queryset=Vendor.objects.none(), required=False, empty_label="All contacts")
    document_type = forms.ChoiceField(required=False, label="Document",
                                      choices=[("", "All documents"), ("invoice", "Invoice"), ("receipt", "Receipt")])
    tax = forms.ChoiceField(required=False, label="Tax",
                            choices=[("all", "All records"), ("taxed", "Tax flagged only"), ("untaxed", "Unflagged only")])
    paid = forms.ChoiceField(required=False, label="Payment",
                             choices=[("all", "All"), ("paid", "Paid only"), ("unpaid", "Unpaid only")])
    start = forms.DateField(required=False, label="From", widget=forms.DateInput(attrs={"type": "date"}))
    end = forms.DateField(required=False, label="To", widget=forms.DateInput(attrs={"type": "date"}))

    def __init__(self, *args, profile, resource="expenses", **kwargs):
        super().__init__(*args, **kwargs)
        from incomes.models import Customer, IncomeCategory

        self.fields["farm"].queryset = Farm.objects.filter(profile=profile)
        if resource == "incomes":
            self.fields["category"].queryset = IncomeCategory.objects.filter(profile=profile)
            self.fields["contact"].queryset = Customer.objects.filter(profile=profile)
            self.fields["contact"].label = "Customer"
            contact_all = "All customers"
            contact_all_el = "Όλοι οι πελάτες"
            del self.fields["paid"]
        else:
            self.fields["category"].queryset = ExpenseCategory.objects.filter(profile=profile)
            self.fields["contact"].queryset = Vendor.objects.filter(profile=profile)
            self.fields["contact"].label = "Vendor"
            contact_all = "All vendors"
            contact_all_el = "Όλοι οι προμηθευτές"
        self.fields["category"].empty_label = "All categories"
        self.fields["contact"].empty_label = contact_all
        style_fields(self.fields)
        apply_greek_labels(self)
        # Generic field names escape the analytics-specific Greek empty
        # labels, so set the localized versions explicitly.
        if in_greek():
            self.fields["category"].empty_label = "Όλες οι κατηγορίες"
            self.fields["contact"].empty_label = contact_all_el
            self.fields["contact"].label = "Πελάτης" if resource == "incomes" else "Προμηθευτής"
            if "paid" in self.fields:
                self.fields["paid"].choices = [("all", "Όλα"), ("paid", "Μόνο πληρωμένα"),
                                                ("unpaid", "Μόνο απλήρωτα")]

    def clean(self):
        data = super().clean()
        apply_preset_to_cleaned(data)
        if data.get("start") and data.get("end") and data["start"] > data["end"]:
            raise ValidationError("Η τελική ημερομηνία πρέπει να είναι ίδια ή μεταγενέστερη της αρχικής." if in_greek() else "The end date must be on or after the start date.")
        return data


class TaskFilterForm(forms.Form):
    q = forms.CharField(required=False, label="Search", widget=forms.TextInput(attrs={"placeholder": "Search tasks…"}))
    preset = forms.ChoiceField(required=False, label="Period", choices=DATE_PRESET_CHOICES, initial="custom")
    farm = forms.ModelChoiceField(queryset=Farm.objects.none(), required=False, empty_label="All farms")
    planting = forms.ModelChoiceField(queryset=TreePlanting.objects.none(), required=False, empty_label="All tree groups")
    category = forms.ModelChoiceField(queryset=TaskCategory.objects.none(), required=False, empty_label="All categories")
    start = forms.DateField(required=False, label="From", widget=forms.DateInput(attrs={"type": "date"}))
    end = forms.DateField(required=False, label="To", widget=forms.DateInput(attrs={"type": "date"}))

    def __init__(self, *args, profile, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["farm"].queryset = Farm.objects.filter(profile=profile)
        self.fields["planting"].queryset = TreePlanting.objects.filter(profile=profile).select_related("farm", "tree_type")
        self.fields["category"].queryset = TaskCategory.objects.filter(profile=profile)
        style_fields(self.fields)
        apply_greek_labels(self)

    def clean(self):
        data = super().clean()
        apply_preset_to_cleaned(data)
        if data.get("start") and data.get("end") and data["start"] > data["end"]:
            raise ValidationError("Η τελική ημερομηνία πρέπει να είναι ίδια ή μεταγενέστερη της αρχικής." if in_greek() else "The end date must be on or after the start date.")
        farm = data.get("farm")
        planting = data.get("planting")
        if farm and planting and planting.farm_id != farm.id:
            raise ValidationError("Η ομάδα δέντρων πρέπει να ανήκει στην επιλεγμένη φάρμα." if in_greek() else "The tree group must belong to the selected farm.")
        return data


class AnalyticsFilterForm(forms.Form):
    """Full-dimension filters shared by the analytics overview and reports."""

    preset = forms.ChoiceField(required=False, label="Period", choices=DATE_PRESET_CHOICES, initial="custom")
    year = forms.ChoiceField(required=False, label="Year", choices=[])
    start = forms.DateField(required=False, label="From", widget=forms.DateInput(attrs={"type": "date"}))
    end = forms.DateField(required=False, label="To", widget=forms.DateInput(attrs={"type": "date"}))
    farm = forms.ModelChoiceField(queryset=Farm.objects.none(), required=False, empty_label="All farms")
    expense_category = forms.ModelChoiceField(queryset=ExpenseCategory.objects.none(), required=False,
                                              empty_label="All expense categories")
    income_category = forms.ModelChoiceField(queryset=IncomeCategory.objects.none(), required=False,
                                             empty_label="All income categories")
    vendor = forms.ModelChoiceField(queryset=Vendor.objects.none(), required=False, empty_label="All vendors")
    customer = forms.ModelChoiceField(queryset=Customer.objects.none(), required=False, empty_label="All customers")
    document_type = forms.ChoiceField(required=False, label="Document",
                                      choices=[("", "All documents"), ("invoice", "Invoice"), ("receipt", "Receipt")])
    tax = forms.ChoiceField(required=False, label="Tax",
                            choices=[("all", "All records"), ("taxed", "Tax flagged only"), ("untaxed", "Unflagged only")])

    def __init__(self, *args, profile, **kwargs):
        super().__init__(*args, **kwargs)
        from analytics.services import available_years
        from django.utils import timezone as _tz
        years = available_years(profile)
        self.fields["year"].choices = [("", "Custom range" if self.data.get("start") or self.data.get("end") else "Select year")] + [
            (str(y), str(y)) for y in years]
        # Default the dropdown to the current year on unbound forms.
        if not self.is_bound:
            self.fields["year"].initial = str(_tz.localdate().year)
        self.fields["farm"].queryset = Farm.objects.filter(profile=profile)
        self.fields["expense_category"].queryset = ExpenseCategory.objects.filter(profile=profile)
        self.fields["income_category"].queryset = IncomeCategory.objects.filter(profile=profile)
        self.fields["vendor"].queryset = Vendor.objects.filter(profile=profile)
        self.fields["customer"].queryset = Customer.objects.filter(profile=profile)
        style_fields(self.fields)
        apply_greek_labels(self)
        if in_greek():
            self.fields["year"].choices = [("", "Επιλέξτε έτος")] + [(str(y), str(y)) for y in years]

    def clean_year(self):
        value = self.cleaned_data.get("year")
        if value in (None, ""):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            raise ValidationError("Επιλέξτε έγκυρο έτος." if in_greek() else "Select a valid year.")

    def clean(self):
        data = super().clean()
        # Preset wins over manual dates; explicit year + custom preset keeps year logic.
        if (data.get("preset") or "custom") != "custom":
            apply_preset_to_cleaned(data)
            data["year"] = None
        if data.get("start") and data.get("end") and data["start"] > data["end"]:
            raise ValidationError("Η τελική ημερομηνία πρέπει να είναι ίδια ή μεταγενέστερη της αρχικής." if in_greek() else "The end date must be on or after the start date.")
        return data


class BackupUploadForm(forms.Form):
    """Upload a workspace JSON backup plus the restore mode."""

    backup_file = forms.FileField()
    mode = forms.ChoiceField(choices=[("replace", "Replace"), ("merge", "Merge")],
                             initial="replace", widget=forms.RadioSelect)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        style_fields(self.fields)
        if in_greek():
            self.fields["backup_file"].label = "Αρχείο αντιγράφου ασφαλείας"
            self.fields["mode"].label = "Λειτουργία επαναφοράς"
            self.fields["mode"].choices = [("replace", "Αντικατάσταση (διαγραφή τρέχοντων δεδομένων)"),
                                           ("merge", "Συγχώνευση (διατήρηση τρέχοντων δεδομένων)")]
        else:
            self.fields["backup_file"].label = "Backup file"
            self.fields["mode"].label = "Restore mode"
            self.fields["mode"].choices = [("replace", "Replace (delete current data first)"),
                                           ("merge", "Merge (keep current data)")]

    def clean_backup_file(self):
        from .backup import MAX_UPLOAD_BYTES
        upload = self.cleaned_data["backup_file"]
        if upload.size > MAX_UPLOAD_BYTES:
            raise ValidationError("Το αρχείο είναι πολύ μεγάλο (όριο 5 MB)." if in_greek()
                                  else "This file is too large (5 MB limit).")
        name = (upload.name or "").lower()
        if not (name.endswith(".json") or upload.content_type == "application/json"):
            raise ValidationError("Ανεβάστε ένα αρχείο JSON αντιγράφου ασφαλείας." if in_greek()
                                  else "Upload a JSON backup file.")
        return upload
