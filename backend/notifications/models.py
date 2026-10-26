from django.conf import settings
from django.db import models


class Notification(models.Model):
    """Thông báo trong ứng dụng (SPA-21, 29). Không có kênh SMS/Zalo."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    kind = models.CharField(max_length=40)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    ref_type = models.CharField(max_length=40, blank=True)
    ref_id = models.PositiveIntegerField(null=True, blank=True)
    link = models.CharField(max_length=255, blank=True, default='')
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Thông báo'
        verbose_name_plural = 'Thông báo'
        ordering = ['-created_at', '-id']


def _default_link(ref_type, ref_id=None):
    if not ref_type:
        return ''
    if ref_type == 'booking':
        return f'/app/lich-hen?id={ref_id}' if ref_id else '/app/lich-hen'
    if ref_type == 'invoice':
        return f'/app/hoa-don?id={ref_id}' if ref_id else '/app/hoa-don'
    if ref_type == 'reminder':
        return '/app/nhac-tai-spa'
    if ref_type in ('client', 'customer'):
        return f'/app/khach-hang?id={ref_id}' if ref_id else '/app/khach-hang'
    if ref_type == 'pet':
        return f'/app/thu-cung?id={ref_id}' if ref_id else '/app/thu-cung'
    if ref_type in ('staff', 'timeoff'):
        return '/app/nhan-su'
    if ref_type == 'analytics':
        return '/app/thong-ke'
    return ''


def notify(users, kind, title, body='', ref_type='', ref_id=None, link=''):
    """Tạo thông báo cho danh sách người dùng (bỏ trùng, bỏ None, bỏ inactive)."""
    seen = {u.pk: u for u in users if u is not None and getattr(u, 'is_active', True)}
    if not seen:
        return []
    resolved_link = link or _default_link(ref_type, ref_id)
    return Notification.objects.bulk_create([
        Notification(
            user=u,
            kind=kind,
            title=title,
            body=body,
            ref_type=ref_type,
            ref_id=ref_id,
            link=resolved_link,
        )
        for u in seen.values()
    ])
