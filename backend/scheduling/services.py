"""Nghiệp vụ lịch hẹn: báo giá, chặn trùng, máy trạng thái (docs 05_quy_trinh.md).

Mọi thay đổi Booking đi qua module này. Lớp AI (Pha 2) không được import các hàm ghi ở đây.
"""
from datetime import datetime, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts.errors import Conflict
from accounts.models import Role, User
from catalog.models import Package, PackagePrice, Service, ServicePrice
from customers.models import Client, Pet
from notifications.models import notify
from spa.models import Resource, Spa, StaffProfile, TimeOff

from .models import (
    ACTIVE_STATUSES, Booking, BookingItem, BookingStatus, BookingStatusLog,
    WalkInStatus, WalkInTicket,
)

# Bảng chuyển trạng thái hợp lệ (Từ -> các Đến)
TRANSITIONS = {
    BookingStatus.PENDING: {BookingStatus.CONFIRMED, BookingStatus.CANCELLED},
    BookingStatus.CONFIRMED: {BookingStatus.CHECKED_IN, BookingStatus.CANCELLED},
    BookingStatus.CHECKED_IN: {BookingStatus.IN_PROGRESS},
    BookingStatus.IN_PROGRESS: {BookingStatus.COMPLETED},
    BookingStatus.COMPLETED: set(),
    BookingStatus.CANCELLED: set(),
}

FRONT_DESK = (Role.RECEPTIONIST, Role.MANAGER)


def _front_desk_users():
    return list(User.objects.filter(role__in=FRONT_DESK, is_active=True))


# ---------------------------------------------------------------- báo giá và chặn trùng

def build_items(pet, package_id, service_ids, start_at):
    """Dựng các dòng dịch vụ tuần tự và giá chốt theo size của thú."""
    if bool(package_id) == bool(service_ids):
        raise ValidationError({'package': 'Chọn một gói hoặc danh sách dịch vụ lẻ (không chọn cả hai).'})
    if not pet.size_class:
        raise ValidationError({'pet': 'Thú chưa có size (cần cân nặng hợp lệ) nên chưa báo giá được.'})

    package = None
    if package_id:
        package = Package.objects.filter(pk=package_id, is_active=True).first()
        if not package:
            raise ValidationError({'package': 'Gói không tồn tại hoặc đã ngừng.'})
        if package.species_scope not in ('both', pet.species):
            raise ValidationError({'package': 'Gói này không áp dụng cho loài của thú.'})
        services = [i.service for i in package.items.select_related('service')]
    else:
        found = {s.pk: s for s in Service.objects.filter(pk__in=service_ids, is_active=True)}
        missing = [i for i in service_ids if i not in found]
        if missing:
            raise ValidationError({'services': 'Có dịch vụ không tồn tại hoặc đã ngừng.'})
        services = [found[i] for i in service_ids]
    if not services:
        raise ValidationError({'package': 'Gói chưa có dịch vụ nào.'})
    for s in services:
        if s.species_scope not in ('both', pet.species):
            raise ValidationError({'services': f'Dịch vụ "{s.name}" không áp dụng cho loài của thú.'})

    prices = {}
    for s in services:
        p = ServicePrice.objects.filter(service=s, size_class=pet.size_class).first()
        if not p:
            raise ValidationError({'services': f'Dịch vụ "{s.name}" chưa có giá cho size {pet.size_class}.'})
        prices[s.pk] = p.price

    unit = dict(prices)
    if package:
        pp = PackagePrice.objects.filter(package=package, size_class=pet.size_class).first()
        if not pp:
            raise ValidationError({'package': f'Gói chưa có giá cho size {pet.size_class}.'})
        base = sum(prices.values()) or Decimal(1)
        running = Decimal(0)
        for s in services[:-1]:
            unit[s.pk] = (pp.price * prices[s.pk] / base).quantize(Decimal(1))
            running += unit[s.pk]
        unit[services[-1].pk] = pp.price - running

    items, cursor = [], start_at
    for pos, s in enumerate(services):
        end = cursor + timedelta(minutes=s.duration_minutes)
        items.append(dict(service=s, position=pos, start_at=cursor, end_at=end,
                          resource_type=s.resource_type, unit_price=unit[s.pk]))
        cursor = end
    return package, items, sum(i['unit_price'] for i in items), cursor


