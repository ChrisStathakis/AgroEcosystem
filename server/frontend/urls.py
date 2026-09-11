from django.contrib.auth import views as auth_views
from django.urls import path

from . import views
from .forms import LoginForm

urlpatterns = [
    path("", views.home, name="home"),
    path("accounts/signup/", views.signup, name="signup"),
    path("accounts/login/", views.LocalizedLoginView.as_view(authentication_form=LoginForm), name="login"),
    path("accounts/logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("analytics/", views.analytics, name="analytics"),
    path("analytics/profit-loss/", views.analytics_profit_loss, name="analytics-pl"),
    path("analytics/cash-flow/", views.analytics_cash_flow, name="analytics-cf"),
    path("analytics/tax/", views.analytics_tax, name="analytics-tax"),
    path("analytics/export/<str:report>/", views.analytics_export, name="analytics-export"),
    path("profile/", views.profile_settings, name="profile-settings"),
    path("workspace/backup/", views.backup_download, name="workspace-backup"),
    path("workspace/restore/", views.backup_restore, name="workspace-restore"),
    path("workspace/destroy/", views.backup_destroy, name="workspace-destroy"),
    path("trees/move/", views.tree_movement_form, name="tree-movement-create"),
    path("trees/history/", views.tree_history_all, name="tree-history-all"),
    path("trees/<int:pk>/history/", views.tree_history, name="tree-history"),
    path("<slug:resource>/", views.record_list, name="record-list"),
    path("<slug:resource>/quick-add/", views.quick_create, name="record-quick-create"),
    path("<slug:resource>/export/", views.record_export, name="record-export"),
    path("<slug:resource>/new/", views.record_form, name="record-create"),
    path("<slug:resource>/<int:pk>/edit/", views.record_form, name="record-edit"),
    path("<slug:resource>/<int:pk>/delete/", views.record_delete, name="record-delete"),
]
