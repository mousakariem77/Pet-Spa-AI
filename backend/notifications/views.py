from django.db.models import Q
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'kind', 'title', 'body', 'ref_type', 'ref_id', 'link', 'is_read', 'created_at']


class NotificationViewSet(mixins.ListModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """notifications — chỉ thấy và quản lý thông báo của chính mình."""

    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Notification.objects.filter(user=self.request.user)

        # Lọc trạng thái: unread / read / all
        unread = self.request.query_params.get('unread')
        status_param = self.request.query_params.get('status')
        if unread == '1' or status_param == 'unread':
            qs = qs.filter(is_read=False)
        elif status_param == 'read':
            qs = qs.filter(is_read=True)

        # Lọc theo phân loại
        kind = self.request.query_params.get('kind') or self.request.query_params.get('type')
        if kind and kind != 'all':
            if kind == 'booking':
                qs = qs.filter(Q(kind__startswith='booking') | Q(ref_type='booking'))
            elif kind == 'invoice':
                qs = qs.filter(Q(kind__startswith='invoice') | Q(ref_type='invoice'))
            elif kind == 'reminder':
                qs = qs.filter(Q(kind__startswith='rebook') | Q(ref_type='reminder'))
            elif kind == 'staff':
                qs = qs.filter(Q(kind__startswith='staff') | Q(ref_type='staff'))
            elif kind == 'system':
                qs = qs.filter(Q(kind='system') | Q(ref_type='system'))
            else:
                qs = qs.filter(kind=kind)

        # Tìm kiếm theo từ khóa
        q = self.request.query_params.get('q')
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(body__icontains=q))

        return qs.order_by('-created_at', '-id')

    def perform_destroy(self, instance):
        instance.delete()

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        return Response({'count': Notification.objects.filter(user=request.user, is_read=False).count()})

    @action(detail=True, methods=['post'])
    def read(self, request, pk=None):
        n = self.get_object()
        n.is_read = True
        n.save(update_fields=['is_read'])
        return Response(NotificationSerializer(n).data)

    @action(detail=True, methods=['post'], url_path='unread')
    def unread(self, request, pk=None):
        n = self.get_object()
        n.is_read = False
        n.save(update_fields=['is_read'])
        return Response(NotificationSerializer(n).data)

    @action(detail=False, methods=['post'], url_path='read-all')
    def read_all(self, request):
        Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return Response({'ok': True})
