from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsFrontDesk
from ai_assistant.models import RebookReminder
from billing.models import Invoice
from catalog.models import Package, Service
from customers.models import Client, Pet
from scheduling.models import Booking, BookingItem, BookingStatus
from spa.models import StaffProfile


def _parse_date_range(request):
    """
    Xác định khoảng ngày bắt đầu và kết thúc dựa trên query params.
    Hỗ trợ shortcut filter: 'today', '7days', 'this_month', 'last_month', 'all_time'
    Hoặc dải ngày tùy chọn start_date & end_date (YYYY-MM-DD).
    Mặc định nếu không truyền: tháng hiện tại (từ ngày 1 đến hôm nay).
    """
    today = timezone.localdate()
    filter_preset = request.query_params.get('preset', '').strip().lower()

    if filter_preset == 'today':
        start_d, end_d = today, today
    elif filter_preset == '7days':
        start_d, end_d = today - timedelta(days=6), today
    elif filter_preset == '30days':
        start_d, end_d = today - timedelta(days=29), today
    elif filter_preset == 'this_month':
        start_d, end_d = today.replace(day=1), today
    elif filter_preset == 'last_month':
        first_this_month = today.replace(day=1)
        last_prev_month = first_this_month - timedelta(days=1)
        start_d, end_d = last_prev_month.replace(day=1), last_prev_month
    elif filter_preset == 'all_time':
        earliest_booking = Booking.objects.order_by('start_at').first()
        earliest_invoice = Invoice.objects.order_by('created_at').first()
        earliest_dates = []
        if earliest_booking:
            earliest_dates.append(timezone.localdate(earliest_booking.start_at))
        if earliest_invoice:
            earliest_dates.append(timezone.localdate(earliest_invoice.created_at))
        start_d = min(earliest_dates) if earliest_dates else today - timedelta(days=30)

        latest_booking = Booking.objects.order_by('-start_at').first()
        latest_invoice = Invoice.objects.order_by('-created_at').first()
        latest_dates = [today]
        if latest_booking:
            latest_dates.append(timezone.localdate(latest_booking.start_at))
        if latest_invoice:
            latest_dates.append(timezone.localdate(latest_invoice.created_at))
        end_d = max(latest_dates)
    else:
        req_start = parse_date(request.query_params.get('start_date', ''))
        req_end = parse_date(request.query_params.get('end_date', ''))
        if req_start and req_end:
            start_d = req_start
            end_d = req_end
        elif req_start and not req_end:
            start_d = req_start
            end_d = today
        elif req_end and not req_start:
            start_d = req_end - timedelta(days=30)
            end_d = req_end
        else:
            # Mặc định lấy từ đầu tháng này đến hôm nay (nếu ngày 1 thì lấy 30 ngày qua)
            if today.day <= 3:
                start_d = today - timedelta(days=29)
                end_d = today
            else:
                start_d = today.replace(day=1)
                end_d = today

    # Đảm bảo start_d <= end_d
    if start_d > end_d:
        start_d, end_d = end_d, start_d

    tz = timezone.get_current_timezone()
    start_dt = timezone.make_aware(datetime.combine(start_d, time.min), tz)
    end_dt = timezone.make_aware(datetime.combine(end_d, time.max), tz)

    return start_d, end_d, start_dt, end_dt


