import re
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Avg
from django.utils import timezone

from accounts.models import Role
from accounts.permissions import IsFrontDesk, IsManager
from catalog.models import Package, Service, ServiceContraindication
from notifications.models import notify

from . import services
from .models import AiLog, AiSuggestion, KnowledgeChunk, KnowledgeDoc, RebookReminder, RebookRule


# ---------------------------------------------------------------- SERIALIZERS

class AiSuggestionSerializer(serializers.ModelSerializer):
    package_name = serializers.CharField(source='package.name', read_only=True, default=None)
    staff_name = serializers.SerializerMethodField()
    package_info = serializers.SerializerMethodField()

    class Meta:
        model = AiSuggestion
        fields = ['id', 'suggestion_type', 'pet', 'package', 'package_name', 'package_info',
                  'staff', 'staff_name', 'rank', 'score', 'confidence', 'reason_text',
                  'evidence', 'warnings', 'status', 'created_at']

    def get_staff_name(self, s):
        return str(s.staff) if s.staff_id else None

    def get_package_info(self, s):
        if not s.package:
            return None
        return {
            'id': s.package.id,
            'name': s.package.name,
            'description': s.package.description,
            'items': [it.service.name for it in s.package.items.select_related('service')],
            'prices': s.package.prices.values('size_class', 'price'),
        }


class RebookRuleSerializer(serializers.ModelSerializer):
    package_name = serializers.CharField(source='package.name', read_only=True)

    class Meta:
        model = RebookRule
        fields = ['id', 'package', 'package_name', 'coat_type', 'species',
                  'interval_days', 'overdue_days', 'note_vi']


class RebookReminderSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.full_name', read_only=True)
    client_phone = serializers.CharField(source='client.phone', read_only=True)
    pet_name = serializers.CharField(source='pet.name', read_only=True)
    pet_species = serializers.CharField(source='pet.species', read_only=True)
    pet_breed = serializers.CharField(source='pet.breed', read_only=True)
    pet_weight_kg = serializers.DecimalField(source='pet.weight_kg', max_digits=5, decimal_places=2, read_only=True)
    pet_size = serializers.CharField(source='pet.size_class', read_only=True)
    pet_info = serializers.SerializerMethodField()

    package_id = serializers.IntegerField(source='last_booking.package_id', read_only=True, default=None)
    package_name = serializers.SerializerMethodField()
    suggested_package_name = serializers.SerializerMethodField()
    suggested_package_price = serializers.SerializerMethodField()
    reason = serializers.CharField(source='reason_text', read_only=True)
    days_overdue = serializers.SerializerMethodField()
    cycle_days = serializers.SerializerMethodField()
    last_booking_date = serializers.SerializerMethodField()

    class Meta:
        model = RebookReminder
        fields = [
            'id', 'client', 'client_name', 'client_phone',
            'pet', 'pet_name', 'pet_species', 'pet_breed', 'pet_weight_kg', 'pet_size', 'pet_info',
            'last_booking', 'last_booking_date', 'package_id', 'package_name', 'suggested_package_name', 'suggested_package_price',
            'due_date', 'overdue_days', 'days_overdue', 'cycle_days',
            'reason_text', 'reason', 'status', 'approved_at', 'sent_at', 'created_at',
        ]

    def get_pet_info(self, r):
        p = r.pet
        if not p:
            return None
        return {
            'id': p.id,
            'name': p.name,
            'species': p.species,
            'breed': p.breed or '',
            'weight_kg': float(p.weight_kg) if p.weight_kg is not None else None,
            'size_class': p.size_class or '',
            'coat_type': getattr(p, 'coat_type', ''),
        }

    def get_package_name(self, r):
        return r.last_booking.package.name if r.last_booking and r.last_booking.package_id else 'Dịch vụ lẻ'

    def get_suggested_package_name(self, r):
        return self.get_package_name(r)

    def get_suggested_package_price(self, r):
        b = r.last_booking
        if b and b.total_price:
            return float(b.total_price)
        pkg = b.package if b else None
        if pkg and r.pet and r.pet.size_class:
            from catalog.models import PackagePrice
            pp = PackagePrice.objects.filter(package=pkg, size_class=r.pet.size_class).first()
            if pp:
                return float(pp.price)
        return None

    def get_cycle_days(self, r):
        return r.rule.interval_days if r.rule else 14

    def get_days_overdue(self, r):
        if not r.due_date:
            return 0
        diff = (timezone.localdate() - r.due_date).days
        return max(0, diff)

    def get_last_booking_date(self, r):
        if r.last_booking and r.last_booking.end_at:
            return r.last_booking.end_at.strftime('%Y-%m-%d')
        return None


class AiLogSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    pet_name = serializers.CharField(source='pet.name', read_only=True, default=None)

    class Meta:
        model = AiLog
        fields = ['id', 'kind', 'session_id', 'user', 'user_name', 'pet', 'pet_name',
                  'input_text', 'output_text', 'context_refs', 'engine', 'status', 'latency_ms', 'created_at']

    def get_user_name(self, lg):
        if not lg.user:
            return 'Khách vãng lai'
        return lg.user.full_name or lg.user.username


class KnowledgeChunkSerializer(serializers.ModelSerializer):
    class Meta:
        model = KnowledgeChunk
        fields = ['id', 'position', 'heading', 'text']


class KnowledgeDocSerializer(serializers.ModelSerializer):
    chunks = KnowledgeChunkSerializer(many=True, read_only=True)
    content = serializers.CharField(write_only=True, required=False, allow_blank=True)
    sections = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)

    class Meta:
        model = KnowledgeDoc
        fields = ['id', 'title', 'doc_type', 'file', 'text_content', 'content', 'sections', 'version', 'is_active', 'created_at', 'chunks']

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        content = data.get('content') or data.get('text_content')
        if content:
            data['text_content'] = content
        doc_type = data.get('doc_type')
        if doc_type in ('guide', 'sop', 'policy', 'faq'):
            data['doc_type'] = doc_type
        elif doc_type in ('price', 'price_list'):
            data['doc_type'] = KnowledgeDoc.DocType.PRICE_LIST
        elif doc_type in ('safety',):
            data['doc_type'] = KnowledgeDoc.DocType.POLICY
        else:
            data['doc_type'] = KnowledgeDoc.DocType.SOP
        return super().to_internal_value(data)

    def create(self, validated_data):
        validated_data.pop('content', None)
        sections = validated_data.pop('sections', None)
        doc = super().create(validated_data)
        doc._received_sections = sections
        return doc

    def update(self, instance, validated_data):
        validated_data.pop('content', None)
        sections = validated_data.pop('sections', None)
        doc = super().update(instance, validated_data)
        doc._received_sections = sections
        return doc


class ServiceContraindicationSerializer(serializers.ModelSerializer):
    service_name = serializers.CharField(source='service.name', read_only=True)
    health_tag_name = serializers.CharField(source='health_tag.name_vi', read_only=True)

    class Meta:
        model = ServiceContraindication
        fields = ['id', 'service', 'service_name', 'health_tag', 'health_tag_name', 'severity', 'reason_vi']


# ---------------------------------------------------------------- VIEWS

import json
from django.utils import timezone


def get_request_data(request):
    data = request.data
    if isinstance(data, str):
        try:
            return json.loads(data)
        except Exception:
            return {}
    return data if isinstance(data, dict) else {}