def vaccination_warnings(pet):
    if not pet.vaccinations.exists():
        return [{'severity': 'warn', 'code': 'no_vaccination',
                 'detail': f'{pet.name} chưa có ghi nhận tiêm phòng. Cần xác nhận trước khi nhận thú.'}]
    return []


def specialty_warnings(items, staff):
    if not staff:
        return []
    have = set(staff.specialties.values_list('id', flat=True))
    need = {i['service'].required_specialty_id for i in items if i['service'].required_specialty_id}
    if need - have:
        return [{'severity': 'warn', 'code': 'staff_specialty',
                 'detail': f'{staff} chưa có đủ chuyên môn cho mọi dịch vụ trong lịch.'}]
    return []


def check_slot(spa, pet, items, start_at, end_at, staff=None, exclude_id=None):
    """Raise Conflict nếu khung giờ không khả thi. Trả None nếu ổn."""
    local_start, local_end = timezone.localtime(start_at), timezone.localtime(end_at)
    if (local_start.weekday() not in spa.open_weekdays or local_start.date() != local_end.date()
            or local_start.time() < spa.open_time or local_end.time() > spa.close_time):
        raise Conflict('outside_hours', 'Khung giờ nằm ngoài giờ mở cửa của spa.')

    for it in items:
        cap = Resource.objects.filter(resource_type=it['resource_type'], is_active=True).count()
        used = BookingItem.objects.filter(
            resource_type=it['resource_type'], booking__status__in=ACTIVE_STATUSES,
            start_at__lt=it['end_at'], end_at__gt=it['start_at'])
        if exclude_id:
            used = used.exclude(booking_id=exclude_id)
        if used.count() >= cap:
            raise Conflict('resource_full', f'Đã hết chỗ cho "{it["service"].name}" trong khung giờ này.')

    base = Booking.objects.filter(status__in=ACTIVE_STATUSES, start_at__lt=end_at, end_at__gt=start_at)
    if exclude_id:
        base = base.exclude(pk=exclude_id)
    if base.filter(pet=pet).exists():
        raise Conflict('pet_busy', 'Thú này đã có lịch trùng khung giờ.')
    if staff:
        d = local_start.date()
        if TimeOff.objects.filter(staff=staff, date_from__lte=d, date_to__gte=d).exists():
            raise Conflict('staff_off', f'{staff} đang nghỉ vào ngày này.')
        if not staff.shifts.filter(weekday=d.weekday(), start_time__lte=local_start.time(),
                                   end_time__gte=local_end.time()).exists():
            raise Conflict('staff_off', f'{staff} không có ca làm phủ khung giờ này.')
        if base.filter(staff=staff).exists():
            raise Conflict('staff_busy', f'{staff} đã có lịch trùng khung giờ.')


def quote(pet, package_id, service_ids, start_at, staff_id=None, exclude_id=None):
    """Báo giá và kiểm tra khả thi mà không ghi dữ liệu."""
    staff = _get_staff(staff_id)
    package, items, total, end_at = build_items(pet, package_id, service_ids, start_at)
    out = dict(
        package=package.pk if package else None, size_class=pet.size_class,
        start_at=start_at, end_at=end_at, total_price=total, feasible=True, conflict=None,
        items=[dict(service=i['service'].pk, service_name=i['service'].name, start_at=i['start_at'],
                    end_at=i['end_at'], resource_type=i['resource_type'], unit_price=i['unit_price'])
               for i in items],
        warnings=vaccination_warnings(pet) + specialty_warnings(items, staff),
    )
    try:
        check_slot(Spa.get(), pet, items, start_at, end_at, staff, exclude_id)
    except Conflict as e:
        out['feasible'], out['conflict'] = False, {'code': e.detail.code, 'detail': str(e.detail)}
    return out


