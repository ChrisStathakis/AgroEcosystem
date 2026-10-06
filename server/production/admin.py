from django.contrib import admin

from .models import Production, ProductionIncomeLink


class ProfileScopedAdmin(admin.ModelAdmin):
    def get_queryset(self, request):
        return super().get_queryset(request).filter(profile__user=request.user)

    def save_model(self, request, obj, form, change):
        from profiles.models import Profile

        obj.profile, _ = Profile.objects.get_or_create(user=request.user)
        super().save_model(request, obj, form, change)


@admin.register(Production)
class ProductionAdmin(ProfileScopedAdmin):
    list_display = ("year", "farm", "tree_type", "quantity", "unit", "updated_at")
    list_filter = ("year", "unit", "farm", "tree_type")
    search_fields = ("farm__title", "tree_type__name", "notes")
    autocomplete_fields = ("farm", "tree_type")


@admin.register(ProductionIncomeLink)
class ProductionIncomeLinkAdmin(ProfileScopedAdmin):
    list_display = ("production", "income")
    list_filter = ("production__year", "production__farm")
    search_fields = ("production__farm__title", "income__title")
