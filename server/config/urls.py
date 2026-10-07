from django.contrib import admin
from django.urls import include, path
from django.conf.urls.i18n import i18n_patterns

urlpatterns = [
    path('i18n/', include('django.conf.urls.i18n')),
]

urlpatterns += i18n_patterns(
    path('admin/', admin.site.urls),
    path('', include('frontend.urls')),
)

# Greek is the default: also serve the same pages without any prefix,
# so `/` (desktop app, bookmarks) opens the Greek version directly.
# `/el/` keeps working, `/en/` serves English.
urlpatterns += [
    path('', include('frontend.urls')),
]