class AnalyticsOverviewView(APIView):
    """
    API tổng hợp toàn diện số liệu hoạt động, tài chính, năng suất nhân sự và hiệu quả AI của Spa.
    Dành cho Lễ tân và Quản lý.
    """
    permission_classes = [IsFrontDesk]

    def get(self, request):
        start_d, end_d, start_dt, end_dt = _parse_date_range(request)
        days_count = (end_d - start_d).days + 1

        # 1. Hóa đơn & Tài chính
        paid_invoices = Invoice.objects.filter(
            status=Invoice.Status.PAID,
            paid_at__gte=start_dt,
            paid_at__lte=end_dt,
        )
        total_revenue = sum((i.total for i in paid_invoices), Decimal(0))
        paid_count = paid_invoices.count()
        aov = int(round(total_revenue / paid_count)) if paid_count > 0 else 0

        cash_invoices = paid_invoices.filter(payment_method=Invoice.Method.CASH)
        cash_total = sum((i.total for i in cash_invoices), Decimal(0))
        transfer_invoices = paid_invoices.filter(payment_method=Invoice.Method.TRANSFER)
        transfer_total = sum((i.total for i in transfer_invoices), Decimal(0))

        unpaid_invoices = Invoice.objects.filter(
            status=Invoice.Status.UNPAID,
            created_at__gte=start_dt,
            created_at__lte=end_dt,
        )
        unpaid_total = sum((i.total for i in unpaid_invoices), Decimal(0))
        unpaid_count = unpaid_invoices.count()

        # 2. Hoạt động Lịch hẹn
        period_bookings = Booking.objects.filter(
            start_at__gte=start_dt,
            start_at__lte=end_dt,
        ).select_related('client', 'pet', 'package', 'staff__user')

        total_bookings = period_bookings.count()
        completed_bookings = period_bookings.filter(status=BookingStatus.COMPLETED).count()
        cancelled_bookings = period_bookings.filter(status=BookingStatus.CANCELLED).count()
        in_progress_bookings = period_bookings.filter(
            status__in=[BookingStatus.CHECKED_IN, BookingStatus.IN_PROGRESS]
        ).count()
        pending_bookings = period_bookings.filter(
            status__in=[BookingStatus.PENDING, BookingStatus.CONFIRMED]
        ).count()

        completion_rate = round((completed_bookings / total_bookings * 100), 1) if total_bookings > 0 else 0.0
        cancellation_rate = round((cancelled_bookings / total_bookings * 100), 1) if total_bookings > 0 else 0.0

        # Phân bổ kênh đặt hẹn
        channels_map = {'online': 0, 'counter': 0, 'walk_in': 0}
        for b in period_bookings:
            c = b.channel
            channels_map[c] = channels_map.get(c, 0) + 1

        # Phân bổ lý do hủy
        cancel_reasons_map = {}
        for b in period_bookings.filter(status=BookingStatus.CANCELLED):
            code = b.cancel_reason_code or 'other'
            label = b.get_cancel_reason_code_display() if b.cancel_reason_code else 'Khác'
            cancel_reasons_map[label] = cancel_reasons_map.get(label, 0) + 1

        # 3. Xu hướng theo ngày (Daily trend)
        daily_trend = []
        cur_d = start_d
        # Nếu khoảng ngày quá 90 ngày thì có thể gom, nhưng trong thực tế spa dải ngày thông thường <= 90 ngày
        while cur_d <= end_d:
            d_start = timezone.make_aware(datetime.combine(cur_d, time.min))
            d_end = timezone.make_aware(datetime.combine(cur_d, time.max))

            day_paid = Invoice.objects.filter(status=Invoice.Status.PAID, paid_at__gte=d_start, paid_at__lte=d_end)
            day_rev = sum((i.total for i in day_paid), Decimal(0))
            day_bks = period_bookings.filter(start_at__gte=d_start, start_at__lte=d_end)

            daily_trend.append({
                'date': cur_d.strftime('%Y-%m-%d'),
                'display_date': cur_d.strftime('%d/%m'),
                'weekday': cur_d.weekday(),
                'revenue': int(day_rev),
                'paid_count': day_paid.count(),
                'total_bookings': day_bks.count(),
                'completed_bookings': day_bks.filter(status=BookingStatus.COMPLETED).count(),
                'cancelled_bookings': day_bks.filter(status=BookingStatus.CANCELLED).count(),
            })
            cur_d += timedelta(days=1)

        # 4. Top Dịch vụ mang lại doanh thu cao nhất
        service_items = BookingItem.objects.filter(
            booking__start_at__gte=start_dt,
            booking__start_at__lte=end_dt,
        ).exclude(booking__status=BookingStatus.CANCELLED).select_related('service')

        service_stats = {}
        for itm in service_items:
            s = itm.service
            if not s:
                continue
            s_id = s.id
            if s_id not in service_stats:
                service_stats[s_id] = {
                    'id': s_id,
                    'name': s.name,
                    'category': s.get_category_display(),
                    'count': 0,
                    'revenue': Decimal(0),
                }
            service_stats[s_id]['count'] += 1
            service_stats[s_id]['revenue'] += itm.unit_price

        top_services = sorted(
            [
                {
                    'id': v['id'],
                    'name': v['name'],
                    'category': v['category'],
                    'count': v['count'],
                    'revenue': int(v['revenue']),
                }
                for v in service_stats.values()
            ],
            key=lambda x: (x['revenue'], x['count']),
            reverse=True,
        )

        # 5. Top Gói combo
        package_bookings = period_bookings.filter(package__isnull=False).exclude(status=BookingStatus.CANCELLED)
        package_stats = {}
        for b in package_bookings:
            pkg = b.package
            if not pkg:
                continue
            pkg_id = pkg.id
            if pkg_id not in package_stats:
                package_stats[pkg_id] = {
                    'id': pkg_id,
                    'name': pkg.name,
                    'count': 0,
                    'revenue': Decimal(0),
                }
            package_stats[pkg_id]['count'] += 1
            package_stats[pkg_id]['revenue'] += b.total_price

        top_packages = sorted(
            [
                {
                    'id': v['id'],
                    'name': v['name'],
                    'count': v['count'],
                    'revenue': int(v['revenue']),
                }
                for v in package_stats.values()
            ],
            key=lambda x: (x['revenue'], x['count']),
            reverse=True,
        )

        # 6. Năng suất Kỹ thuật viên (Staff Performance)
        staff_perf = []
        staff_qs = StaffProfile.objects.filter(is_active=True).select_related('user').prefetch_related('specialties')
        for sp in staff_qs:
            staff_bks = period_bookings.filter(staff=sp)
            s_total = staff_bks.count()
            s_completed = staff_bks.filter(status=BookingStatus.COMPLETED).count()
            s_cancelled = staff_bks.filter(status=BookingStatus.CANCELLED).count()
            s_rev = sum((b.total_price for b in staff_bks.filter(status=BookingStatus.COMPLETED)), Decimal(0))
            s_rate = round((s_completed / s_total * 100), 1) if s_total > 0 else 0.0

            staff_perf.append({
                'id': sp.id,
                'name': sp.user.full_name or sp.user.username,
                'phone': sp.user.phone or '',
                'specialties': [spec.name_vi for spec in sp.specialties.all()],
                'total_assigned': s_total,
                'completed_count': s_completed,
                'cancelled_count': s_cancelled,
                'completion_rate': s_rate,
                'revenue': int(s_rev),
            })
        staff_perf.sort(key=lambda x: (x['revenue'], x['completed_count']), reverse=True)

        # 7. Khách hàng & Thú cưng insights
        unique_client_ids = set(period_bookings.values_list('client_id', flat=True))
        new_clients_count = Client.objects.filter(
            created_at__gte=start_dt,
            created_at__lte=end_dt,
        ).count()

        species_count = {'dog': 0, 'cat': 0}
        size_count = {'XS': 0, 'S': 0, 'M': 0, 'L': 0, 'XL': 0}
        for b in period_bookings:
            p = b.pet
            if p.species in species_count:
                species_count[p.species] += 1
            if p.size_class in size_count:
                size_count[p.size_class] += 1

        # 8. Hiệu quả AI Rebook (Nhắc tái spa)
        reminders = RebookReminder.objects.filter(
            created_at__gte=start_dt,
            created_at__lte=end_dt,
        )
        reminders_suggested = reminders.count()
        reminders_sent = reminders.filter(status__in=[RebookReminder.Status.SENT, RebookReminder.Status.BOOKED]).count()
        reminders_booked = reminders.filter(status=RebookReminder.Status.BOOKED).count()
        conversion_rate = round((reminders_booked / reminders_sent * 100), 1) if reminders_sent > 0 else 0.0

        return Response({
            'period': {
                'start_date': start_d.strftime('%Y-%m-%d'),
                'end_date': end_d.strftime('%Y-%m-%d'),
                'days_count': days_count,
            },
            'financial': {
                'total_revenue': int(total_revenue),
                'paid_invoices_count': paid_count,
                'average_order_value': aov,
                'unpaid_count': unpaid_count,
                'unpaid_total': int(unpaid_total),
                'payment_methods': {
                    'cash': {'count': cash_invoices.count(), 'total': int(cash_total)},
                    'transfer': {'count': transfer_invoices.count(), 'total': int(transfer_total)},
                },
            },
            'bookings': {
                'total': total_bookings,
                'completed': completed_bookings,
                'cancelled': cancelled_bookings,
                'in_progress': in_progress_bookings,
                'pending': pending_bookings,
                'completion_rate': completion_rate,
                'cancellation_rate': cancellation_rate,
                'channels': [
                    {'channel': 'online', 'label': 'Đặt qua Web', 'count': channels_map.get('online', 0)},
                    {'channel': 'counter', 'label': 'Đặt tại quầy', 'count': channels_map.get('counter', 0)},
                    {'channel': 'walk_in', 'label': 'Khách vãng lai', 'count': channels_map.get('walk_in', 0)},
                ],
                'cancel_reasons': [{'reason': k, 'count': v} for k, v in cancel_reasons_map.items()],
            },
            'daily_trend': daily_trend,
            'top_services': top_services,
            'top_packages': top_packages,
            'staff_performance': staff_perf,
            'insights': {
                'active_clients': len(unique_client_ids),
                'new_clients': new_clients_count,
                'pets_by_species': [
                    {'species': 'dog', 'label': 'Chó', 'count': species_count['dog']},
                    {'species': 'cat', 'label': 'Mèo', 'count': species_count['cat']},
                ],
                'pets_by_size': [{'size': k, 'count': v} for k, v in size_count.items()],
            },
            'ai_rebook': {
                'total_suggested': reminders_suggested,
                'total_sent': reminders_sent,
                'total_booked': reminders_booked,
                'conversion_rate': conversion_rate,
            },
        })
