"""
Module điều phối thông báo tập trung (Notification Dispatcher).
Đảm bảo gửi thông báo đúng vai trò (Role-Based), đúng đối tượng liên quan,
tránh gửi nhầm giữa khách hàng và nhân viên hoặc giữa các bộ phận không liên quan.
"""

from django.utils import timezone
from accounts.models import Role, User
from .models import notify


def notify_user(user, kind, title, body='', ref_type='', ref_id=None, link=''):
    """Gửi thông báo tới 1 người dùng cụ thể."""
    if not user:
        return []
    return notify([user], kind=kind, title=title, body=body, ref_type=ref_type, ref_id=ref_id, link=link)


def notify_roles(roles, kind, title, body='', ref_type='', ref_id=None, link=''):
    """
    Gửi thông báo tới toàn bộ nhân sự đang hoạt động có vai trò trong danh sách `roles`.
    Ví dụ: roles=[Role.MANAGER, Role.RECEPTIONIST]
    """
    if isinstance(roles, str):
        roles = [roles]
    users = list(User.objects.filter(role__in=roles, is_active=True))
    return notify(users, kind=kind, title=title, body=body, ref_type=ref_type, ref_id=ref_id, link=link)


# ==============================================================================
# CÁC SỰ KIỆN LỊCH HẸN (BOOKING)
# ==============================================================================

def notify_booking_created(booking):
    """
    Khi lịch hẹn được tạo mới:
    - Nếu trạng thái PENDING (chờ duyệt): Thông báo cho Lễ tân & Quản lý để kiểm tra.
    - Nếu đã CONFIRMED ngay và chủ nuôi có tài khoản: Thông báo cho Khách hàng.
    """
    pet_name = getattr(booking.pet, 'name', 'Thú cưng')
    client_name = getattr(booking.client, 'full_name', 'Khách hàng')
    local_time = timezone.localtime(booking.start_at)
    time_str = local_time.strftime('%H:%M %d/%m')

    if booking.status == 'pending':
        return notify_roles(
            roles=[Role.RECEPTIONIST, Role.MANAGER],
            kind='booking_new',
            title='Lịch hẹn mới chờ duyệt',
            body=f'{pet_name} (Chủ: {client_name}) vào {time_str}',
            ref_type='booking',
            ref_id=booking.pk,
            link=f'/app/lich-hen?id={booking.pk}',
        )
    elif getattr(booking.client, 'user_id', None):
        return notify_user(
            user=booking.client.user,
            kind='booking_confirmed',
            title='Lịch hẹn đã được xác nhận',
            body=f'Lịch hẹn của bé {pet_name} lúc {time_str} đã được xác nhận.',
            ref_type='booking',
            ref_id=booking.pk,
            link=f'/app/lich-hen?id={booking.pk}',
        )


def notify_booking_assigned(booking, staff):
    """
    Khi lịch hẹn được phân công kỹ thuật viên:
    - Gửi thông báo trực tiếp tới Kỹ thuật viên phụ trách.
    """
    if not staff or not getattr(staff, 'user', None):
        return []
    pet_name = getattr(booking.pet, 'name', 'Thú cưng')
    local_time = timezone.localtime(booking.start_at)
    time_str = local_time.strftime('%H:%M %d/%m')

    return notify_user(
        user=staff.user,
        kind='booking_assigned',
        title='Bạn được giao một lịch hẹn mới',
        body=f'Phục vụ bé {pet_name} vào lúc {time_str}.',
        ref_type='booking',
        ref_id=booking.pk,
        link=f'/app/lich-hen?id={booking.pk}',
    )


def notify_booking_checked_in(booking):
    """Khi thú cưng check-in đến spa: Báo khách và KTV được giao."""
    pet_name = getattr(booking.pet, 'name', 'Thú cưng')
    notifications = []
    if getattr(booking.client, 'user_id', None):
        notifications += notify_user(
            user=booking.client.user,
            kind='booking_status',
            title='Bé đã được tiếp nhận tại Spa',
            body=f'Bé {pet_name} đã check-in thành công và đang được chuẩn bị làm dịch vụ.',
            ref_type='booking',
            ref_id=booking.pk,
            link=f'/app/lich-hen?id={booking.pk}',
        )
    if booking.staff and getattr(booking.staff, 'user', None):
        notifications += notify_user(
            user=booking.staff.user,
            kind='booking_status',
            title='Thú cưng đã đến spa',
            body=f'Bé {pet_name} đã đến quầy, sẵn sàng vào phòng thực hiện dịch vụ.',
            ref_type='booking',
            ref_id=booking.pk,
            link=f'/app/lich-hen?id={booking.pk}',
        )
    return notifications


def notify_booking_completed(booking):
    """
    Khi dịch vụ hoàn tất:
    - Báo Khách hàng đến đón bé.
    - Báo Lễ tân / Quản lý xuất hóa đơn thu ngân.
    """
    pet_name = getattr(booking.pet, 'name', 'Thú cưng')
    notifications = []
    if getattr(booking.client, 'user_id', None):
        notifications += notify_user(
            user=booking.client.user,
            kind='booking_completed',
            title='Bé đã làm spa xong!',
            body=f'Dịch vụ của bé {pet_name} đã hoàn tất xinh xắn, mời bạn đến đón bé.',
            ref_type='booking',
            ref_id=booking.pk,
            link=f'/app/lich-hen?id={booking.pk}',
        )
    notifications += notify_roles(
        roles=[Role.RECEPTIONIST, Role.MANAGER],
        kind='booking_completed',
        title='Dịch vụ hoàn tất, chờ thu tiền',
        body=f'Bé {pet_name} đã xong dịch vụ, sẵn sàng thu ngân xuất hóa đơn.',
        ref_type='booking',
        ref_id=booking.pk,
        link=f'/app/lich-hen?id={booking.pk}',
    )
    return notifications


