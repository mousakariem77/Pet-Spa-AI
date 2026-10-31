from django.conf import settings
from django.db import models


class KnowledgeDoc(models.Model):
    """Tài liệu SOP hoặc bảng giá làm nguồn tri thức cho AI (SPA-24)."""

    class DocType(models.TextChoices):
        SOP = 'sop', 'Quy trình chuẩn (SOP)'
        GUIDE = 'guide', 'Cẩm nang giống & Chăm sóc'
        POLICY = 'policy', 'Chính sách an toàn & Da liễu'
        FAQ = 'faq', 'Hỏi đáp thường gặp (FAQ)'
        PRICE_LIST = 'price_list', 'Bảng giá dịch vụ (Legacy)'

    title = models.CharField('Tiêu đề tài liệu', max_length=200)
    doc_type = models.CharField(max_length=20, choices=DocType.choices, default=DocType.SOP)
    file = models.FileField(upload_to='knowledge/', blank=True)
    text_content = models.TextField('Nội dung văn bản trích xuất', blank=True)
    version = models.PositiveSmallIntegerField(default=1)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name='+')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Tài liệu tri thức'
        verbose_name_plural = 'Tài liệu tri thức'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.title} (v{self.version})'


class KnowledgeChunk(models.Model):
    """Đoạn văn bản trích từ tài liệu để tìm kiếm từ khóa cho chatbot (SPA-23)."""

    doc = models.ForeignKey(KnowledgeDoc, on_delete=models.CASCADE, related_name='chunks')
    position = models.PositiveSmallIntegerField(default=0)
    heading = models.CharField(max_length=200, blank=True)
    text = models.TextField()

    class Meta:
        ordering = ['position']

    def __str__(self):
        return f'[{self.doc.title}] {self.heading or self.text[:50]}'


class RebookRule(models.Model):
    """Luật chu kỳ nhắc tái spa theo gói và loại lông (SPA-28)."""

    package = models.ForeignKey('catalog.Package', on_delete=models.CASCADE, related_name='rebook_rules')
    coat_type = models.CharField(max_length=20, blank=True)
    species = models.CharField(max_length=10, blank=True)
    interval_days = models.PositiveSmallIntegerField('Chu kỳ (ngày)', default=45)
    overdue_days = models.PositiveSmallIntegerField('Ngưỡng quá hạn (ngày)', default=14)
    note_vi = models.CharField('Ghi chú luật', max_length=250, blank=True)

    class Meta:
        verbose_name = 'Luật nhắc tái spa'
        verbose_name_plural = 'Luật nhắc tái spa'

    def __str__(self):
        return f'{self.package.name} ({self.interval_days} ngày)'


class RebookReminder(models.Model):
    """Nhắc tái spa cho khách khi đến hạn (SPA-28, 29). Một nhắc cho mỗi lần dịch vụ hoàn tất."""

    class Status(models.TextChoices):
        SUGGESTED = 'suggested', 'Hệ thống đề xuất'
        APPROVED = 'approved', 'Quản lý đã duyệt'
        SENT = 'sent', 'Đã gửi cho khách'
        DISMISSED = 'dismissed', 'Bỏ qua'
        BOOKED = 'booked', 'Đã đặt lại lịch'

    client = models.ForeignKey('customers.Client', on_delete=models.CASCADE, related_name='rebook_reminders')
    pet = models.ForeignKey('customers.Pet', on_delete=models.CASCADE, related_name='rebook_reminders')
    last_booking = models.OneToOneField('scheduling.Booking', on_delete=models.CASCADE,
                                        related_name='rebook_reminder')
    rule = models.ForeignKey(RebookRule, null=True, blank=True, on_delete=models.SET_NULL)
    due_date = models.DateField('Ngày đến hạn')
    overdue_days = models.IntegerField('Số ngày quá hạn', default=0)
    reason_text = models.TextField('Lý do đề xuất nhắc')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUGGESTED)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name='+')
    approved_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Nhắc tái spa'
        verbose_name_plural = 'Nhắc tái spa'
        ordering = ['-overdue_days', 'due_date']

    def __str__(self):
        return f'Nhắc {self.pet.name} ({self.due_date}) [{self.status}]'


