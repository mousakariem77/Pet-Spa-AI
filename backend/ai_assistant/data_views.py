"""API dữ liệu dành cho lớp AI (chỉ đọc).

Lớp AI (`services.py`) KHÔNG truy vấn trực tiếp CSDL của các module nghiệp vụ. Mọi dữ kiện
(hồ sơ thú, gói/giá, chống chỉ định, lịch, nhân sự, tri thức SOP) đều được lấy qua các
endpoint `/api/v1/ai/data/...` trong file này, thông qua `data_api.AiDataClient`.

Endpoint phân quyền theo người gọi (khách chỉ thấy thú của mình, v.v.).
"""
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role
from accounts.permissions import IsFrontDesk
from catalog.models import Package, Service, ServiceContraindication, SizeBand
from customers.models import Pet
from scheduling.models import Booking
from spa.models import Spa, StaffProfile

from .models import KnowledgeChunk, RebookReminder, RebookRule

ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed', 'checked_in', 'in_progress']


def _iso(dt):
    return dt.isoformat() if dt else None


class KnowledgeDataView(APIView):
    """GET ai/data/knowledge — đoạn tri thức SOP, thông tin spa, bảng giá và danh mục dịch vụ (công khai, chỉ đọc)."""

    permission_classes = [AllowAny]

    def get(self, request):
        items = []

        # 1. Đoạn tài liệu SOP chuẩn từ KnowledgeChunk
        chunks = KnowledgeChunk.objects.filter(doc__is_active=True).select_related('doc')[:300]
        for c in chunks:
            items.append({
                'id': f'sop_{c.id}',
                'heading': c.heading,
                'text': c.text,
                'doc_title': c.doc.title,
            })

        # 2. Thông tin cơ sở, thời gian hoạt động và chính sách đặt lịch từ Hồ Sơ Spa (/app/ho-so-spa)
        try:
            spa = Spa.objects.first()
            if spa:
                open_str = spa.open_time.strftime('%H:%M') if spa.open_time else '08:00'
                close_str = spa.close_time.strftime('%H:%M') if spa.close_time else '19:00'

                weekday_names = {
                    0: 'Thứ Hai',
                    1: 'Thứ Ba',
                    2: 'Thứ Tư',
                    3: 'Thứ Năm',
                    4: 'Thứ Sáu',
                    5: 'Thứ Bảy',
                    6: 'Chủ nhật',
                }
                raw_days = spa.open_weekdays if isinstance(spa.open_weekdays, list) else list(range(7))
                open_days = [weekday_names[d] for d in sorted(raw_days) if d in weekday_names]
                closed_days = [weekday_names[d] for d in range(7) if d not in raw_days]

                if len(open_days) == 7:
                    days_desc = 'Mở cửa tất cả các ngày trong tuần (từ Thứ Hai đến Chủ nhật)'
                elif open_days == ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu']:
                    days_desc = 'Từ Thứ Hai đến Thứ Sáu (nghỉ Thứ Bảy và Chủ nhật)'
                elif open_days:
                    closed_note = f" (Nghỉ vào: {', '.join(closed_days)})" if closed_days else ''
                    days_desc = f"{', '.join(open_days)}{closed_note}"
                else:
                    days_desc = 'Tạm thời chưa thiết lập lịch mở cửa'

                closed_desc = ', '.join(closed_days) if closed_days else 'Không có (mở cửa suốt tuần)'

                # 2.1 Khung giờ làm việc và các ngày mở cửa trong tuần
                items.append({
                    'id': 'spa_operating_hours',
                    'heading': 'Khung giờ hoạt động, giờ mở cửa và các ngày mở cửa trong tuần của Pet Spa',
                    'text': (
                        f'Thời gian hoạt động và lịch mở cửa của {spa.name}:\n'
                        f'- Giờ mở cửa hàng ngày: Từ {open_str} đến {close_str}.\n'
                        f'- Các ngày mở cửa trong tuần: {days_desc}.\n'
                        f'- Các ngày đóng cửa (nghỉ): {closed_desc}.\n'
                        f'- Hotline hỗ trợ & đặt lịch: {spa.phone or "Chưa cập nhật"}.'
                    ),
                    'doc_title': 'Hồ sơ Spa',
                })

                # 2.2 Thông tin liên hệ, hotline, địa chỉ
                contact_lines = [
                    f'- Tên spa: {spa.name}',
                    f'- Địa chỉ cơ sở: {spa.address or "Chưa cập nhật"}',
                    f'- Hotline tư vấn & đặt hẹn: {spa.phone or "Chưa cập nhật"}',
                ]
                if spa.email:
                    contact_lines.append(f'- Email liên hệ: {spa.email}')
                items.append({
                    'id': 'spa_contact_info',
                    'heading': 'Thông tin liên hệ, hotline, số điện thoại, email và địa chỉ của Pet Spa',
                    'text': (
                        f'Thông tin liên hệ chính thức của {spa.name}:\n' + '\n'.join(contact_lines)
                    ),
                    'doc_title': 'Hồ sơ Spa',
                })

                # 2.3 Quy định đặt lịch & hủy lịch hẹn
                items.append({
                    'id': 'spa_booking_policy',
                    'heading': 'Quy định đặt lịch hẹn, bước slot thời gian và chính sách hủy lịch của Pet Spa',
                    'text': (
                        f'Chính sách đặt hẹn và hủy lịch tại {spa.name}:\n'
                        f'- Bước slot đặt lịch: Mỗi khung giờ cách nhau {spa.slot_minutes} phút.\n'
                        f'- Quy định hủy/đổi lịch hẹn: Khách hàng cần thông báo hoặc hủy trước tối thiểu {spa.cancel_cutoff_hours} giờ trước giờ hẹn để spa kịp điều phối phục vụ chu đáo.\n'
                        f'- Hotline hỗ trợ đổi/hủy lịch: {spa.phone or "Chưa cập nhật"}.'
                    ),
                    'doc_title': 'Hồ sơ Spa',
                })
        except Exception:
            pass

        # 3. Quy định phân loại size theo cân nặng
        try:
            bands = list(SizeBand.objects.all().order_by('species', 'min_kg'))
            if bands:
                dog_bands = [f'{b.size_class} ({b.min_kg:.0f}-{b.max_kg:.0f}kg)' for b in bands if b.species == 'dog']
                cat_bands = [f'{b.size_class} ({b.min_kg:.0f}-{b.max_kg:.0f}kg)' for b in bands if b.species == 'cat']
                items.append({
                    'id': 'catalog_sizes',
                    'heading': 'Bảng phân loại size thú cưng theo cân nặng (XS, S, M, L, XL)',
                    'text': (
                        f'Quy định size theo cân nặng tại Pet Spa:\n'
                        f'- Chó: {", ".join(dog_bands)}\n'
                        f'- Mèo: {", ".join(cat_bands)}'
                    ),
                    'doc_title': 'Quy định Size Cân Nặng',
                })
        except Exception:
            pass

        # Chu kỳ tắm và chăm sóc vệ sinh định kỳ theo giống thú cưng
        items.append({
            'id': 'grooming_cycles',
            'heading': 'Chu kỳ tắm, cắt tỉa và vệ sinh định kỳ theo từng giống thú cưng',
            'text': (
                'Chu kỳ chăm sóc lông da định kỳ khuyến nghị:\n'
                '- Chó lông xoăn / lông dài (Poodle, Bichon, Maltese, Shih Tzu): Tắm và chải lông định kỳ 2-3 tuần/lần; cắt tỉa tạo kiểu 4-6 tuần/lần để tránh lông bị bết dính, vón cục.\n'
                '- Chó lông 2 lớp dày (Corgi, Husky, Alaska, Golden, Phốc Sóc): Tắm 3-4 tuần/lần, dùng dầu dưỡng xả tơ và sấy kỹ chuồng sấy để phòng ngừa ẩm da, viêm nấm da.\n'
                '- Chó lông ngắn (Pug, Bull, Lạp Xưởng, Phú Quốc): Tắm 3-4 tuần/lần hoặc khi vận động nhiều bám bẩn.\n'
                '- Mèo lông dài (Mèo Ba Tư, Anh lông dài, Ragdoll): Tắm dưỡng 4-6 tuần/lần, chải lông đều đặn.\n'
                '- Mèo lông ngắn (Mèo ta, Anh lông ngắn): Tắm 6-8 tuần/lần hoặc khi cần làm sạch khử mùi.'
            ),
            'doc_title': 'Cẩm nang Chăm sóc Thú cưng',
        })

        # Quy định tiếp nhận và tắm cho thú bị viêm da, nhạy cảm, dị ứng
        items.append({
            'id': 'skin_condition_policy',
            'heading': 'Quy trình và chính sách tắm cho thú cưng bị viêm da, ngứa ngáy, da nhạy cảm hoặc dị ứng',
            'text': (
                'Quy định về chăm sóc thú cưng có vấn đề da liễu:\n'
                '- Thú cưng bị viêm da nhẹ, dị ứng thời tiết hoặc mẩn ngứa: HOÀN TOÀN TẮM ĐƯỢC tại Pet Spa. Spa áp dụng quy trình SOP chuyên biệt bằng liệu trình "Tắm dưỡng không hương liệu", dùng sữa tắm thảo dược dịu nhẹ, nước ấm vừa phải và sấy khô chân lông.\n'
                '- Chống chỉ định hóa chất: Bé bị viêm da hoặc dị ứng tuyệt đối KHÔNG sử dụng các gói/dịch vụ có tinh dầu hương liệu nồng (như Tắm dưỡng dầu hương liệu, Gói VIP) để tránh kích ứng.\n'
                '- Trường hợp từ chối/tạm hoãn: Thú cưng bị viêm da cấp tính lở loét diện rộng, chảy mủ hoặc bệnh truyền nhiễm nguy hiểm, spa sẽ hướng dẫn chủ đưa bé đến phòng khám thú y điều trị ổn định trước.'
            ),
            'doc_title': 'Quy trình SOP An toàn & Da liễu',
        })

        # 4. Danh mục Dịch vụ lẻ & Bảng giá
        svc_summaries = []
        try:
            services = Service.objects.filter(is_active=True).prefetch_related('prices')
            for s in services:
                prices = list(s.prices.all())
                prices_str = ', '.join(f'size {p.size_class}: {int(p.price):,}đ' for p in prices) if prices else 'Liên hệ báo giá'
                desc = f' {s.description}' if s.description else ''
                species_name = s.get_species_scope_display()
                cat_name = s.get_category_display()
                svc_summaries.append(f'{s.name} ({cat_name}, dành cho {species_name}, {s.duration_minutes} phút)')
                items.append({
                    'id': f'service_{s.id}',
                    'heading': f'Dịch vụ {s.name} ({species_name}) - Bảng giá theo size',
                    'text': (
                        f'Dịch vụ: {s.name}. Nhóm: {cat_name}. Áp dụng cho: {species_name}. '
                        f'Thời lượng ước tính: {s.duration_minutes} phút.{desc} '
                        f'Bảng giá theo từng size: {prices_str}.'
                    ),
                    'doc_title': 'Danh mục Dịch vụ lẻ',
                })
        except Exception:
            pass

        # 5. Danh mục Gói combo & Bảng giá
        pkg_summaries = []
        try:
            packages = Package.objects.filter(is_active=True).prefetch_related('items__service', 'prices')
            for p in packages:
                prices = list(p.prices.all())
                prices_str = ', '.join(f'size {pr.size_class}: {int(pr.price):,}đ' for pr in prices) if prices else 'Liên hệ báo giá'
                item_names = ', '.join(it.service.name for it in p.items.all())
                species_name = p.get_species_scope_display()
                desc = f' {p.description}' if p.description else ''
                pkg_summaries.append(f'{p.name} ({species_name}: gồm {item_names})')
                items.append({
                    'id': f'package_{p.id}',
                    'heading': f'Gói combo {p.name} ({species_name}) - Chi tiết và Bảng giá theo size',
                    'text': (
                        f'Gói combo: {p.name}. Áp dụng cho: {species_name}. '
                        f'Bao gồm các dịch vụ: {item_names}.{desc} '
                        f'Bảng giá theo từng size: {prices_str}.'
                    ),
                    'doc_title': 'Danh mục Gói combo trọn gói',
                })
        except Exception:
            pass

        # 6. Bản tổng hợp toàn bộ dịch vụ và gói combo (để trả lời các câu hỏi tổng quan)
        if svc_summaries or pkg_summaries:
            overview_lines = ['Hiện tại Pet Spa đang cung cấp các dịch vụ và gói combo sau:']
            if svc_summaries:
                overview_lines.append('DỊCH VỤ LẺ:')
                for i, sm in enumerate(svc_summaries, 1):
                    overview_lines.append(f'{i}. {sm}')
            if pkg_summaries:
                overview_lines.append('GÓI COMBO TRỌN GÓI:')
                for i, pm in enumerate(pkg_summaries, 1):
                    overview_lines.append(f'{i}. {pm}')
            items.append({
                'id': 'catalog_overview',
                'heading': 'Tổng hợp danh mục tất cả dịch vụ lẻ và gói combo trọn gói tại Pet Spa',
                'text': '\n'.join(overview_lines),
                'doc_title': 'Danh mục Dịch vụ & Gói combo',
            })

        return Response(items)