def availability(pet, package_id, service_ids, day, staff_id=None):
    """Danh sách slot trong ngày và còn chỗ hay không."""
    spa = Spa.get()
    staff = _get_staff(staff_id)
    tz = timezone.get_current_timezone()
    step = timedelta(minutes=spa.slot_minutes)
    cursor = timezone.make_aware(datetime.combine(day, spa.open_time), tz)
    last = timezone.make_aware(datetime.combine(day, spa.close_time), tz)
    now, slots = timezone.now(), []
    while cursor < last:
        package, items, total, end_at = build_items(pet, package_id, service_ids, cursor)
        reason = None
        if cursor <= now:
            reason = {'code': 'in_past', 'detail': 'Đã qua giờ này.'}
        else:
            try:
                check_slot(spa, pet, items, cursor, end_at, staff)
            except Conflict as e:
                reason = {'code': e.detail.code, 'detail': str(e.detail)}
        slots.append({'start_at': cursor, 'end_at': end_at, 'available': reason is None, 'reason': reason})
        cursor += step
    return slots


def _get_staff(staff_id):
    if not staff_id:
        return None
    staff = StaffProfile.objects.select_related('user').filter(
        pk=staff_id, is_active=True, user__role=Role.TECHNICIAN).first()
    if not staff:
        raise ValidationError({'staff': 'Kỹ thuật viên không tồn tại hoặc đã nghỉ.'})
    return staff


# ---------------------------------------------------------------- ghi dữ liệu

def _log(booking, from_status, to_status, user, reason=''):
    BookingStatusLog.objects.create(
        booking=booking, from_status=from_status, to_status=to_status, changed_by=user, reason=reason)


@transaction.atomic
def create_booking(user, pet, package_id, service_ids, start_at, staff_id=None, note='',
                   customer_note='', channel=None, confirm=True):
    """Tạo lịch. Khách -> pending. Lễ tân/Quản lý -> confirmed (hoặc pending nếu confirm=False)."""
    is_customer = user.role == Role.CUSTOMER
    if not pet.is_active:
        raise ValidationError({'pet': 'Hồ sơ thú đã ngừng hoạt động.'})
    if is_customer and start_at <= timezone.now():
        raise ValidationError({'start_at': 'Giờ hẹn phải ở tương lai.'})

    Spa.objects.select_for_update().get(pk=1)  # tuần tự hóa kiểm tra-rồi-ghi (PostgreSQL)
    staff = _get_staff(staff_id) if not is_customer else None
    package, items, total, end_at = build_items(pet, package_id, service_ids, start_at)
    check_slot(Spa.get(), pet, items, start_at, end_at, staff)

    status = BookingStatus.PENDING if (is_customer or not confirm) else BookingStatus.CONFIRMED
    booking = Booking.objects.create(
        client=pet.client, pet=pet, package=package, staff=staff, status=status,
        start_at=start_at, end_at=end_at, created_by=user, total_price=total,
        channel=Booking.Channel.ONLINE if is_customer else (channel or Booking.Channel.COUNTER),
        note_internal='' if is_customer else note, customer_note=customer_note)
    BookingItem.objects.bulk_create([BookingItem(booking=booking, **i) for i in items])
    _log(booking, '', status, user)
    if status == BookingStatus.PENDING:
        notify(_front_desk_users(), 'booking_new', 'Có lịch hẹn mới chờ duyệt',
               f'{pet.name} - {timezone.localtime(start_at):%d/%m %H:%M}', 'booking', booking.pk)
    elif pet.client.user_id:
        notify([pet.client.user], 'booking_confirmed', 'Lịch hẹn đã được xác nhận',
               f'{pet.name} - {timezone.localtime(start_at):%d/%m %H:%M}', 'booking', booking.pk)

    # Chuyển trạng thái các lời nhắc tái spa của bé sang 'booked' (đã đặt lại lịch)
    try:
        from ai_assistant.models import RebookReminder
        RebookReminder.objects.filter(
            pet=pet,
            status__in=[RebookReminder.Status.SUGGESTED, RebookReminder.Status.APPROVED, RebookReminder.Status.SENT]
        ).update(status=RebookReminder.Status.BOOKED)
    except Exception:
        pass

    return booking


