from datetime import date, datetime, time, timedelta

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from billing.models import Invoice
from catalog.models import Package, Service
from customers.models import Pet
from notifications.models import Notification
from scheduling.models import Booking
from spa.models import StaffProfile

API = '/api/v1'


def at(days, hour, minute=0):
    d = date.today() + timedelta(days=days)
    return timezone.make_aware(datetime.combine(d, time(hour, minute))).isoformat()


class BaseCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_demo', verbosity=0)
        cls.users = {u.username: u for u in User.objects.all()}
        cls.pet = Pet.objects.get(name='Bông')      # của khach1
        cls.other = Pet.objects.get(name='Kem')     # của khách khác
        cls.svc = {s.code: s.pk for s in Service.objects.all()}
        cls.ktv1 = StaffProfile.objects.get(user__username='ktv1')

    def as_user(self, username):
        c = APIClient()
        c.force_authenticate(self.users[username])
        return c


class BookingFlowTests(BaseCase):
    def _book(self, who='khach1', pet=None, services=('bath_basic',), days=10, hour=9, **extra):
        body = dict(pet=(pet or self.pet).pk, services=[self.svc[s] for s in services],
                    start_at=at(days, hour), **extra)
        return self.as_user(who).post(f'{API}/bookings', body, format='json')

    def test_customer_booking_is_pending_and_notifies_front_desk(self):
        r = self._book()
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['status'], 'pending')
        self.assertTrue(Notification.objects.filter(user=self.users['letan'], kind='booking_new').exists())

    def test_front_desk_booking_is_confirmed(self):
        r = self._book('letan', staff=self.ktv1.pk)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['status'], 'confirmed')
        self.assertEqual(r.data['staff'], self.ktv1.pk)

    def test_customer_cannot_book_other_customers_pet(self):
        self.assertEqual(self._book(pet=self.other).status_code, 404)

    def test_customer_cannot_see_other_bookings(self):
        ids = {b['id'] for b in self.as_user('khach1').get(f'{API}/bookings').data['results']}
        self.assertTrue(ids)
        self.assertTrue(all(Booking.objects.get(pk=i).client.user_id == self.users['khach1'].pk for i in ids))

    def test_outside_hours_rejected(self):
        r = self._book(hour=20)
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.data['code'], 'outside_hours')

    def test_past_time_rejected_for_customer(self):
        self.assertEqual(self._book(days=-1).status_code, 422)

    def test_resource_capacity_blocks_third_overlap(self):
        # Phòng spa chỉ có 1 -> hai lịch spa mèo chồng giờ phải bị chặn
        mimi, sua = Pet.objects.get(name='Mimi'), Pet.objects.get(name='Sữa')
        self.assertEqual(self._book('letan', pet=mimi, services=('cat_spa',), hour=10).status_code, 201)
        r = self._book('letan', pet=sua, services=('cat_spa',), hour=10)
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.data['code'], 'resource_full')

    def test_same_pet_cannot_overlap(self):
        self.assertEqual(self._book('letan').status_code, 201)
        r = self._book('letan', services=('nail_trim',), hour=9)
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.data['code'], 'pet_busy')

    def test_staff_cannot_double_book(self):
        self.assertEqual(self._book('letan', staff=self.ktv1.pk).status_code, 201)
        r = self._book('letan', pet=self.other, staff=self.ktv1.pk)
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.data['code'], 'staff_busy')

    def test_package_price_matches_size_and_items_sum(self):
        pkg = Package.objects.get(code='basic')
        r = self.as_user('letan').post(f'{API}/bookings/quote', dict(
            pet=self.pet.pk, package=pkg.pk, start_at=at(10, 9)), format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data['feasible'])
        self.assertEqual(sum(float(i['unit_price']) for i in r.data['items']), float(r.data['total_price']))
        self.assertEqual(float(r.data['total_price']), float(pkg.prices.get(size_class=self.pet.size_class).price))

    def test_species_mismatch_rejected(self):
        r = self._book('letan', services=('cat_spa',))   # Bông là chó
        self.assertEqual(r.status_code, 422)

    def test_no_vaccination_warning_in_quote(self):
        mimi = Pet.objects.get(name='Mimi')   # chưa tiêm
        r = self.as_user('khach1').post(f'{API}/bookings/quote', dict(
            pet=mimi.pk, services=[self.svc['cat_spa']], start_at=at(10, 9)), format='json')
        self.assertEqual(r.data['warnings'][0]['code'], 'no_vaccination')

    def test_availability_lists_slots(self):
        r = self.as_user('khach1').get(f'{API}/bookings/availability', dict(
            pet=self.pet.pk, services=str(self.svc['bath_basic']), date=(date.today() + timedelta(days=10)).isoformat()))
        self.assertEqual(r.status_code, 200)
        self.assertTrue(any(s['available'] for s in r.data))

    def test_full_lifecycle_to_payment(self):
        letan, ktv = self.as_user('letan'), self.as_user('ktv1')
        b = self._book(services=('bath_basic',)).data['id']
        self.assertEqual(letan.post(f'{API}/bookings/{b}/confirm').status_code, 200)
        self.assertEqual(letan.post(f'{API}/bookings/{b}/assign-staff', dict(staff=self.ktv1.pk), format='json').status_code, 200)
        r = letan.post(f'{API}/bookings/{b}/check-in')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(all(i['resource'] for i in r.data['items']))
        self.assertEqual(ktv.post(f'{API}/bookings/{b}/start').status_code, 200)
        r = ktv.post(f'{API}/bookings/{b}/complete')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['invoice']['status'], 'unpaid')
        inv = Invoice.objects.get(booking_id=b)
        self.assertEqual(inv.total, Booking.objects.get(pk=b).total_price)
        r = letan.post(f'{API}/bookings/{b}/check-out')
        self.assertEqual(r.data['warnings'][0]['code'], 'unpaid')
        r = letan.post(f'{API}/invoices/{inv.pk}/pay', dict(payment_method='cash'), format='json')
        self.assertEqual(r.data['status'], 'paid')
        # không thu hai lần
        self.assertEqual(letan.post(f'{API}/invoices/{inv.pk}/pay', dict(payment_method='cash'), format='json').status_code, 409)

    def test_invalid_transition(self):
        b = self._book('letan').data['id']
        self.assertEqual(self.as_user('letan').post(f'{API}/bookings/{b}/start').status_code, 403)
        r = self.as_user('quanly').post(f'{API}/bookings/{b}/start')
        self.assertEqual(r.status_code, 409)
        self.assertIn(r.data['code'], ('invalid_transition', 'no_staff'))
        r = self.as_user('letan').post(f'{API}/bookings/{b}/confirm')
        self.assertEqual(r.data['code'], 'invalid_transition')

    def test_cancel_requires_reason_for_staff(self):
        b = self._book().data['id']
        r = self.as_user('letan').post(f'{API}/bookings/{b}/cancel', {}, format='json')
        self.assertEqual(r.status_code, 422)
        r = self.as_user('letan').post(f'{API}/bookings/{b}/cancel', dict(reason='Hết ca'), format='json')
        self.assertEqual(r.data['cancel_reason_code'], 'rejected')

    def test_customer_cancel_cutoff(self):
        # lịch confirmed bắt đầu sau 1 giờ nữa (< 2 giờ) -> khách không tự hủy được
        soon = (timezone.now() + timedelta(hours=1)).isoformat()
        b = Booking.objects.filter(client__user=self.users['khach1']).first()
        b.status, b.start_at, b.end_at = 'confirmed', soon, (timezone.now() + timedelta(hours=2))
        b.save()
        r = self.as_user('khach1').post(f'{API}/bookings/{b.pk}/cancel', {}, format='json')
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.data['code'], 'cancel_too_late')

    def test_cancelled_frees_slot(self):
        b = self._book('letan', services=('cat_spa',), pet=Pet.objects.get(name='Mimi')).data['id']
        self.as_user('letan').post(f'{API}/bookings/{b}/cancel', dict(reason='Khách đổi ý'), format='json')
        r = self._book('letan', services=('cat_spa',), pet=Pet.objects.get(name='Sữa'))
        self.assertEqual(r.status_code, 201, r.data)


