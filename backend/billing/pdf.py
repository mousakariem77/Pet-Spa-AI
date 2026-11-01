import os
import warnings
from pathlib import Path
from fpdf import FPDF

class InvoicePDF(FPDF):
    def footer(self):
        self.set_y(-16)
        self.set_font('Arial', '', 8)
        self.set_text_color(100, 116, 139)
        self.cell(
            0, 4,
            'PET SPA AI · 25 Lê Văn Thịnh, P. Bình Trưng Tây, TP. Thủ Đức, TP.HCM · Hotline: 0909 111 222 · Website: petspa.ai',
            align='C', new_x='LMARGIN', new_y='NEXT'
        )
        self.cell(0, 4, f'Trang {self.page_no()}', align='C')


def _find_font():
    candidates = [
        (r'C:\Windows\Fonts\arial.ttf', r'C:\Windows\Fonts\arialbd.ttf'),
        ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'),
        ('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'),
    ]
    for reg, bld in candidates:
        if os.path.exists(reg):
            return reg, bld if os.path.exists(bld) else reg
    return None, None


def _find_asset(filename):
    base_dir = Path(__file__).resolve().parent
    local_path = base_dir / 'assets' / filename
    if local_path.exists():
        return str(local_path)
    frontend_path = base_dir.parent.parent / 'frontend' / 'public' / filename
    if frontend_path.exists():
        return str(frontend_path)
    return None