class AiPackageSuggestionView(APIView):
    """POST /ai/suggest-packages: Gợi ý tối đa 3 gói cho thú cưng bằng bộ luật R1-R7 (SPA-25, 26)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = get_request_data(request)
        pet_id = data.get('pet') or data.get('pet_id')
        if not pet_id:
            raise ValidationError({'pet': 'Bắt buộc truyền mã thú cưng.'})
        # Hồ sơ thú được lấy qua API dữ liệu AI (kiểm tra quyền sở hữu nằm trong API đó)
        try:
            suggestions = services.suggest_packages(pet_id, request.user)
            return Response(AiSuggestionSerializer(suggestions, many=True).data)
        except ValueError as e:
            raise ValidationError({'pet': str(e)})


class AiStaffSuggestionView(APIView):
    """POST /ai/suggest-staff: Gợi ý KTV phù hợp cho lịch hẹn (SPA-30)."""

    permission_classes = [IsFrontDesk]

    def post(self, request):
        data = get_request_data(request)
        booking_id = data.get('booking') or data.get('booking_id')
        if not booking_id:
            raise ValidationError({'booking': 'Bắt buộc truyền mã lịch hẹn.'})
        suggestions = services.suggest_staff(booking_id, request.user)
        return Response(AiSuggestionSerializer(suggestions, many=True).data)


class AiSuggestionDecideView(APIView):
    """POST /ai/suggestions/{id}/decide: Người dùng bấm Chấp nhận hoặc Từ chối gợi ý."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk=None):
        try:
            sug = AiSuggestion.objects.get(pk=pk)
        except AiSuggestion.DoesNotExist:
            raise NotFound()

        data = get_request_data(request)
        action = data.get('action')
        if action is None and 'accepted' in data:
            action = 'accept' if data['accepted'] else 'reject'

        if action not in ('accept', 'reject'):
            raise ValidationError({'action': 'Hành động phải là accept hoặc reject.'})

        sug.status = AiSuggestion.Status.ACCEPTED if action == 'accept' else AiSuggestion.Status.REJECTED
        sug.decided_by = request.user
        sug.decided_at = timezone.now()
        sug.save()
        return Response(AiSuggestionSerializer(sug).data)


