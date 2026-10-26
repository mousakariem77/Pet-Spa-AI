from datetime import time

from django.db import transaction
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response

from accounts.models import Role, User
from accounts.permissions import IsStaffRole
from catalog.models import Specialty

from .models import Resource, Spa, StaffProfile, TimeOff, WorkShift

STAFF_ROLES = (Role.MANAGER, Role.RECEPTIONIST, Role.TECHNICIAN)


class StaffSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username')
    full_name = serializers.CharField(source='user.full_name')
    phone = serializers.CharField(source='user.phone', required=False, allow_blank=True)
    email = serializers.EmailField(source='user.email', required=False, allow_blank=True)
    role = serializers.ChoiceField(source='user.role', choices=STAFF_ROLES)
    password = serializers.CharField(write_only=True, required=False, min_length=8)
    specialties = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Specialty.objects.all(), required=False)
    birthday = serializers.DateField(required=False, allow_null=True)
    gender = serializers.CharField(required=False, allow_blank=True, default='other')
    address = serializers.CharField(required=False, allow_blank=True, default='')

    class Meta:
        model = StaffProfile
        fields = ['id', 'user_id', 'username', 'full_name', 'phone', 'email', 'role', 'password',
                  'specialties', 'is_active', 'birthday', 'gender', 'address']

    def validate_username(self, v):
        qs = User.objects.filter(username__iexact=v)
        if self.instance:
            qs = qs.exclude(pk=self.instance.user_id)
        if qs.exists():
            raise serializers.ValidationError('Tên đăng nhập đã tồn tại.')
        return v

    def validate(self, attrs):
        if self.instance is None and not attrs.get('password'):
            raise serializers.ValidationError({'password': 'Bắt buộc nhập mật khẩu khi tạo tài khoản.'})
        user_data = attrs.get('user', {})
        if self.instance is None and user_data.get('role') == Role.MANAGER:
            raise serializers.ValidationError({'role': 'Không thể tạo tài khoản Quản lý qua API nhân sự.'})
        return attrs

    @transaction.atomic
    def create(self, validated):
        u = validated.pop('user')
        password = validated.pop('password')
        specialties = validated.pop('specialties', [])
        user = User(username=u['username'], full_name=u['full_name'], phone=u.get('phone', ''),
                    email=u.get('email', ''), role=u['role'])
        user.set_password(password)
        user.save()
        profile = StaffProfile.objects.create(user=user, **validated)
        profile.specialties.set(specialties)

        # Tự động tạo ca làm việc mặc định từ T2 đến CN nếu là Kỹ thuật viên
        if u['role'] == Role.TECHNICIAN:
            spa = Spa.get()
            start_t = spa.open_time if spa and spa.open_time else time(8, 0)
            end_t = spa.close_time if spa and spa.close_time else time(19, 0)
            open_days = spa.open_weekdays if spa and spa.open_weekdays else list(range(7))
            WorkShift.objects.bulk_create([
                WorkShift(staff=profile, weekday=day, start_time=start_t, end_time=end_t)
                for day in open_days
            ])

        return profile

    @transaction.atomic
    def update(self, instance, validated):
        u = validated.pop('user', {})
        password = validated.pop('password', None)
        specialties = validated.pop('specialties', None)
        user = instance.user
        for k, v in u.items():
            setattr(user, k, v)
        if password:
            user.set_password(password)
        if 'is_active' in validated:
            user.is_active = validated['is_active']
        user.save()
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        if specialties is not None:
            instance.specialties.set(specialties)
        return instance


class ShiftSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkShift
        fields = ['id', 'weekday', 'start_time', 'end_time']

    def validate(self, a):
        if a['end_time'] <= a['start_time']:
            raise serializers.ValidationError({'end_time': 'Giờ kết thúc phải sau giờ bắt đầu.'})
        if a['weekday'] > 6:
            raise serializers.ValidationError({'weekday': 'Thứ phải từ 0 đến 6.'})
        return a


class TimeOffSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimeOff
        fields = ['id', 'date_from', 'date_to', 'reason']

    def validate(self, a):
        if a['date_to'] < a['date_from']:
            raise serializers.ValidationError({'date_to': 'Ngày kết thúc phải từ ngày bắt đầu trở đi.'})
        return a


