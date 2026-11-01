from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from accounts.models import User, Role
from customers.models import Client, Pet
from catalog.models import Service, Package, PackageItem, ServicePrice, PackagePrice
from scheduling.models import Booking, BookingItem, BookingStatus
from billing.models import Invoice, InvoiceLine
from billing.services import create_invoice, pay, void

class BillingAPITestCase(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(
            username='quanly', password='Password@123', role=Role.MANAGER, full_name='Chủ Spa'
        )
        self.receptionist = User.objects.create_user(
            username='letan', password='Password@123', role=Role.RECEPTIONIST, full_name='Lễ Tân'
        )
        self.client_user = User.objects.create_user(
            username='khach', password='Password@123', role=Role.CUSTOMER, full_name='Khách Hàng A'
        )
        self.client_profile = Client.objects.create(
            user=self.client_user, full_name='Khách Hàng A', phone='0912345678'
        )
        self.pet = Pet.objects.create(
            client=self.client_profile, name='Lucky', species='dog', breed='Poodle',
            weight_kg=4.5, size_class='S'
        )
        self.service = Service.objects.create(name='Tắm sấy', duration_minutes=45)
        ServicePrice.objects.create(service=self.service, size_class='S', price=120000)

        now = timezone.now()
        self.booking = Booking.objects.create(
            client=self.client_profile, pet=self.pet,
            status=BookingStatus.COMPLETED,
            start_at=now - timezone.timedelta(hours=1),
            end_at=now,
            completed_at=now,
            total_price=120000
        )
        BookingItem.objects.create(
            booking=self.booking, service=self.service, resource_type='bath_tub',
            unit_price=120000, start_at=self.booking.start_at, end_at=self.booking.end_at
        )

        self.api = APIClient()

    def test_create_invoice_and_download_pdf(self):
        self.api.force_authenticate(user=self.receptionist)
        # Create invoice
        inv = create_invoice(self.booking)
        self.assertEqual(inv.total, 120000)
        self.assertEqual(inv.status, Invoice.Status.UNPAID)

        # Download PDF endpoint
        res = self.api.get(f'/api/v1/invoices/{inv.id}/pdf')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/pdf')
        self.assertIn(f'Hoa_Don_{inv.invoice_no}.pdf', res['Content-Disposition'])
        self.assertTrue(len(res.content) > 1000)

    def test_pay_invoice(self):
        self.api.force_authenticate(user=self.receptionist)
        inv = create_invoice(self.booking)
        res = self.api.post(f'/api/v1/invoices/{inv.id}/pay', {'payment_method': 'cash'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['status'], 'paid')
        self.assertEqual(res.data['payment_method'], 'cash')

    def test_void_invoice_permission(self):
        inv = create_invoice(self.booking)
        self.api.force_authenticate(user=self.receptionist)
        # Receptionist cannot void
        res = self.api.post(f'/api/v1/invoices/{inv.id}/void', {'reason': 'test'}, format='json')
        self.assertEqual(res.status_code, 403)

        # Manager can void
        self.api.force_authenticate(user=self.manager)
        res = self.api.post(f'/api/v1/invoices/{inv.id}/void', {'reason': 'Sai sót kỹ thuật'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['status'], 'void')
