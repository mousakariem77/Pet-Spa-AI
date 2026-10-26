import Home from './pages/Home.jsx'
import Bookings from './pages/Bookings.jsx'
import Invoices from './pages/Invoices.jsx'
import StaffManagement from './pages/StaffManagement.jsx'
import Catalog from './pages/Catalog.jsx'
import Clients from './pages/Clients.jsx'
import Pets from './pages/Pets.jsx'
import SpaProfile from './pages/SpaProfile.jsx'
import Account from './pages/Account.jsx'
import RebookReminders from './pages/RebookReminders.jsx'
import AiAdmin from './pages/AiAdmin.jsx'
import Analytics from './pages/Analytics.jsx'
import Notifications from './pages/Notifications.jsx'

// Danh sách route trong khu vực ứng dụng nội bộ (/app)
export const APP_ROUTES = [
  { path: '/app/tong-quan', label: 'Tổng quan', element: <Home />, roles: null, public: true },
  { path: '/app/thong-ke', label: 'Thống kê hoạt động', element: <Analytics />, roles: ['receptionist', 'manager'] },
  { path: '/app/lich-hen', label: 'Lịch hẹn', element: <Bookings />, roles: null, public: true },
  { path: '/app/hoa-don', label: 'Hóa đơn & Thu ngân', element: <Invoices />, roles: ['customer', 'receptionist', 'manager'] },
  { path: '/app/nhac-tai-spa', label: 'Nhắc tái spa (AI)', element: <RebookReminders />, roles: ['customer', 'receptionist', 'manager'] },
  // Nhân viên quản lý thú cưng trong trang Khách hàng; route này chỉ còn hiện ở menu của khách (nhân viên được chuyển hướng)
  { path: '/app/thu-cung', label: 'Thú cưng', element: <Pets />, roles: ['customer', 'receptionist', 'manager'], hideInMenuFor: ['receptionist', 'manager'] },
  { path: '/app/khach-hang', label: 'Khách hàng', element: <Clients />, roles: ['receptionist', 'manager'] },
  { path: '/app/dich-vu', label: 'Dịch vụ & Giá', element: <Catalog />, roles: null, public: true },
  { path: '/app/nhan-su', label: 'Nhân sự & Cơ sở', element: <StaffManagement />, roles: ['receptionist', 'manager'] },
  { path: '/app/quan-tri-ai', label: 'Quản trị AI & SOP', element: <AiAdmin />, roles: ['manager'] },
  { path: '/app/ho-so-spa', label: 'Hồ sơ spa', element: <SpaProfile />, roles: ['manager'] },
  { path: '/app/tai-khoan', label: 'Tài khoản', element: <Account />, roles: null, public: true },
  { path: '/app/thong-bao', label: 'Thông báo', element: <Notifications />, roles: null, public: true, hideInMenuFor: ['customer', 'receptionist', 'manager', 'technician'] },
]

export const labelFor = (route, user) => {
  if (route.path === '/app/thu-cung' && user?.role === 'customer') return 'Thú cưng của tôi'
  if (route.path === '/app/lich-hen') {
    if (user?.role === 'customer') return 'Lịch hẹn của tôi'
    if (user?.role === 'technician') return 'Lịch được giao'
  }
  if (route.path === '/app/hoa-don' && user?.role === 'customer') return 'Hóa đơn của tôi'
  if (route.path === '/app/nhac-tai-spa' && user?.role === 'customer') return 'Nhắc tái spa'
  return route.label
}