def _move(booking, to, user, reason='', **fields):
    cur = BookingStatus(booking.status)
    if to not in TRANSITIONS[cur]:
        raise Conflict('invalid_transition', f'Không thể chuyển từ "{cur.label}" sang "{BookingStatus(to).label}".')
    for k, v in fields.items():
        setattr(booking, k, v)
    booking.status = to
    booking.save()
    _log(booking, cur, to, user, reason)


def _notify_client(booking, kind, title):
    if booking.client.user_id:
        notify([booking.client.user], kind, title,
               f'{booking.pet.name} - {timezone.localtime(booking.start_at):%d/%m %H:%M}', 'booking', booking.pk)


@transaction.atomic
def confirm(booking, user):
    Spa.objects.select_for_update().get(pk=1)
    booking = Booking.objects.select_for_update().get(pk=booking.pk)
    if booking.status != BookingStatus.PENDING:
        raise Conflict('invalid_transition', 'Chỉ duyệt được lịch đang chờ duyệt.')
    items = [dict(service=i.service, start_at=i.start_at, end_at=i.end_at, resource_type=i.resource_type)
             for i in booking.items.select_related('service')]
    check_slot(Spa.get(), booking.pet, items, booking.start_at, booking.end_at, booking.staff, booking.pk)
    _move(booking, BookingStatus.CONFIRMED, user)
    _notify_client(booking, 'booking_confirmed', 'Lịch hẹn đã được xác nhận')
    return booking


@transaction.atomic
def cancel(booking, user, reason='', code=''):
    booking = Booking.objects.select_for_update().get(pk=booking.pk)
    cur = BookingStatus(booking.status)
    if BookingStatus.CANCELLED not in TRANSITIONS[cur]:
        raise Conflict('invalid_transition', f'Không thể hủy lịch ở trạng thái "{cur.label}".')
    now = timezone.now()
    if user.role == Role.CUSTOMER:
        cutoff = timedelta(hours=Spa.get().cancel_cutoff_hours)
        if cur == BookingStatus.CONFIRMED and booking.start_at - now < cutoff:
            raise Conflict('cancel_too_late',
                           f'Chỉ tự hủy được trước giờ hẹn tối thiểu {Spa.get().cancel_cutoff_hours} giờ. '
                           'Vui lòng liên hệ spa.')
        reason, code = reason or 'Khách tự hủy.', Booking.CancelCode.CUSTOMER
    else:
        if not reason.strip():
            raise ValidationError({'reason': 'Bắt buộc nhập lý do.'})
        if code == Booking.CancelCode.NO_SHOW:
            if cur != BookingStatus.CONFIRMED or booking.start_at > now:
                raise Conflict('invalid_transition', 'Chỉ đánh dấu không đến với lịch đã xác nhận và đã qua giờ hẹn.')
        elif cur == BookingStatus.PENDING and not code:
            code = Booking.CancelCode.REJECTED
        code = code or Booking.CancelCode.OTHER
    if not reason.strip():
        raise ValidationError({'reason': 'Bắt buộc nhập lý do.'})
    _move(booking, BookingStatus.CANCELLED, user, reason, cancel_reason=reason, cancel_reason_code=code)
    if user.role != Role.CUSTOMER:
        _notify_client(booking, 'booking_cancelled', 'Lịch hẹn đã bị hủy')
    else:
        notify(_front_desk_users(), 'booking_cancelled', 'Khách đã hủy lịch hẹn',
               f'{booking.pet.name} - {timezone.localtime(booking.start_at):%d/%m %H:%M}', 'booking', booking.pk)
    return booking


