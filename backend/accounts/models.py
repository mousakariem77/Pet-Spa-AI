from django.contrib.auth.models import AbstractUser
from django.db import models


class Role(models.TextChoices):
    CUSTOMER = 'customer', 'Khách hàng'
    RECEPTIONIST = 'receptionist', 'Lễ tân'
    TECHNICIAN = 'technician', 'Kỹ thuật viên'
    MANAGER = 'manager', 'Quản lý'


class User(AbstractUser):
    """Tài khoản đăng nhập. Mỗi tài khoản đúng một vai trò (SPA-02)."""

    full_name = models.CharField('Họ tên', max_length=150, blank=True)
    phone = models.CharField('Số điện thoại', max_length=20, blank=True)
    role = models.CharField('Vai trò', max_length=20, choices=Role.choices, default=Role.CUSTOMER)

    class Meta:
        verbose_name = 'Tài khoản'
        verbose_name_plural = 'Tài khoản'

    @property
    def is_staff_role(self):
        return self.role in (Role.RECEPTIONIST, Role.TECHNICIAN, Role.MANAGER)

    def __str__(self):
        return f'{self.username} ({self.role})'


class PasswordResetOTP(models.Model):
    """Mã OTP đặt lại mật khẩu cho tài khoản qua Số điện thoại."""

    phone = models.CharField('Số điện thoại', max_length=20, db_index=True)
    otp_code = models.CharField('Mã OTP', max_length=6)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reset_otps', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Mã OTP đặt lại mật khẩu'
        verbose_name_plural = 'Mã OTP đặt lại mật khẩu'
        ordering = ['-created_at']

    @property
    def is_expired(self):
        from django.utils import timezone
        return timezone.now() > self.expires_at

