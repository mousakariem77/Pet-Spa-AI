from decimal import Decimal
from django.db.models import Q, Sum
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Role
from scheduling.models import Booking, BookingItem, BookingStatus

from . import services
from .models import Invoice, InvoiceLine


class InvoiceLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLine
        fields = ['id', 'description', 'quantity', 'unit_price', 'amount']


class InvoiceSerializer(serializers.ModelSerializer):
    lines = InvoiceLineSerializer(many=True, read_only=True)
    booking_id = serializers.IntegerField(source='booking.id', read_only=True)
    client_id = serializers.IntegerField(source='booking.client.id', read_only=True)
    client_name = serializers.CharField(source='booking.client.full_name', read_only=True)
    client_phone = serializers.CharField(source='booking.client.phone', read_only=True)
    client_address = serializers.CharField(source='booking.client.address', read_only=True)
    pet_id = serializers.IntegerField(source='booking.pet.id', read_only=True)
    pet_name = serializers.CharField(source='booking.pet.name', read_only=True)
    pet_species = serializers.CharField(source='booking.pet.species', read_only=True)
    pet_breed = serializers.CharField(source='booking.pet.breed', read_only=True)
    pet_weight_kg = serializers.DecimalField(source='booking.pet.weight_kg', max_digits=5, decimal_places=2, read_only=True)
    pet_size_class = serializers.CharField(source='booking.pet.size_class', read_only=True)
    package_name = serializers.CharField(source='booking.package.name', read_only=True)
    staff_name = serializers.SerializerMethodField()
    booking_start_at = serializers.DateTimeField(source='booking.start_at', read_only=True)
    channel = serializers.CharField(source='booking.channel', read_only=True)
    received_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_no', 'booking', 'booking_id',
            'client_id', 'client_name', 'client_phone', 'client_address',
            'pet_id', 'pet_name', 'pet_species', 'pet_breed', 'pet_weight_kg', 'pet_size_class',
            'package_name', 'staff_name', 'booking_start_at', 'channel',
            'subtotal', 'total', 'status', 'payment_method', 'paid_at',
            'received_by_name', 'void_reason', 'created_at', 'lines',
        ]

    def get_staff_name(self, inv):
        if inv.booking and inv.booking.staff and inv.booking.staff.user:
            return inv.booking.staff.user.full_name or inv.booking.staff.user.username
        return None

    def get_received_by_name(self, inv):
        u = inv.received_by
        return (u.full_name or u.username) if u else None


class InvoiceViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    """invoices — Quản lý hóa đơn & thu ngân spa (SPA-19)."""

    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        u = self.request.user
        if u.role == Role.TECHNICIAN:
            return Invoice.objects.none()
        qs = Invoice.objects.select_related(
            'booking__client', 'booking__pet', 'booking__package',
            'booking__staff__user', 'received_by'
        ).prefetch_related('lines')
        if u.role == Role.CUSTOMER:
            qs = qs.filter(booking__client__user=u)

        p = self.request.query_params
        status_param = p.get('status')
        if status_param and status_param != 'all':
            qs = qs.filter(status=status_param)

        payment_method = p.get('payment_method')
        if payment_method and payment_method != 'all':
            qs = qs.filter(payment_method=payment_method)

        q = p.get('q')
        if q:
            q_clean = q.strip()
            qs = qs.filter(
                Q(invoice_no__icontains=q_clean)
                | Q(booking__client__full_name__icontains=q_clean)
                | Q(booking__client__phone__icontains=q_clean)
                | Q(booking__pet__name__icontains=q_clean)
            )

        ordering = p.get('ordering')
        if ordering:
            allowed_orderings = {
                '-created_at': '-created_at',
                'created_at': 'created_at',
                '-total': '-total',
                'total': 'total',
            }
            if ordering in allowed_orderings:
                qs = qs.order_by(allowed_orderings[ordering])

        return qs

    @action(detail=False, methods=['get'], url_path='counts')
    def counts(self, request):
        u = self.request.user
        if u.role == Role.TECHNICIAN:
            return Response({'all': 0, 'unpaid': 0, 'paid': 0, 'void': 0, 'revenue': 0})
        qs = Invoice.objects.all()
        if u.role == Role.CUSTOMER:
            qs = qs.filter(booking__client__user=u)
        total = qs.count()
        unpaid = qs.filter(status=Invoice.Status.UNPAID).count()
        paid = qs.filter(status=Invoice.Status.PAID).count()
        void = qs.filter(status=Invoice.Status.VOID).count()
        total_revenue = qs.filter(status=Invoice.Status.PAID).aggregate(t=Sum('total'))['t'] or 0
        return Response({
            'all': total,
            'unpaid': unpaid,
            'paid': paid,
            'void': void,
            'revenue': int(total_revenue),
        })

    def create(self, request, *args, **kwargs):
        if request.user.role not in (Role.RECEPTIONIST, Role.MANAGER):
            raise PermissionDenied('Chỉ Lễ tân hoặc Quản lý mới được tạo hóa đơn.')

        booking_id = request.data.get('booking') or request.data.get('booking_id')
        if booking_id:
            try:
                booking = Booking.objects.get(pk=booking_id)
            except Booking.DoesNotExist:
                raise ValidationError({'booking': 'Không tìm thấy lịch hẹn tương ứng.'})
            if hasattr(booking, 'invoice'):
                return Response(InvoiceSerializer(booking.invoice).data, status=status.HTTP_200_OK)
            inv = services.create_invoice(booking)
            if request.data.get('is_paid') and request.data.get('payment_method'):
                inv = services.pay(inv, request.user, request.data.get('payment_method'))
            return Response(InvoiceSerializer(inv).data, status=status.HTTP_201_CREATED)

        # Lập hóa đơn trực tiếp tại quầy (walk-in)
        pet_id = request.data.get('pet') or request.data.get('pet_id')
        if not pet_id:
            raise ValidationError({'booking': 'Vui lòng chọn lịch hẹn đã hoàn tất hoặc thú cưng tại quầy.'})

        from customers.models import Pet
        from catalog.models import Package, Service
        from django.utils import timezone

        try:
            pet = Pet.objects.get(pk=pet_id)
        except Pet.DoesNotExist:
            raise ValidationError({'pet': 'Không tìm thấy hồ sơ thú cưng.'})

        now = timezone.now()
        start_time = now - timezone.timedelta(minutes=30)
        end_time = now
        package_id = request.data.get('package') or request.data.get('package_id')
        raw_services = request.data.get('services') or request.data.get('service_ids') or []
        service_ids = [raw_services] if isinstance(raw_services, int) else list(raw_services)

        booking = Booking.objects.create(
            client=pet.client,
            pet=pet,
            package_id=package_id,
            status=BookingStatus.COMPLETED,
            start_at=start_time,
            end_at=end_time,
            completed_at=end_time,
            channel=Booking.Channel.WALK_IN,
            customer_note=request.data.get('note', 'Lập hóa đơn trực tiếp tại quầy'),
            total_price=0,
        )

        items_to_create = []
        total_price = 0
        if package_id:
            pkg = Package.objects.prefetch_related('items__service', 'prices').get(pk=package_id)
            pkg_price = pkg.prices.filter(size_class=pet.size_class).first()
            p_price = pkg_price.price if pkg_price else 0
            for idx, pi in enumerate(pkg.items.all()):
                items_to_create.append(BookingItem(
                    booking=booking,
                    service=pi.service,
                    resource_type=pi.service.resource_type or 'bath_tub',
                    position=idx + 1,
                    unit_price=p_price if idx == 0 else 0,
                    start_at=start_time,
                    end_at=end_time,
                ))
            total_price = p_price
        elif service_ids:
            svcs = Service.objects.prefetch_related('prices').filter(id__in=service_ids)
            for idx, s in enumerate(svcs):
                sp = s.prices.filter(size_class=pet.size_class).first()
                price = sp.price if sp else 0
                items_to_create.append(BookingItem(
                    booking=booking,
                    service=s,
                    resource_type=s.resource_type or 'bath_tub',
                    position=idx + 1,
                    unit_price=price,
                    start_at=start_time,
                    end_at=end_time,
                ))
                total_price += price
        else:
            raise ValidationError({'services': 'Vui lòng chọn ít nhất 1 dịch vụ hoặc gói combo.'})

        BookingItem.objects.bulk_create(items_to_create)
        booking.total_price = total_price
        booking.save(update_fields=['total_price'])

        inv = services.create_invoice(booking)
        if request.data.get('is_paid') and request.data.get('payment_method'):
            inv = services.pay(inv, request.user, request.data.get('payment_method'))

        return Response(InvoiceSerializer(inv).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='unbilled-bookings')
    def unbilled_bookings(self, request):
        if request.user.role not in (Role.RECEPTIONIST, Role.MANAGER):
            raise PermissionDenied()
        qs = Booking.objects.filter(
            status__in=[BookingStatus.COMPLETED, BookingStatus.IN_PROGRESS, BookingStatus.CHECKED_IN],
            invoice__isnull=True,
        ).select_related('client', 'pet', 'package', 'staff__user').order_by('-start_at')
        data = [{
            'id': b.id,
            'client_id': b.client_id,
            'client_name': b.client.full_name,
            'client_phone': b.client.phone,
            'pet_id': b.pet_id,
            'pet_name': b.pet.name,
            'pet_species': b.pet.species,
            'pet_breed': b.pet.breed,
            'pet_size': b.pet.size_class,
            'pet_weight_kg': b.pet.weight_kg,
            'package_name': b.package.name if b.package else 'Dịch vụ lẻ',
            'staff_name': (b.staff.user.full_name or b.staff.user.username) if (b.staff and b.staff.user) else None,
            'status': b.status,
            'status_display': b.get_status_display(),
            'start_at': b.start_at,
            'completed_at': b.completed_at,
            'total_price': int(b.total_price or 0),
        } for b in qs[:50]]
        return Response(data)

    @action(detail=True, methods=['post'])
    def pay(self, request, pk=None):
        if request.user.role not in (Role.RECEPTIONIST, Role.MANAGER):
            raise PermissionDenied()
        inv = services.pay(self.get_object(), request.user, request.data.get('payment_method'))
        return Response(InvoiceSerializer(inv).data)

    @action(detail=True, methods=['post'])
    def void(self, request, pk=None):
        if request.user.role != Role.MANAGER:
            raise PermissionDenied()
        inv = services.void(self.get_object(), request.user, request.data.get('reason'))
        return Response(InvoiceSerializer(inv).data)

    @action(detail=True, methods=['get'], url_path='pdf')
    def download_pdf(self, request, pk=None):
        inv = self.get_object()
        serializer = self.get_serializer(inv)
        from .pdf import generate_invoice_pdf
        from django.http import HttpResponse
        pdf_bytes = generate_invoice_pdf(serializer.data)
        filename = f"Hoa_Don_{inv.invoice_no}.pdf"
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response['Access-Control-Expose-Headers'] = 'Content-Disposition'
        return response
