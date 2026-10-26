from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role, User
from catalog.models import HealthTag, SizeBand
from customers.models import Client, Pet
from spa.models import Spa

API = '/api/v1'


def make_user(username, role, **kw):
    return User.objects.create_user(username=username, password='Matkhau@123', role=role, **kw)


def login(username):
    c = APIClient()
    r = c.post(f'{API}/auth/login', {'username': username, 'password': 'Matkhau@123'}, format='json')
    assert r.status_code == 200, r.content
    c.credentials(HTTP_AUTHORIZATION=f"Token {r.json()['token']}")
    return c


class BaseCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        for sp, bands in {'dog': [('S', 0, 7), ('M', 7, 15)]}.items():
            for size, lo, hi in bands:
                SizeBand.objects.create(species=sp, size_class=size, min_kg=lo, max_kg=hi)
        cls.mgr = make_user('mgr', Role.MANAGER)
        cls.rec = make_user('rec', Role.RECEPTIONIST)
        cls.tech = make_user('tech', Role.TECHNICIAN)
        cls.cust_a = make_user('ka', Role.CUSTOMER, full_name='A', phone='0911')
        cls.cust_b = make_user('kb', Role.CUSTOMER, full_name='B', phone='0922')
        cls.client_a = Client.objects.create(user=cls.cust_a, full_name='A', phone='0911')
        cls.client_b = Client.objects.create(user=cls.cust_b, full_name='B', phone='0922')
        cls.pet_a = Pet.objects.create(
            client=cls.client_a, name='Bông', species='dog', weight_kg=5, allergy_note='Không')
        cls.pet_b = Pet.objects.create(
            client=cls.client_b, name='Lu', species='dog', weight_kg=9, allergy_note='Không')


