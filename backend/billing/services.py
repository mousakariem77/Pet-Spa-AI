from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.errors import Conflict

from .models import Invoice, InvoiceLine


def _next_invoice_no():
    today = timezone.localdate()
    prefix = f'HD-{today:%Y%m%d}-'
    n = Invoice.objects.filter(invoice_no__startswith=prefix).count() + 1
    while Invoice.objects.filter(invoice_no=f'{prefix}{n:03d}').exists():
        n += 1
    return f'{prefix}{n:03d}'


def create_invoice(booking):
    """Sinh hóa đơn unpaid từ lịch; hỗ trợ tự động đánh dấu hoàn tất nếu đang tiến hành."""
    if booking.status != 'completed':
        booking.status = 'completed'
        if not booking.completed_at:
            booking.completed_at = timezone.now()
        booking.save(update_fields=['status', 'completed_at'])

    if hasattr(booking, 'invoice'):
        return booking.invoice

    pet_size_str = f"Size {booking.pet.size_class.upper()}" if (booking.pet and booking.pet.size_class) else "Tiêu chuẩn"
    lines_to_create = []

    if booking.package:
        from catalog.models import PackagePrice
        pkg_price_obj = PackagePrice.objects.filter(package=booking.package, size_class=booking.pet.size_class).first()
        pkg_price = pkg_price_obj.price if pkg_price_obj else (booking.total_price or Decimal(0))
        lines_to_create.append(
            InvoiceLine(
                description=f"Gói dịch vụ: {booking.package.name} ({pet_size_str})",
                quantity=1,
                unit_price=pkg_price,
                amount=pkg_price,
            )
        )
        pkg_service_ids = set(booking.package.items.values_list('service_id', flat=True))
        extra_items = [i for i in booking.items.select_related('service') if i.service_id not in pkg_service_ids]
        for ei in extra_items:
            lines_to_create.append(
                InvoiceLine(
                    description=f"Dịch vụ phát sinh: {ei.service.name} ({pet_size_str})",
                    quantity=1,
                    unit_price=ei.unit_price,
                    amount=ei.unit_price,
                )
            )
    else:
        items = list(booking.items.select_related('service'))
        if items:
            for i in items:
                lines_to_create.append(
                    InvoiceLine(
                        description=f"{i.service.name} ({pet_size_str})",
                        quantity=1,
                        unit_price=i.unit_price,
                        amount=i.unit_price,
                    )
                )
        else:
            price = booking.total_price or Decimal(0)
            lines_to_create.append(
                InvoiceLine(
                    description=f"Dịch vụ Spa trọn gói ({pet_size_str})",
                    quantity=1,
                    unit_price=price,
                    amount=price,
                )
            )

    subtotal = sum(l.amount for l in lines_to_create)
    inv = Invoice.objects.create(
        invoice_no=_next_invoice_no(),
        booking=booking,
        subtotal=subtotal,
        total=subtotal,
    )
    for l in lines_to_create:
        l.invoice = inv
    InvoiceLine.objects.bulk_create(lines_to_create)

    # Đồng bộ booking.total_price nếu có chênh lệch
    if booking.total_price != subtotal:
        booking.total_price = subtotal
        booking.save(update_fields=['total_price'])

    try:
        from notifications.services import notify_invoice_created
        notify_invoice_created(inv)
    except Exception:
        pass

    return inv


@transaction.atomic
def pay(invoice, user, method):
    invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)
    if invoice.status != Invoice.Status.UNPAID:
        raise Conflict('invalid_invoice_state', 'Chỉ thu được hóa đơn chưa thu.')
    if method not in Invoice.Method.values:
        raise ValidationError({'payment_method': 'Hình thức thanh toán không hợp lệ.'})
    invoice.status, invoice.payment_method = Invoice.Status.PAID, method
    invoice.paid_at, invoice.received_by = timezone.now(), user
    invoice.save()
    try:
        from notifications.services import notify_invoice_paid
        notify_invoice_paid(invoice)
    except Exception:
        pass
    return invoice


@transaction.atomic
def void(invoice, user, reason):
    invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)
    if invoice.status == Invoice.Status.VOID:
        raise Conflict('invalid_invoice_state', 'Hóa đơn đã hủy.')
    if not (reason or '').strip():
        raise ValidationError({'reason': 'Bắt buộc nhập lý do hủy.'})
    invoice.status, invoice.void_reason = Invoice.Status.VOID, reason
    invoice.save()
    return invoice