@transaction.atomic
def update_booking(booking, user, pet=None, package_id=None, service_ids=None, start_at=None,
                   staff_id=None, note=None, customer_note=None):
    """Sửa thông tin hoặc dời lịch hẹn. Chỉ cho phép khi PENDING hoặc CONFIRMED."""
    Spa.objects.select_for_update().get(pk=1)
    booking = Booking.objects.select_for_update().get(pk=booking.pk)
    cur = BookingStatus(booking.status)
    if cur not in (BookingStatus.PENDING, BookingStatus.CONFIRMED):
        raise Conflict('invalid_transition', f'Không thể sửa lịch ở trạng thái "{cur.label}".')

    is_customer = user.role == Role.CUSTOMER
    if is_customer:
        if booking.client.user_id != user.id:
            raise PermissionDenied()
        cutoff = timedelta(hours=Spa.get().cancel_cutoff_hours)
        if cur == BookingStatus.CONFIRMED and booking.start_at - timezone.now() < cutoff:
            raise Conflict('update_too_late',
                           f'Chỉ tự dời lịch trước giờ hẹn tối thiểu {Spa.get().cancel_cutoff_hours} giờ. '
                           'Vui lòng liên hệ spa.')

    new_pet = pet if pet else booking.pet
    new_start_at = start_at if start_at else booking.start_at
    if is_customer and new_start_at <= timezone.now():
        raise ValidationError({'start_at': 'Giờ hẹn phải ở tương lai.'})

    new_staff = _get_staff(staff_id) if (staff_id is not None and not is_customer) else (
        booking.staff if staff_id is None else None
    )

    has_package = package_id is not None
    has_services = service_ids is not None

    if has_package or has_services:
        pkg_id = package_id if has_package else (booking.package_id if not has_services else None)
        svc_ids = service_ids if has_services else (None if has_package else [i.service_id for i in booking.items.all()])
        package, items, total, end_at = build_items(new_pet, pkg_id, svc_ids, new_start_at)
        items_payload = [dict(service=i['service'], start_at=i['start_at'], end_at=i['end_at'],
                              resource_type=i['resource_type']) for i in items]
        check_slot(Spa.get(), new_pet, items_payload, new_start_at, end_at, new_staff, exclude_id=booking.pk)

        booking.package = package
        booking.total_price = total
        booking.start_at = new_start_at
        booking.end_at = end_at
        booking.items.all().delete()
        BookingItem.objects.bulk_create([BookingItem(booking=booking, **i) for i in items])
    elif new_start_at != booking.start_at:
        cursor = new_start_at
        items_payload = []
        existing_items = list(booking.items.select_related('service').order_by('position'))
        for it in existing_items:
            dur = timedelta(minutes=it.service.duration_minutes)
            it_end = cursor + dur
            items_payload.append(dict(service=it.service, position=it.position, start_at=cursor, end_at=it_end,
                                      resource_type=it.resource_type, unit_price=it.unit_price))
            cursor = it_end
        check_slot(Spa.get(), new_pet, items_payload, new_start_at, cursor, new_staff, exclude_id=booking.pk)

        booking.start_at = new_start_at
        booking.end_at = cursor
        for it, data in zip(existing_items, items_payload):
            it.start_at = data['start_at']
            it.end_at = data['end_at']
            it.save(update_fields=['start_at', 'end_at'])
    else:
        items_payload = [dict(service=i.service, start_at=i.start_at, end_at=i.end_at, resource_type=i.resource_type)
                         for i in booking.items.select_related('service')]
        check_slot(Spa.get(), new_pet, items_payload, booking.start_at, booking.end_at, new_staff, exclude_id=booking.pk)

    booking.pet = new_pet
    booking.staff = new_staff
    if note is not None and not is_customer:
        booking.note_internal = note
    if customer_note is not None:
        booking.customer_note = customer_note
    booking.save()

    _log(booking, cur, cur, user, reason='Cập nhật thông tin lịch hẹn')
    if is_customer:
        notify(_front_desk_users(), 'booking_updated', 'Khách đã dời/cập nhật lịch hẹn',
               f'{booking.pet.name} - {timezone.localtime(booking.start_at):%d/%m %H:%M}', 'booking', booking.pk)
    elif booking.client.user_id:
        notify([booking.client.user], 'booking_updated', 'Lịch hẹn của bạn đã được cập nhật',
               f'{booking.pet.name} - {timezone.localtime(booking.start_at):%d/%m %H:%M}', 'booking', booking.pk)
    return booking


