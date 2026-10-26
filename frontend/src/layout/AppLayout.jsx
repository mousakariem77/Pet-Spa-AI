import { useEffect, useState } from 'react'
import {
  App, Avatar, Badge, Button, Dropdown, Layout, List, Menu, Popover,
  Space, Tag, Typography,
} from 'antd'
import {
  BankOutlined, BarChartOutlined, BellOutlined, CalendarOutlined, CheckOutlined, DashboardOutlined,
  DollarOutlined, ExclamationCircleOutlined, GlobalOutlined, HistoryOutlined, IdcardOutlined,
  LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, RobotOutlined, ShopOutlined, TeamOutlined,
  ToolOutlined, UserOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { api, unwrap } from '../api.js'
import { useAuth, ROLE_LABEL } from '../auth.jsx'
import { APP_ROUTES, labelFor } from '../routes.jsx'
import AiChatDrawer from '../components/AiChatDrawer.jsx'
import Logo from '../components/Logo.jsx'
import { getNotifMeta } from '../pages/Notifications.jsx'

const { Header, Sider, Content } = Layout
const { Text } = Typography

const ROUTE_ICONS = {
  '/app/tong-quan': <DashboardOutlined />,
  '/app/thong-ke': <BarChartOutlined />,
  '/app/lich-hen': <CalendarOutlined />,
  '/app/hoa-don': <DollarOutlined />,
  '/app/nhac-tai-spa': <HistoryOutlined />,
  '/app/thu-cung': <IdcardOutlined />,
  '/app/khach-hang': <TeamOutlined />,
  '/app/dich-vu': <ShopOutlined />,
  '/app/nhan-su': <ToolOutlined />,
  '/app/quan-tri-ai': <RobotOutlined />,
  '/app/ho-so-spa': <BankOutlined />,
  '/app/tai-khoan': <UserOutlined />,
}

// Cấu trúc phân nhóm logic các trang điều hướng trong sidebar
const NAV_GROUPS = [
  {
    key: 'operations',
    label: 'Vận hành & Đặt lịch',
    paths: ['/app/tong-quan', '/app/thong-ke', '/app/lich-hen', '/app/hoa-don'],
  },
  {
    key: 'crm',
    label: 'Khách hàng & Bé cưng',
    paths: ['/app/khach-hang', '/app/thu-cung', '/app/nhac-tai-spa'],
  },
  {
    key: 'catalog_staff',
    label: 'Dịch vụ & Cơ sở',
    paths: ['/app/dich-vu', '/app/nhan-su'],
  },
  {
    key: 'system',
    label: 'Hệ thống & AI',
    paths: ['/app/quan-tri-ai', '/app/ho-so-spa', '/app/tai-khoan'],
  },
]

export default function AppLayout() {
  const { modal, message } = App.useApp()
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const { pathname } = useLocation()

  // Đồng bộ tiêu đề tab trình duyệt tương ứng theo từng trang chức năng
  useEffect(() => {
    const currentRoute = APP_ROUTES.find((r) => r.path === pathname)
    if (currentRoute) {
      const pageTitle = labelFor(currentRoute, user)
      document.title = `${pageTitle} | Pet Spa AI`
    } else {
      document.title = 'Pet Spa AI - Hệ Thống Chăm Sóc & Đặt Lịch Spa Thú Cưng Thông Minh'
    }
  }, [pathname, user])

  const handleLogout = () => {
    modal.confirm({
      title: 'Xác nhận đăng xuất',
      icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
      content: 'Bạn có chắc chắn muốn đăng xuất khỏi hệ thống không?',
      okText: 'Đăng xuất',
      okType: 'danger',
      cancelText: 'Hủy',
      centered: true,
      onOk: async () => {
        try {
          await logout()
          message.success('Đã đăng xuất thành công.')
          nav('/')
        } catch {
          nav('/')
        }
      },
    })
  }

  // Trạng thái thu gọn sidebar (lưu vào localStorage)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })

  const handleToggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('sidebar_collapsed', String(next))
      } catch {}
      return next
    })
  }

  // Thông báo
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState([])
  const [notifOpen, setNotifOpen] = useState(false)

  const loadNotifications = async () => {
    if (!user) return
    try {
      const [cnt, listRes] = await Promise.all([
        api('/notifications/unread-count').catch(() => ({ count: 0 })),
        api('/notifications', { params: { page_size: 8 } }).catch(() => ({ results: [] })),
      ])
      setUnreadCount(cnt?.count ?? 0)
      setNotifications(unwrap(listRes))
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadNotifications()
    const timer = setInterval(loadNotifications, 30000)
    return () => clearInterval(timer)
  }, [user])

  const markAllRead = async () => {
    try {
      await api('/notifications/read-all', { method: 'POST' })
      setUnreadCount(0)
      // Giữ nguyên thông báo trong hòm thư, chỉ cập nhật trạng thái đã đọc
      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })))
      message.success('Đã đánh dấu đã đọc tất cả')
    } catch {
      // ignore
    }
  }

  const handleNotificationClick = async (n) => {
    setNotifOpen(false)
    if (!n.is_read) {
      api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {})
      setNotifications((prev) => prev.map((item) => item.id === n.id ? { ...item, is_read: true } : item))
      setUnreadCount((c) => Math.max(0, c - 1))
    }

    if (n.link) {
      nav(n.link)
    } else if (n.ref_type === 'booking') {
      nav(n.ref_id ? `/app/lich-hen?id=${n.ref_id}` : '/app/lich-hen')
    } else if (n.ref_type === 'invoice') {
      nav(n.ref_id ? `/app/hoa-don?id=${n.ref_id}` : '/app/hoa-don')
    } else if (n.ref_type === 'reminder') {
      nav('/app/nhac-tai-spa')
    } else if (n.ref_type === 'client' || n.ref_type === 'customer') {
      nav('/app/khach-hang')
    } else if (n.ref_type === 'pet') {
      nav('/app/thu-cung')
    } else if (n.ref_type === 'staff') {
      nav('/app/nhan-su')
    } else if (n.ref_type === 'analytics') {
      nav('/app/thong-ke')
    }
  }

  // Lọc routes theo vai trò và tổ chức thành nhóm
  const visibleRoutes = APP_ROUTES.filter(
    (r) => (r.roles ? user && r.roles.includes(user.role) : true) && !(r.hideInMenuFor && user && r.hideInMenuFor.includes(user.role)),
  )
  const routeMap = new Map(visibleRoutes.map((r) => [r.path, r]))

  const menuItems = collapsed
    ? visibleRoutes.map((r) => ({
        key: r.path,
        icon: ROUTE_ICONS[r.path],
        label: labelFor(r, user),
        title: labelFor(r, user),
      }))
    : NAV_GROUPS.map((group) => {
        const children = group.paths
          .filter((p) => routeMap.has(p))
          .map((p) => {
            const r = routeMap.get(p)
            return {
              key: r.path,
              icon: ROUTE_ICONS[r.path],
              label: labelFor(r, user),
            }
          })
        if (children.length === 0) return null
        return {
          type: 'group',
          key: group.key,
          label: group.label,
          children,
        }
      }).filter(Boolean)

  const notifPopoverContent = (
    <div style={{ width: 370, maxWidth: '92vw' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
        <Space size={8}>
          <Text strong style={{ fontSize: 15, color: '#0b3d3f' }}>Hộp thư thông báo</Text>
          {unreadCount > 0 ? (
            <Badge count={unreadCount} style={{ backgroundColor: '#0f8b8d' }} />
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>({notifications.length})</Text>
          )}
        </Space>
        {unreadCount > 0 && (
          <Button type="link" size="small" icon={<CheckOutlined />} onClick={markAllRead} style={{ color: '#0f8b8d', padding: 0 }}>
            Đọc tất cả
          </Button>
        )}
      </div>

      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        <List
          size="small"
          dataSource={notifications}
          locale={{ emptyText: 'Chưa có thông báo nào trong hộp thư' }}
          renderItem={(n) => {
            const meta = getNotifMeta(n.kind, n.ref_type)
            return (
              <List.Item
                key={n.id}
                style={{
                  cursor: 'pointer',
                  padding: '10px 10px',
                  borderRadius: 8,
                  background: n.is_read ? '#ffffff' : '#f0fdfa',
                  border: n.is_read ? '1px solid #f1f5f9' : '1px solid #ccfbf1',
                  borderLeft: n.is_read ? '3px solid #cbd5e1' : '3px solid #0f8b8d',
                  marginBottom: 6,
                  transition: 'background 0.2s',
                }}
                onClick={() => handleNotificationClick(n)}
              >
                <List.Item.Meta
                  avatar={
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: meta.bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                        flexShrink: 0,
                      }}
                    >
                      {meta.icon}
                    </div>
                  }
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <Text strong={!n.is_read} style={{ fontSize: 13, color: n.is_read ? '#475569' : '#0b3d3f' }}>
                        {n.title}
                      </Text>
                      {!n.is_read && (
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#0f8b8d', flexShrink: 0 }} />
                      )}
                    </div>
                  }
                  description={
                    <div>
                      <div style={{ fontSize: 12, color: n.is_read ? '#64748b' : '#334155', lineHeight: 1.4, margin: '2px 0 4px' }}>
                        {n.body}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Tag color={meta.color} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0, borderRadius: 3 }}>
                          {meta.label}
                        </Tag>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {dayjs(n.created_at).format('HH:mm DD/MM')}
                        </Text>
                      </div>
                    </div>
                  }
                />
              </List.Item>
            )
          }}
        />
      </div>

      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
        <Button
          type="link"
          block
          onClick={() => {
            setNotifOpen(false)
            nav('/app/thong-bao')
          }}
          style={{ color: '#0f8b8d', fontWeight: 600 }}
        >
          Xem toàn bộ hòm thư thông báo →
        </Button>
      </div>
    </div>
  )

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={240}
        collapsedWidth={76}
        style={{
          height: '100vh',
          background: '#0b3d3f',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '2px 0 10px rgba(0,0,0,0.12)',
          transition: 'all 0.25s cubic-bezier(0.2, 0, 0, 1)',
          zIndex: 20,
        }}
      >
        {/* Brand header */}
        <div
          className="brand"
          onClick={() => nav('/app/tong-quan')}
          style={{
            height: 64,
            flexShrink: 0,
            background: '#0b3d3f',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            padding: collapsed ? '14px 0' : '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          title="Pet Spa AI - Về trang Tổng quan"
        >
          <Logo size={36} showText={!collapsed} theme="dark" />
        </div>

        {/* Scrollable menu area (không hiển thị scrollbar, cuộn mượt mà) */}
        <div className="sidebar-menu-scroll">
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[pathname]}
            items={menuItems}
            onClick={(e) => nav(e.key)}
            inlineIndent={16}
            style={{ background: 'transparent', borderRight: 0, paddingBottom: 16 }}
          />
        </div>

        {/* Bottom collapse / expand bar (ghim cố định ở đáy, không bị ảnh hưởng khi scroll menu) */}
        <div
          className="sidebar-collapse-btn"
          style={{
            justifyContent: collapsed ? 'center' : 'space-between',
          }}
          onClick={handleToggleCollapse}
          title={collapsed ? 'Mở rộng thanh menu' : 'Thu gọn thanh menu'}
        >
          {!collapsed && (
            <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: 0.2 }}>
              Thu gọn menu
            </span>
          )}
          {collapsed ? (
            <MenuUnfoldOutlined style={{ fontSize: 16, color: '#5eead4' }} />
          ) : (
            <MenuFoldOutlined style={{ fontSize: 16, color: '#5eead4' }} />
          )}
        </div>
      </Sider>

      <Layout style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header
          style={{
            background: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 24px',
            borderBottom: '1px solid #e2e8f0',
            flexShrink: 0,
            zIndex: 9,
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Button
              type="text"
              icon={<GlobalOutlined style={{ color: '#0f8b8d', fontSize: 16 }} />}
              onClick={() => nav('/')}
              style={{ fontWeight: 600, color: '#0b3d3f' }}
            >
              Trang Giới Thiệu (Landing Page)
            </Button>
          </div>

          <Space size="large">
            {/* Chuông thông báo */}
            {user && (
              <Popover
                content={notifPopoverContent}
                trigger="click"
                placement="bottomRight"
                open={notifOpen}
                onOpenChange={(open) => {
                  setNotifOpen(open)
                  if (open) loadNotifications()
                }}
              >
                <Badge count={unreadCount} overflowCount={99} offset={[-2, 4]}>
                  <Button type="text" shape="circle" icon={<BellOutlined style={{ fontSize: 18, color: '#4b5563' }} />} />
                </Badge>
              </Popover>
            )}

            {user ? (
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'acc',
                      label: 'Tài khoản',
                      icon: <UserOutlined />,
                      onClick: () => nav('/app/tai-khoan'),
                    },
                    {
                      key: 'out',
                      label: 'Đăng xuất',
                      icon: <LogoutOutlined />,
                      danger: true,
                      onClick: handleLogout,
                    },
                  ],
                }}
              >
                <Space style={{ cursor: 'pointer' }}>
                  <Avatar style={{ background: '#0f8b8d' }} icon={<UserOutlined />} />
                  <Typography.Text strong>{user.full_name || user.username}</Typography.Text>
                  <Tag color="cyan">{ROLE_LABEL[user.role]}</Tag>
                </Space>
              </Dropdown>
            ) : (
              <Button type="primary" onClick={() => nav('/dang-nhap')}>
                Đăng nhập
              </Button>
            )}
          </Space>
        </Header>
        <Content
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 24,
            background: '#f8fafc',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
      <AiChatDrawer />
    </Layout>
  )
}
