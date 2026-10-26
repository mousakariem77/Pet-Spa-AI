from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import SimpleRouter

from ai_assistant import views as ai
from billing import views as billing
from catalog import views as catalog
from customers import views as customers
from notifications import views as notifications
from scheduling import views as scheduling
from scheduling.analytics_views import AnalyticsOverviewView
from spa import staff_views
from spa.views import SpaView

router = SimpleRouter(trailing_slash=False)
router.register('services', catalog.ServiceViewSet, basename='service')
router.register('packages', catalog.PackageViewSet, basename='package')
router.register('size-bands', catalog.SizeBandViewSet, basename='sizeband')
router.register('specialties', catalog.SpecialtyViewSet, basename='specialty')
router.register('health-tags', catalog.HealthTagViewSet, basename='healthtag')
router.register('clients', customers.ClientViewSet, basename='client')
router.register('pets', customers.PetViewSet, basename='pet')
router.register('staff', staff_views.StaffViewSet, basename='staff')
router.register('resources', staff_views.ResourceViewSet, basename='resource')
router.register('bookings', scheduling.BookingViewSet, basename='booking')
router.register('invoices', billing.InvoiceViewSet, basename='invoice')
router.register('notifications', notifications.NotificationViewSet, basename='notification')
router.register('rebook-reminders', ai.RebookReminderViewSet, basename='rebook-reminder')
router.register('ai/logs', ai.AiLogViewSet, basename='ai-log')
router.register('ai/knowledge-docs', ai.KnowledgeDocViewSet, basename='knowledge-doc')
router.register('service-contraindications', ai.ServiceContraindicationViewSet, basename='service-contraindication')

api_patterns = [
    path('auth/', include('accounts.urls')),
    path('spa', SpaView.as_view()),
    path('dashboard/today', scheduling.DashboardView.as_view()),
    path('dashboard/daily', scheduling.DashboardView.as_view()),
    path('analytics/overview', AnalyticsOverviewView.as_view()),
    path('clients/me', customers.MyClientView.as_view()),  # trước router để không bị nhầm pk
    path('ai/suggest-packages', ai.AiPackageSuggestionView.as_view()),
    path('ai/suggest-staff', ai.AiStaffSuggestionView.as_view()),
    path('ai/suggestions/<int:pk>/decide', ai.AiSuggestionDecideView.as_view()),
    path('ai/chat', ai.AiChatView.as_view()),
    path('', include(router.urls)),
]

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/', include(api_patterns)),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