@transaction.atomic
def assign_staff(booking, staff_id, user):
    Spa.objects.select_for_update().get(pk=1)
    booking = Booking.objects.select_for_update().get(pk=booking.pk)
    if booking.status not in ACTIVE_STATUSES:
        raise Conflict('invalid_transition', 'Không thể đổi kỹ thuật viên của lịch đã kết thúc.')
    staff = _get_staff(staff_id)
    if staff:
        items = [dict(service=i.service, start_at=i.start_at, end_at=i.end_at, resource_type=i.resource_type)
                 for i in booking.items.select_related('service')]
        check_slot(Spa.get(), booking.pet, items, booking.start_at, booking.end_at, staff, booking.pk)
    booking.staff = staff
    booking.save(update_fields=['staff', 'updated_at'])
    if staff:
        notify([staff.user], 'booking_assigned', 'Bạn được giao một lịch hẹn',
               f'{booking.pet.name} - {timezone.localtime(booking.start_at):%d/%m %H:%M}', 'booking', booking.pk)
    return booking


@transaction.atomic
def check_in(booking, user, assignments=None):
    """assignments: {item_id: resource_id}. Thiếu thì tự gán tài nguyên trống."""
    Spa.objects.select_for_update().get(pk=1)
    booking = Booking.objects.select_for_update().get(pk=booking.pk)
    if booking.status != BookingStatus.CONFIRMED:
        raise Conflict('invalid_transition', 'Chỉ nhận thú với lịch đã xác nhận.')
    assignments = assignments or {}
    for item in booking.items.select_related('service'):
        busy_ids = BookingItem.objects.filter(
            resource__isnull=False, booking__status__in=(BookingStatus.CHECKED_IN, BookingStatus.IN_PROGRESS),
            start_at__lt=item.end_at, end_at__gt=item.start_at).exclude(booking=booking
            ).values_list('resource_id', flat=True)
        free = Resource.objects.filter(resource_type=item.resource_type, is_active=True).exclude(pk__in=busy_ids)
        wanted = assignments.get(item.pk)
        if wanted:
            res = free.filter(pk=wanted).first()
            if not res:
                wanted_obj = Resource.objects.filter(pk=wanted).first()
                if wanted_obj and wanted_obj.pk in busy_ids:
                    raise Conflict('resource_busy', f'Vị trí "{wanted_obj.name}" hiện đang có thú cưng sử dụng.')
                raise Conflict('invalid_resource', 'Vị trí được chọn không phù hợp với dịch vụ này.')
        else:
            res = free.first()
        if not res:
            raise Conflict('no_resource', f'Không còn tài nguyên trống cho "{item.service.name}".')
        item.resource = res
        item.save(update_fields=['resource'])
    _move(booking, BookingStatus.CHECKED_IN, user, checked_in_at=timezone.now())
    return booking


def _require_technician(booking, user):
    if user.role == Role.TECHNICIAN and not (booking.staff_id and booking.staff.user_id == user.id):
        raise Conflict('not_assigned', 'Bạn không được giao lịch này.')
    if not booking.staff_id:
        raise Conflict('no_staff', 'Lịch chưa có kỹ thuật viên phụ trách.')


@transaction.atomic
def start(booking, user):
    booking = Booking.objects.select_for_update().get(pk=booking.pk)
    _require_technician(booking, user)
    _move(booking, BookingStatus.IN_PROGRESS, user)
    return booking