class MyPetsDataView(APIView):
    """GET ai/data/my-pets — danh sách hồ sơ thú cưng của người dùng (khách chỉ xem thú của mình)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        u = request.user
        qs = Pet.objects.filter(is_active=True).select_related('client').prefetch_related('health_tags')
        pet_id = request.query_params.get('pet_id')
        if u.role == Role.CUSTOMER:
            qs = qs.filter(client__user_id=u.id)
            if pet_id:
                qs = qs.filter(pk=pet_id)
        else:
            client_id = request.query_params.get('client_id')
            if pet_id:
                qs = qs.filter(pk=pet_id)
            elif client_id:
                qs = qs.filter(client_id=client_id)

        pets_data = []
        for pet in qs:
            last = Booking.objects.filter(pet=pet, status='completed').select_related('package').order_by('-end_at').first()
            pets_data.append({
                'id': pet.id,
                'name': pet.name,
                'species': pet.species,
                'species_display': pet.get_species_display(),
                'breed': pet.breed,
                'coat_type': pet.coat_type,
                'coat_type_display': pet.get_coat_type_display(),
                'weight_kg': str(pet.weight_kg),
                'size_class': pet.size_class,
                'age_months': pet.age_months,
                'allergy_note': pet.allergy_note,
                'health_tags': [{'id': t.id, 'name_vi': t.name_vi} for t in pet.health_tags.all()],
                'last_completed_booking': {
                    'id': last.id,
                    'package_id': last.package_id,
                    'package_name': last.package.name if last.package_id else 'Dịch vụ lẻ',
                    'end_at': _iso(last.end_at),
                } if last else None,
            })
        return Response(pets_data)


class PetProfileDataView(APIView):
    """GET ai/data/pets/{id} — hồ sơ thú + lần hoàn tất gần nhất (khách chỉ xem thú của mình)."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        try:
            pet = Pet.objects.select_related('client').prefetch_related('health_tags').get(pk=pk)
        except Pet.DoesNotExist:
            raise NotFound('Không tìm thấy thú cưng.')
        if request.user.role == Role.CUSTOMER and pet.client.user_id != request.user.id:
            raise NotFound('Không tìm thấy thú cưng.')

        last = Booking.objects.filter(pet=pet, status='completed').order_by('-end_at').first()
        return Response({
            'id': pet.id,
            'name': pet.name,
            'species': pet.species,
            'species_display': pet.get_species_display(),
            'breed': pet.breed,
            'coat_type': pet.coat_type,
            'coat_type_display': pet.get_coat_type_display(),
            'weight_kg': str(pet.weight_kg),
            'size_class': pet.size_class,
            'age_months': pet.age_months,
            'health_tags': [{'id': t.id, 'name_vi': t.name_vi} for t in pet.health_tags.all()],
            'last_completed_booking': {
                'id': last.id,
                'package_id': last.package_id,
                'end_at': _iso(last.end_at),
            } if last else None,
        })