def notify_booking_cancelled(booking, reason=''):
    """Khi hủy lịch hẹn: Gửi đúng bên liên quan."""
    pet_name = getattr(booking.pet, 'name', 'Thú cưng')
    notifications = []
    # Báo khách hàng nếu người hủy là nhân viên
    if getattr(booking.client, 'user_id', None):
        notifications += notify_user(
            user=booking.client.user,
            kind='booking_cancelled',
            title='Lịch hẹn đã bị hủy',
            body=f'Lịch hẹn của bé {pet_name} đã bị hủy' + (f': {reason}' if reason else '.'),
            ref_type='booking',
            ref_id=booking.pk,
            link='/app/lich-hen',
        )
    # Báo Lễ tân / Quản lý nếu khách hủy
    notifications += notify_roles(
        roles=[Role.RECEPTIONIST, Role.MANAGER],
        kind='booking_cancelled',
        title='Lịch hẹn bị hủy',
        body=f'Lịch hẹn của bé {pet_name} đã bị hủy' + (f': {reason}' if reason else '.'),
        ref_type='booking',
        ref_id=booking.pk,
        link='/app/lich-hen',
    )
    return notifications


# ==============================================================================
# HÓA ĐƠN & THANH TOÁN (INVOICE)
# ==============================================================================

def notify_invoice_created(invoice):
    """Thông báo hóa đơn mới cho khách hàng."""
    if not invoice or not getattr(invoice, 'client', None):
        return []
    if getattr(invoice.client, 'user_id', None):
        return notify_user(
            user=invoice.client.user,
            kind='invoice_new',
            title=f'Hóa đơn dịch vụ #{invoice.id}',
            body=f'Hóa đơn {invoice.total_amount:,.0f}đ đã được tạo. Bạn có thể kiểm tra chi tiết tại mục Hóa đơn.',
            ref_type='invoice',
            ref_id=invoice.id,
            link=f'/app/hoa-don?id={invoice.id}',
        )


def notify_invoice_paid(invoice):
    """Thông báo thanh toán thành công."""
    if not invoice or not getattr(invoice, 'client', None):
        return []
    if getattr(invoice.client, 'user_id', None):
        return notify_user(
            user=invoice.client.user,
            kind='invoice_paid',
            title='Thanh toán thành công',
            body=f'Đã xác nhận thanh toán hóa đơn #{invoice.id} ({invoice.total_amount:,.0f}đ). Cảm ơn quý khách!',
            ref_type='invoice',
            ref_id=invoice.id,
            link=f'/app/hoa-don?id={invoice.id}',
        )


# ==============================================================================
# NHẮC TÁI SPA & CHĂM SÓC ĐỊNH KỲ (AI REMINDERS)
# ==============================================================================

def notify_rebook_reminder(reminder):
    """Gửi nhắc tái spa thông minh tới khách hàng."""
    if not reminder or not getattr(reminder, 'client', None):
        return []
    if getattr(reminder.client, 'user_id', None):
        pet_name = getattr(reminder.pet, 'name', 'bé cưng')
        return notify_user(
            user=reminder.client.user,
            kind='rebook_reminder',
            title=f'Nhắc lịch chăm sóc cho {pet_name}',
            body=f'Đã đến chu kỳ spa định kỳ cho bé {pet_name}. Đặt lịch sớm để nhận khung giờ ưng ý nhất!',
            ref_type='reminder',
            ref_id=reminder.pk,
            link='/app/nhac-tai-spa',
        )


# ==============================================================================
# NHÂN SỰ & NGHỈ PHÉP (STAFF & TIME OFF)
# ==============================================================================

def notify_time_off_requested(time_off):
    """Kỹ thuật viên nộp đơn xin nghỉ phép -> Gửi Quản lý xét duyệt."""
    staff_name = getattr(time_off.staff.user, 'full_name', 'Nhân viên')
    from_str = time_off.date_from.strftime('%d/%m/%Y')
    to_str = time_off.date_to.strftime('%d/%m/%Y')
    span_str = from_str if from_str == to_str else f'{from_str} đến {to_str}'

    return notify_roles(
        roles=[Role.MANAGER],
        kind='staff_timeoff',
        title='Đơn xin nghỉ phép mới',
        body=f'{staff_name} gửi đơn nghỉ phép từ {span_str}. Vui lòng xét duyệt.',
        ref_type='staff',
        ref_id=time_off.pk,
        link='/app/nhan-su',
    )


def notify_time_off_reviewed(time_off, is_approved):
    """Quản lý đã duyệt/từ chối đơn nghỉ -> Gửi kết quả cho nhân viên đó."""
    status_text = 'được phê duyệt' if is_approved else 'bị từ chối'
    staff_user = getattr(time_off.staff, 'user', None)
    if not staff_user:
        return []
    from_str = time_off.date_from.strftime('%d/%m/%Y')
    to_str = time_off.date_to.strftime('%d/%m/%Y')
    span_str = from_str if from_str == to_str else f'{from_str} đến {to_str}'

    return notify_user(
        user=staff_user,
        kind='staff_timeoff_status',
        title=f'Đơn nghỉ phép đã {status_text}',
        body=f'Đơn nghỉ phép ({span_str}) của bạn đã {status_text}.',
        ref_type='staff',
        ref_id=time_off.pk,
        link='/app/nhan-su',
    )
