from django import forms
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm
from django.core.exceptions import ValidationError
from django.utils.translation import get_language

from expenses.models import Expense, ExpenseCategory, Vendor
from farm.models import Farm, FarmTask, TaskCategory, TreePlanting, TreeType
from incomes.models import Customer, Income, IncomeCategory
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
    "farm": "Φάρμα",
    "category": "Κατηγορία",
    "vendor": "Προμηθευτής",
    "customer": "Πελάτης",
    "document_type": "Τύπος παραστατικού",
    "include_in_tax": "Συμπερίληψη στην εφορία",
    "description": "Περιγραφή",
    "name": "Όνομα",
    "email": "Email",
    "phone": "Τηλέφωνο",
    "address": "Διεύθυνση",
    "notes": "Σημειώσεις",
    "size": "Έκταση (στρέμματα)",
    "active": "Ενεργή",
    "tree_type": "Είδος δέντρου",
    "count": "Πλήθος δέντρων",
    "planted_on": "Ημερομηνία φύτευσης",
    "planting": "Ομάδα δέντρων",
    "expense": "Σχετικό έξοδο",
    "display_name": "Όνομα χώρου εργασίας",
    "q": "Αναζήτηση",
    "start": "Από",
    "end": "Έως",
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
            elif name == "category":
                field.empty_label = "Όλες οι κατηγορίες"
            elif name in ("vendor", "customer", "expense"):
                field.empty_label = "— Καμία επιλογή —"
        if name == "document_type" and isinstance(field, forms.ChoiceField):
            field.choices = [c for c in field.choices if not c[0]] + EL_DOCUMENT_CHOICES if any(not c[0] for c in field.choices) else EL_DOCUMENT_CHOICES
    return form


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
        fields = ["title", "date", "amount", "farm", "category", "vendor", "document_type", "include_in_tax", "description"]
        widgets = {"date": forms.DateInput(format="%Y-%m-%d", attrs={"type": "date"})}


class IncomeForm(OwnedForm):
    class Meta:
        model = Income
        fields = ["title", "date", "amount", "farm", "category", "customer", "document_type", "include_in_tax", "description"]
        widgets = {"date": forms.DateInput(format="%Y-%m-%d", attrs={"type": "date"})}


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
        if count <= 0:
            raise ValidationError("Εισάγετε αριθμό δέντρων μεγαλύτερο του μηδενός." if in_greek() else "Enter a number of trees greater than zero.")
        return count


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
            queryset = TreePlanting.objects.select_related("farm", "tree_type")
            if farm is not None:
                queryset = queryset.filter(farm=farm)
            self.fields["planting"].queryset = queryset.filter(profile=self.instance.profile)
            self.fields["planting"].required = False
        if "expense" in self.fields:
            expenses = Expense.objects.select_related("farm")
            if farm is not None:
                expenses = expenses.filter(farm=farm)
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
        if farm and expense and expense.farm_id != farm.id:
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


class TransactionFilterForm(forms.Form):
    q = forms.CharField(required=False, label="Search", widget=forms.TextInput(attrs={"placeholder": "Search transactions…"}))
    farm = forms.ModelChoiceField(queryset=Farm.objects.none(), required=False, empty_label="All farms")
    start = forms.DateField(required=False, label="From", widget=forms.DateInput(attrs={"type": "date"}))
    end = forms.DateField(required=False, label="To", widget=forms.DateInput(attrs={"type": "date"}))

    def __init__(self, *args, profile, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["farm"].queryset = Farm.objects.filter(profile=profile)
        style_fields(self.fields)
        apply_greek_labels(self)

    def clean(self):
        data = super().clean()
        if data.get("start") and data.get("end") and data["start"] > data["end"]:
            raise ValidationError("Η τελική ημερομηνία πρέπει να είναι ίδια ή μεταγενέστερη της αρχικής." if in_greek() else "The end date must be on or after the start date.")
        return data


class TaskFilterForm(forms.Form):
    q = forms.CharField(required=False, label="Search", widget=forms.TextInput(attrs={"placeholder": "Search tasks…"}))
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
        if data.get("start") and data.get("end") and data["start"] > data["end"]:
            raise ValidationError("Η τελική ημερομηνία πρέπει να είναι ίδια ή μεταγενέστερη της αρχικής." if in_greek() else "The end date must be on or after the start date.")
        farm = data.get("farm")
        planting = data.get("planting")
        if farm and planting and planting.farm_id != farm.id:
            raise ValidationError("Η ομάδα δέντρων πρέπει να ανήκει στην επιλεγμένη φάρμα." if in_greek() else "The tree group must belong to the selected farm.")
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
