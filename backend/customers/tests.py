from datetime import date
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role, User
from customers.models import Client, Pet

API = '/api/v1'


class CustomerProfileTests(TestCase):
    def setUp(self):
        self.mgr = User.objects.create_user(
            username='mgr_cust', password='Password@123', role=Role.MANAGER, is_staff=True
        )
        self.api_client = APIClient()
        self.api_client.force_authenticate(self.mgr)

        self.client_obj = Client.objects.create(
            full_name='Trần Minh Quân',
            phone='0912345678',
            secondary_phone='0988222333',
            birthday=date(1990, 8, 20),
            address='123 Nguyễn Thị Minh Khai, Q1',
            email='quan.tm@example.com',
            source=Client.Source.WALK_IN,
        )

    def test_client_creation_with_secondary_phone_and_birthday(self):
        self.assertEqual(self.client_obj.secondary_phone, '0988222333')
        self.assertEqual(str(self.client_obj.birthday), '1990-08-20')

    def test_api_list_clients_includes_new_fields(self):
        res = self.api_client.get(f'{API}/clients')
        self.assertEqual(res.status_code, 200)
        items = res.data.get('results', res.data)
        item = next((i for i in items if i['id'] == self.client_obj.id), None)
        self.assertIsNotNone(item)
        self.assertEqual(item['secondary_phone'], '0988222333')
        self.assertEqual(item['birthday'], '1990-08-20')

    def test_api_update_client_secondary_phone_and_birthday(self):
        payload = {
            'secondary_phone': '0977888999',
            'birthday': '1995-10-15',
        }
        res = self.api_client.patch(f'{API}/clients/{self.client_obj.id}', payload)
        self.assertEqual(res.status_code, 200)
        self.client_obj.refresh_from_db()
        self.assertEqual(self.client_obj.secondary_phone, '0977888999')
        self.assertEqual(str(self.client_obj.birthday), '1995-10-15')

    def test_api_create_client_with_all_fields(self):
        payload = {
            'full_name': 'Lê Hoàng Nam',
            'phone': '0933111222',
            'secondary_phone': '0933444555',
            'birthday': '1992-06-25',
            'address': '456 Lê Lợi, Q1',
            'email': 'nam.lh@example.com',
            'source': 'online',
        }
        res = self.api_client.post(f'{API}/clients', payload)
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['secondary_phone'], '0933444555')
        self.assertEqual(res.data['birthday'], '1992-06-25')
        self.assertTrue(Client.objects.filter(phone='0933111222').exists())