class RoleScopeTests(BaseCase):
    def test_technician_sees_only_assigned_bookings_and_pets(self):
        r = self.as_user('ktv1').get(f'{API}/bookings')
        self.assertTrue(r.data['results'])
        self.assertTrue(all(b['staff'] == self.ktv1.pk for b in r.data['results']))
        pets = self.as_user('ktv1').get(f'{API}/pets').data['results']
        self.assertTrue(pets)
        # ktv3 không thấy thú của ktv1 (ví dụ Kem)
        names3 = {p['name'] for p in self.as_user('ktv3').get(f'{API}/pets').data['results']}
        self.assertNotIn('Kem', names3)

    def test_technician_cannot_start_unassigned_booking(self):
        b = Booking.objects.filter(status='confirmed', staff__user__username='ktv3').first()
        b.status = 'checked_in'
        b.save()
        r = self.as_user('ktv1').post(f'{API}/bookings/{b.pk}/start')
        self.assertEqual(r.status_code, 404)  # không thấy lịch của người khác

    def test_technician_cannot_create_booking_or_see_invoices(self):
        r = self.as_user('ktv1').post(f'{API}/bookings', dict(
            pet=self.pet.pk, services=[self.svc['bath_basic']], start_at=at(10, 9)), format='json')
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.as_user('ktv1').get(f'{API}/invoices').data['results'], [])

    def test_customer_hides_internal_notes(self):
        r = self.as_user('khach1').get(f'{API}/bookings')
        for b in r.data['results']:
            self.assertNotIn('note_internal', b)
            self.assertNotIn('safety_note', b['pet_info'])

    def test_customer_only_own_invoices(self):
        for inv in self.as_user('khach1').get(f'{API}/invoices').data['results']:
            self.assertEqual(Invoice.objects.get(pk=inv['id']).booking.client.user_id, self.users['khach1'].pk)

    def test_void_invoice_manager_only(self):
        inv = Invoice.objects.filter(status='unpaid').first()
        self.assertEqual(self.as_user('letan').post(
            f'{API}/invoices/{inv.pk}/void', dict(reason='x'), format='json').status_code, 403)
        self.assertEqual(self.as_user('quanly').post(f'{API}/invoices/{inv.pk}/void', {}, format='json').status_code, 422)
        r = self.as_user('quanly').post(f'{API}/invoices/{inv.pk}/void', dict(reason='Nhập nhầm'), format='json')
        self.assertEqual(r.data['status'], 'void')

    def test_dashboard_front_desk_only_and_revenue_matches_invoices(self):
        self.assertEqual(self.as_user('khach1').get(f'{API}/dashboard/today').status_code, 403)
        self.assertEqual(self.as_user('ktv1').get(f'{API}/dashboard/today').status_code, 403)
        self.assertEqual(self.as_user('khach1').get(f'{API}/dashboard/daily').status_code, 403)
        r = self.as_user('letan').get(f'{API}/dashboard/today')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['unpaid_count'], Invoice.objects.filter(status='unpaid').count())
        self.assertIn('feed', r.data)
        self.assertIn('staff_on_duty', r.data)
        self.assertIn('resources_summary', r.data)
        self.assertIn('in_service_count', r.data)
        # Quản lý cũng có quyền xem dashboard ngày
        r_mgr = self.as_user('quanly').get(f'{API}/dashboard/daily')
        self.assertEqual(r_mgr.status_code, 200)
        self.assertIn('feed', r_mgr.data)

    def test_notifications_are_private(self):
        n = Notification.objects.create(user=self.users['letan'], kind='x', title='t')
        self.assertEqual(self.as_user('khach1').post(f'{API}/notifications/{n.pk}/read').status_code, 404)
        self.assertEqual(self.as_user('letan').post(f'{API}/notifications/{n.pk}/read').status_code, 200)