class RebookSetting(models.Model):
    """Cấu hình tự động quét và tạo lời nhắc tái spa định kỳ."""

    auto_scan_enabled = models.BooleanField('Tự động quét chu kỳ hàng ngày', default=True)
    scan_time = models.CharField('Khung giờ quét hàng ngày (HH:MM)', max_length=5, default='08:00')
    auto_approve = models.BooleanField('Tự động gửi thông báo khi đến hạn', default=False)
    advance_days = models.PositiveSmallIntegerField('Số ngày nhắc trước hạn', default=0)
    last_scanned_at = models.DateTimeField('Lần quét tự động gần nhất', null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Cấu hình nhắc tái spa'
        verbose_name_plural = 'Cấu hình nhắc tái spa'

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        status = 'Bật' if self.auto_scan_enabled else 'Tắt'
        return f'Cấu hình nhắc tái spa ({status} - {self.scan_time})'


class AiLog(models.Model):
    """Nhật ký hoạt động và truy vấn AI (SPA-31). Bất biến, không sửa, không xóa."""

    class Kind(models.TextChoices):
        CHAT = 'chat', 'Chatbot tư vấn'
        SUGGEST_PACKAGE = 'suggest_package', 'Gợi ý gói'
        SUGGEST_STAFF = 'suggest_staff', 'Gợi ý kỹ thuật viên'
        SAFETY_CHECK = 'safety_check', 'Kiểm tra an toàn'
        REBOOK = 'rebook', 'Tính nhắc tái spa'

    class Status(models.TextChoices):
        OK = 'ok', 'Thành công'
        REFUSED = 'refused', 'Từ chối (ngoài phạm vi)'
        ERROR = 'error', 'Lỗi'

    kind = models.CharField(max_length=30, choices=Kind.choices)
    session_id = models.UUIDField(null=True, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                             on_delete=models.SET_NULL, related_name='+')
    pet = models.ForeignKey('customers.Pet', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    input_text = models.TextField('Đầu vào')
    output_text = models.TextField('Đầu ra')
    context_refs = models.JSONField('Tham chiếu tri thức & dữ kiện', default=dict, blank=True)
    engine = models.CharField('Động cơ AI', max_length=100, default='rules-v1')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OK)
    latency_ms = models.PositiveIntegerField('Độ trễ (ms)', default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Nhật ký AI'
        verbose_name_plural = 'Nhật ký AI'
        ordering = ['-created_at']

    def __str__(self):
        return f'[{self.kind}] {self.status} ({self.created_at:%Y-%m-%d %H:%M})'


class AiSuggestion(models.Model):
    """Gợi ý do AI sinh ra (SPA-25, 26, 30). Người dùng luôn là người duyệt/xác nhận."""

    class Type(models.TextChoices):
        PACKAGE = 'package', 'Gợi ý gói combo'
        STAFF = 'staff', 'Gợi ý kỹ thuật viên'

    class Status(models.TextChoices):
        PROPOSED = 'proposed', 'Đề xuất'
        ACCEPTED = 'accepted', 'Chấp nhận'
        REJECTED = 'rejected', 'Từ chối'
        EXPIRED = 'expired', 'Hết hạn'

    suggestion_type = models.CharField(max_length=20, choices=Type.choices)
    pet = models.ForeignKey('customers.Pet', null=True, blank=True, on_delete=models.CASCADE, related_name='+')
    package = models.ForeignKey('catalog.Package', null=True, blank=True, on_delete=models.CASCADE, related_name='+')
    staff = models.ForeignKey('spa.StaffProfile', null=True, blank=True, on_delete=models.CASCADE, related_name='+')
    target_start_at = models.DateTimeField(null=True, blank=True)
    rank = models.PositiveSmallIntegerField(default=1)
    score = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    confidence = models.DecimalField('Độ tin cậy (0-1)', max_digits=4, decimal_places=2, default=0)
    reason_text = models.TextField('Lý do đề xuất')
    evidence = models.JSONField('Dữ kiện đã dùng', default=list, blank=True)
    warnings = models.JSONField('Cảnh báo đi kèm', default=list, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PROPOSED)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name='+')
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name='+')
    decided_at = models.DateTimeField(null=True, blank=True)
    booking = models.ForeignKey('scheduling.Booking', null=True, blank=True,
                                on_delete=models.SET_NULL, related_name='ai_suggestions')
    ai_log = models.ForeignKey(AiLog, null=True, blank=True, on_delete=models.CASCADE, related_name='suggestions')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Gợi ý AI'
        verbose_name_plural = 'Gợi ý AI'
        ordering = ['rank', '-score']

    def __str__(self):
        return f'Gợi ý {self.suggestion_type} rank {self.rank}: {self.package or self.staff}'