def generate_invoice_pdf(data: dict) -> bytes:
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')

        pdf = InvoicePDF(format='A4')
        pdf.set_margins(15, 14, 15)
        pdf.set_auto_page_break(auto=True, margin=18)

        font_reg, font_bld = _find_font()
        if font_reg:
            pdf.add_font('Arial', '', font_reg)
            if font_bld:
                pdf.add_font('Arial', 'B', font_bld)
        font_family = 'Arial' if font_reg else 'helvetica'

        pdf.add_page()

        # Logo & Brand Header
        logo_path = _find_asset('petspa-logo.svg')
        header_y = 14
        if logo_path:
            try:
                pdf.image(logo_path, x=15, y=header_y, w=16)
            except Exception:
                pass

        pdf.set_xy(33, header_y)
        pdf.set_font(font_family, 'B', 16)
        pdf.set_text_color(15, 139, 141)  # #0f8b8d
        pdf.cell(85, 7, 'PET SPA AI')

        pdf.set_font(font_family, 'B', 13)
        pdf.set_text_color(11, 61, 63)
        pdf.cell(77, 7, 'HÓA ĐƠN DỊCH VỤ', align='R', new_x='LMARGIN', new_y='NEXT')

        pdf.set_xy(33, header_y + 7)
        pdf.set_font(font_family, '', 8.5)
        pdf.set_text_color(100, 116, 139)
        pdf.cell(85, 4, 'Hệ thống Spa & Chăm sóc Thú cưng Cao cấp')

        inv_no = data.get('invoice_no', '')
        pdf.set_font(font_family, 'B', 9.5)
        pdf.set_text_color(30, 41, 59)
        pdf.cell(77, 4, f'Số HĐ: {inv_no}', align='R', new_x='LMARGIN', new_y='NEXT')

        pdf.set_xy(33, header_y + 11.5)
        pdf.set_font(font_family, '', 8.5)
        pdf.set_text_color(100, 116, 139)
        pdf.cell(85, 4, '25 Lê Văn Thịnh, TP. Thủ Đức, TP.HCM · Hotline: 0909 111 222')

        created_str = data.get('created_at', '')
        if 'T' in str(created_str):
            created_str = str(created_str).replace('T', ' ')[:16]
        pdf.cell(77, 4, f'Ngày lập: {created_str}', align='R', new_x='LMARGIN', new_y='NEXT')

        pdf.set_xy(33, header_y + 16)
        pdf.set_font(font_family, '', 8.5)
        pdf.cell(85, 4, 'Website: petspa.ai · Email: cskh@petspa.ai')

        status = data.get('status', 'unpaid')
        if status == 'paid':
            status_text = 'ĐÃ THANH TOÁN'
            pdf.set_text_color(16, 185, 129)  # Green
        elif status == 'unpaid':
            status_text = 'CHƯA THU TIỀN'
            pdf.set_text_color(217, 119, 6)   # Amber
        else:
            status_text = 'HÓA ĐƠN ĐÃ HỦY'
            pdf.set_text_color(100, 116, 139) # Gray
        pdf.set_font(font_family, 'B', 9.5)
        pdf.cell(77, 4, f'[{status_text}]', align='R', new_x='LMARGIN', new_y='NEXT')

        pdf.set_y(header_y + 23)

        # Teal Accent Line
        pdf.set_draw_color(15, 139, 141)
        pdf.set_line_width(0.8)
        pdf.line(15, pdf.get_y(), 195, pdf.get_y())
        pdf.ln(4)

        # Customer and Pet Info Box
        y_box = pdf.get_y()
        pdf.set_fill_color(248, 250, 252)
        pdf.set_draw_color(226, 232, 240)
        pdf.set_line_width(0.3)
        pdf.rect(15, y_box, 180, 27, style='FD')

        # Left Column: Client
        pdf.set_xy(18, y_box + 2)
        pdf.set_font(font_family, 'B', 8.5)
        pdf.set_text_color(15, 139, 141)
        pdf.cell(85, 4.5, 'THÔNG TIN KHÁCH HÀNG:')

        # Right Column: Pet
        pdf.set_xy(105, y_box + 2)
        pdf.cell(85, 4.5, 'THÔNG TIN BÉ CƯNG:')

        # Client details
        pdf.set_xy(18, y_box + 7)
        pdf.set_font(font_family, 'B', 9)
        pdf.set_text_color(30, 41, 59)
        client_name = data.get('client_name') or 'Khách vãng lai'
        pdf.cell(85, 4.5, f'Họ tên: {client_name}')

        # Pet details
        pdf.set_xy(105, y_box + 7)
        species = data.get('pet_species', 'dog')
        species_label = 'Chó' if species == 'dog' else ('Mèo' if species == 'cat' else 'Thú cưng')
        pet_name = data.get('pet_name') or '—'
        pdf.cell(85, 4.5, f'Tên bé: {pet_name} ({species_label})')

        pdf.set_xy(18, y_box + 12)
        pdf.set_font(font_family, '', 8.5)
        pdf.set_text_color(71, 85, 105)
        pdf.cell(85, 4.5, f"Số điện thoại: {data.get('client_phone') or '—'}")

        pdf.set_xy(105, y_box + 12)
        breed = data.get('pet_breed') or '—'
        weight = data.get('pet_weight_kg')
        weight_str = f"{weight} kg" if weight else '—'
        size = data.get('pet_size_class') or '—'
        pdf.cell(85, 4.5, f'Giống: {breed} · Cân nặng: {weight_str} (Size {size})')

        pdf.set_xy(18, y_box + 17)
        pdf.cell(85, 4.5, f"Địa chỉ: {data.get('client_address') or '—'}")

        pdf.set_xy(105, y_box + 17)
        staff = data.get('staff_name') or 'Đội ngũ chuyên viên'
        pdf.cell(85, 4.5, f'KTV phụ trách: {staff}')

        # Line items Table
        pdf.set_xy(15, y_box + 31)

        pdf.set_fill_color(241, 245, 249)
        pdf.set_draw_color(203, 213, 225)
        pdf.set_text_color(51, 65, 85)
        pdf.set_font(font_family, 'B', 8.5)

        pdf.cell(12, 7.5, 'STT', border=1, align='C', fill=True)
        pdf.cell(100, 7.5, 'Nội dung dịch vụ / Gói spa', border=1, align='L', fill=True)
        pdf.cell(16, 7.5, 'SL', border=1, align='C', fill=True)
        pdf.cell(26, 7.5, 'Đơn giá', border=1, align='R', fill=True)
        pdf.cell(26, 7.5, 'Thành tiền', border=1, align='R', fill=True, new_x='LMARGIN', new_y='NEXT')

        lines = data.get('lines', [])
        pdf.set_font(font_family, '', 8.5)
        pdf.set_text_color(30, 41, 59)

        if not lines:
            pdf.cell(180, 8, 'Dịch vụ spa trọn gói', border=1, align='C', new_x='LMARGIN', new_y='NEXT')
        else:
            for idx, line in enumerate(lines, 1):
                desc = str(line.get('description', ''))
                qty = str(line.get('quantity', 1))
                try:
                    unit_p = f"{int(float(line.get('unit_price', 0))):,} đ".replace(',', '.')
                except (ValueError, TypeError):
                    unit_p = f"{line.get('unit_price', 0)} đ"
                try:
                    amt = f"{int(float(line.get('amount', 0))):,} đ".replace(',', '.')
                except (ValueError, TypeError):
                    amt = f"{line.get('amount', 0)} đ"

                pdf.cell(12, 7, str(idx), border=1, align='C')
                pdf.cell(100, 7, desc[:60], border=1, align='L')
                pdf.cell(16, 7, qty, border=1, align='C')
                pdf.cell(26, 7, unit_p, border=1, align='R')
                pdf.set_font(font_family, 'B', 8.5)
                pdf.set_text_color(15, 139, 141)
                pdf.cell(26, 7, amt, border=1, align='R', new_x='LMARGIN', new_y='NEXT')
                pdf.set_font(font_family, '', 8.5)
                pdf.set_text_color(30, 41, 59)

        pdf.ln(3)

        # Totals box
        try:
            total_val = int(float(data.get('total', 0)))
            total_str = f"{total_val:,} đ".replace(',', '.')
        except (ValueError, TypeError):
            total_str = f"{data.get('total', 0)} đ"

        pdf.set_font(font_family, 'B', 11)
        pdf.set_text_color(15, 139, 141)
        pdf.cell(154, 7, 'TỔNG CỘNG THANH TOÁN:', align='R')
        pdf.cell(26, 7, total_str, align='R', new_x='LMARGIN', new_y='NEXT')

        # Payment details
        pay_method = data.get('payment_method')
        method_str = 'Tiền mặt tại quầy' if pay_method == 'cash' else ('Chuyển khoản VietQR' if pay_method == 'transfer' else 'Chưa thanh toán')
        paid_at = data.get('paid_at')
        time_str = f" · Thời gian thu: {str(paid_at).replace('T', ' ')[:16]}" if paid_at else ''
        cashier = data.get('received_by_name')
        cashier_str = f" · Thu ngân: {cashier}" if cashier else ''

        pdf.set_font(font_family, '', 8.5)
        pdf.set_text_color(100, 116, 139)
        pdf.cell(180, 5, f'Hình thức: {method_str}{time_str}{cashier_str}', align='R', new_x='LMARGIN', new_y='NEXT')

        # Bank transfer block if transfer or unpaid
        if pay_method == 'transfer' or status == 'unpaid':
            pdf.ln(3)
            y_bank = pdf.get_y()
            pdf.set_fill_color(240, 253, 250)
            pdf.set_draw_color(153, 246, 228)
            pdf.rect(15, y_bank, 180, 16, style='FD')

            pdf.set_xy(18, y_bank + 2.5)
            pdf.set_font(font_family, 'B', 8.5)
            pdf.set_text_color(15, 118, 110)
            pdf.cell(100, 4, 'THÔNG TIN CHUYỂN KHOẢN SPA:')

            pdf.set_xy(18, y_bank + 6.5)
            pdf.set_font(font_family, '', 8)
            pdf.set_text_color(15, 118, 110)
            pdf.cell(100, 4, f'Ngân hàng: Vietcombank (VCB) · Số TK: 1028999888 · Chủ TK: PET SPA LONG MUOT')

            pdf.set_xy(18, y_bank + 10.5)
            pdf.cell(100, 4, f'Nội dung chuyển khoản (cú pháp): {inv_no}')

            pdf.set_xy(120, y_bank + 6.5)
            pdf.cell(70, 4, 'Quét mã VietQR tại quầy để thanh toán tự động', align='R')

            pdf.set_y(y_bank + 19)
        else:
            pdf.ln(5)

        # Thank you note
        pdf.set_font(font_family, 'B', 8.5)
        pdf.set_text_color(51, 65, 85)
        pdf.cell(180, 5, 'CẢM ƠN QUÝ KHÁCH ĐÃ TIN TƯỞNG GỬI GẮM BÉ CƯNG TẠI PET SPA AI!', align='C', new_x='LMARGIN', new_y='NEXT')
        pdf.set_font(font_family, '', 8)
        pdf.set_text_color(100, 116, 139)
        pdf.cell(180, 4, 'Mọi thắc mắc hoặc cần hỗ trợ chăm sóc bé, vui lòng liên hệ hotline 0909 111 222 để được phục vụ chu đáo.', align='C')

        return bytes(pdf.output())

