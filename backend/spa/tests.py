from datetime import time
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role, User
from spa.models import Spa

API = '/api/v1'


class SpaProfileApiTests(TestCase):
    def setUp(self):
        self.mgr = User.objects.create_user(
            username='mgr', password='Password@123', role=Role.MANAGER, is_staff=True
        )
        self.rec = User.objects.create_user(
            username='rec', password='Password@123', role=Role.RECEPTIONIST, is_staff=True
        )
        self.client_mgr = APIClient()
        self.client_mgr.force_authenticate(self.mgr)

        self.client_rec = APIClient()
        self.client_rec.force_authenticate(self.rec)

        self.client_anon = APIClient()

        # Tạo sẵn hồ sơ spa
        self.spa = Spa.objects.create(
            id=1,
            name='Spa Thú Y Lông Mượt',
            phone='0283000000',
            email='lienhe@longmuot.example',
            address='25 Lê Văn Thịnh, TP. Thủ Đức, TP.HCM',
            open_time=time(8, 0),
            close_time=time(19, 0),
            open_weekdays=[0, 1, 2, 3, 4, 5, 6],
            slot_minutes=30,
            cancel_cutoff_hours=2,
        )

    def test_get_spa_public(self):
        res = self.client_anon.get(f'{API}/spa')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['name'], 'Spa Thú Y Lông Mượt')
        self.assertEqual(res.data['open_time'], '08:00:00')
        self.assertEqual(res.data['close_time'], '19:00:00')

    def test_patch_spa_permission(self):
        # Khách vãng lai không được sửa
        res_anon = self.client_anon.patch(f'{API}/spa', {'name': 'Spa Hacker'})
        self.assertEqual(res_anon.status_code, 401)

        # Lễ tân không có quyền sửa hồ sơ spa
        res_rec = self.client_rec.patch(f'{API}/spa', {'name': 'Spa Lễ Tân'})
        self.assertEqual(res_rec.status_code, 403)

        # Quản lý được phép sửa
        res_mgr = self.client_mgr.patch(f'{API}/spa', {'name': 'Spa Pet Mới'})
        self.assertEqual(res_mgr.status_code, 200)
        self.assertEqual(res_mgr.data['name'], 'Spa Pet Mới')

    def test_patch_spa_validates_times(self):
        # Giờ đóng cửa trước giờ mở cửa
        res = self.client_mgr.patch(f'{API}/spa', {
            'open_time': '10:00:00',
            'close_time': '09:00:00',
        }, format='json')
        self.assertEqual(res.status_code, 422)

    def test_patch_spa_validates_empty_name(self):
        res = self.client_mgr.patch(f'{API}/spa', {'name': '   '}, format='json')
        self.assertEqual(res.status_code, 422)

    def test_patch_spa_validates_open_weekdays(self):
        # Không được để danh sách ngày mở cửa trống
        res = self.client_mgr.patch(f'{API}/spa', {'open_weekdays': []}, format='json')
        self.assertEqual(res.status_code, 422)

    def test_patch_spa_validates_slot_minutes(self):
        # Bước slot < 5 phút
        res = self.client_mgr.patch(f'{API}/spa', {'slot_minutes': 2}, format='json')
        self.assertEqual(res.status_code, 422)
