from django.contrib import admin

from .models import Customer, Income, IncomeCategory


class ProfileScopedAdmin(admin.ModelAdmin):
    def get_queryset(self, request):
        return super().get_queryset(request).filter(profile__user=request.user)

    def save_model(self, request, obj, form, change):
        from profiles.models import Profile

        obj.profile, _ = Profile.objects.get_or_create(user=request.user)
        super().save_model(request, obj, form, change)

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        field = super().formfield_for_foreignkey(db_field, request, **kwargs)
        if request.user.is_authenticated and hasattr(request.user, "profile"):
            if hasattr(field, "queryset") and hasattr(db_field.remote_field.model, "profile"):
                field.queryset = field.queryset.filter(profile=request.user.profile)
        return field


@admin.register(IncomeCategory)
class IncomeCategoryAdmin(ProfileScopedAdmin):
    search_fields = ("name",)


@admin.register(Income)
class IncomeAdmin(ProfileScopedAdmin):
    list_display = ("title", "farm", "category", "customer", "amount", "date", "document_type", "include_in_tax")
    list_filter = ("document_type", "include_in_tax", "category")
    search_fields = ("title", "description", "farm__title")
    autocomplete_fields = ("farm", "category", "customer")


@admin.register(Customer)
class CustomerAdmin(ProfileScopedAdmin):
    search_fields = ("name", "email", "phone")
