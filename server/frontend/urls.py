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
    path("profile/", views.profile_settings, name="profile-settings"),
    path("workspace/backup/", views.backup_download, name="workspace-backup"),
    path("workspace/restore/", views.backup_restore, name="workspace-restore"),
    path("workspace/destroy/", views.backup_destroy, name="workspace-destroy"),
    path("<slug:resource>/", views.record_list, name="record-list"),
    path("<slug:resource>/export/", views.record_export, name="record-export"),
    path("<slug:resource>/new/", views.record_form, name="record-create"),
    path("<slug:resource>/<int:pk>/edit/", views.record_form, name="record-edit"),
    path("<slug:resource>/<int:pk>/delete/", views.record_delete, name="record-delete"),
]
