from unittest import mock

from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from customers.models import Pet
from notifications.models import Notification
from scheduling.models import Booking

from .models import AiLog, AiSuggestion, KnowledgeDoc, RebookReminder

API = '/api/v1'


@override_settings(OPENROUTER_API_KEY='')  # test mặc định không gọi mạng
class AiAssistantTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_demo', verbosity=0)
        cls.users = {u.username: u for u in User.objects.all()}
        cls.bong = Pet.objects.get(name='Bông')  # Poodle dị ứng hương liệu
        cls.lu = Pet.objects.get(name='Lu')      # Poodle hoàn tất cách đây 56 ngày

    def as_user(self, username):
        c = APIClient()
        c.force_authenticate(self.users[username])
        return c

    def test_suggest_packages_blocks_contraindicated_scented_bath(self):
        # Bông có thẻ fragrance_allergy -> Gói VIP có bath_scented bị BLOCK
        r = self.as_user('khach1').post(f'{API}/ai/suggest-packages', {'pet': self.bong.id}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        pkg_names = [s['package_name'] for s in r.data]
        self.assertNotIn('Gói VIP', pkg_names)
        self.assertIn('Gói cơ bản', pkg_names)
        self.assertTrue(AiLog.objects.filter(kind='suggest_package').exists())
        self.assertTrue(AiSuggestion.objects.filter(pet=self.bong, suggestion_type='package').exists())

    def test_suggest_packages_for_dog_does_not_suggest_cat_care(self):
        r = self.as_user('khach1').post(f'{API}/ai/suggest-packages', {'pet': self.bong.id}, format='json')
        self.assertEqual(r.status_code, 200)
        pkg_names = [s['package_name'] for s in r.data]
        self.assertNotIn('Gói chăm sóc mèo', pkg_names)

    def test_suggest_staff_recommends_qualified_available_technician(self):
        b = Booking.objects.filter(status='pending').first()
        r = self.as_user('letan').post(f'{API}/ai/suggest-staff', {'booking': b.id}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(len(r.data) > 0)
        self.assertTrue(all(s['staff_name'] for s in r.data))

    def test_rebook_reminders_generated_and_approved_by_manager(self):
        # Lu hoàn tất 56 ngày trước (> 45 ngày) -> có RebookReminder
        reminders = RebookReminder.objects.filter(pet=self.lu)
        self.assertTrue(reminders.exists())
        rem = reminders.first()
        self.assertEqual(rem.status, 'suggested')

        # Quản lý duyệt nhắc -> gửi Notification trong app cho chủ
        r = self.as_user('quanly').post(f'{API}/rebook-reminders/{rem.id}/approve')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['status'], 'sent')
        if rem.client.user:
            self.assertTrue(Notification.objects.filter(user=rem.client.user, kind='rebook_reminder').exists())

    def test_knowledge_chatbot_answers_from_sop(self):
        c = APIClient()  # Chatbot công khai không cần đăng nhập
        r = c.post(f'{API}/ai/chat', {'question': 'Quy định an toàn bàn cắt tỉa như thế nào?'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn('bàn cắt tỉa', r.data['answer'].lower())
        self.assertTrue(len(r.data['sources']) > 0)

    def test_knowledge_chatbot_refuses_medical_prescription(self):
        c = APIClient()
        r = c.post(f'{API}/ai/chat', {'question': 'Chó bị nôn ra máu uống thuốc kháng sinh gì?'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertIn('bác sĩ thú y', r.data['answer'])
        self.assertEqual(r.data.get('warning'), 'medical_referral')


@override_settings(OPENROUTER_API_KEY='test-key')
class AiLlmProviderTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_demo', verbosity=0)
        cls.users = {u.username: u for u in User.objects.all()}
        cls.bong = Pet.objects.get(name='Bông')

    def as_user(self, username):
        c = APIClient()
        c.force_authenticate(self.users[username])
        return c

    @mock.patch('ai_assistant.llm_provider.urllib.request.urlopen')
    def test_chat_uses_llm_for_smalltalk_and_logs_engine(self, urlopen):
        import io, json
        body = json.dumps({'choices': [{'message': {'content': 'Dạ em chào anh/chị ạ!'}}]}).encode()
        urlopen.return_value.__enter__.return_value = io.BytesIO(body)
        r = APIClient().post(f'{API}/ai/chat', {'question': 'Xin chào'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn('em chào', r.data['answer'])
        self.assertTrue(AiLog.objects.filter(kind='chat', engine__startswith='rules-v1+').exists())

    @mock.patch('ai_assistant.llm_provider.urllib.request.urlopen', side_effect=OSError('offline'))
    def test_chat_falls_back_to_template_when_llm_fails(self, _):
        r = APIClient().post(f'{API}/ai/chat', {'question': 'Quy định an toàn bàn cắt tỉa như thế nào?'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertIn('bàn cắt tỉa', r.data['answer'].lower())
        self.assertTrue(AiLog.objects.filter(kind='chat', engine='rules-v1').exists())

    @mock.patch('ai_assistant.llm_provider.urllib.request.urlopen')
    def test_medical_question_never_reaches_llm(self, urlopen):
        r = APIClient().post(f'{API}/ai/chat', {'question': 'Chó co giật uống thuốc gì?'}, format='json')
        self.assertEqual(r.data.get('warning'), 'medical_referral')
        urlopen.assert_not_called()

    @mock.patch('ai_assistant.llm_provider.urllib.request.urlopen', side_effect=OSError('offline'))
    def test_suggestion_still_works_and_keeps_safety_when_llm_down(self, _):
        r = self.as_user('khach1').post(f'{API}/ai/suggest-packages', {'pet': self.bong.id}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertNotIn('Gói VIP', [s['package_name'] for s in r.data])


class AiDataViaApiTests(TestCase):
    """Lop AI chi duoc lay du lieu qua API, khong doc thang DB cua module nghiep vu."""

    FORBIDDEN_IMPORTS = ('catalog.models', 'customers.models', 'scheduling.models', 'spa.models',
                         'billing.models', 'accounts.models')

    @classmethod
    def setUpTestData(cls):
        call_command('seed_demo', verbosity=0)
        cls.users = {u.username: u for u in User.objects.all()}
        cls.bong = Pet.objects.get(name='B\u00f4ng')

    def as_user(self, username):
        c = APIClient()
        c.force_authenticate(self.users[username])
        return c

    def test_services_module_does_not_import_business_models(self):
        import pathlib
        src = (pathlib.Path(__file__).parent / 'services.py').read_text(encoding='utf-8')
        for mod in self.FORBIDDEN_IMPORTS:
            self.assertNotIn(f'from {mod}', src, f'services.py khong duoc import {mod}')

    def test_data_api_requires_authentication_except_knowledge(self):
        c = APIClient()
        self.assertEqual(c.get(f'{API}/ai/data/knowledge').status_code, 200)
        self.assertEqual(c.get(f'{API}/ai/data/packages').status_code, 401)
        self.assertEqual(c.get(f'{API}/ai/data/pets/{self.bong.id}').status_code, 401)

    def test_customer_cannot_read_other_customers_pet_via_data_api(self):
        other = Pet.objects.exclude(client__user=self.users['khach1']).first()
        r = self.as_user('khach1').get(f'{API}/ai/data/pets/{other.id}')
        self.assertEqual(r.status_code, 404)
        # va chuc nang AI cung bi chan theo quyen cua nguoi goi
        r = self.as_user('khach1').post(f'{API}/ai/suggest-packages', {'pet': other.id}, format='json')
        self.assertEqual(r.status_code, 404)

    def test_staff_candidates_api_is_front_desk_only(self):
        b = Booking.objects.filter(status='pending').first()
        self.assertEqual(self.as_user('khach1').get(f'{API}/ai/data/bookings/{b.id}/staff-candidates').status_code, 403)
        self.assertEqual(self.as_user('letan').get(f'{API}/ai/data/bookings/{b.id}/staff-candidates').status_code, 200)

    def test_chat_reads_knowledge_through_api(self):
        from unittest import mock as m
        with m.patch('ai_assistant.services.AiDataClient.knowledge_chunks', return_value=[
            {'id': 1, 'heading': 'Gio mo cua', 'text': 'Spa mo cua 8h den 18h', 'doc_title': 'Test'},
        ]) as called:
            with override_settings(OPENROUTER_API_KEY=''):
                r = APIClient().post(f'{API}/ai/chat', {'question': 'mo cua gio nao'}, format='json')
        called.assert_called_once()
        self.assertIn('8h den 18h', r.data['answer'])
