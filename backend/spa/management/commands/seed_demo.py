"""Nạp dữ liệu mẫu cho demo (NFR-11). Chạy lại nhiều lần không tạo trùng.

    python manage.py seed_demo
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounts.models import Role, User
from billing import services as billing_services
from billing.models import Invoice
from catalog.models import (
    HealthTag, Package, PackageItem, PackagePrice, ResourceType, Service, ServicePrice,
    SizeBand, Specialty,
)
from customers.models import Client, Pet, PetVaccination
from scheduling.models import Booking, BookingItem, BookingStatus, BookingStatusLog
from scheduling.services import build_items
from spa.models import Resource, Spa, StaffProfile, WorkShift

DEMO_PASSWORD = 'Demo@12345'
SIZES = ['XS', 'S', 'M', 'L', 'XL']
SIZE_FACTOR = [1.0, 1.2, 1.5, 1.9, 2.4]

SIZE_BANDS = {
    'dog': [('XS', 0, 3), ('S', 3, 7), ('M', 7, 15), ('L', 15, 30), ('XL', 30, 100)],
    'cat': [('XS', 0, 3), ('S', 3, 4.5), ('M', 4.5, 6), ('L', 6, 8), ('XL', 8, 30)],
}

SPECIALTIES = [('bath', 'Tắm'), ('poodle_cut', 'Cắt Poodle'), ('cat_spa', 'Spa mèo')]

HEALTH_TAGS = [
    ('fragrance_allergy', 'Dị ứng hương liệu', 'allergy'),
    ('dermatitis', 'Viêm da', 'skin_condition'),
    ('skin_sensitive', 'Da nhạy cảm', 'skin_condition'),
    ('aggressive', 'Hay cắn / hung dữ', 'behavior'),
]

# code, name, category, phút, loài, tài nguyên, chuyên môn, giá size XS, mô tả
SERVICES = [
    ('bath_basic', 'Tắm cơ bản', 'bath', 45, 'both', ResourceType.BATH_TUB, 'bath', 100000,
     'Tắm sữa tắm thường, xả sạch.'),
    ('bath_scented', 'Tắm dưỡng dầu hương liệu', 'bath', 60, 'both', ResourceType.BATH_TUB, 'bath', 150000,
     'Tắm dưỡng lông bằng dầu có hương liệu.'),
    ('bath_unscented', 'Tắm dưỡng không hương liệu', 'bath', 60, 'both', ResourceType.BATH_TUB, 'bath', 170000,
     'Tắm dưỡng cho da nhạy cảm, không hương liệu.'),
    ('cut_style', 'Cắt tỉa tạo kiểu', 'grooming', 60, 'dog', ResourceType.GROOMING_TABLE, 'poodle_cut', 200000,
     'Cắt tỉa tạo kiểu theo giống.'),
    ('nail_trim', 'Cắt móng', 'grooming', 20, 'both', ResourceType.GROOMING_TABLE, None, 50000,
     'Cắt và mài móng.'),
    ('ear_clean', 'Vệ sinh tai', 'ear', 15, 'both', ResourceType.GROOMING_TABLE, None, 60000,
     'Vệ sinh tai bằng dung dịch chuyên dụng.'),
    ('blow_dry', 'Sấy khô', 'other', 30, 'both', ResourceType.DRYING_CAGE, None, 70000,
     'Sấy khô trong chuồng sấy.'),
    ('cat_spa', 'Spa thư giãn cho mèo', 'spa', 60, 'cat', ResourceType.SPA_ROOM, 'cat_spa', 220000,
     'Spa thư giãn, chải lông, massage nhẹ.'),
]

# code, name, loài, loại lông, tuổi tối thiểu, các dịch vụ
PACKAGES = [
    ('vip', 'Gói VIP', 'dog', ['curly', 'long'], 6,
     ['bath_scented', 'cut_style', 'ear_clean']),
    ('basic', 'Gói cơ bản', 'both', [], 2,
     ['bath_basic', 'blow_dry', 'nail_trim']),
    ('cat_care', 'Gói chăm sóc mèo', 'cat', [], 3,
     ['cat_spa', 'ear_clean', 'bath_unscented']),
]

# tên, SĐT chính, SĐT phụ/Zalo, ngày sinh, tài khoản (nếu có)
CLIENTS = [
    ('Nguyễn Thu Hà', '0901234567', '0909888111', date(1994, 5, 12), 'khach1'),
    ('Trần Minh Quân', '0912345678', '0988222333', date(1990, 8, 20), None),
    ('Lê Phương Anh', '0983456789', '0977333444', date(1996, 11, 3), None),
    ('Phạm Quốc Bảo', '0974567890', '', date(1988, 3, 15), None),
    ('Võ Ngọc Diệp', '0935678901', '0911555666', date(1995, 7, 28), None),
    ('Đặng Hoài Nam', '0866789012', '', date(1992, 12, 10), None),
    ('Bùi Khánh Linh', '0887890123', '0933777888', date(1998, 9, 25), None),
    ('Hoàng Gia Huy', '0778901234', '', date(1993, 1, 18), None),
    ('Ngô Thanh Mai', '0359012345', '0855999000', date(1997, 6, 30), None),
    ('Đỗ Tuấn Kiệt', '0389123456', '', date(1991, 10, 5), None),
]

# chủ (index), tên, loài, giống, lông, sinh cách đây (tháng), cân nặng, thẻ, dị ứng, tiêm phòng?
PETS = [
    (0, 'Bông', 'dog', 'Poodle', 'curly', 24, '4.5', ['fragrance_allergy', 'skin_sensitive'],
     'Dị ứng hương liệu, da nhạy cảm', True),
    (0, 'Mimi', 'cat', 'Mèo Anh lông ngắn', 'short', 18, '4.2', [], 'Không', False),  # mèo chưa tiêm
    (1, 'Lu', 'dog', 'Poodle', 'curly', 36, '5.0', [], 'Không', True),
    (2, 'Kem', 'dog', 'Corgi', 'double', 30, '11.0', [], 'Không', True),
    (3, 'Mực', 'dog', 'Phú Quốc', 'short', 48, '18.0', ['aggressive'], 'Không', True),
    (4, 'Tuyết', 'cat', 'Ba Tư', 'long', 20, '4.0', ['skin_sensitive'], 'Không', True),
    (5, 'Bơ', 'dog', 'Golden Retriever', 'long', 40, '28.0', [], 'Không', True),
    (6, 'Nu', 'dog', 'Chihuahua', 'short', 14, '2.2', [], 'Không', True),
    (7, 'Sữa', 'cat', 'Munchkin', 'short', 12, '3.3', [], 'Không', True),
    (8, 'Bắp', 'dog', 'Shiba', 'double', 26, '9.0', ['dermatitis'], 'Viêm da, tránh chất tẩy mạnh', True),
    (9, 'Tít', 'dog', 'Poodle', 'curly', 10, '3.0', [], 'Không', True),
    (9, 'Gạo', 'cat', 'Mèo ta', 'short', 30, '4.8', [], 'Không', True),
]

# Tài nguyên: (tên, loại)
RESOURCES = (
    [(f'Bồn tắm {i}', ResourceType.BATH_TUB) for i in (1, 2)]
    + [(f'Bàn cắt {i}', ResourceType.GROOMING_TABLE) for i in (1, 2, 3)]
    + [(f'Chuồng sấy {i}', ResourceType.DRYING_CAGE) for i in (1, 2, 3, 4)]
    + [('Phòng spa 1', ResourceType.SPA_ROOM)]
)

# Lịch mẫu: (thú, gói|None, [dịch vụ], ngày lệch, giờ, ktv, trạng thái, đã thu?)
BOOKINGS = [
    ('Lu', 'vip', [], -56, 9, 'ktv2', 'completed', True),
    ('Kem', 'basic', [], -10, 9, 'ktv1', 'completed', True),
    ('Mực', None, ['bath_basic'], -9, 10, 'ktv1', 'completed', True),
    ('Bơ', 'basic', [], -38, 14, 'ktv1', 'completed', True),
    ('Tuyết', 'cat_care', [], -6, 9, 'ktv3', 'completed', True),
    ('Nu', None, ['bath_basic', 'nail_trim'], -4, 15, 'ktv1', 'completed', True),
    ('Bắp', None, ['bath_unscented'], -3, 10, 'ktv1', 'completed', False),
    ('Mimi', None, ['cat_spa'], -2, 11, 'ktv3', 'completed', True),
    ('Gạo', None, ['cat_spa'], -5, 13, 'ktv3', 'cancelled', False),
    ('Tít', None, ['bath_basic', 'blow_dry'], 0, 9, 'ktv1', 'in_progress', False),
    ('Sữa', None, ['cat_spa'], 0, 16, 'ktv3', 'confirmed', False),
    ('Bông', 'vip', [], 1, 10, None, 'pending', False),
    ('Mực', None, ['bath_basic'], 1, 15, None, 'pending', False),
    ('Kem', 'vip', [], 2, 9, 'ktv2', 'confirmed', False),
    ('Tuyết', 'cat_care', [], 3, 14, 'ktv3', 'confirmed', False),
]


def months_ago(n):
    return date.today() - timedelta(days=int(n * 30.4))


class Command(BaseCommand):
    help = 'Nạp dữ liệu mẫu: 1 spa, 5 tài khoản nhân sự, 10 khách, 12 thú, 8 dịch vụ, 3 gói, 12 tài nguyên, 15 lịch.'

    def handle(self, *args, **options):
        self._seed()
        self.stdout.write(self.style.SUCCESS(
            f'Da nap du lieu mau. Mat khau tat ca tai khoan demo: {DEMO_PASSWORD}'))
        self.stdout.write('Tai khoan: quanly, letan, ktv1, ktv2, ktv3, khach1')

    @transaction.atomic
    def _seed(self):
        self._spa()
        self._users()
        specs = self._specialties()
        tags = self._health_tags()
        self._size_bands()
        services = self._services(specs)
        self._packages(services)
        self._clients_and_pets(tags)
        self._staff_and_resources()
        self._bookings()
        self._walk_ins()
        self._ai_data()
        self._seed_notifications()

    def _spa(self):
        Spa.objects.update_or_create(id=1, defaults=dict(
            name='Spa Thú Y Lông Mượt', phone='02838229999', email='lienhe@longmuot.example',
            address='25 Lê Văn Thịnh, P. Bình Trưng Tây, TP. Thủ Đức, TP.HCM',
            open_time=time(8, 0), close_time=time(19, 0), open_weekdays=[0, 1, 2, 3, 4, 5, 6],
            slot_minutes=30, cancel_cutoff_hours=2,
        ))

    def _users(self):
        rows = [
            ('quanly', 'Chủ spa Lông Mượt', Role.MANAGER, '0909111222'),
            ('letan', 'Nguyễn Lễ Tân', Role.RECEPTIONIST, '0908222333'),
            ('ktv1', 'Kỹ thuật viên Tắm', Role.TECHNICIAN, '0907333444'),
            ('ktv2', 'Kỹ thuật viên Cắt Poodle', Role.TECHNICIAN, '0906444555'),
            ('ktv3', 'Kỹ thuật viên Spa mèo', Role.TECHNICIAN, '0905555666'),
        ]
        for username, full_name, role, phone in rows:
            user, _ = User.objects.get_or_create(username=username)
            user.full_name, user.role, user.phone = full_name, role, phone
            if role == Role.MANAGER:
                user.is_staff = True
                user.is_superuser = True
            user.set_password(DEMO_PASSWORD)
            user.save()

    def _specialties(self):
        return {c: Specialty.objects.update_or_create(code=c, defaults={'name_vi': n})[0]
                for c, n in SPECIALTIES}

    def _health_tags(self):
        return {c: HealthTag.objects.update_or_create(code=c, defaults={'name_vi': n, 'kind': k})[0]
                for c, n, k in HEALTH_TAGS}

    def _size_bands(self):
        for species, bands in SIZE_BANDS.items():
            for size, lo, hi in bands:
                SizeBand.objects.update_or_create(
                    species=species, size_class=size,
                    defaults={'min_kg': Decimal(str(lo)), 'max_kg': Decimal(str(hi))})

    def _services(self, specs):
        out = {}
        for code, name, cat, mins, scope, res, spec, base, desc in SERVICES:
            svc, _ = Service.objects.update_or_create(code=code, defaults=dict(
                name=name, category=cat, duration_minutes=mins, species_scope=scope,
                resource_type=res, required_specialty=specs.get(spec), description=desc,
                is_active=True))
            for size, factor in zip(SIZES, SIZE_FACTOR):
                ServicePrice.objects.update_or_create(
                    service=svc, size_class=size,
                    defaults={'price': Decimal(round(base * factor, -3))})
            out[code] = svc
        return out

    def _packages(self, services):
        for code, name, scope, coats, min_age, codes in PACKAGES:
            pkg, _ = Package.objects.update_or_create(code=code, defaults=dict(
                name=name, species_scope=scope, coat_types=coats, min_age_months=min_age,
                is_active=True))
            pkg.items.all().delete()
            PackageItem.objects.bulk_create([
                PackageItem(package=pkg, service=services[c], position=i) for i, c in enumerate(codes)])
            for size in SIZES:
                total = sum(ServicePrice.objects.get(service=services[c], size_class=size).price
                            for c in codes)
                PackagePrice.objects.update_or_create(
                    package=pkg, size_class=size,
                    defaults={'price': Decimal(round(float(total) * 0.9, -3))})

    def _clients_and_pets(self, tags):
        clients = []
        for name, phone, sec_phone, bday, username in CLIENTS:
            user = None
            if username:
                user, _ = User.objects.get_or_create(username=username)
                user.full_name, user.role, user.phone = name, Role.CUSTOMER, phone
                user.set_password(DEMO_PASSWORD)
                user.save()

            client = None
            if user:
                client = Client.objects.filter(user=user).first()
            if not client:
                client = Client.objects.filter(full_name=name).first()

            if client:
                client.phone = phone
                client.secondary_phone = sec_phone
                client.birthday = bday
                client.full_name = name
                client.user = user
                client.source = Client.Source.ONLINE if user else Client.Source.WALK_IN
                client.is_active = True
                client.save()
            else:
                client, _ = Client.objects.update_or_create(phone=phone, defaults=dict(
                    full_name=name, secondary_phone=sec_phone, birthday=bday,
                    user=user, source=Client.Source.ONLINE if user else Client.Source.WALK_IN,
                    is_active=True))
            clients.append(client)

        for owner, name, species, breed, coat, age_m, weight, tag_codes, allergy, vaccinated in PETS:
            pet, _ = Pet.objects.update_or_create(client=clients[owner], name=name, defaults=dict(
                species=species, breed=breed, coat_type=coat, birth_date=months_ago(age_m),
                weight_kg=Decimal(weight), allergy_note=allergy, is_active=True))
            pet.health_tags.set([tags[c] for c in tag_codes])
            if vaccinated:
                given = months_ago(4)
                PetVaccination.objects.update_or_create(
                    pet=pet, vaccine_name='Dại', date_given=given,
                    defaults={'valid_until': given + timedelta(days=365)})

    def _staff_and_resources(self):
        for u in User.objects.exclude(role=Role.CUSTOMER):
            StaffProfile.objects.get_or_create(user=u)
        specs = {s.code: s for s in Specialty.objects.all()}
        for username, codes, days in [('ktv1', ['bath'], range(7)),
                                      ('ktv2', ['bath', 'poodle_cut'], range(7)),
                                      ('ktv3', ['cat_spa', 'bath'], range(6))]:
            p = StaffProfile.objects.get(user__username=username)
            p.specialties.set([specs[c] for c in codes])
            p.shifts.all().delete()
            WorkShift.objects.bulk_create([
                WorkShift(staff=p, weekday=d, start_time=time(8, 0), end_time=time(19, 0)) for d in days])
        for name, rtype in RESOURCES:
            Resource.objects.get_or_create(name=name, defaults={'resource_type': rtype})

    def _bookings(self):
        """Làm lại toàn bộ lịch/hóa đơn mẫu để chạy lại seed không bị trùng."""
        Invoice.objects.all().delete()
        Booking.objects.all().delete()
        letan = User.objects.get(username='letan')
        tz = timezone.get_current_timezone()
        for pet_name, pkg_code, svc_codes, offset, hour, ktv, status, paid in BOOKINGS:
            pet = Pet.objects.filter(name=pet_name).first()
            pkg = Package.objects.get(code=pkg_code) if pkg_code else None
            svc_ids = [Service.objects.get(code=c).pk for c in svc_codes] or None
            start = timezone.make_aware(datetime.combine(date.today() + timedelta(days=offset), time(hour, 0)), tz)
            package, items, total, end_at = build_items(pet, pkg.pk if pkg else None, svc_ids, start)
            staff = StaffProfile.objects.get(user__username=ktv) if ktv else None
            b = Booking.objects.create(
                client=pet.client, pet=pet, package=package, staff=staff, status=status,
                start_at=start, end_at=end_at, total_price=total, created_by=pet.client.user or letan,
                channel=Booking.Channel.ONLINE if pet.client.user else Booking.Channel.COUNTER,
                cancel_reason='Khách bận việc đột xuất.' if status == 'cancelled' else '',
                cancel_reason_code='customer_cancelled' if status == 'cancelled' else '')
            BookingItem.objects.bulk_create([BookingItem(booking=b, **i) for i in items])
            BookingStatusLog.objects.create(booking=b, to_status='pending', changed_by=b.created_by)
            if status in ('checked_in', 'in_progress', 'completed'):
                for it in b.items.all():
                    it.resource = Resource.objects.filter(resource_type=it.resource_type).first()
                    it.save(update_fields=['resource'])
                b.checked_in_at = start
            if status == 'completed':
                b.completed_at, b.checked_out_at = end_at, end_at
            b.save()
            if status == 'completed':
                inv = billing_services.create_invoice(b)
                if paid:
                    billing_services.pay(inv, letan, 'cash')
                    Invoice.objects.filter(pk=inv.pk).update(paid_at=end_at)

    def _walk_ins(self):
        """Dữ liệu hàng đợi khách vãng lai mẫu trong ngày (SPA-18)."""
        from scheduling.models import WalkInTicket, WalkInStatus
        from catalog.models import Service, Package
        WalkInTicket.objects.all().delete()
        today = timezone.localdate()
        s_bath = Service.objects.filter(code='bath_basic').first()
        s_cat = Service.objects.filter(code='cat_spa').first()
        pkg_vip = Package.objects.filter(code='vip').first()

        now = timezone.now()
        WalkInTicket.objects.create(
            date=today, queue_no=1, contact_name='Anh Tuấn', phone='0912345671',
            pet_name='Bé Bông', pet_species='dog', service=s_bath, status=WalkInStatus.CALLED,
            called_at=now - timedelta(minutes=5), estimated_wait_minutes=5,
            note='Khách quen vãng lai, yêu cầu tắm sấy thơm dịu'
        )
        WalkInTicket.objects.create(
            date=today, queue_no=2, contact_name='Chị Lan', phone='0987654321',
            pet_name='Bé Miu', pet_species='cat', service=s_cat, status=WalkInStatus.WAITING,
            estimated_wait_minutes=15, note='Mèo sợ nước, dặn KTV nhẹ tay'
        )
        WalkInTicket.objects.create(
            date=today, queue_no=3, contact_name='Anh Dũng', phone='0909090909',
            pet_name='Bé Cún', pet_species='dog', package=pkg_vip, status=WalkInStatus.WAITING,
            estimated_wait_minutes=35, note='Khách mới lần đầu đến spa'
        )

    def _ai_data(self):
        """Dữ liệu mẫu cho module AI: Chống chỉ định, Luật chu kỳ, Tri thức SOP/Giá."""
        from ai_assistant.models import KnowledgeChunk, KnowledgeDoc, RebookRule
        from ai_assistant import services as ai_services
        from catalog.models import HealthTag, Package, Service, ServiceContraindication

        quanly = User.objects.get(username='quanly')

        # 1. Ma trận chống chỉ định (SPA-27)
        contras = [
            ('bath_scented', 'fragrance_allergy', ServiceContraindication.Severity.BLOCK,
             'Sản phẩm chứa dầu thơm có nguy cơ gây dị ứng và ngứa rát cho thú dị ứng hương liệu.'),
            ('bath_scented', 'skin_sensitive', ServiceContraindication.Severity.WARN,
             'Hương liệu có thể kích ứng nhẹ vùng da nhạy cảm; cần theo dõi phản ứng lông da.'),
            ('bath_basic', 'dermatitis', ServiceContraindication.Severity.WARN,
             'Sữa tắm thông thường có thể làm khô vùng da viêm; khuyến nghị dùng dầu tắm dược liệu.'),
        ]
        for svc_code, tag_code, sev, reason in contras:
            svc = Service.objects.filter(code=svc_code).first()
            tag = HealthTag.objects.filter(code=tag_code).first()
            if svc and tag:
                ServiceContraindication.objects.update_or_create(
                    service=svc, health_tag=tag, defaults={'severity': sev, 'reason_vi': reason})

        # 2. Luật chu kỳ nhắc tái spa (SPA-28)
        rules = [
            ('vip', 45, 14, 'Chu kỳ cắt tỉa lông tạo kiểu 6-8 tuần cho giống Poodle / lông dài'),
            ('basic', 30, 10, 'Chu kỳ tắm vệ sinh và cắt móng định kỳ 3-4 tuần'),
            ('cat_care', 40, 14, 'Chu kỳ spa thư giãn định kỳ cho mèo 5-6 tuần'),
        ]
        for pkg_code, interval, overdue, note in rules:
            pkg = Package.objects.filter(code=pkg_code).first()
            if pkg:
                RebookRule.objects.update_or_create(
                    package=pkg, defaults={'interval_days': interval, 'overdue_days': overdue, 'note_vi': note})

        # 3. Tài liệu tri thức SOP & Bảng giá (SPA-24)
        doc1, _ = KnowledgeDoc.objects.update_or_create(
            title='Quy trình Vận hành Tiêu chuẩn (SOP) Spa Thú Y Lông Mượt',
            defaults={
                'doc_type': KnowledgeDoc.DocType.SOP,
                'version': 1,
                'uploaded_by': quanly,
                'is_active': True,
                'text_content': (
                    'Quy định tiếp nhận và kiểm tra ban đầu: Kỹ thuật viên đối chiếu thẻ tiêm phòng, kiểm tra lịch sử dị ứng, '
                    'cân đo để xác định đúng size (XS dưới 3kg, S 3-7kg, M 7-15kg, L 15-30kg, XL trên 30kg).\n\n'
                    'Quy trình tắm và dưỡng lông da nhạy cảm: Tuyệt đối không dùng sữa tắm có hương liệu mạnh cho thú có thẻ Dị ứng hương liệu. '
                    'Dùng nước ấm 35-37 độ C, massage nhẹ nhàng tránh tổn thương vùng da viêm.\n\n'
                    'Quy định an toàn bàn cắt tỉa và chuồng sấy: Luôn cài đai giữ cổ mềm trên bàn cắt tỉa thủy lực. '
                    'Theo dõi nhiệt độ chuồng sấy tĩnh âm không vượt quá 38 độ C. Thú có tính hay cắn phải đeo rọ mõm xốp mềm an toàn.'
                ),
            },
        )
        doc1.chunks.all().delete()
        KnowledgeChunk.objects.bulk_create([
            KnowledgeChunk(doc=doc1, position=0, heading='Quy định tiếp nhận và kiểm tra ban đầu',
                           text='Kỹ thuật viên đối chiếu thẻ tiêm phòng, kiểm tra lịch sử dị ứng, cân đo xác định đúng size.'),
            KnowledgeChunk(doc=doc1, position=1, heading='Quy trình tắm cho thú da nhạy cảm & dị ứng',
                           text='Tuyệt đối không dùng dầu thơm cho thú dị ứng hương liệu. Dùng nước ấm 35-37 độ C dịu nhẹ.'),
            KnowledgeChunk(doc=doc1, position=2, heading='Quy định an toàn bàn cắt và chuồng sấy',
                           text='Cài đai an toàn trên bàn cắt tỉa; theo dõi nhiệt độ chuồng sấy dưới 38 độ C; thú cắn phải có rọ mõm xốp.'),
        ])

        doc2, _ = KnowledgeDoc.objects.update_or_create(
            title='Chính sách đặt hẹn, hủy lịch và bảng giá',
            defaults={
                'doc_type': KnowledgeDoc.DocType.PRICE_LIST,
                'version': 1,
                'uploaded_by': quanly,
                'is_active': True,
                'text_content': (
                    'Chính sách hủy lịch hẹn: Khách hàng có thể tự hủy lịch trên hệ thống trước giờ hẹn tối thiểu 2 giờ mà không mất phí. '
                    'Sau thời gian này vui lòng gọi hotline spa để được hỗ trợ chuyển giờ.\n\n'
                    'Chính sách thanh toán và bảo hành: Hóa đơn được lập tự động từ lịch dịch vụ sau khi hoàn tất. '
                    'Spa chấp nhận tiền mặt và chuyển khoản ngân hàng qua mã QR tại quầy lễ tân.'
                ),
            },
        )
        doc2.chunks.all().delete()
        KnowledgeChunk.objects.bulk_create([
            KnowledgeChunk(doc=doc2, position=0, heading='Chính sách hủy lịch hẹn',
                           text='Khách hàng được tự hủy lịch trước giờ hẹn tối thiểu 2 giờ không mất phí.'),
            KnowledgeChunk(doc=doc2, position=1, heading='Chính sách thanh toán và hóa đơn',
                           text='Chấp nhận thanh toán tiền mặt tại quầy và chuyển khoản ngân hàng qua mã QR.'),
        ])

        # 4. Quét và tạo các bản ghi nhắc tái spa mẫu
        ai_services.generate_rebook_reminders()

    def _seed_notifications(self):
        """Tạo dữ liệu mẫu thông báo chuẩn vai trò cho từng nhóm người dùng."""
        from notifications.models import Notification

        Notification.objects.all().delete()
        users = {u.username: u for u in User.objects.all()}
        items = []

        # 1. Khách hàng (khach1 - Nguyễn Thu Hà)
        if 'khach1' in users:
            u = users['khach1']
            items.extend([
                Notification(
                    user=u,
                    kind='booking_confirmed',
                    title='Lịch hẹn bé Bông đã được xác nhận',
                    body='Lịch hẹn tắm sấy lúc 09:30 ngày mai của bé Bông đã được xác nhận và xếp Kỹ thuật viên.',
                    ref_type='booking',
                    link='/app/lich-hen',
                    is_read=False,
                ),
                Notification(
                    user=u,
                    kind='rebook_reminder',
                    title='Nhắc lịch spa định kỳ cho bé Mimi',
                    body='Đã 3 tuần kể từ lần spa gần nhất của bé Mimi. Đặt lịch sớm để nhận ưu đãi và khung giờ ưng ý!',
                    ref_type='reminder',
                    link='/app/nhac-tai-spa',
                    is_read=False,
                ),
                Notification(
                    user=u,
                    kind='invoice_paid',
                    title='Thanh toán thành công',
                    body='Đã xác nhận thanh toán hóa đơn dịch vụ #1 số tiền 150.000đ. Cảm ơn bạn đã tin tưởng dịch vụ!',
                    ref_type='invoice',
                    link='/app/hoa-don',
                    is_read=True,
                ),
                Notification(
                    user=u,
                    kind='booking_completed',
                    title='Bé Mimi đã làm spa xong!',
                    body='Dịch vụ của bé Mimi đã hoàn tất thơm tho, mời bạn ghé quầy lễ tân để đón bé.',
                    ref_type='booking',
                    link='/app/lich-hen',
                    is_read=True,
                ),
            ])

        # 2. Quản lý (quanly - Chủ spa)
        if 'quanly' in users:
            u = users['quanly']
            items.extend([
                Notification(
                    user=u,
                    kind='booking_new',
                    title='Lịch hẹn mới chờ duyệt',
                    body='Khách hàng Nguyễn Thu Hà vừa đặt lịch Tắm dưỡng cho bé Bông trên website.',
                    ref_type='booking',
                    link='/app/lich-hen',
                    is_read=False,
                ),
                Notification(
                    user=u,
                    kind='staff_timeoff',
                    title='Đơn xin nghỉ phép mới',
                    body='Kỹ thuật viên Kiều Nghiên gửi đơn xin nghỉ phép 1 ngày (28/10). Vui lòng xét duyệt.',
                    ref_type='staff',
                    link='/app/nhan-su',
                    is_read=False,
                ),
                Notification(
                    user=u,
                    kind='system',
                    title='Báo cáo doanh thu tuần',
                    body='Doanh thu tuần này đạt 18.500.000đ, tăng 15% so với tuần trước. Xem chi tiết tại Thống kê.',
                    ref_type='analytics',
                    link='/app/thong-ke',
                    is_read=True,
                ),
            ])

        # 3. Lễ tân (letan)
        if 'letan' in users:
            u = users['letan']
            items.extend([
                Notification(
                    user=u,
                    kind='booking_new',
                    title='Lịch hẹn mới chờ duyệt',
                    body='Bé Bông đặt lịch Tắm dưỡng vào 10:00 ngày mai. Vui lòng kiểm tra và duyệt lịch.',
                    ref_type='booking',
                    link='/app/lich-hen',
                    is_read=False,
                ),
                Notification(
                    user=u,
                    kind='booking_completed',
                    title='Dịch vụ hoàn tất, chờ thu tiền',
                    body='Bé Mimi đã xong dịch vụ tại phòng spa, sẵn sàng xuất hóa đơn và thu tiền khách.',
                    ref_type='booking',
                    link='/app/hoa-don',
                    is_read=False,
                ),
            ])

        # 4. Kỹ thuật viên (ktv1)
        if 'ktv1' in users:
            u = users['ktv1']
            items.extend([
                Notification(
                    user=u,
                    kind='booking_assigned',
                    title='Bạn được giao một lịch hẹn mới',
                    body='Ca phục vụ bé Bông - Dịch vụ Tắm cơ bản lúc 09:30 ngày mai.',
                    ref_type='booking',
                    link='/app/lich-hen',
                    is_read=False,
                ),
                Notification(
                    user=u,
                    kind='staff_timeoff_status',
                    title='Đơn nghỉ phép đã được phê duyệt',
                    body='Quản lý đã phê duyệt đơn xin nghỉ phép ngày 28/10 của bạn.',
                    ref_type='staff',
                    link='/app/nhan-su',
                    is_read=True,
                ),
            ])

        Notification.objects.bulk_create(items)

