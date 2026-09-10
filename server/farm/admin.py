from django.contrib import admin

from .models import Farm, FarmTask, TaskCategory, TreePlanting, TreeType


class ProfileOwnedAdmin(admin.ModelAdmin):
    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        return queryset.filter(profile__user=request.user)

    def save_model(self, request, obj, form, change):
        from profiles.models import Profile

        obj.profile, _ = Profile.objects.get_or_create(user=request.user)
        super().save_model(request, obj, form, change)


@admin.register(Farm)
class FarmAdmin(ProfileOwnedAdmin):
    list_display = ("title", "size", "active", "updated_at")
    list_filter = ("active",)
    search_fields = ("title",)


@admin.register(TreeType)
class TreeTypeAdmin(ProfileOwnedAdmin):
    list_display = ("name", "created_at")
    search_fields = ("name",)


@admin.register(TreePlanting)
class TreePlantingAdmin(ProfileOwnedAdmin):
    list_display = ("farm", "tree_type", "count", "planted_on", "updated_at")
    list_filter = ("tree_type",)
    search_fields = ("farm__title", "tree_type__name")


@admin.register(TaskCategory)
class TaskCategoryAdmin(ProfileOwnedAdmin):
    list_display = ("name", "created_at")
    search_fields = ("name",)


@admin.register(FarmTask)
class FarmTaskAdmin(ProfileOwnedAdmin):
    list_display = ("title", "farm", "planting", "category", "date", "expense")
    list_filter = ("category", "farm")
    search_fields = ("title", "description")
    date_hierarchy = "date"
