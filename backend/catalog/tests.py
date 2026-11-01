from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from accounts.models import Role
from catalog.models import Service, Package, PackageItem

User = get_user_model()

class CatalogServiceDeleteTests(APITestCase):
    def setUp(self):
        self.manager = User.objects.create_user(
            username='manager_test',
            phone='0988888888',
            role=Role.MANAGER,
            full_name='Test Manager',
        )
        self.client.force_authenticate(user=self.manager)
        self.service = Service.objects.create(
            code='DV_TEST_DELETE',
            name='Dịch vụ test xóa',
            duration_minutes=30,
            species_scope='both',
            resource_type='bath_tub',
            is_active=True,
        )

    def test_cannot_delete_active_service(self):
        # Service is currently active
        res = self.client.delete(f'/api/v1/services/{self.service.id}')
        self.assertEqual(res.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)
        self.assertIn('Chỉ có thể xóa dịch vụ đã bị ẩn', str(res.data))
        self.assertTrue(Service.objects.filter(id=self.service.id).exists())

    def test_can_hide_service_then_delete(self):
        # 1. Hide service via PATCH
        res_hide = self.client.patch(f'/api/v1/services/{self.service.id}', {'is_active': False})
        self.assertEqual(res_hide.status_code, status.HTTP_200_OK)
        self.service.refresh_from_db()
        self.assertFalse(self.service.is_active)

        # 2. Now delete service
        res_del = self.client.delete(f'/api/v1/services/{self.service.id}')
        self.assertEqual(res_del.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Service.objects.filter(id=self.service.id).exists())

    def test_cannot_delete_hidden_service_if_protected_by_package(self):
        # Package protects service with PROTECT
        pkg = Package.objects.create(
            code='PKG_TEST_PROTECT',
            name='Gói test protect',
            is_active=True,
        )
        PackageItem.objects.create(package=pkg, service=self.service, position=0)

        # Hide service
        self.service.is_active = False
        self.service.save()

        # Delete should be blocked by ProtectedError handler
        res = self.client.delete(f'/api/v1/services/{self.service.id}')
        self.assertEqual(res.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)
        self.assertIn('Không thể xóa vĩnh viễn dịch vụ này', str(res.data))
        self.assertTrue(Service.objects.filter(id=self.service.id).exists())
