from django.db import models
from django.db.models import F, Q


class Species(models.TextChoices):
    DOG = 'dog', 'Chó'
    CAT = 'cat', 'Mèo'


class SpeciesScope(models.TextChoices):
    DOG = 'dog', 'Chó'
    CAT = 'cat', 'Mèo'
    BOTH = 'both', 'Chó và mèo'


class SizeClass(models.TextChoices):
    XS = 'XS', 'XS'
    S = 'S', 'S'
    M = 'M', 'M'
    L = 'L', 'L'
    XL = 'XL', 'XL'


class ResourceType(models.TextChoices):
    BATH_TUB = 'bath_tub', 'Bồn tắm'
    GROOMING_TABLE = 'grooming_table', 'Bàn cắt tỉa'
    DRYING_CAGE = 'drying_cage', 'Chuồng sấy'
    SPA_ROOM = 'spa_room', 'Phòng spa'


class Specialty(models.Model):
    """Chuyên môn kỹ thuật viên: tắm, cắt Poodle, spa mèo (SPA-13, 14)."""

    code = models.CharField(max_length=50, unique=True)
    name_vi = models.CharField('Tên chuyên môn', max_length=100)
    species_scope = models.CharField('Áp dụng cho loài', max_length=10, choices=SpeciesScope.choices, default=SpeciesScope.BOTH)
    description = models.TextField('Mô tả chuyên môn', blank=True, default='')

    class Meta:
        verbose_name = 'Chuyên môn'
        verbose_name_plural = 'Chuyên môn'
        ordering = ['id']

    def __str__(self):
        return self.name_vi


class HealthTag(models.Model):
    """Thẻ sức khỏe/an toàn gắn vào thú: dị ứng, bệnh da, hành vi (SPA-08, 27)."""

    class Kind(models.TextChoices):
        ALLERGY = 'allergy', 'Dị ứng'
        SKIN = 'skin_condition', 'Bệnh/tình trạng da'
        BEHAVIOR = 'behavior', 'Hành vi'

    code = models.CharField(max_length=50, unique=True)
    name_vi = models.CharField('Tên thẻ', max_length=100)
    kind = models.CharField(max_length=20, choices=Kind.choices)

    class Meta:
        verbose_name = 'Thẻ sức khỏe'
        verbose_name_plural = 'Thẻ sức khỏe'

    def __str__(self):
        return self.name_vi


class SizeBand(models.Model):
    """Khoảng cân nặng -> size XS..XL theo loài (SPA-06)."""

    species = models.CharField(max_length=10, choices=Species.choices)
    size_class = models.CharField(max_length=2, choices=SizeClass.choices)
    min_kg = models.DecimalField(max_digits=5, decimal_places=2)
    max_kg = models.DecimalField(max_digits=5, decimal_places=2)

    class Meta:
        verbose_name = 'Khoảng size'
        verbose_name_plural = 'Khoảng size'
        constraints = [
            models.UniqueConstraint(fields=['species', 'size_class'], name='uniq_sizeband_species_size'),
            models.CheckConstraint(condition=Q(max_kg__gt=F('min_kg')), name='sizeband_max_gt_min'),
        ]

    @classmethod
    def size_for(cls, species, weight_kg):
        """Trả size cho cân nặng; thú nặng hơn band cuối cùng thì lấy size lớn nhất."""
        if weight_kg is None:
            return ''
        bands = list(cls.objects.filter(species=species).order_by('min_kg'))
        for b in bands:
            if b.min_kg <= weight_kg < b.max_kg:
                return b.size_class
        if bands and weight_kg >= bands[-1].max_kg:
            return bands[-1].size_class
        return ''

    def __str__(self):
        return f'{self.species} {self.size_class}: {self.min_kg}-{self.max_kg} kg'


