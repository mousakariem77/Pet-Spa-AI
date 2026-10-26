from datetime import datetime, timedelta

from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role
from accounts.permissions import IsFrontDesk
from billing.models import Invoice
from catalog.models import Package, Service
from customers.models import Client, Pet

from . import services
from .models import (
    ACTIVE_STATUSES, Booking, BookingItem, BookingStatus,
    WalkInStatus, WalkInTicket,
)

FRONT_DESK = (Role.RECEPTIONIST, Role.MANAGER)


def _day_start(d):
    return timezone.make_aware(datetime.combine(d, datetime.min.time()), timezone.get_current_timezone())


class BookingItemSerializer(serializers.ModelSerializer):
    service_name = serializers.CharField(source='service.name', read_only=True)
    resource_name = serializers.CharField(source='resource.name', read_only=True, default=None)

    class Meta:
        model = BookingItem
        fields = ['id', 'service', 'service_name', 'position', 'start_at', 'end_at', 'resource_type',
                  'resource', 'resource_name', 'unit_price']


class BookingSerializer(serializers.ModelSerializer):
    """Khách không thấy ghi chú nội bộ và ghi chú an toàn của thú."""

    client_info = serializers.SerializerMethodField()
    pet_info = serializers.SerializerMethodField()
    package_name = serializers.CharField(source='package.name', read_only=True, default=None)
    staff_name = serializers.SerializerMethodField()
    items = BookingItemSerializer(many=True, read_only=True)
    invoice = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = ['id', 'client', 'client_info', 'pet', 'pet_info', 'package', 'package_name', 'staff',
                  'staff_name', 'status', 'start_at', 'end_at', 'channel', 'note_internal', 'customer_note',
                  'cancel_reason', 'cancel_reason_code', 'checked_in_at', 'checked_out_at', 'completed_at',
                  'total_price', 'items', 'invoice', 'created_at']

    def _is_staff(self):
        return self.context['request'].user.role != Role.CUSTOMER

    def get_client_info(self, b):
        return {'id': b.client_id, 'full_name': b.client.full_name, 'phone': b.client.phone}

    def get_pet_info(self, b):
        p = b.pet
        info = {'id': p.pk, 'name': p.name, 'species': p.species, 'breed': p.breed, 'size_class': p.size_class,
                'coat_type': p.coat_type, 'allergy_note': p.allergy_note,
                'health_tags': [t.name_vi for t in p.health_tags.all()]}
        if self._is_staff():
            info['safety_note'] = p.safety_note
            info['behavior_flags'] = [t.name_vi for t in p.health_tags.all() if t.kind == 'behavior']
        return info

    def get_staff_name(self, b):
        return str(b.staff) if b.staff_id else None

    def get_invoice(self, b):
        inv = getattr(b, 'invoice', None)
        return {'id': inv.pk, 'invoice_no': inv.invoice_no, 'status': inv.status, 'total': inv.total} if inv else None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not self._is_staff():
            data.pop('note_internal', None)
        return data


class BookingDetailSerializer(BookingSerializer):
    logs = serializers.SerializerMethodField()

    class Meta(BookingSerializer.Meta):
        fields = BookingSerializer.Meta.fields + ['logs']

    def get_logs(self, b):
        return [{'from_status': lg.from_status, 'to_status': lg.to_status, 'reason': lg.reason,
                 'changed_at': lg.changed_at,
                 'changed_by': (lg.changed_by.full_name or lg.changed_by.username) if lg.changed_by else None}
                for lg in b.logs.select_related('changed_by')]


class BookingInputSerializer(serializers.Serializer):
    pet = serializers.PrimaryKeyRelatedField(queryset=Pet.objects.select_related('client'))
    package = serializers.IntegerField(required=False, allow_null=True)
    services = serializers.ListField(child=serializers.IntegerField(), required=False)
    start_at = serializers.DateTimeField()
    staff = serializers.IntegerField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, default='')
    customer_note = serializers.CharField(required=False, allow_blank=True, default='')
    channel = serializers.ChoiceField(choices=['counter', 'walk_in'], required=False)
    confirm = serializers.BooleanField(required=False, default=True)
    exclude_id = serializers.IntegerField(required=False, allow_null=True)