class RebookReminderViewSet(viewsets.ModelViewSet):
    """rebook-reminders: Danh sách và duyệt nhắc tái spa (SPA-28, 29)."""

    serializer_class = RebookReminderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        u = self.request.user
        # Tự động kiểm tra và quét chu kỳ nếu đến khung giờ và đang bật tính năng tự động
        if u.role in (Role.RECEPTIONIST, Role.MANAGER):
            try:
                services.check_and_run_auto_scan(force=False, user=u)
            except Exception:
                pass

        qs = RebookReminder.objects.select_related('client', 'pet', 'last_booking__package', 'rule').order_by('-due_date', '-id')
        if u.role == Role.CUSTOMER:
            return qs.filter(client__user=u, status=RebookReminder.Status.SENT)
        st = self.request.query_params.get('status')
        if st:
            qs = qs.filter(status=st)
        return qs

    @action(detail=False, methods=['post'], url_path='refresh')
    def refresh_reminders(self, request):
        if request.user.role not in (Role.RECEPTIONIST, Role.MANAGER):
            raise PermissionDenied()
        created = services.generate_rebook_reminders(request.user)
        total_active = RebookReminder.objects.filter(status=RebookReminder.Status.SUGGESTED).count()
        if len(created) > 0:
            msg = f'Đã phân tích xong: Tạo mới {len(created)} lời nhắc tái spa định kỳ cho các bé đến hạn!'
        else:
            msg = f'Đã quét xong: Chưa có thêm bé nào đến hạn chu kỳ mới (Hiện có {total_active} lời nhắc chờ duyệt).'
        return Response({'message': msg, 'created_count': len(created), 'total_suggested': total_active})

    @action(detail=False, methods=['post'], url_path='generate')
    def generate_reminders(self, request):
        return self.refresh_reminders(request)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        if request.user.role not in (Role.RECEPTIONIST, Role.MANAGER):
            raise PermissionDenied()
        reminder = services.approve_reminder(self.get_object(), request.user)
        # Gửi thông báo trong app cho khách (tầng API, không nằm trong lớp AI)
        if reminder.client.user_id:
            notify(
                [reminder.client.user],
                kind='rebook_reminder',
                title=f'🐾 Đã đến lịch chăm sóc định kỳ cho bé {reminder.pet.name}',
                body=reminder.reason_text,
                ref_type='rebook',
                ref_id=reminder.id,
            )
        return Response(RebookReminderSerializer(reminder).data)

    @action(detail=True, methods=['post'])
    def dismiss(self, request, pk=None):
        if request.user.role not in (Role.RECEPTIONIST, Role.MANAGER):
            raise PermissionDenied()
        reminder = self.get_object()
        reminder.status = RebookReminder.Status.DISMISSED
        reminder.save()
        return Response(RebookReminderSerializer(reminder).data)

    @action(detail=True, methods=['post'], url_path='mark-booked')
    def mark_booked(self, request, pk=None):
        if request.user.role not in (Role.RECEPTIONIST, Role.MANAGER):
            raise PermissionDenied()
        reminder = self.get_object()
        reminder.status = RebookReminder.Status.BOOKED
        reminder.save()
        return Response(RebookReminderSerializer(reminder).data)

    @action(detail=False, methods=['get', 'patch', 'post'], url_path='settings')
    def rebook_settings(self, request):
        from .models import RebookSetting
        setting = RebookSetting.get()

        if request.method in ('PATCH', 'POST'):
            if request.user.role not in (Role.RECEPTIONIST, Role.MANAGER):
                raise PermissionDenied()
            data = request.data
            if 'auto_scan_enabled' in data:
                setting.auto_scan_enabled = bool(data['auto_scan_enabled'])
            if 'scan_time' in data:
                setting.scan_time = str(data['scan_time'])[:5]
            if 'auto_approve' in data:
                setting.auto_approve = bool(data['auto_approve'])
            if 'advance_days' in data:
                setting.advance_days = max(0, int(data['advance_days']))
            setting.save()

        return Response({
            'auto_scan_enabled': setting.auto_scan_enabled,
            'scan_time': setting.scan_time,
            'auto_approve': setting.auto_approve,
            'advance_days': setting.advance_days,
            'last_scanned_at': setting.last_scanned_at,
            'updated_at': setting.updated_at,
        })

    @action(detail=False, methods=['post'], url_path='run-auto-scan')
    def run_auto_scan(self, request):
        if request.user.role not in (Role.RECEPTIONIST, Role.MANAGER):
            raise PermissionDenied()
        res = services.check_and_run_auto_scan(force=True, user=request.user)
        count = res.get('created_count', 0)
        auto_approved = res.get('auto_approve', False)
        if count > 0:
            if auto_approved:
                msg = f'Đã quét xong: Tự động tạo và gửi thông báo quả chuông cho {count} thú cưng đến hạn chu kỳ!'
            else:
                msg = f'Đã quét xong: Đã tạo mới {count} lời nhắc tái spa ở trạng thái chờ duyệt.'
        else:
            msg = 'Đã quét xong: Chưa phát hiện thêm thú cưng nào đến hạn chu kỳ mới.'
        return Response({'message': msg, **res})


class AiChatView(APIView):
    """POST /ai/chat: Chatbot tư vấn dựa trên trích xuất tri thức (SPA-23)."""

    permission_classes = [AllowAny]

    def post(self, request):
        data = get_request_data(request)
        question = data.get('question', '').strip()
        if not question:
            raise ValidationError({'question': 'Nội dung câu hỏi không được để trống.'})

        user = request.user if request.user.is_authenticated else None
        pet_id = data.get('pet_id')
        res = services.query_knowledge_chat(question, user, pet_id=pet_id)
        return Response(res)


class AiLogViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """ai/logs: Nhật ký hoạt động của AI (SPA-31). Dành cho Quản lý."""

    serializer_class = AiLogSerializer
    permission_classes = [IsManager]

    def get_queryset(self):
        qs = AiLog.objects.select_related('user', 'pet')
        k = self.request.query_params.get('kind')
        if k and k != 'all':
            qs = qs.filter(kind=k)
        return qs.order_by('-created_at')

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Thống kê tổng quan toàn bộ nhật ký AI."""
        qs = AiLog.objects.all()
        k = request.query_params.get('kind')
        if k and k != 'all':
            qs = qs.filter(kind=k)
        total = qs.count()
        chat_count = qs.filter(kind='chat').count()
        refused_count = qs.filter(status='refused').count()
        avg_latency = qs.aggregate(avg=Avg('latency_ms'))['avg'] or 0
        return Response({
            'total': total,
            'chat_count': chat_count,
            'refused_count': refused_count,
            'avg_latency': round(avg_latency),
        })


class KnowledgeDocViewSet(viewsets.ModelViewSet):
    """ai/knowledge-docs: Quản lý tài liệu SOP & Bảng giá (SPA-24)."""

    serializer_class = KnowledgeDocSerializer
    permission_classes = [IsManager]
    queryset = KnowledgeDoc.objects.prefetch_related('chunks').all()

    def _create_chunks_for_doc(self, doc, sections=None):
        doc.chunks.all().delete()
        if sections and isinstance(sections, list):
            chunks_to_create = []
            valid_texts = []
            for i, sec in enumerate(sections):
                txt = (sec.get('text') or '').strip()
                if not txt:
                    continue
                heading = (sec.get('heading') or '').strip()
                if not heading:
                    heading = f"{doc.title} - {txt.splitlines()[0][:80].lstrip('-*#•1234567890. ')}"
                elif not heading.startswith(doc.title):
                    heading = f"{doc.title} - {heading}"
                chunks_to_create.append(KnowledgeChunk(
                    doc=doc,
                    position=i,
                    heading=heading[:200],
                    text=txt
                ))
                valid_texts.append(txt)
            if chunks_to_create:
                KnowledgeChunk.objects.bulk_create(chunks_to_create)
                joined_text = '\n\n'.join(valid_texts)
                if doc.text_content != joined_text:
                    KnowledgeDoc.objects.filter(id=doc.id).update(text_content=joined_text)
            return

        text = (doc.text_content or '').strip()
        if text:
            raw_paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
            final_sections = []
            for p in raw_paragraphs:
                sub_parts = re.split(r'\n(?=(?:[0-9]+[.)]|Phần\s+[0-9]+|Mục\s+[0-9]+|##+\s+|Q[0-9]+:))', p)
                if len(sub_parts) > 1:
                    final_sections.extend([sp.strip() for sp in sub_parts if sp.strip()])
                else:
                    final_sections.append(p)

            chunk_list = final_sections or [text]
            KnowledgeChunk.objects.bulk_create([
                KnowledgeChunk(
                    doc=doc,
                    position=i,
                    heading=f"{doc.title} - {c.splitlines()[0][:80].lstrip('-*#•1234567890. ')}",
                    text=c
                )
                for i, c in enumerate(chunk_list)
            ])

    def perform_create(self, serializer):
        doc = serializer.save(uploaded_by=self.request.user)
        sections = getattr(doc, '_received_sections', None)
        self._create_chunks_for_doc(doc, sections=sections)

    def perform_update(self, serializer):
        doc = serializer.save()
        sections = getattr(doc, '_received_sections', None)
        if sections is not None or 'text_content' in serializer.validated_data:
            self._create_chunks_for_doc(doc, sections=sections)


class RebookRuleViewSet(viewsets.ModelViewSet):
    """rebook-rules: Bộ luật chu kỳ nhắc tái spa (SPA-28)."""

    serializer_class = RebookRuleSerializer
    queryset = RebookRule.objects.select_related('package').all().order_by('id')

    def get_permissions(self):
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return [IsAuthenticated()]
        return [IsManager()]


class ServiceContraindicationViewSet(viewsets.ModelViewSet):
    """service-contraindications: Ma trận dịch vụ - chống chỉ định (SPA-27)."""

    serializer_class = ServiceContraindicationSerializer
    queryset = ServiceContraindication.objects.select_related('service', 'health_tag').all().order_by('id')

    def get_permissions(self):
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return [IsAuthenticated()]
        return [IsManager()]
