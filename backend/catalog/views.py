from django.db import transaction
from django.db.models import ProtectedError
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Role
from accounts.permissions import IsManager, IsStaffRole, ReadAnyWriteManager

from .models import (
    HealthTag, Package, PackageItem, PackagePrice, Service, ServicePrice, SizeBand, Specialty,
)
from .serializers import (
    HealthTagSerializer, ItemsInputSerializer, PackageSerializer, PricesInputSerializer,
    ServiceSerializer, SizeBandSerializer, SpecialtySerializer,
)

SAFE = ('GET', 'HEAD', 'OPTIONS')


def _is_manager(request):
    u = request.user
    return bool(u and u.is_authenticated and u.role == Role.MANAGER)


class ServiceViewSet(viewsets.ModelViewSet):
    """services — công khai xem dịch vụ đang hoạt động; Quản lý xem/sửa tất cả."""

    serializer_class = ServiceSerializer
    permission_classes = [ReadAnyWriteManager]
    pagination_class = None

    def get_queryset(self):
        qs = Service.objects.prefetch_related('prices')
        return qs if _is_manager(self.request) else qs.filter(is_active=True)

    def perform_destroy(self, instance):
        if instance.is_active:
            raise ValidationError({'detail': 'Chỉ có thể xóa dịch vụ đã bị ẩn. Vui lòng ẩn dịch vụ trước khi xóa.'})
        try:
            instance.delete()
        except ProtectedError:
            raise ValidationError({
                'detail': 'Không thể xóa vĩnh viễn dịch vụ này do đã có dữ liệu liên quan (lịch hẹn hoặc gói combo). Hãy giữ ở trạng thái ẩn để bảo toàn lịch sử giao dịch.'
            })

    @action(detail=True, methods=['put'], url_path='prices')
    @transaction.atomic
    def set_prices(self, request, pk=None):
        service = self.get_object()
        s = PricesInputSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        for size, price in s.validated_data['prices'].items():
            ServicePrice.objects.update_or_create(
                service=service, size_class=size, defaults={'price': price})
        return Response(ServiceSerializer(self.get_object()).data)


class PackageViewSet(viewsets.ModelViewSet):
    serializer_class = PackageSerializer
    permission_classes = [ReadAnyWriteManager]
    pagination_class = None

    def get_queryset(self):
        qs = Package.objects.prefetch_related('prices', 'items__service')
        return qs if _is_manager(self.request) else qs.filter(is_active=True)

    def perform_destroy(self, instance):
        if instance.is_active:
            raise ValidationError({'detail': 'Chỉ có thể xóa gói combo đã bị ẩn. Vui lòng ẩn gói combo trước khi xóa.'})
        try:
            instance.delete()
        except ProtectedError:
            raise ValidationError({
                'detail': 'Không thể xóa vĩnh viễn gói combo này do đã có dữ liệu liên quan (lịch hẹn). Hãy giữ ở trạng thái ẩn để bảo toàn lịch sử giao dịch.'
            })

    @action(detail=True, methods=['put'], url_path='prices')
    @transaction.atomic
    def set_prices(self, request, pk=None):
        package = self.get_object()
        s = PricesInputSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        for size, price in s.validated_data['prices'].items():
            PackagePrice.objects.update_or_create(
                package=package, size_class=size, defaults={'price': price})
        return Response(PackageSerializer(self.get_object()).data)

    @action(detail=True, methods=['put'], url_path='items')
    @transaction.atomic
    def set_items(self, request, pk=None):
        package = self.get_object()
        s = ItemsInputSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        package.items.all().delete()
        PackageItem.objects.bulk_create([
            PackageItem(package=package, service_id=sid, position=i)
            for i, sid in enumerate(s.validated_data['services'])
        ])
        return Response(PackageSerializer(self.get_object()).data)


class SizeBandViewSet(viewsets.ModelViewSet):
    queryset = SizeBand.objects.order_by('species', 'min_kg')
    serializer_class = SizeBandSerializer
    permission_classes = [ReadAnyWriteManager]
    pagination_class = None


class SpecialtyViewSet(viewsets.ModelViewSet):
    serializer_class = SpecialtySerializer
    pagination_class = None

    def get_queryset(self):
        qs = Specialty.objects.all()
        if self.action == 'list' and self.request.query_params.get('include_inactive') != '1':
            qs = qs.filter(is_active=True)
        return qs

    def perform_destroy(self, instance):
        if instance.is_active:
            raise ValidationError({'detail': 'Chỉ có thể xóa chuyên môn đã bị ẩn. Vui lòng ẩn chuyên môn trước khi xóa.'})
        try:
            instance.delete()
        except ProtectedError:
            raise ValidationError({'detail': 'Không thể xóa vĩnh viễn chuyên môn này do đang có dịch vụ hoặc nhân sự liên kết. Hãy giữ ở trạng thái ẩn.'})

    def get_permissions(self):
        return [IsStaffRole()] if self.request.method in SAFE else [IsManager()]


class HealthTagViewSet(viewsets.ModelViewSet):
    queryset = HealthTag.objects.all()
    serializer_class = HealthTagSerializer
    pagination_class = None

    def get_permissions(self):
        return [IsAuthenticated()] if self.request.method in SAFE else [IsManager()]