class StaffWritePermission(BasePermission):
    """Đọc: mọi nhân sự. Ghi hồ sơ: Quản lý. Ca/nghỉ: Quản lý hoặc chính chủ (kiểm ở view)."""

    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated and u.is_staff_role):
            return False
        if request.method in SAFE_METHODS or view.action in ('shifts', 'time_off', 'delete_time_off', 'check_availability', 'roster'):
            return True
        return u.role == Role.MANAGER


class StaffViewSet(viewsets.ModelViewSet):
    """staff — quản lý nhân sự (UC-04, SPA-13). Khóa tài khoản bằng is_active=false, không xóa cứng."""

    serializer_class = StaffSerializer
    permission_classes = [StaffWritePermission]

    def get_queryset(self):
        qs = StaffProfile.objects.select_related('user').prefetch_related('specialties')
        p = self.request.query_params
        if p.get('role'):
            qs = qs.filter(user__role=p['role'])
        if self.action == 'list' and p.get('include_inactive') != '1':
            qs = qs.filter(is_active=True)
        return qs

    def perform_destroy(self, instance):
        if instance.user_id == self.request.user.id:
            raise PermissionDenied('Bạn không thể tự khóa tài khoản của chính mình.')
        instance.is_active = False
        instance.user.is_active = False
        instance.user.save(update_fields=['is_active'])
        instance.save(update_fields=['is_active'])

    def perform_update(self, serializer):
        if serializer.validated_data.get('is_active') is False and serializer.instance.user_id == self.request.user.id:
            raise PermissionDenied('Bạn không thể tự khóa tài khoản của chính mình.')
        serializer.save()

    def _own_or_manager(self, request, staff):
        if request.user.role != Role.MANAGER and staff.user_id != request.user.id:
            raise PermissionDenied()

    @action(detail=True, methods=['get', 'put'], url_path='shifts')
    def shifts(self, request, pk=None):
        staff = self.get_object()
        if request.method == 'GET':
            return Response(ShiftSerializer(staff.shifts.all(), many=True).data)
        self._own_or_manager(request, staff)
        s = ShiftSerializer(data=request.data, many=True)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            staff.shifts.all().delete()
            WorkShift.objects.bulk_create([WorkShift(staff=staff, **d) for d in s.validated_data])
        return Response(ShiftSerializer(staff.shifts.all(), many=True).data)

    @action(detail=True, methods=['get', 'post'], url_path='time-off')
    def time_off(self, request, pk=None):
        staff = self.get_object()
        if request.method == 'GET':
            return Response(TimeOffSerializer(staff.time_off.all(), many=True).data)
        self._own_or_manager(request, staff)
        s = TimeOffSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        s.save(staff=staff)
        return Response(s.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path=r'time-off/(?P<tid>\d+)')
    def delete_time_off(self, request, pk=None, tid=None):
        staff = self.get_object()
        self._own_or_manager(request, staff)
        deleted, _ = TimeOff.objects.filter(staff=staff, pk=tid).delete()
        if not deleted:
            raise NotFound()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'], url_path='roster')
    def roster(self, request):
        """Ma trận phân công ca làm việc & trực tuần."""
        import datetime
        from django.utils import timezone

        week_param = request.query_params.get('week_start')
        if week_param:
            try:
                base_date = datetime.date.fromisoformat(week_param)
            except ValueError:
                base_date = timezone.localdate()
        else:
            base_date = timezone.localdate()

        monday = base_date - datetime.timedelta(days=base_date.weekday())
        sunday = monday + datetime.timedelta(days=6)

        week_days = []
        weekday_names = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật']
        for i in range(7):
            cur_d = monday + datetime.timedelta(days=i)
            week_days.append({
                'weekday': i,
                'date': cur_d.isoformat(),
                'day_label': weekday_names[i],
                'short_label': f'{weekday_names[i][:4]} {cur_d.strftime("%d/%m")}',
                'is_today': cur_d == timezone.localdate(),
            })

        staff_qs = StaffProfile.objects.filter(is_active=True).select_related('user').prefetch_related('specialties', 'shifts', 'time_off')
        role_filter = request.query_params.get('role')
        if role_filter:
            staff_qs = staff_qs.filter(user__role=role_filter)
        spec_filter = request.query_params.get('specialty')
        if spec_filter:
            staff_qs = staff_qs.filter(specialties__id=spec_filter)

        staff_data = []
        for st in staff_qs:
            shifts_map = {}
            for sh in st.shifts.all():
                shifts_map[sh.weekday] = {
                    'id': sh.id,
                    'start_time': sh.start_time.strftime('%H:%M'),
                    'end_time': sh.end_time.strftime('%H:%M'),
                }

            leaves_in_week = []
            for to in st.time_off.filter(date_from__lte=sunday, date_to__gte=monday):
                leaves_in_week.append({
                    'id': to.id,
                    'date_from': to.date_from.isoformat(),
                    'date_to': to.date_to.isoformat(),
                    'reason': to.reason,
                })

            specs = [{'id': sp.id, 'name_vi': sp.name_vi, 'code': sp.code, 'species_scope': sp.species_scope}
                     for sp in st.specialties.all()]

            staff_data.append({
                'id': st.id,
                'user_id': st.user_id,
                'username': st.user.username,
                'full_name': st.user.full_name or st.user.username,
                'phone': st.user.phone,
                'role': st.user.role,
                'specialties': specs,
                'shifts_map': shifts_map,
                'leaves': leaves_in_week,
            })

        return Response({
            'week_start': monday.isoformat(),
            'week_end': sunday.isoformat(),
            'week_days': week_days,
            'staff': staff_data,
        })

    @action(detail=False, methods=['post'], url_path='check-availability')
    def check_availability(self, request):
        """Kiểm tra độ rảnh và chuyên môn của Kỹ thuật viên."""
        import datetime
        from django.utils import timezone
        from scheduling.models import Booking, ACTIVE_STATUSES

        target_date_str = request.data.get('date')
        if not target_date_str:
            return Response({'error': 'Vui lòng cung cấp ngày cần kiểm tra (date).'}, status=400)

        try:
            target_date = datetime.date.fromisoformat(target_date_str)
        except ValueError:
            return Response({'error': 'Định dạng ngày không hợp lệ (YYYY-MM-DD).'}, status=400)

        specialty_id = request.data.get('specialty_id')
        weekday = target_date.weekday()

        tech_qs = StaffProfile.objects.filter(
            is_active=True, user__role=Role.TECHNICIAN
        ).select_related('user').prefetch_related('specialties', 'shifts', 'time_off')

        results = []
        for st in tech_qs:
            is_on_leave = st.time_off.filter(date_from__lte=target_date, date_to__gte=target_date).first()
            shift = st.shifts.filter(weekday=weekday).first()

            has_spec = False
            if specialty_id:
                has_spec = st.specialties.filter(id=specialty_id).exists()
            else:
                has_spec = True

            day_bookings = Booking.objects.filter(
                staff=st,
                start_at__date=target_date,
                status__in=ACTIVE_STATUSES
            ).count()

            if is_on_leave:
                match_type = 'on_leave'
                score = 0
                badge_text = 'Nghỉ phép'
                badge_color = 'default'
                reason = f'Đang nghỉ phép: {is_on_leave.reason or "Lý do cá nhân"}'
            elif not shift:
                match_type = 'off_shift'
                score = 20
                badge_text = 'Ngoài ca trực'
                badge_color = 'default'
                reason = 'Không có lịch trực vào ngày này'
            elif has_spec and day_bookings == 0:
                match_type = 'perfect'
                score = 100
                badge_text = 'Tối ưu (Rảnh & Đúng chuyên môn)'
                badge_color = 'success'
                reason = f'Đúng chuyên môn, có ca trực ({shift.start_time.strftime("%H:%M")} - {shift.end_time.strftime("%H:%M")}) và chưa có lịch hẹn'
            elif has_spec:
                match_type = 'good'
                score = 85
                badge_text = 'Đúng chuyên môn (Đang có ca)'
                badge_color = 'cyan'
                reason = f'Đúng chuyên môn, có ca trực ({shift.start_time.strftime("%H:%M")} - {shift.end_time.strftime("%H:%M")}), hiện có {day_bookings} lịch hẹn trong ngày'
            elif day_bookings == 0:
                match_type = 'no_specialty'
                score = 65
                badge_text = 'Rảnh ca (Chưa có chuyên môn)'
                badge_color = 'orange'
                reason = 'Rảnh ca trực nhưng chưa có chứng chỉ chuyên môn này (Quản lý có thể gán tay khi thiếu thợ)'
            else:
                match_type = 'busy'
                score = 40
                badge_text = 'Đang có ca (Chưa có chuyên môn)'
                badge_color = 'gold'
                reason = f'Chưa có chuyên môn này, đang có {day_bookings} lịch hẹn trong ngày'

            results.append({
                'staff_id': st.id,
                'user_id': st.user_id,
                'full_name': st.user.full_name or st.user.username,
                'username': st.user.username,
                'phone': st.user.phone,
                'match_type': match_type,
                'score': score,
                'badge_text': badge_text,
                'badge_color': badge_color,
                'reason': reason,
                'has_specialty': has_spec,
                'specialties': [{'id': sp.id, 'name_vi': sp.name_vi} for sp in st.specialties.all()],
                'shift': {
                    'start_time': shift.start_time.strftime('%H:%M'),
                    'end_time': shift.end_time.strftime('%H:%M'),
                } if shift else None,
                'is_on_leave': bool(is_on_leave),
                'day_bookings_count': day_bookings,
            })

        results.sort(key=lambda x: x['score'], reverse=True)
        return Response({'date': target_date_str, 'technicians': results})

    @action(detail=False, methods=['post'], url_path='assign-day-shift')
    def assign_day_shift(self, request):
        """Quản lý gán hoặc chỉnh nhanh ca trực cho 1 ngày."""
        if request.user.role != Role.MANAGER:
            raise PermissionDenied('Chỉ Quản lý mới có quyền điều phối ca trực.')

        staff_id = request.data.get('staff_id')
        weekday = request.data.get('weekday')
        is_off = request.data.get('is_off', False)

        if staff_id is None or weekday is None:
            return Response({'error': 'Thiếu staff_id hoặc weekday'}, status=400)

        staff = StaffProfile.objects.filter(id=staff_id).first()
        if not staff:
            raise NotFound('Không tìm thấy nhân viên.')

        WorkShift.objects.filter(staff=staff, weekday=weekday).delete()
        if is_off:
            return Response({'ok': True, 'message': 'Đã xóa ca trực, chuyển sang ngày nghỉ'})

        start_time_str = request.data.get('start_time', '08:00')
        end_time_str = request.data.get('end_time', '19:00')

        try:
            import datetime
            st_t = datetime.time.fromisoformat(start_time_str)
            en_t = datetime.time.fromisoformat(end_time_str)
            if en_t <= st_t:
                return Response({'error': 'Giờ kết thúc phải sau giờ bắt đầu'}, status=400)
        except ValueError:
            return Response({'error': 'Định dạng giờ không hợp lệ'}, status=400)

        WorkShift.objects.create(
            staff=staff, weekday=weekday,
            start_time=st_t, end_time=en_t
        )
        return Response({'ok': True, 'message': 'Đã cập nhật ca trực thành công'})


class ResourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resource
        fields = ['id', 'name', 'resource_type', 'is_active']


class ResourceViewSet(viewsets.ModelViewSet):
    """resources — danh mục bồn/bàn/chuồng/phòng (SPA-16, 17). Đọc: nhân sự. Ghi: Quản lý."""

    serializer_class = ResourceSerializer

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsStaffRole()]
        from accounts.permissions import IsManager
        return [IsManager()]

    def get_queryset(self):
        qs = Resource.objects.all()
        if self.action == 'list' and self.request.query_params.get('include_inactive') != '1':
            qs = qs.filter(is_active=True)
        t = self.request.query_params.get('resource_type')
        return qs.filter(resource_type=t) if t else qs

    def perform_destroy(self, instance):
        from django.utils import timezone
        from rest_framework.exceptions import ValidationError
        from scheduling.models import ACTIVE_STATUSES, BookingItem

        active_bookings_count = BookingItem.objects.filter(
            resource=instance,
            booking__status__in=ACTIVE_STATUSES,
            end_at__gte=timezone.now()
        ).count()
        if active_bookings_count > 0:
            raise ValidationError(
                f'Không thể xóa cơ sở vật chất "{instance.name}" vì đang có {active_bookings_count} lịch hẹn sắp tới đang sử dụng. Vui lòng chuyển sang "Tạm ngưng" hoặc dời lịch trước.'
            )
        instance.delete()