class PackageCatalogDataView(APIView):
    """GET ai/data/packages — gói đang bán kèm dịch vụ, size có giá, luật chu kỳ tái spa."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        packages = Package.objects.filter(is_active=True).prefetch_related('items__service', 'prices')
        intervals = {}
        for r in RebookRule.objects.order_by('id'):
            intervals.setdefault(r.package_id, r.interval_days)
        return Response([{
            'id': p.id,
            'name': p.name,
            'species_scope': p.species_scope,
            'min_age_months': p.min_age_months,
            'coat_types': p.coat_types,
            'service_ids': [it.service_id for it in p.items.all()],
            'size_classes': [pr.size_class for pr in p.prices.all()],
            'rebook_interval_days': intervals.get(p.id),
        } for p in packages])


class ContraindicationDataView(APIView):
    """GET ai/data/contraindications?service_ids=1,2&tag_ids=3 — ma trận chống chỉ định."""

    permission_classes = [IsAuthenticated]

    @staticmethod
    def _ids(raw):
        return [int(x) for x in (raw or '').split(',') if x.strip().isdigit()]

    def get(self, request):
        service_ids = self._ids(request.query_params.get('service_ids'))
        tag_ids = self._ids(request.query_params.get('tag_ids'))
        qs = ServiceContraindication.objects.filter(
            service_id__in=service_ids, health_tag_id__in=tag_ids).select_related('service', 'health_tag')
        return Response([{
            'service_id': c.service_id,
            'service_name': c.service.name,
            'health_tag_id': c.health_tag_id,
            'health_tag_name': c.health_tag.name_vi,
            'severity': c.severity,
            'reason_vi': c.reason_vi,
        } for c in qs])


class StaffCandidatesDataView(APIView):
    """GET ai/data/bookings/{id}/staff-candidates — lịch hẹn + dữ liệu thô của các KTV để AI chấm điểm."""

    permission_classes = [IsFrontDesk]

    def get(self, request, pk=None):
        try:
            booking = Booking.objects.select_related('pet').prefetch_related('items__service').get(pk=pk)
        except Booking.DoesNotExist:
            raise NotFound('Không tìm thấy lịch hẹn.')

        techs = StaffProfile.objects.select_related('user').prefetch_related(
            'specialties', 'shifts', 'time_off').filter(user__role=Role.TECHNICIAN, is_active=True)

        technicians = []
        for st in techs:
            busy = Booking.objects.filter(
                staff=st, status__in=ACTIVE_BOOKING_STATUSES,
                start_at__lt=booking.end_at, end_at__gt=booking.start_at,
            ).exclude(pk=booking.pk)
            technicians.append({
                'id': st.id,
                'username': st.user.username,
                'display_name': st.user.full_name or st.user.username,
                'specialties': [{'id': s.id, 'name_vi': s.name_vi} for s in st.specialties.all()],
                'shifts': [{
                    'weekday': sh.weekday,
                    'start_time': sh.start_time.isoformat(),
                    'end_time': sh.end_time.isoformat(),
                } for sh in st.shifts.all()],
                'time_off': [{
                    'date_from': t.date_from.isoformat(),
                    'date_to': t.date_to.isoformat(),
                } for t in st.time_off.all()],
                'conflicting_bookings': [{'id': b.id} for b in busy],
                'past_handled_with_pet': Booking.objects.filter(
                    pet=booking.pet, staff=st, status='completed').count(),
            })

        return Response({
            'booking': {
                'id': booking.id,
                'pet_id': booking.pet_id,
                'pet_name': booking.pet.name,
                'start_at': _iso(booking.start_at),
                'end_at': _iso(booking.end_at),
                'services': [{
                    'id': it.service_id,
                    'name': it.service.name,
                    'required_specialty_id': it.service.required_specialty_id,
                } for it in booking.items.all()],
            },
            'technicians': technicians,
        })


class RebookCandidatesDataView(APIView):
    """GET ai/data/rebook-candidates — thú đủ điều kiện xét nhắc tái spa + các luật chu kỳ."""

    permission_classes = [IsFrontDesk]

    def get(self, request):
        rules = [{
            'id': r.id,
            'package_id': r.package_id,
            'species': r.species,
            'interval_days': r.interval_days,
            'note_vi': r.note_vi,
        } for r in RebookRule.objects.order_by('id')]

        candidates = []
        if rules:
            pets = Pet.objects.filter(
                is_active=True, client__allow_reminders=True, client__is_active=True).select_related('client')
            now = timezone.now()
            for pet in pets:
                if Booking.objects.filter(pet=pet, status__in=ACTIVE_BOOKING_STATUSES, start_at__gte=now).exists():
                    continue
                last = Booking.objects.filter(
                    pet=pet, status='completed').select_related('package').order_by('-end_at').first()
                if not last or RebookReminder.objects.filter(last_booking=last).exists():
                    continue
                candidates.append({
                    'pet_id': pet.id,
                    'pet_name': pet.name,
                    'species': pet.species,
                    'client_id': pet.client_id,
                    'last_booking': {
                        'id': last.id,
                        'package_id': last.package_id,
                        'package_name': last.package.name if last.package_id else None,
                        'end_at': _iso(last.end_at),
                    },
                })
        return Response({'rules': rules, 'candidates': candidates})