class AuthTests(BaseCase):
    def test_register_creates_customer_and_client(self):
        c = APIClient()
        r = c.post(f'{API}/auth/register', {
            'username': 'moi', 'password': 'Matkhau@123', 'full_name': 'Khách Mới', 'phone': '0933',
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()['user']['role'], 'customer')
        self.assertTrue(Client.objects.filter(user__username='moi').exists())

    def test_register_cannot_choose_role(self):
        c = APIClient()
        r = c.post(f'{API}/auth/register', {
            'username': 'x', 'password': 'Matkhau@123', 'full_name': 'X', 'phone': '0944',
            'role': 'manager',
        }, format='json')
        self.assertEqual(r.json()['user']['role'], 'customer')

    def test_login_wrong_password_uses_vietnamese_error(self):
        r = APIClient().post(f'{API}/auth/login', {'username': 'mgr', 'password': 'sai'}, format='json')
        self.assertEqual(r.status_code, 422)
        self.assertEqual(r.json()['code'], 'validation_error')

    def test_unauthenticated_is_401(self):
        r = APIClient().get(f'{API}/auth/me')
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.json()['code'], 'not_authenticated')

    def test_register_auto_links_existing_walkin_client(self):
        walkin = Client.objects.create(full_name='Khách Tại Quầy', phone='0988', source=Client.Source.WALK_IN)
        pet = Pet.objects.create(client=walkin, name='Miu', species='cat', weight_kg=3.5, allergy_note='Không')

        c = APIClient()
        r = c.post(f'{API}/auth/register', {
            'username': 'khach_quay', 'password': 'Matkhau@123', 'full_name': 'Khách Tại Quầy', 'phone': '0988',
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertTrue(r.json().get('linked_existing_client'))

        walkin.refresh_from_db()
        self.assertIsNotNone(walkin.user)
        self.assertEqual(walkin.user.username, 'khach_quay')
        # Thú cưng vẫn thuộc về client này
        self.assertEqual(walkin.pets.first().name, 'Miu')

    def test_register_duplicate_phone_rejected(self):
        c = APIClient()
        r = c.post(f'{API}/auth/register', {
            'username': 'trung_phone', 'password': 'Matkhau@123', 'full_name': 'Trùng', 'phone': '0911',
        }, format='json')
        self.assertEqual(r.status_code, 422)
        self.assertIn('phone', r.json()['fields'])

    def test_login_with_phone_number(self):
        c = APIClient()
        # client_a có phone '0911', user 'ka'
        r = c.post(f'{API}/auth/login', {'username': '0911', 'password': 'Matkhau@123'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['user']['username'], 'ka')

    def test_admin_reset_password(self):
        client = login('rec')
        r = client.post(f'{API}/auth/users/{self.cust_a.id}/reset-password', {
            'new_password': 'MatkhauMoi@123',
        }, format='json')
        self.assertEqual(r.status_code, 200)

        # Đăng nhập lại với mật khẩu mới
        c = APIClient()
        r2 = c.post(f'{API}/auth/login', {'username': 'ka', 'password': 'MatkhauMoi@123'}, format='json')
        self.assertEqual(r2.status_code, 200)

    def test_forgot_password_otp_flow(self):
        c = APIClient()

        # 1. Yêu cầu OTP cho SĐT không tồn tại -> Lỗi 422
        r = c.post(f'{API}/auth/forgot-password/request-otp', {'phone': '0999999999'}, format='json')
        self.assertEqual(r.status_code, 422)

        # 2. Yêu cầu OTP cho SĐT '0911' (khách hàng ka) -> Thành công 200
        r = c.post(f'{API}/auth/forgot-password/request-otp', {'phone': '0911'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()['success'])
        otp_code = r.json()['dev_otp']
        self.assertEqual(len(otp_code), 6)

        # 3. Yêu cầu OTP lại ngay lập tức -> Cooldown 429
        r_cooldown = c.post(f'{API}/auth/forgot-password/request-otp', {'phone': '0911'}, format='json')
        self.assertEqual(r_cooldown.status_code, 429)

        # 4. Verify OTP sai -> 422
        r_verify_wrong = c.post(f'{API}/auth/forgot-password/verify-otp', {
            'phone': '0911', 'otp_code': '000000',
        }, format='json')
        self.assertEqual(r_verify_wrong.status_code, 422)

        # 5. Verify OTP đúng -> 200
        r_verify = c.post(f'{API}/auth/forgot-password/verify-otp', {
            'phone': '0911', 'otp_code': otp_code,
        }, format='json')
        self.assertEqual(r_verify.status_code, 200)

        # 6. Reset mật khẩu không khớp -> 422
        r_mismatch = c.post(f'{API}/auth/forgot-password/reset', {
            'phone': '0911', 'otp_code': otp_code,
            'new_password': 'NewPassword@123', 'confirm_password': 'MismatchPassword@123',
        }, format='json')
        self.assertEqual(r_mismatch.status_code, 422)

        # 7. Reset mật khẩu thành công -> 200
        r_reset = c.post(f'{API}/auth/forgot-password/reset', {
            'phone': '0911', 'otp_code': otp_code,
            'new_password': 'NewPassword@123', 'confirm_password': 'NewPassword@123',
        }, format='json')
        self.assertEqual(r_reset.status_code, 200)

        # 8. Đăng nhập ngay bằng mật khẩu mới
        r_login = c.post(f'{API}/auth/login', {'username': 'ka', 'password': 'NewPassword@123'}, format='json')
        self.assertEqual(r_login.status_code, 200)

    def test_get_me_returns_profile_data(self):
        c = login('ka')
        r = c.get(f'{API}/auth/me')
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data['username'], 'ka')
        self.assertEqual(data['role'], 'customer')
        self.assertEqual(data['phone'], '0911')
        self.assertIn('date_joined', data)

    def test_patch_me_updates_user_and_client(self):
        c = login('ka')
        r = c.patch(f'{API}/auth/me', {
            'full_name': 'Khách A Mới',
            'phone': '0911999888',
            'email': 'khacha@example.com',
            'allow_reminders': False,
        }, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['full_name'], 'Khách A Mới')
        self.assertEqual(r.json()['phone'], '0911999888')

        self.cust_a.refresh_from_db()
        self.assertEqual(self.cust_a.full_name, 'Khách A Mới')
        self.client_a.refresh_from_db()
        self.assertEqual(self.client_a.full_name, 'Khách A Mới')
        self.assertEqual(self.client_a.phone, '0911999888')
        self.assertFalse(self.client_a.allow_reminders)

    def test_patch_me_duplicate_phone_rejected(self):
        c = login('ka')
        # phone 0922 thuộc về client_b/cust_b
        r = c.patch(f'{API}/auth/me', {'phone': '0922'}, format='json')
        self.assertEqual(r.status_code, 422)
        self.assertIn('phone', r.json()['fields'])

    def test_change_password_flow(self):
        c = login('ka')
        # 1. Mật khẩu cũ sai
        r_bad_old = c.post(f'{API}/auth/change-password', {
            'old_password': 'WrongPassword@123',
            'new_password': 'NewPassword@999',
            'confirm_password': 'NewPassword@999',
        }, format='json')
        self.assertEqual(r_bad_old.status_code, 422)

        # 2. Mật khẩu mới trùng mật khẩu cũ
        r_same = c.post(f'{API}/auth/change-password', {
            'old_password': 'Matkhau@123',
            'new_password': 'Matkhau@123',
            'confirm_password': 'Matkhau@123',
        }, format='json')
        self.assertEqual(r_same.status_code, 422)

        # 3. Mật khẩu xác nhận không khớp
        r_mismatch = c.post(f'{API}/auth/change-password', {
            'old_password': 'Matkhau@123',
            'new_password': 'NewPassword@999',
            'confirm_password': 'DifferentPassword@999',
        }, format='json')
        self.assertEqual(r_mismatch.status_code, 422)

        # 4. Đổi mật khẩu thành công
        r_ok = c.post(f'{API}/auth/change-password', {
            'old_password': 'Matkhau@123',
            'new_password': 'NewPassword@999',
            'confirm_password': 'NewPassword@999',
        }, format='json')
        self.assertEqual(r_ok.status_code, 200)
        new_token = r_ok.json()['token']

        # 5. Token cũ không còn dùng được
        r_old_token = c.get(f'{API}/auth/me')
        self.assertEqual(r_old_token.status_code, 401)

        # 6. Dùng token mới gọi auth/me thành công
        c_new = APIClient()
        c_new.credentials(HTTP_AUTHORIZATION=f'Token {new_token}')
        self.assertEqual(c_new.get(f'{API}/auth/me').status_code, 200)



class CustomerScopeTests(BaseCase):
    def test_customer_sees_only_own_pets(self):
        r = login('ka').get(f'{API}/pets')
        names = [p['name'] for p in r.json()['results']]
        self.assertEqual(names, ['Bông'])

    def test_customer_cannot_open_other_pet(self):
        r = login('ka').get(f'{API}/pets/{self.pet_b.id}')
        self.assertEqual(r.status_code, 404)

    def test_customer_cannot_list_clients(self):
        self.assertEqual(login('ka').get(f'{API}/clients').status_code, 403)

    def test_customer_never_sees_internal_safety_note(self):
        self.pet_a.safety_note = 'Hay cắn'
        self.pet_a.save()
        r = login('ka').get(f'{API}/pets/{self.pet_a.id}')
        self.assertNotIn('safety_note', r.json())

    def test_customer_creates_pet_for_self_only(self):
        r = login('ka').post(f'{API}/pets', {
            'client': self.client_b.id, 'name': 'Mới', 'species': 'dog',
            'weight_kg': '3.0', 'allergy_note': 'Không',
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(Pet.objects.get(name='Mới').client_id, self.client_a.id)

    def test_staff_sees_all_pets(self):
        r = login('rec').get(f'{API}/pets')
        self.assertEqual(r.json()['count'], 2)

    def test_technician_cannot_create_or_see_unassigned_pets(self):
        c = login('tech')
        self.assertEqual(c.get(f'{API}/pets').json()['count'], 0)
        r = c.post(f'{API}/pets', {
            'client': self.client_a.id, 'name': 'X', 'species': 'dog',
            'weight_kg': '3', 'allergy_note': 'Không'}, format='json')
        self.assertEqual(r.status_code, 403)


class PetRulesTests(BaseCase):
    def test_allergy_note_required(self):
        r = login('rec').post(f'{API}/pets', {
            'client': self.client_a.id, 'name': 'T', 'species': 'dog',
            'weight_kg': '3', 'allergy_note': '  '}, format='json')
        self.assertEqual(r.status_code, 422)
        self.assertIn('allergy_note', r.json()['fields'])

    def test_size_derived_from_weight(self):
        self.assertEqual(Pet.objects.get(pk=self.pet_a.pk).size_class, 'S')
        self.assertEqual(Pet.objects.get(pk=self.pet_b.pk).size_class, 'M')

    def test_vaccination_duplicate_rejected(self):
        c = login('rec')
        body = {'vaccine_name': 'Dại', 'date_given': '2026-01-10'}
        self.assertEqual(c.post(f'{API}/pets/{self.pet_a.id}/vaccinations', body, format='json').status_code, 201)
        self.assertEqual(c.post(f'{API}/pets/{self.pet_a.id}/vaccinations', body, format='json').status_code, 422)

    def test_phone_unique_among_active_clients(self):
        r = login('rec').post(f'{API}/clients', {'full_name': 'Trùng', 'phone': '0911'}, format='json')
        self.assertEqual(r.status_code, 422)

    def test_delete_is_soft(self):
        r = login('rec').delete(f'{API}/pets/{self.pet_a.id}')
        self.assertEqual(r.status_code, 204)
        self.assertFalse(Pet.objects.get(pk=self.pet_a.pk).is_active)

    def test_technician_can_edit_only_safety_fields(self):
        # kỹ thuật viên chưa thấy thú nào (chưa có lịch) nên không sửa được qua API
        r = login('tech').patch(f'{API}/pets/{self.pet_a.id}', {'safety_note': 'x'}, format='json')
        self.assertEqual(r.status_code, 404)


class CatalogAndSpaTests(BaseCase):
    def test_catalog_public_read_manager_write(self):
        anon = APIClient()
        self.assertEqual(anon.get(f'{API}/services').status_code, 200)
        body = {'code': 's1', 'name': 'Tắm', 'duration_minutes': 30, 'resource_type': 'bath_tub'}
        self.assertEqual(anon.post(f'{API}/services', body, format='json').status_code, 401)
        self.assertEqual(login('rec').post(f'{API}/services', body, format='json').status_code, 403)
        self.assertEqual(login('mgr').post(f'{API}/services', body, format='json').status_code, 201)

    def test_inactive_services_hidden_from_public(self):
        m = login('mgr')
        sid = m.post(f'{API}/services', {
            'code': 's2', 'name': 'Ẩn', 'duration_minutes': 30, 'resource_type': 'bath_tub',
        }, format='json').json()['id']
        m.delete(f'{API}/services/{sid}')
        self.assertEqual(len(APIClient().get(f'{API}/services').json()), 0)
        self.assertEqual(len(m.get(f'{API}/services').json()), 1)

    def test_set_prices_validates_size(self):
        m = login('mgr')
        sid = m.post(f'{API}/services', {
            'code': 's3', 'name': 'G', 'duration_minutes': 30, 'resource_type': 'bath_tub',
        }, format='json').json()['id']
        bad = m.put(f'{API}/services/{sid}/prices', {'prices': {'XXL': 1}}, format='json')
        self.assertEqual(bad.status_code, 422)
        ok = m.put(f'{API}/services/{sid}/prices', {'prices': {'S': 100000, 'M': 150000}}, format='json')
        self.assertEqual(ok.json()['prices'], {'S': 100000, 'M': 150000})

    def test_spa_public_get_manager_patch(self):
        from datetime import time
        Spa.objects.create(name='Spa', open_time=time(8), close_time=time(19), open_weekdays=[0, 1])
        self.assertEqual(APIClient().get(f'{API}/spa').json()['name'], 'Spa')
        self.assertEqual(login('rec').patch(f'{API}/spa', {'name': 'X'}, format='json').status_code, 403)
        r = login('mgr').patch(f'{API}/spa', {'name': 'Mới'}, format='json')
        self.assertEqual(r.json()['name'], 'Mới')
        bad = login('mgr').patch(f'{API}/spa', {'close_time': '07:00:00'}, format='json')
        self.assertEqual(bad.status_code, 422)

    def test_health_tags_require_login(self):
        HealthTag.objects.create(code='x', name_vi='X', kind='allergy')
        self.assertEqual(APIClient().get(f'{API}/health-tags').status_code, 401)
        self.assertEqual(login('ka').get(f'{API}/health-tags').status_code, 200)
