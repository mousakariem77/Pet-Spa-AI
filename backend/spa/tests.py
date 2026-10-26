from datetime import date, datetime, time, timedelta

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Role, User
from customers.models import Pet
from scheduling import services as sched_services
from scheduling.models import Booking
from spa.models import Resource, Spa

API = '/api/v1'


class ResourceOccupancyTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_demo', verbosity=0)
        cls.users = {u.username: u for u in User.objects.all()}

    def as_user(self, username):
        c = APIClient()
        c.force_authenticate(self.users[username])
        return c

    def test_get_resource_occupancy_endpoint(self):
        r = self.as_user('letan').get(f'{API}/resources/occupancy')
        self.assertEqual(r.status_code, 200)
        self.assertIn('summary', r.data)
        self.assertIn('resources', r.data)
        self.assertIn('by_type', r.data['summary'])
        self.assertGreater(r.data['summary']['total'], 0)

    def test_occupancy_updates_when_booking_checked_in(self):
        pet = Pet.objects.first()
        target_date = date.today() + timedelta(days=5)
        target_dt = timezone.make_aware(datetime.combine(target_date, time(10, 0)))
        booking = sched_services.create_booking(
            user=self.users['letan'],
            pet=pet,
            package_id=None,
            service_ids=[1],
            start_at=target_dt,
            confirm=True,
        )

        item = booking.items.first()
        res = Resource.objects.filter(resource_type=item.resource_type, is_active=True).first()

        # Check-in và gán tài nguyên
        sched_services.check_in(booking, self.users['letan'], assignments={item.pk: res.pk})

        # Gọi endpoint occupancy cho ngày đó
        r = self.as_user('letan').get(f'{API}/resources/occupancy?date={target_date.isoformat()}')
        self.assertEqual(r.status_code, 200)

        # Kiểm tra tài nguyên đó phải có lịch được gán
        target_res = next((x for x in r.data['resources'] if x['id'] == res.pk), None)
        self.assertIsNotNone(target_res)
        self.assertTrue(len(target_res['schedule']) > 0)
        self.assertEqual(target_res['schedule'][0]['booking_id'], booking.pk)
        self.assertEqual(target_res['schedule'][0]['pet_name'], pet.name)

    def test_occupancy_forbidden_for_customers(self):
        """Khách hàng không được phép xem sơ đồ công suất nội bộ spa (SPA-02)."""
        r = self.as_user('khach1').get(f'{API}/resources/occupancy')
        self.assertEqual(r.status_code, 403)

    def test_occupancy_summary_math_accuracy(self):
        """Kiểm tra tính toàn vẹn số liệu công suất summary và by_type (SPA-16)."""
        r = self.as_user('letan').get(f'{API}/resources/occupancy')
        self.assertEqual(r.status_code, 200)
        s = r.data['summary']
        self.assertEqual(s['total'], s['occupied'] + s['free'])
        expected_rate = round(s['occupied'] / s['total'] * 100) if s['total'] > 0 else 0
        self.assertEqual(s['rate'], expected_rate)

        # Tổng by_type phải bằng tổng summary
        by_type = s['by_type']
        sum_total = sum(v['total'] for v in by_type.values())
        sum_occ = sum(v['occupied'] for v in by_type.values())
        sum_free = sum(v['free'] for v in by_type.values())
        self.assertEqual(sum_total, s['total'])
        self.assertEqual(sum_occ, s['occupied'])
        self.assertEqual(sum_free, s['free'])

    def test_overbooking_capacity_block(self):
        """SPA-16: Chặn overbooking khi tài nguyên vật lý cùng loại đã hết chỗ."""
        from accounts.errors import Conflict
        pets = list(Pet.objects.all()[:3])
        target_date = date.today() + timedelta(days=6)
        target_dt = timezone.make_aware(datetime.combine(target_date, time(10, 0)))

        # bath_basic cần resource_type = bath_tub (hệ thống có 2 bồn tắm)
        sched_services.create_booking(self.users['letan'], pets[0], None, [1], target_dt, confirm=True)
        sched_services.create_booking(self.users['letan'], pets[1], None, [1], target_dt, confirm=True)

        # Lượt thứ 3 trùng khung giờ cố đặt lịch đã bị chặn vật lý ngay tại check_slot (SPA-16)
        with self.assertRaises(Conflict) as ctx:
            sched_services.create_booking(self.users['letan'], pets[2], None, [1], target_dt, confirm=True)
        self.assertEqual(ctx.exception.get_codes(), 'resource_full')

    def test_invalid_lifecycle_transitions_for_reception(self):
        """SPA-15: Chặn các thao tác chuyển trạng thái không hợp lệ tại bàn lễ tân."""
        from accounts.errors import Conflict
        pet = Pet.objects.first()
        target_date = date.today() + timedelta(days=7)
        target_dt = timezone.make_aware(datetime.combine(target_date, time(11, 0)))

        # 1. Không thể check-in lịch pending chưa confirm
        b_pending = sched_services.create_booking(self.users['khach1'], pet, None, [1], target_dt, confirm=False)
        with self.assertRaises(Conflict) as ctx:
            sched_services.check_in(b_pending, self.users['letan'])
        self.assertEqual(ctx.exception.get_codes(), 'invalid_transition')

        # 2. Không thể check-out lịch khi chưa hoàn tất (ví dụ đang in_progress)
        sched_services.confirm(b_pending, self.users['letan'])
        staff = self.users['ktv1'].staff_profile
        sched_services.assign_staff(b_pending, staff.pk, self.users['letan'])
        sched_services.check_in(b_pending, self.users['letan'])
        sched_services.start(b_pending, self.users['quanly'])

        with self.assertRaises(Conflict) as ctx:
            sched_services.check_out(b_pending, self.users['letan'])
        self.assertEqual(ctx.exception.get_codes(), 'invalid_transition')

        # 3. Hoàn tất dịch vụ rồi check-out thành công
        sched_services.complete(b_pending, self.users['quanly'])
        checked_out_b = sched_services.check_out(b_pending, self.users['letan'])
        self.assertIsNotNone(checked_out_b.checked_out_at)

        # 4. Không thể check-out lần 2
        with self.assertRaises(Conflict) as ctx:
            sched_services.check_out(b_pending, self.users['letan'])
        self.assertEqual(ctx.exception.get_codes(), 'invalid_transition')


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