class BookingUpdateSerializer(serializers.Serializer):
    pet = serializers.PrimaryKeyRelatedField(queryset=Pet.objects.select_related('client'), required=False)
    package = serializers.IntegerField(required=False, allow_null=True)
    services = serializers.ListField(child=serializers.IntegerField(), required=False)
    start_at = serializers.DateTimeField(required=False)
    staff = serializers.IntegerField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True)
    customer_note = serializers.CharField(required=False, allow_blank=True)


class CancelSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default='')
    code = serializers.ChoiceField(choices=Booking.CancelCode.values, required=False, default='')


def _pet_for(user, pet):
    """Khách chỉ thao tác trên thú của mình; không để lộ sự tồn tại thú người khác."""
    if user.role == Role.CUSTOMER and pet.client.user_id != user.id:
        raise NotFound()
    return pet


class BookingViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = BookingSerializer

    def get_serializer_class(self):
        return BookingDetailSerializer if self.action == 'retrieve' else BookingSerializer

    def get_queryset(self):
        u = self.request.user
        qs = Booking.objects.select_related(
            'client', 'pet', 'package', 'staff__user', 'invoice').prefetch_related(
            'items__service', 'items__resource', 'pet__health_tags', 'logs')
        if u.role == Role.CUSTOMER:
            qs = qs.filter(client__user=u)
        elif u.role == Role.TECHNICIAN:
            qs = qs.filter(staff__user=u)
        p = self.request.query_params
        if p.get('date'):
            d = parse_date(p['date'])
            if not d:
                raise ValidationError({'date': 'Ngày không hợp lệ (YYYY-MM-DD).'})
            qs = qs.filter(start_at__gte=_day_start(d), start_at__lt=_day_start(d + timedelta(days=1)))
        if parse_date(p.get('date_from', '')):
            qs = qs.filter(start_at__gte=_day_start(parse_date(p['date_from'])))
        if parse_date(p.get('date_to', '')):
            qs = qs.filter(start_at__lt=_day_start(parse_date(p['date_to']) + timedelta(days=1)))
        if p.get('status'):
            qs = qs.filter(status__in=p['status'].split(','))
        for key in ('pet', 'staff', 'client'):
            if p.get(key):
                qs = qs.filter(**{f'{key}_id': p[key]})
        if p.get('q') and u.role != Role.CUSTOMER:
            qs = qs.filter(Q(pet__name__icontains=p['q']) | Q(client__full_name__icontains=p['q'])
                           | Q(client__phone__icontains=p['q']))
        return qs.order_by('start_at')

    # --- Đọc
    @action(detail=False, methods=['post'], url_path='quote')
    def quote(self, request):
        s = BookingInputSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        pet = _pet_for(request.user, d['pet'])
        staff = d.get('staff') if request.user.role != Role.CUSTOMER else None
        return Response(services.quote(pet, d.get('package'), d.get('services'), d['start_at'], staff, exclude_id=d.get('exclude_id')))

    @action(detail=False, methods=['get'], url_path='availability')
    def availability(self, request):
        p = request.query_params
        day = parse_date(p.get('date', ''))
        if not day:
            raise ValidationError({'date': 'Bắt buộc, dạng YYYY-MM-DD.'})
        try:
            pet = Pet.objects.select_related('client').get(pk=p.get('pet'))
        except (Pet.DoesNotExist, ValueError, TypeError):
            raise ValidationError({'pet': 'Bắt buộc chọn thú hợp lệ.'})
        _pet_for(request.user, pet)
        svc = [int(x) for x in p['services'].split(',') if x] if p.get('services') else None
        staff = p.get('staff') if request.user.role != Role.CUSTOMER else None
        return Response(services.availability(pet, p.get('package') or None, svc, day, staff))

    # --- Ghi
    def create(self, request):
        if request.user.role == Role.TECHNICIAN:
            raise PermissionDenied()
        s = BookingInputSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        pet = _pet_for(request.user, d['pet'])
        b = services.create_booking(
            request.user, pet, d.get('package'), d.get('services'), d['start_at'], d.get('staff'),
            d['note'], d['customer_note'], d.get('channel'), d['confirm'])
        return Response(self._out(b, request), status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        return self.partial_update(request, pk)

    def partial_update(self, request, pk=None):
        if request.user.role == Role.TECHNICIAN:
            raise PermissionDenied()
        booking = self.get_object()
        s = BookingUpdateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        pet = None
        if 'pet' in d:
            pet = _pet_for(request.user, d['pet'])
        b = services.update_booking(
            booking=booking,
            user=request.user,
            pet=pet,
            package_id=d.get('package'),
            service_ids=d.get('services'),
            start_at=d.get('start_at'),
            staff_id=d.get('staff'),
            note=d.get('note'),
            customer_note=d.get('customer_note'),
        )
        return Response(self._out(b, request))

    def _out(self, booking, request):
        booking = self.get_queryset().get(pk=booking.pk) if request.user.role != Role.TECHNICIAN else \
            Booking.objects.get(pk=booking.pk)
        return BookingDetailSerializer(booking, context={'request': request}).data

    def _front_desk_only(self, request):
        if request.user.role not in FRONT_DESK:
            raise PermissionDenied()

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        self._front_desk_only(request)
        return Response(self._out(services.confirm(self.get_object(), request.user), request))

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        self._front_desk_only(request)
        s = CancelSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        b = services.cancel(self.get_object(), request.user, s.validated_data['reason'], code='rejected')
        return Response(self._out(b, request))

    @action(detail=False, methods=['get'])
    def calendar(self, request):
        p = request.query_params
        d_from = parse_date(p.get('from') or p.get('date_from', ''))
        d_to = parse_date(p.get('to') or p.get('date_to', ''))
        qs = self.get_queryset()
        if d_from:
            qs = qs.filter(start_at__gte=_day_start(d_from))
        if d_to:
            qs = qs.filter(start_at__lt=_day_start(d_to + timedelta(days=1)))
        return Response([self._out(b, request) for b in qs])

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        if request.user.role == Role.TECHNICIAN:
            raise PermissionDenied()
        s = CancelSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        b = services.cancel(self.get_object(), request.user, s.validated_data['reason'], s.validated_data['code'])
        return Response(self._out(b, request))

    @action(detail=True, methods=['post'], url_path='assign-staff')
    def assign_staff(self, request, pk=None):
        self._front_desk_only(request)
        b = services.assign_staff(self.get_object(), request.data.get('staff'), request.user)
        return Response(self._out(b, request))

    @action(detail=True, methods=['post'], url_path='check-in')
    def check_in(self, request, pk=None):
        self._front_desk_only(request)
        raw = request.data.get('resources') or {}
        try:
            assignments = {int(k): int(v) for k, v in raw.items()}
        except (ValueError, TypeError, AttributeError):
            raise ValidationError({'resources': 'Dạng {mã_dòng: mã_tài_nguyên}.'})
        return Response(self._out(services.check_in(self.get_object(), request.user, assignments), request))

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        if request.user.role not in (Role.TECHNICIAN, Role.MANAGER):
            raise PermissionDenied()
        return Response(self._out(services.start(self.get_object(), request.user), request))

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        if request.user.role not in (Role.TECHNICIAN, Role.MANAGER):
            raise PermissionDenied()
        return Response(self._out(services.complete(self.get_object(), request.user), request))

    @action(detail=True, methods=['post'], url_path='check-out')
    def check_out(self, request, pk=None):
        self._front_desk_only(request)
        b = services.check_out(self.get_object(), request.user)
        out = self._out(b, request)
        inv = out.get('invoice')
        out['warnings'] = [] if (inv and inv['status'] == 'paid') else [
            {'severity': 'warn', 'code': 'unpaid', 'detail': 'Hóa đơn chưa được thu tiền.'}]
        return Response(out)


class DashboardView(APIView):
    """dashboard/today & dashboard/daily — tổng quan ngày cho Lễ tân/Quản lý (SPA-20). Doanh thu chỉ cộng hóa đơn đã thu."""

    permission_classes = [IsFrontDesk]

    def get(self, request):
        from spa.models import StaffProfile, Resource
        day = parse_date(request.query_params.get('date', '')) or timezone.localdate()
        lo, hi = _day_start(day), _day_start(day + timedelta(days=1))
        today = Booking.objects.filter(start_at__gte=lo, start_at__lt=hi)
        counts = {s.value: today.filter(status=s).count() for s in BookingStatus}
        paid = Invoice.objects.filter(status=Invoice.Status.PAID, paid_at__gte=lo, paid_at__lt=hi)
        revenue = sum(i.total for i in paid)
        now = timezone.now()
        attention = Booking.objects.filter(status=BookingStatus.PENDING).filter(
            Q(created_at__lt=now - timedelta(hours=24)) | Q(start_at__lt=now))
        unpaid = Invoice.objects.filter(status=Invoice.Status.UNPAID)
        by_staff = {}
        active_or_done = tuple(ACTIVE_STATUSES) + (BookingStatus.COMPLETED,)
        for b in today.filter(status__in=active_or_done).select_related('staff__user'):
            key = str(b.staff) if b.staff_id else 'Chưa giao'
            by_staff[key] = by_staff.get(key, 0) + 1

        feed_qs = today.select_related(
            'client', 'pet', 'package', 'staff__user', 'invoice'
        ).prefetch_related(
            'items__service', 'items__resource', 'pet__health_tags'
        ).order_by('start_at')
        feed = BookingSerializer(feed_qs, many=True, context={'request': request}).data

        attention_list = []
        for b in attention.select_related('pet', 'client')[:20]:
            is_overdue = b.start_at < now
            is_expired = b.created_at < (now - timedelta(hours=24))
            reason = "Quá giờ hẹn" if is_overdue else "Chờ duyệt >24h"
            if is_overdue and is_expired:
                reason = "Quá giờ hẹn & Chờ duyệt >24h"
            attention_list.append({
                'id': b.pk,
                'pet': b.pet.name,
                'pet_id': b.pet_id,
                'client_name': b.client.full_name,
                'client_phone': b.client.phone,
                'start_at': b.start_at,
                'created_at': b.created_at,
                'reason': reason,
                'is_overdue': is_overdue,
                'is_expired': is_expired,
            })

        day_weekday = day.weekday()
        staff_profiles = StaffProfile.objects.filter(is_active=True).select_related('user').prefetch_related(
            'shifts', 'specialties', 'time_off'
        )
        staff_on_duty = []
        for sp in staff_profiles:
            shifts_today = [s for s in sp.shifts.all() if s.weekday == day_weekday]
            on_leave = any(t.date_from <= day <= t.date_to for t in sp.time_off.all())
            assigned_today = today.filter(staff=sp).count()
            in_progress_today = today.filter(staff=sp, status__in=('checked_in', 'in_progress')).count()
            completed_today = today.filter(staff=sp, status=BookingStatus.COMPLETED).count()
            shift_time_str = ', '.join(f"{s.start_time.strftime('%H:%M')}–{s.end_time.strftime('%H:%M')}" for s in shifts_today) if shifts_today else 'Không có ca'

            staff_on_duty.append({
                'id': sp.pk,
                'user_id': sp.user_id,
                'name': sp.user.full_name or sp.user.username,
                'username': sp.user.username,
                'role': sp.user.role,
                'specialties': [spec.name_vi for spec in sp.specialties.all()],
                'shifts': shift_time_str,
                'has_shift': bool(shifts_today),
                'on_leave': on_leave,
                'assigned_count': assigned_today,
                'in_progress_count': in_progress_today,
                'completed_count': completed_today,
            })

        resources = Resource.objects.filter(is_active=True)
        res_summary = {
            'total': resources.count(),
            'by_type': {},
        }
        for r in resources:
            res_summary['by_type'][r.resource_type] = res_summary['by_type'].get(r.resource_type, 0) + 1

        in_service_count = counts.get('checked_in', 0) + counts.get('in_progress', 0)

        return Response({
            'date': day,
            'counts': counts,
            'total_bookings': sum(counts.values()),
            'revenue': revenue,
            'paid_invoices': paid.count(),
            'unpaid_count': unpaid.count(),
            'unpaid_total': sum(i.total for i in unpaid),
            'needs_attention': attention_list,
            'by_staff': [{'staff': k, 'count': v} for k, v in by_staff.items()],
            'feed': feed,
            'staff_on_duty': staff_on_duty,
            'resources_summary': res_summary,
            'in_service_count': in_service_count,
        })


# ==============================================================================
# SERIALIZERS & VIEWSET CHO HÀNG ĐỢI WALK-IN (SPA-18)
# ==============================================================================

class WalkInTicketSerializer(serializers.ModelSerializer):
    queue_code = serializers.SerializerMethodField()
    client_name = serializers.CharField(source='client.full_name', read_only=True, default=None)
    service_name = serializers.CharField(source='service.name', read_only=True, default=None)
    package_name = serializers.CharField(source='package.name', read_only=True, default=None)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    booking_id = serializers.IntegerField(source='booking.id', read_only=True, default=None)

    class Meta:
        model = WalkInTicket
        fields = [
            'id', 'date', 'queue_no', 'queue_code', 'contact_name', 'phone',
            'client', 'client_name', 'pet', 'pet_name', 'pet_species',
            'service', 'service_name', 'package', 'package_name',
            'status', 'status_label', 'estimated_wait_minutes',
            'booking', 'booking_id', 'note',
            'called_at', 'served_at', 'left_at', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'date', 'queue_no', 'queue_code', 'status', 'status_label',
            'estimated_wait_minutes', 'booking', 'booking_id',
            'called_at', 'served_at', 'left_at', 'created_at', 'updated_at',
        ]

    def get_queue_code(self, obj):
        return f'#{obj.queue_no:02d}'


class WalkInTicketCreateSerializer(serializers.Serializer):
    contact_name = serializers.CharField(max_length=120, required=False, allow_blank=True, default='')
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')
    pet_name = serializers.CharField(max_length=120, required=False, allow_blank=True, default='')
    pet_species = serializers.ChoiceField(choices=[('dog', 'Chó'), ('cat', 'Mèo')], default='dog')
    service = serializers.PrimaryKeyRelatedField(queryset=Service.objects.filter(is_active=True), required=False, allow_null=True, default=None)
    package = serializers.PrimaryKeyRelatedField(queryset=Package.objects.filter(is_active=True), required=False, allow_null=True, default=None)
    client = serializers.PrimaryKeyRelatedField(queryset=Client.objects.all(), required=False, allow_null=True, default=None)
    pet = serializers.PrimaryKeyRelatedField(queryset=Pet.objects.all(), required=False, allow_null=True, default=None)
    note = serializers.CharField(required=False, allow_blank=True, default='')


class WalkInTicketViewSet(viewsets.ModelViewSet):
    """Quản lý hàng đợi khách vãng lai tại quầy (SPA-18)."""

    queryset = WalkInTicket.objects.select_related('client', 'pet', 'service', 'package', 'booking').all()
    serializer_class = WalkInTicketSerializer

    def get_permissions(self):
        if self.action in ['create', 'kiosk']:
            return []
        return [IsAuthenticated()]

    def get_queryset(self):
        day_str = self.request.query_params.get('date')
        target_day = parse_date(day_str) if day_str else timezone.localdate()
        if not target_day:
            target_day = timezone.localdate()
        qs = self.queryset.filter(date=target_day)
        st = self.request.query_params.get('status')
        if st:
            qs = qs.filter(status=st)
        return qs.order_by('queue_no')

    def list(self, request, *args, **kwargs):
        if request.user.role not in FRONT_DESK:
            raise PermissionDenied()
        qs = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(qs, many=True)

        day_str = request.query_params.get('date')
        target_day = parse_date(day_str) if day_str else timezone.localdate()
        day_tickets = WalkInTicket.objects.filter(date=target_day)

        waiting = day_tickets.filter(status=WalkInStatus.WAITING).count()
        called = day_tickets.filter(status=WalkInStatus.CALLED).count()
        served = day_tickets.filter(status=WalkInStatus.SERVED).count()
        left = day_tickets.filter(status=WalkInStatus.LEFT).count()
        total = day_tickets.count()

        current_called_ticket = day_tickets.filter(status=WalkInStatus.CALLED).order_by('-called_at').first()
        next_waiting_ticket = day_tickets.filter(status=WalkInStatus.WAITING).order_by('queue_no').first()

        avg_wait = 15
        if waiting > 0:
            avg_wait = next_waiting_ticket.estimated_wait_minutes if next_waiting_ticket else 15

        return Response({
            'date': target_day,
            'summary': {
                'total': total,
                'waiting': waiting,
                'called': called,
                'served': served,
                'left': left,
                'current_called': current_called_ticket.queue_no if current_called_ticket else None,
                'next_waiting': next_waiting_ticket.queue_no if next_waiting_ticket else None,
                'average_wait_minutes': avg_wait,
            },
            'results': serializer.data,
        })

    def create(self, request, *args, **kwargs):
        s = WalkInTicketCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        ticket = services.create_walk_in(
            contact_name=d.get('contact_name'),
            phone=d.get('phone'),
            pet_name=d.get('pet_name'),
            pet_species=d.get('pet_species', 'dog'),
            service=d.get('service'),
            package=d.get('package'),
            client=d.get('client'),
            pet=d.get('pet'),
            note=d.get('note', ''),
        )
        return Response(self.get_serializer(ticket).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def call(self, request, pk=None):
        if request.user.role not in FRONT_DESK:
            raise PermissionDenied()
        ticket = self.get_object()
        ticket = services.call_walk_in(ticket, request.user)
        return Response(self.get_serializer(ticket).data)

    @action(detail=True, methods=['post'])
    def convert(self, request, pk=None):
        if request.user.role not in FRONT_DESK:
            raise PermissionDenied()
        ticket = self.get_object()
        staff_id = request.data.get('staff')
        raw_resources = request.data.get('resources')
        assignments = None
        if raw_resources:
            try:
                assignments = {int(k): int(v) for k, v in raw_resources.items()}
            except (ValueError, TypeError, AttributeError):
                raise ValidationError({'resources': 'Dạng {mã_dòng: mã_tài_nguyên}.'})

        ticket, booking = services.convert_walk_in(ticket, request.user, staff_id=staff_id, assignments=assignments)
        return Response({
            'ticket': self.get_serializer(ticket).data,
            'booking': BookingDetailSerializer(booking, context={'request': request}).data,
        })

    @action(detail=True, methods=['post'])
    def leave(self, request, pk=None):
        if request.user.role not in FRONT_DESK:
            raise PermissionDenied()
        ticket = self.get_object()
        reason = request.data.get('reason', '')
        ticket = services.leave_walk_in(ticket, request.user, reason=reason)
        return Response(self.get_serializer(ticket).data)

    @action(detail=False, methods=['get'])
    def kiosk(self, request):
        today = timezone.localdate()
        day_tickets = WalkInTicket.objects.filter(date=today)
        called = day_tickets.filter(status=WalkInStatus.CALLED).order_by('-called_at')[:5]
        waiting = day_tickets.filter(status=WalkInStatus.WAITING).order_by('queue_no')[:5]
        return Response({
            'date': today,
            'called': self.get_serializer(called, many=True).data,
            'waiting': self.get_serializer(waiting, many=True).data,
            'waiting_count': day_tickets.filter(status=WalkInStatus.WAITING).count(),
        })

