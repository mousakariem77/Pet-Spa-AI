from datetime import date

from django.conf import settings
from django.db import models
from django.db.models import Q

from catalog.models import HealthTag, SizeBand, Species


class Client(models.Model):
    """Khách hàng / chủ thú (SPA-07). user = null với khách vãng lai nhập ở quầy."""

    class Source(models.TextChoices):
        WALK_IN = 'walk_in', 'Đến quầy'
        ONLINE = 'online', 'Đăng ký web'
        REFERRAL = 'referral', 'Giới thiệu'
        OTHER = 'other', 'Khác'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='client')
    full_name = models.CharField('Họ tên', max_length=150)
    phone = models.CharField('Số điện thoại', max_length=20)
    secondary_phone = models.CharField('Số điện thoại phụ / Zalo', max_length=20, blank=True)
    birthday = models.DateField('Ngày sinh', null=True, blank=True)
    email = models.EmailField('Email', blank=True)
    address = models.CharField('Địa chỉ', max_length=300, blank=True)
    note = models.TextField('Ghi chú nội bộ', blank=True)
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.WALK_IN)
    allow_reminders = models.BooleanField('Nhận nhắc tái spa', default=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Khách hàng'
        verbose_name_plural = 'Khách hàng'
        ordering = ['full_name']
        constraints = [
            models.UniqueConstraint(
                fields=['phone'], condition=Q(is_active=True), name='uniq_active_client_phone'),
        ]

    def __str__(self):
        return f'{self.full_name} ({self.phone})'


class Pet(models.Model):
    """Hồ sơ thú: nguồn dữ liệu cốt lõi cho lịch và AI (SPA-08)."""

    class Coat(models.TextChoices):
        SHORT = 'short', 'Lông ngắn'
        LONG = 'long', 'Lông dài'
        CURLY = 'curly', 'Lông xoăn'
        DOUBLE = 'double', 'Lông kép'
        HAIRLESS = 'hairless', 'Không lông'

    class Sex(models.TextChoices):
        MALE = 'male', 'Đực'
        FEMALE = 'female', 'Cái'
        UNKNOWN = 'unknown', 'Chưa rõ'

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='pets')
    name = models.CharField('Tên thú', max_length=100)
    species = models.CharField(max_length=10, choices=Species.choices)
    breed = models.CharField('Giống', max_length=100, blank=True)
    coat_type = models.CharField(max_length=20, choices=Coat.choices, default=Coat.SHORT)
    sex = models.CharField(max_length=10, choices=Sex.choices, default=Sex.UNKNOWN)
    birth_date = models.DateField('Ngày sinh', null=True, blank=True)
    weight_kg = models.DecimalField('Cân nặng (kg)', max_digits=5, decimal_places=2)
    size_class = models.CharField(max_length=2, blank=True, editable=False)
    health_tags = models.ManyToManyField(HealthTag, blank=True, related_name='pets')
    allergy_note = models.TextField('Dị ứng (ghi "Không" nếu không có)')
    safety_note = models.TextField('Ghi chú an toàn nội bộ', blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Thú cưng'
        verbose_name_plural = 'Thú cưng'
        ordering = ['name']
        constraints = [models.CheckConstraint(condition=Q(weight_kg__gt=0), name='pet_weight_positive')]

    def save(self, *args, **kwargs):
        self.size_class = SizeBand.size_for(self.species, self.weight_kg)
        super().save(*args, **kwargs)

    @property
    def age_months(self):
        if not self.birth_date:
            return None
        today = date.today()
        return (today.year - self.birth_date.year) * 12 + (today.month - self.birth_date.month)

    def __str__(self):
        return f'{self.name} ({self.species})'


class PetVaccination(models.Model):
    pet = models.ForeignKey(Pet, on_delete=models.CASCADE, related_name='vaccinations')
    vaccine_name = models.CharField('Loại vaccine', max_length=100)
    date_given = models.DateField('Ngày tiêm')
    valid_until = models.DateField('Có hiệu lực đến', null=True, blank=True)
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        verbose_name = 'Tiêm phòng'
        verbose_name_plural = 'Tiêm phòng'
        ordering = ['-date_given']
        constraints = [
            models.UniqueConstraint(
                fields=['pet', 'vaccine_name', 'date_given'], name='uniq_pet_vaccination'),
        ]
