"""Client gọi API dữ liệu AI (`/api/v1/ai/data/...`) ngay trong process, không đi qua mạng.

Lớp AI chỉ được lấy dữ liệu qua client này, không import model của catalog/customers/scheduling/spa.
Request đi qua đầy đủ middleware + permission của DRF, dùng đúng quyền của người đang gọi
(khách vãng lai gọi ẩn danh).
"""
from django.conf import settings
from rest_framework.exceptions import APIException, NotAuthenticated, NotFound, PermissionDenied
from rest_framework.test import APIClient

API_PREFIX = '/api/v1/ai/data'


def _host():
    hosts = [h for h in settings.ALLOWED_HOSTS if h and not h.startswith('.') and h != '*']
    return hosts[0] if hosts else 'localhost'


class AiDataClient:
    def __init__(self, user=None):
        self._client = APIClient(HTTP_HOST=_host())
        if user is not None and getattr(user, 'is_authenticated', False):
            self._client.force_authenticate(user)
        else:
            # Với tác vụ hệ thống chạy ngầm / cron, xác thực qua tài khoản quản lý
            from django.contrib.auth import get_user_model
            User = get_user_model()
            system_user = User.objects.filter(role__in=['manager', 'receptionist'], is_active=True).first()
            if system_user:
                self._client.force_authenticate(system_user)

    def _get(self, path, params=None):
        res = self._client.get(f'{API_PREFIX}/{path}', params or {})
        if res.status_code == 401:
            raise NotAuthenticated()
        if res.status_code == 403:
            raise PermissionDenied()
        if res.status_code == 404:
            body = res.json() if res.content else {}
            raise NotFound(body.get('detail') if isinstance(body, dict) else None)
        if res.status_code >= 400:
            raise APIException(f'API dữ liệu AI lỗi {res.status_code}.')
        return res.json()

    def knowledge_chunks(self):
        return self._get('knowledge')

    def pet_profile(self, pet_id):
        return self._get(f'pets/{pet_id}')

    def my_pets(self, pet_id=None, client_id=None):
        params = {}
        if pet_id:
            params['pet_id'] = pet_id
        if client_id:
            params['client_id'] = client_id
        return self._get('my-pets', params)

    def packages(self):
        return self._get('packages')

    def contraindications(self, service_ids, tag_ids):
        if not service_ids or not tag_ids:
            return []
        return self._get('contraindications', {
            'service_ids': ','.join(map(str, service_ids)),
            'tag_ids': ','.join(map(str, tag_ids)),
        })

    def staff_candidates(self, booking_id):
        return self._get(f'bookings/{booking_id}/staff-candidates')

    def rebook_candidates(self):
        return self._get('rebook-candidates')