@transaction.atomic
def complete(booking, user):
    from billing.services import create_invoice
    booking = Booking.objects.select_for_update().get(pk=booking.pk)
    _require_technician(booking, user)
    _move(booking, BookingStatus.COMPLETED, user, completed_at=timezone.now())
    create_invoice(booking)
    notify(_front_desk_users(), 'booking_completed', 'Có thú đã làm xong, chờ thu tiền',
           f'{booking.pet.name}', 'booking', booking.pk)
    return booking


@transaction.atomic
def check_out(booking, user):
    booking = Booking.objects.select_for_update().get(pk=booking.pk)
    if booking.status != BookingStatus.COMPLETED:
        raise Conflict('invalid_transition', 'Chỉ trả thú với lịch đã hoàn tất.')
    if booking.checked_out_at:
        raise Conflict('invalid_transition', 'Lịch này đã được trả thú.')
    booking.checked_out_at = timezone.now()
    booking.save(update_fields=['checked_out_at', 'updated_at'])
    _log(booking, BookingStatus.COMPLETED, BookingStatus.COMPLETED, user, 'Trả thú')
    return booking


# ==============================================================================
# HÀNG ĐỢI TIẾP NHẬN KHÁCH VÃNG LAI (WALK-IN QUEUE - SPA-18)
# ==============================================================================