class StaffTests(BaseCase):
    def test_only_manager_creates_staff(self):
        body = dict(
            username='ktv9', password='Demo@12345', full_name='KTV Mới', role='technician',
            birthday='1995-05-20', gender='female', address='123 Lê Lợi, Q.1, TP.HCM'
        )
        self.assertEqual(self.as_user('letan').post(f'{API}/staff', body, format='json').status_code, 403)
        r = self.as_user('quanly').post(f'{API}/staff', body, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['birthday'], '1995-05-20')
        self.assertEqual(r.data['gender'], 'female')
        self.assertEqual(r.data['address'], '123 Lê Lợi, Q.1, TP.HCM')
        self.assertTrue(User.objects.get(username='ktv9').check_password('Demo@12345'))
        # trùng tên đăng nhập
        self.assertEqual(self.as_user('quanly').post(f'{API}/staff', body, format='json').status_code, 422)

    def test_manager_cannot_be_created_via_staff_api(self):
        body = dict(username='x1', password='Demo@12345', full_name='X', role='manager')
        self.assertEqual(self.as_user('quanly').post(f'{API}/staff', body, format='json').status_code, 422)

    def test_technician_edits_only_own_shifts(self):
        shifts = [dict(weekday=0, start_time='09:00', end_time='17:00')]
        self.assertEqual(self.as_user('ktv1').put(f'{API}/staff/{self.ktv1.pk}/shifts', shifts, format='json').status_code, 200)
        other = StaffProfile.objects.get(user__username='ktv2')
        self.assertEqual(self.as_user('ktv1').put(f'{API}/staff/{other.pk}/shifts', shifts, format='json').status_code, 403)

    def test_time_off_blocks_staff_booking(self):
        d = (date.today() + timedelta(days=10)).isoformat()
        r = self.as_user('ktv1').post(f'{API}/staff/{self.ktv1.pk}/time-off', dict(date_from=d, date_to=d), format='json')
        self.assertEqual(r.status_code, 201)
        r = self.as_user('letan').post(f'{API}/bookings', dict(
            pet=self.pet.pk, services=[self.svc['bath_basic']], start_at=at(10, 9), staff=self.ktv1.pk), format='json')
        self.assertEqual(r.data['code'], 'staff_off')

    def test_resources_manager_write_only(self):
        self.assertEqual(self.as_user('letan').post(
            f'{API}/resources', dict(name='B', resource_type='bath_tub'), format='json').status_code, 403)
        self.assertEqual(self.as_user('quanly').post(
            f'{API}/resources', dict(name='B', resource_type='bath_tub'), format='json').status_code, 201)
        self.assertEqual(self.as_user('khach1').get(f'{API}/resources').status_code, 403)


class AnalyticsTests(BaseCase):
    def test_customer_cannot_access_analytics(self):
        r = self.as_user('khach1').get(f'{API}/analytics/overview')
        self.assertEqual(r.status_code, 403)

    def test_receptionist_and_manager_can_access_analytics(self):
        for role in ('letan', 'quanly'):
            r = self.as_user(role).get(f'{API}/analytics/overview?preset=all_time')
            self.assertEqual(r.status_code, 200, r.data)
            self.assertIn('period', r.data)
            self.assertIn('financial', r.data)
            self.assertIn('bookings', r.data)
            self.assertIn('daily_trend', r.data)
            self.assertIn('top_services', r.data)
            self.assertIn('staff_performance', r.data)
            self.assertIn('insights', r.data)
            self.assertIn('ai_rebook', r.data)
            self.assertGreaterEqual(r.data['financial']['paid_invoices_count'], 0)

