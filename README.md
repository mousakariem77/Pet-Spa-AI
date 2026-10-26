# Pet Spa AI

Hệ thống quản lý một spa thú y tại chỗ, có AI hỗ trợ tư vấn và nhắc việc. Đồ án môn Phân tích thiết kế hệ thống thông tin nâng cao (TS. Cao Thị Nhạn, Khoa Hệ thống thông tin, Trường ĐH Công nghệ Thông tin, ĐHQG TP.HCM).

Trạng thái hiện tại: **Pha 1 (Vận hành cốt lõi) đã hoàn tất 100% cả Backend và Frontend**.
- **Backend**: Django REST framework, 53 unit tests pass, máy trạng thái lịch hẹn, báo giá tự động theo size thú, chống trùng slot/tài nguyên, tự động sinh hóa đơn, dashboard ngày, trung tâm thông báo.
- **Frontend**: React + Vite + Ant Design, Landing Page ngoài cùng ấn tượng, khu vực quản trị `/app` đầy đủ các màn hình (Dashboard, Lịch hẹn & Đặt lịch, Hóa đơn & Thu ngân, Khách hàng, Thú cưng, Bảng giá, Nhân sự & Cơ sở vật chất, Thông báo).
- **Giai đoạn tiếp theo**: Pha 2 (Tích hợp AI Assistant, Gợi ý gói, Cảnh báo dị ứng hóa chất, Nhắc tái spa thông minh).

## Cây thư mục

```
Pet Spa AI/
  document/          # tài liệu đọc, không phải mã nguồn
    thiet-ke/        # bộ thiết kế (xem bên dưới)
  backend/           # Django + DRF
  frontend/          # React + Vite + Ant Design
  README.md
```

Chỉ có hai nhánh mã nguồn là `backend/` và `frontend/`.

## Hướng dẫn cài đặt và chạy thử

### 1. Dành cho Windows (PowerShell)

```powershell
# Backend
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python manage.py migrate
$env:PYTHONUTF8='1'; .venv\Scripts\python manage.py seed_demo
.venv\Scripts\python manage.py runserver 127.0.0.1:8000

# Frontend (mở thêm cửa sổ PowerShell khác)
cd frontend
npm install
npm run dev

# Chạy test backend
cd backend; .venv\Scripts\python manage.py test
```

### 2. Dành cho macOS / Linux (Terminal - zsh/bash)

```bash
# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 127.0.0.1:8000

# Frontend (mở thêm tab hoặc cửa sổ Terminal khác)
cd frontend
npm install
npm run dev

# Chạy test backend (đã kích hoạt venv)
cd backend && python manage.py test
# hoặc chạy trực tiếp mà không cần activate:
# cd backend && .venv/bin/python manage.py test
```

> **Lưu ý trên macOS/Linux:**
> - Sử dụng `python3` và `pip3` nếu hệ thống chưa gán alias `python`.
> - Kích hoạt môi trường ảo bằng lệnh `source .venv/bin/activate` (khi muốn thoát gõ `deactivate`). Sau khi kích hoạt, lệnh `python` và `pip` sẽ tự động trỏ đến `.venv`.
> - Mặc định trên macOS / Linux môi trường đã dùng chuẩn UTF-8 nên không cần thiết lập `$env:PYTHONUTF8`. Trường hợp hiếm gặp nếu xuất hiện lỗi font khi chạy `seed_demo`, có thể dùng: `PYTHONUTF8=1 python manage.py seed_demo`.

### Tài khoản demo

Tài khoản demo (mật khẩu chung: `Demo@12345`):
- Quản lý: `quanly`
- Lễ tân: `letan`
- Kỹ thuật viên: `ktv1`, `ktv2`, `ktv3`
- Khách hàng: `khach1`

> *Ghi chú:* Chạy lại `seed_demo` bất cứ lúc nào để làm mới lại dữ liệu lịch hẹn và hóa đơn mẫu.

- **Frontend URL:** http://localhost:5173
- **Backend API:** http://127.0.0.1:8000/api/

## Cách đọc thiết kế

Đọc trong `document/thiet-ke/` theo thứ tự:

| File | Nội dung | Dùng cho |
|------|----------|----------|
| `00_da_nam.md` | Tóm tắt đã đọc tài liệu; chênh lệch và thiếu sót trong tài liệu đầu vào | Đọc đầu tiên |
| `01_to_chuc_bai_toan.md` | Spa giả định, quy trình cũ, hệ thống mới | Mở đầu báo cáo |
| `02_actor_phan_quyen.md` | Actor và ma trận phân quyền | Báo cáo, use case |
| `03_yeu_cau.md` | Yêu cầu chức năng và phi chức năng | Báo cáo |
| `04_use_case.md` | Use case Pha 1–2, include/extend với AI | Vẽ sơ đồ use case |
| `05_quy_trinh.md` | Máy trạng thái lịch, ba luồng nổi bật | Vẽ activity, sequence |
| `06_du_lieu.md` | Thực thể, khóa, quan hệ, ràng buộc | Vẽ ERD, lớp |
| `07_kien_truc.md` | Sơ đồ thành phần, quyết định kiến trúc | Báo cáo, cài đặt |
| `08_api.md` | Endpoint theo tài nguyên và actor | Backend, frontend |
| `09_man_hinh.md` | Màn hình và component Ant Design | Frontend, giao diện |
| `10_thu_tu_chia_viec.md` | Lộ trình 12 tuần, chia 4 người | Quản lý dự án, WBS |
| `11_ngoai_pham_vi.md` | Cố ý không làm | Phạm vi, bảo vệ |

Mã chức năng `SPA-xx` lấy từ `document/ChucNang_HeThong_SpaThuY_AI.xlsx`. Mỗi file thiết kế đều truy vết về mã này.

Thứ tự làm việc gợi ý: đọc 00 → 01 → 04 → 06 → 05 → 07 → 08 → 09 → 10.