def create_walk_in(contact_name, phone='', pet_name='', pet_species='dog', service=None, package=None, client=None, pet=None, note=''):
    """Lấy số thứ tự hàng đợi khách vãng lai (SPA-18)."""
    today = timezone.localdate()
    # Tự động gán Client và Pet nếu tìm thấy
    if phone and not client:
        client = Client.objects.filter(phone=phone).first()
    if client and not pet and pet_name:
        pet = Pet.objects.filter(client=client, name__iexact=pet_name).first()

    # Tính queue_no tăng dần trong ngày
    with transaction.atomic():
        last_ticket = WalkInTicket.objects.select_for_update().filter(date=today).order_by('-queue_no').first()
        queue_no = (last_ticket.queue_no + 1) if last_ticket else 1

        # Tính thời gian chờ ước tính
        waiting_count = WalkInTicket.objects.filter(date=today, status__in=[WalkInStatus.WAITING, WalkInStatus.CALLED]).count()
        duration = 30
        if service:
            duration = service.duration_minutes
        elif package:
            duration = sum(i.service.duration_minutes for i in package.items.all())

        active_res = Resource.objects.filter(is_active=True).count() or 1
        estimated = max(5, int((waiting_count * duration) / max(1, (active_res // 2))))

        ticket = WalkInTicket.objects.create(
            date=today,
            queue_no=queue_no,
            client=client,
            contact_name=contact_name or (client.full_name if client else 'Khách vãng lai'),
            phone=phone or (client.phone if client else ''),
            pet=pet,
            pet_name=pet_name or (pet.name if pet else 'Bé cưng'),
            pet_species=pet_species or (pet.species if pet else 'dog'),
            service=service,
            package=package,
            status=WalkInStatus.WAITING,
            estimated_wait_minutes=estimated,
            note=note,
        )
    return ticket


def call_walk_in(ticket, user):
    """Lễ tân gọi số thứ tự tiếp theo (SPA-18)."""
    if ticket.status == WalkInStatus.SERVED:
        raise Conflict('invalid_transition', 'Phiếu này đã được tiếp nhận.')
    if ticket.status == WalkInStatus.LEFT:
        raise Conflict('invalid_transition', 'Khách đã hủy phiếu hoặc rời đi.')
    ticket.status = WalkInStatus.CALLED
    ticket.called_at = timezone.now()
    ticket.save(update_fields=['status', 'called_at', 'updated_at'])
    return ticket


@transaction.atomic
def convert_walk_in(ticket, user, staff_id=None, assignments=None):
    """Chuyển đổi phiếu walk-in thành Booking và tiếp nhận vào bàn (SPA-18)."""
    ticket = WalkInTicket.objects.select_for_update().get(pk=ticket.pk)
    if ticket.status == WalkInStatus.SERVED:
        raise Conflict('invalid_transition', 'Phiếu này đã được tiếp nhận.')
    if ticket.status == WalkInStatus.LEFT:
        raise Conflict('invalid_transition', 'Khách đã hủy phiếu hoặc rời đi.')

    # 1. Đảm bảo có Client
    client = ticket.client
    if not client:
        if ticket.phone:
            client = Client.objects.filter(phone=ticket.phone).first()
        if not client:
            client = Client.objects.create(
                full_name=ticket.contact_name or 'Khách vãng lai',
                phone=ticket.phone or f'W{ticket.pk:04d}',
                source=Client.Source.WALK_IN,
                is_active=True,
            )

    # 2. Đảm bảo có Pet
    pet = ticket.pet
    if not pet:
        if client:
            pet = Pet.objects.filter(client=client, name__iexact=ticket.pet_name).first()
        if not pet:
            pet = Pet.objects.create(
                client=client,
                name=ticket.pet_name or 'Bé cưng',
                species=ticket.pet_species or 'dog',
                weight_kg=Decimal('5.0'),
                coat_type='short',
                is_active=True,
            )

    # 3. Xác định dịch vụ/gói
    pkg_id = ticket.package_id
    svc_ids = [ticket.service_id] if ticket.service_id else None
    if not pkg_id and not svc_ids:
        first_svc = Service.objects.filter(is_active=True).first()
        if first_svc:
            svc_ids = [first_svc.pk]

    spa = Spa.get()
    start_at = timezone.now()
    if spa:
        local_now = timezone.localtime(start_at)
        if local_now.time() > spa.close_time or local_now.time() < spa.open_time:
            mid_hour = (spa.open_time.hour + spa.close_time.hour) // 2
            start_at = local_now.replace(hour=mid_hour, minute=0, second=0, microsecond=0)

    # 4. Tạo Booking
    booking = create_booking(
        user=user,
        pet=pet,
        package_id=pkg_id,
        service_ids=svc_ids,
        start_at=start_at,
        staff_id=staff_id,
        note=ticket.note,
        customer_note=f'Phiếu Walk-in #{ticket.queue_no:02d}',
        channel=Booking.Channel.WALK_IN,
        confirm=True,
    )

    # 5. Nếu có yêu cầu gán bàn hoặc check-in ngay
    if assignments is not None:
        real_assignments = {}
        items_list = list(booking.items.all().order_by('pk'))
        for k, res_id in assignments.items():
            if k in [it.pk for it in items_list]:
                real_assignments[k] = res_id
            elif 1 <= k <= len(items_list):
                real_assignments[items_list[k - 1].pk] = res_id
            elif len(items_list) == 1:
                real_assignments[items_list[0].pk] = res_id
        booking = check_in(booking, user, assignments=real_assignments)

    # 6. Cập nhật phiếu walk-in
    ticket.status = WalkInStatus.SERVED
    ticket.served_at = timezone.now()
    ticket.booking = booking
    ticket.client = client
    ticket.pet = pet
    ticket.save(update_fields=['status', 'served_at', 'booking', 'client', 'pet', 'updated_at'])

    return ticket, booking


def leave_walk_in(ticket, user, reason=''):
    """Đánh dấu khách rời đi / hủy chờ (SPA-18)."""
    if ticket.status == WalkInStatus.SERVED:
        raise Conflict('invalid_transition', 'Phiếu này đã được tiếp nhận, không thể đánh dấu rời đi.')
    ticket.status = WalkInStatus.LEFT
    ticket.left_at = timezone.now()
    if reason:
        ticket.note = (ticket.note + f' [Rời đi: {reason}]').strip()
    ticket.save(update_fields=['status', 'left_at', 'note', 'updated_at'])
    return ticket

