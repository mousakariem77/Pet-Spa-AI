from django.conf import settings
from django.db import models
from django.db.models import F, Q

from catalog.models import ResourceType


class Spa(models.Model):
    """Hồ sơ cơ sở (SPA-01). Chỉ tồn tại một bản ghi, id = 1."""

    name = models.CharField('Tên spa', max_length=200)
    phone = models.CharField('Số điện thoại', max_length=20, blank=True)
    email = models.EmailField('Email', blank=True)
    address = models.CharField('Địa chỉ', max_length=300, blank=True)
    logo = models.ImageField('Logo', upload_to='spa/', blank=True)
    open_time = models.TimeField('Giờ mở cửa')
    close_time = models.TimeField('Giờ đóng cửa')
    open_weekdays = models.JSONField('Ngày mở cửa (0=Thứ Hai ... 6=Chủ nhật)', default=list)
    slot_minutes = models.PositiveSmallIntegerField('Bước slot (phút)', default=30)
    cancel_cutoff_hours = models.PositiveSmallIntegerField('Khách hủy trước giờ hẹn (giờ)', default=2)
    timezone = models.CharField(max_length=50, default='Asia/Ho_Chi_Minh')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Hồ sơ spa'
        verbose_name_plural = 'Hồ sơ spa'
        constraints = [models.CheckConstraint(condition=Q(id=1), name='spa_singleton')]

    def save(self, *args, **kwargs):
        self.id = 1
        super().save(*args, **kwargs)

    @classmethod
    def get(cls):
        return cls.objects.filter(id=1).first()

    def __str__(self):
        return self.name


class StaffProfile(models.Model):
    """Hồ sơ nhân viên (SPA-13). Mỗi tài khoản nhân sự có đúng một hồ sơ."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='staff_profile')
    specialties = models.ManyToManyField('catalog.Specialty', blank=True, related_name='staff')
    class Gender(models.TextChoices):
        MALE = 'male', 'Nam'
        FEMALE = 'female', 'Nữ'
        OTHER = 'other', 'Khác'

    birthday = models.DateField('Ngày sinh', null=True, blank=True)
    gender = models.CharField('Giới tính', max_length=10, choices=Gender.choices, default=Gender.OTHER, blank=True)
    address = models.CharField('Địa chỉ', max_length=300, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Nhân viên'
        verbose_name_plural = 'Nhân viên'
        ordering = ['user__full_name']

    def __str__(self):
        return self.user.full_name or self.user.username


class WorkShift(models.Model):
    """Ca làm theo thứ trong tuần. Có thể có nhiều ca một ngày."""

    staff = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name='shifts')
    weekday = models.PositiveSmallIntegerField('Thứ (0=Thứ Hai ... 6=Chủ nhật)')
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        ordering = ['weekday', 'start_time']
        constraints = [
            models.CheckConstraint(condition=Q(end_time__gt=F('start_time')), name='shift_end_gt_start'),
            models.CheckConstraint(condition=Q(weekday__lte=6), name='shift_weekday_range'),
        ]


class TimeOff(models.Model):
    staff = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name='time_off')
    date_from = models.DateField()
    date_to = models.DateField()
    reason = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ['-date_from']
        constraints = [models.CheckConstraint(condition=Q(date_to__gte=F('date_from')), name='timeoff_to_gte_from')]


class Resource(models.Model):
    """Bồn tắm, bàn cắt, chuồng sấy, phòng spa (SPA-16, 17). Công suất = số bản ghi đang hoạt động."""

    name = models.CharField('Tên', max_length=100)
    resource_type = models.CharField(max_length=20, choices=ResourceType.choices)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Tài nguyên'
        verbose_name_plural = 'Tài nguyên'
        ordering = ['resource_type', 'name']

    def __str__(self):
        return self.name