class Service(models.Model):
    """Dịch vụ lẻ (SPA-04)."""

    class Category(models.TextChoices):
        BATH = 'bath', 'Tắm'
        GROOMING = 'grooming', 'Cắt tỉa'
        EAR = 'ear', 'Vệ sinh tai'
        SPA = 'spa', 'Spa dưỡng'
        OTHER = 'other', 'Khác'

    code = models.CharField(max_length=50, unique=True)
    name = models.CharField('Tên dịch vụ', max_length=150)
    description = models.TextField('Mô tả', blank=True)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OTHER)
    duration_minutes = models.PositiveSmallIntegerField('Thời lượng (phút)')
    species_scope = models.CharField(max_length=10, choices=SpeciesScope.choices, default=SpeciesScope.BOTH)
    resource_type = models.CharField('Loại tài nguyên cần', max_length=20, choices=ResourceType.choices)
    required_specialty = models.ForeignKey(
        Specialty, null=True, blank=True, on_delete=models.SET_NULL, related_name='services')
    supplies_note = models.TextField('Vật tư gợi ý (ghi chú)', blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Dịch vụ'
        verbose_name_plural = 'Dịch vụ'
        ordering = ['name']

    def __str__(self):
        return self.name


class ServicePrice(models.Model):
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name='prices')
    size_class = models.CharField(max_length=2, choices=SizeClass.choices)
    price = models.DecimalField(max_digits=12, decimal_places=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['service', 'size_class'], name='uniq_serviceprice_size'),
            models.CheckConstraint(condition=Q(price__gte=0), name='serviceprice_nonneg'),
        ]


class Package(models.Model):
    """Gói combo gồm nhiều dịch vụ (SPA-05)."""

    code = models.CharField(max_length=50, unique=True)
    name = models.CharField('Tên gói', max_length=150)
    description = models.TextField('Mô tả', blank=True)
    species_scope = models.CharField(max_length=10, choices=SpeciesScope.choices, default=SpeciesScope.BOTH)
    coat_types = models.JSONField('Loại lông phù hợp (rỗng = mọi loại)', default=list, blank=True)
    min_age_months = models.PositiveSmallIntegerField('Tuổi tối thiểu (tháng)', default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Gói combo'
        verbose_name_plural = 'Gói combo'
        ordering = ['name']

    def __str__(self):
        return self.name


class PackageItem(models.Model):
    package = models.ForeignKey(Package, on_delete=models.CASCADE, related_name='items')
    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name='package_items')
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['position']
        constraints = [models.UniqueConstraint(fields=['package', 'service'], name='uniq_packageitem')]


class PackagePrice(models.Model):
    package = models.ForeignKey(Package, on_delete=models.CASCADE, related_name='prices')
    size_class = models.CharField(max_length=2, choices=SizeClass.choices)
    price = models.DecimalField(max_digits=12, decimal_places=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['package', 'size_class'], name='uniq_packageprice_size'),
            models.CheckConstraint(condition=Q(price__gte=0), name='packageprice_nonneg'),
        ]


class ServiceContraindication(models.Model):
    """Ma trận chống chỉ định dịch vụ với thẻ sức khỏe (SPA-27)."""

    class Severity(models.TextChoices):
        WARN = 'warn', 'Cảnh báo vàng'
        BLOCK = 'block', 'Chặn đỏ'

    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name='contraindications')
    health_tag = models.ForeignKey(HealthTag, on_delete=models.CASCADE, related_name='contraindications')
    severity = models.CharField(max_length=10, choices=Severity.choices, default=Severity.WARN)
    reason_vi = models.CharField('Lý do', max_length=250)

    class Meta:
        verbose_name = 'Chống chỉ định'
        verbose_name_plural = 'Chống chỉ định'
        constraints = [
            models.UniqueConstraint(fields=['service', 'health_tag'], name='uniq_service_healthtag_contra'),
        ]

    def __str__(self):
        return f'{self.service.name} x {self.health_tag.name_vi} [{self.severity}]'

