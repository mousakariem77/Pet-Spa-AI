import { useEffect, useState, useMemo } from 'react'
import {
  Alert, Avatar, Badge, Button, Card, Col, DatePicker, Descriptions,
  Divider, Drawer, Empty, Image, Input, List, Modal, Progress,
  Row, Segmented, Skeleton, Space, Statistic, Steps, Table, Tabs, Tag,
  Tooltip, Typography, message,
} from 'antd'
import {
  CalendarFilled, CalendarOutlined, CheckCircleFilled, CheckCircleOutlined,
  ClockCircleFilled, ClockCircleOutlined, CloseCircleFilled, CopyOutlined,
  DesktopOutlined, DollarCircleFilled, DollarOutlined, ExclamationCircleFilled, EyeOutlined,
  FilterOutlined, FireOutlined, HeartFilled, IdcardOutlined, InfoCircleOutlined,
  LeftOutlined, MedicineBoxOutlined, PhoneOutlined, PlayCircleOutlined,
  PlusOutlined, ReloadOutlined, RightOutlined, RobotOutlined,
  SafetyCertificateOutlined, SearchOutlined, ShopOutlined, SmileFilled,
  SyncOutlined, TeamOutlined, ThunderboltFilled, UserOutlined, WarningFilled,
  BarChartOutlined, PieChartOutlined, RiseOutlined, FieldTimeOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { api, money, unwrap } from '../api.js'
import { useAuth } from '../auth.jsx'
import PetAvatar from '../components/PetAvatar.jsx'
import RowPerPageSelect from '../components/RowPerPageSelect.jsx'

const { Title, Text, Paragraph } = Typography

const DAYS = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật']

const STATUS_CONFIG = {
  pending: { label: 'Chờ duyệt', color: 'gold', badge: 'warning' },
  confirmed: { label: 'Đã xác nhận', color: 'blue', badge: 'processing' },
  checked_in: { label: 'Đã đến quầy', color: 'cyan', badge: 'processing' },
  in_progress: { label: 'Đang chăm sóc', color: 'orange', badge: 'processing' },
  completed: { label: 'Đã hoàn tất', color: 'green', badge: 'success' },
  cancelled: { label: 'Đã hủy', color: 'default', badge: 'default' },
  no_show: { label: 'Vắng mặt', color: 'magenta', badge: 'error' },
}

export default function Home() {
  const { user } = useAuth()
  const nav = useNavigate()
  const isCustomer = user?.role === 'customer'
  const isTech = user?.role === 'technician'
  const isManager = user?.role === 'manager'
  const isFrontDesk = ['receptionist', 'manager'].includes(user?.role)

  const [selectedDate, setSelectedDate] = useState(dayjs())
  const [spa, setSpa] = useState(null)
  const [packages, setPackages] = useState([])
  const [dashboardData, setDashboardData] = useState(null)
  const [myTechBookings, setMyTechBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Dữ liệu mở rộng cho Khách hàng
  const [myPets, setMyPets] = useState([])
  const [myBookings, setMyBookings] = useState([])
  const [myInvoices, setMyInvoices] = useState([])
  const [myReminders, setMyReminders] = useState([])

  // Bộ lọc feed và phân trang cho Lễ tân
  const [feedTab, setFeedTab] = useState('all')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [detailBooking, setDetailBooking] = useState(null)
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)

  // Bộ lọc biểu đồ giờ
  const [hourlyMetric, setHourlyMetric] = useState('all') // 'all' | 'in_progress' | 'completed'
  const [hoveredHour, setHoveredHour] = useState(null)

  const loadData = async (targetDate = selectedDate) => {
    setLoading(true)
    try {
      const dateStr = targetDate.format('YYYY-MM-DD')
      const [s, p] = await Promise.all([
        api('/spa').catch(() => null),
        api('/packages').catch(() => []),
      ])
      setSpa(s)
      setPackages(unwrap(p))

      if (isFrontDesk) {
        const d = await api('/dashboard/today', { params: { date: dateStr } }).catch(() => null)
        setDashboardData(d)
      } else if (isTech) {
        const b = await api('/bookings', { params: { date: dateStr } }).catch(() => [])
        setMyTechBookings(unwrap(b))
      } else if (isCustomer) {
        const [petsRes, bookingsRes, invoicesRes, remindersRes] = await Promise.all([
          api('/pets').catch(() => []),
          api('/bookings').catch(() => []),
          api('/invoices').catch(() => []),
          api('/rebook-reminders').catch(() => []),
        ])
        setMyPets(unwrap(petsRes))
        setMyBookings(unwrap(bookingsRes))
        setMyInvoices(unwrap(invoicesRes))
        setMyReminders(unwrap(remindersRes))
      }
    } catch (e) {
      message.error(e.message || 'Lỗi khi tải dữ liệu tổng quan')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(selectedDate)
  }, [user, selectedDate])

  // Thao tác nhanh đổi trạng thái lịch hẹn ngay từ Dashboard (Lễ tân / Quản lý)
  const handleQuickAction = async (bookingId, actionName, payload = {}) => {
    setActionLoading(true)
    try {
      await api(`/bookings/${bookingId}/${actionName}`, { method: 'POST', body: payload })
      message.success('Cập nhật trạng thái thành công!')
      if (detailBooking && detailBooking.id === bookingId) {
        setDetailDrawerOpen(false)
        setDetailBooking(null)
      }
      loadData(selectedDate)
    } catch (e) {
      message.error(e.message || 'Không thể thực hiện thao tác.')
    } finally {
      setActionLoading(false)
    }
  }

  // Khách hàng hủy lịch hẹn trực tiếp từ Dashboard
  const handleCustomerCancelBooking = (booking) => {
    Modal.confirm({
      title: 'Xác nhận hủy lịch hẹn',
      icon: <ExclamationCircleFilled style={{ color: '#ff4d4f' }} />,
      content: `Bạn có chắc chắn muốn hủy lịch hẹn chăm sóc cho bé ${booking.pet_info?.name || ''} vào lúc ${dayjs(booking.start_at).format('HH:mm DD/MM/YYYY')} không?`,
      okText: 'Xác nhận hủy',
      okType: 'danger',
      cancelText: 'Giữ lại lịch',
      centered: true,
      onOk: async () => {
        try {
          await api(`/bookings/${booking.id}/cancel`, {
            method: 'POST',
            body: { reason: 'Khách hàng chủ động hủy qua trang tổng quan', code: 'customer_cancelled' },
          })
          message.success('Đã hủy lịch hẹn thành công.')
          loadData()
        } catch (e) {
          message.error(e.message || 'Không thể hủy lịch (có thể đã quá thời hạn cho phép hủy).')
        }
      },
    })
  }

  // Danh sách feed sau khi lọc theo tab và từ khóa tìm kiếm (Lễ tân)
  const filteredFeed = useMemo(() => {
    if (!dashboardData?.feed) return []
    let list = dashboardData.feed

    // Lọc theo tab trạng thái
    if (feedTab === 'pending_confirmed') {
      list = list.filter((b) => ['pending', 'confirmed'].includes(b.status))
    } else if (feedTab === 'in_service') {
      list = list.filter((b) => ['checked_in', 'in_progress'].includes(b.status))
    } else if (feedTab === 'completed') {
      list = list.filter((b) => b.status === 'completed')
    } else if (feedTab === 'cancelled') {
      list = list.filter((b) => ['cancelled', 'no_show'].includes(b.status))
    }

    // Lọc theo từ khóa tìm kiếm
    if (searchKeyword.trim()) {
      const q = searchKeyword.toLowerCase()
      list = list.filter(
        (b) =>
          b.pet_info?.name?.toLowerCase().includes(q) ||
          b.client_info?.full_name?.toLowerCase().includes(q) ||
          b.client_info?.phone?.includes(q) ||
          b.staff_name?.toLowerCase().includes(q) ||
          b.package_name?.toLowerCase().includes(q)
      )
    }
    return list
  }, [dashboardData, feedTab, searchKeyword])

  // Tính toán tóm tắt cho Khách hàng
  const customerStats = useMemo(() => {
    if (!isCustomer) return null
    const activeAtSpa = myBookings.find((b) => ['checked_in', 'in_progress'].includes(b.status))
    const upcoming = myBookings
      .filter((b) => ['pending', 'confirmed'].includes(b.status))
      .sort((a, b) => dayjs(a.start_at).diff(dayjs(b.start_at)))
    const completed = myBookings.filter((b) => b.status === 'completed')
    const totalSpent = myInvoices
      .filter((i) => i.status === 'paid')
      .reduce((sum, i) => sum + Number(i.total || 0), 0)
    const unpaidInv = myInvoices.filter((i) => i.status === 'unpaid')

    return {
      activeAtSpa,
      upcoming,
      completed,
      totalSpent,
      unpaidInv,
    }
  }, [isCustomer, myPets, myBookings, myInvoices])

  // Tính toán dữ liệu biểu đồ phân bổ giờ
  const hourlyData = useMemo(() => {
    if (!dashboardData) return []
    if (dashboardData.hourly_distribution && dashboardData.hourly_distribution.length > 0) {
      return dashboardData.hourly_distribution
    }
    // Fallback tính từ feed nếu backend chưa gửi
    const hours = {}
    for (let h = 8; h <= 18; h++) {
      const hStr = `${String(h).padStart(2, '0')}:00`
      hours[hStr] = { hour: hStr, count: 0, completed: 0, in_progress: 0, confirmed: 0, pending: 0 }
    }
    (dashboardData.feed || []).forEach((b) => {
      const h = dayjs(b.start_at).hour()
      const hStr = `${String(h).padStart(2, '0')}:00`
      if (hours[hStr]) {
        hours[hStr].count += 1
        if (b.status === 'completed') hours[hStr].completed += 1
        else if (['in_progress', 'checked_in'].includes(b.status)) hours[hStr].in_progress += 1
        else if (b.status === 'confirmed') hours[hStr].confirmed += 1
        else if (b.status === 'pending') hours[hStr].pending += 1
      }
    })
    return Object.values(hours)
  }, [dashboardData])

  // Tìm khung giờ cao điểm
  const peakHour = useMemo(() => {
    if (!hourlyData.length) return null
    let max = hourlyData[0]
    for (const h of hourlyData) {
      if (h.count > max.count) max = h
    }
    return max.count > 0 ? max : null
  }, [hourlyData])

  // Thống kê cơ cấu trạng thái
  const statusBreakdown = useMemo(() => {
    if (!dashboardData?.counts) return []
    const total = dashboardData.total_bookings || 1
    const items = [
      { key: 'completed', label: 'Đã hoàn tất', count: dashboardData.counts.completed || 0, color: '#10b981' },
      { key: 'in_progress', label: 'Đang chăm sóc', count: dashboardData.counts.in_progress || 0, color: '#f97316' },
      { key: 'checked_in', label: 'Đã đến quầy', count: dashboardData.counts.checked_in || 0, color: '#06b6d4' },
      { key: 'confirmed', label: 'Đã xác nhận', count: dashboardData.counts.confirmed || 0, color: '#0f8b8d' },
      { key: 'pending', label: 'Chờ duyệt', count: dashboardData.counts.pending || 0, color: '#f59e0b' },
      { key: 'cancelled', label: 'Đã hủy/Vắng', count: (dashboardData.counts.cancelled || 0) + (dashboardData.counts.no_show || 0), color: '#94a3b8' },
    ]
    return items.map((it) => ({
      ...it,
      percent: Math.round((it.count / total) * 100),
    }))
  }, [dashboardData])

  if (loading && !dashboardData && !spa && myPets.length === 0) {
    return (
      <div style={{ padding: '8px 0' }}>
        <Skeleton active paragraph={{ rows: 12 }} />
      </div>
    )
  }

  if (!spa) {
    return <Empty description="Spa chưa khai báo hồ sơ cơ sở." />
  }

  const openDays = (spa.open_weekdays || []).map((d) => DAYS[d]).join(', ')
  const isToday = selectedDate.isSame(dayjs(), 'day')

  // Cột bảng Feed Lịch hẹn trong ngày cho Lễ tân
  const feedColumns = [
    {
      title: 'Khung giờ',
      dataIndex: 'start_at',
      key: 'time',
      width: 130,
      render: (val, record) => (
        <div>
          <Text strong style={{ fontSize: 14 }}>
            {dayjs(val).format('HH:mm')}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {' '}– {record.end_at ? dayjs(record.end_at).format('HH:mm') : ''}
          </Text>
          {record.channel === 'online' ? (
            <div><Tag color="purple" style={{ fontSize: 11, marginTop: 4 }}>Online</Tag></div>
          ) : (
            <div><Tag color="cyan" style={{ fontSize: 11, marginTop: 4 }}>Tại quầy</Tag></div>
          )}
        </div>
      ),
    },
    {
      title: 'Bé cưng & An toàn',
      dataIndex: 'pet_info',
      key: 'pet',
      render: (pet) => {
        const hasBite = pet?.behavior_flags?.some((f) => f.toLowerCase().includes('cắn') || f.toLowerCase().includes('hung'))
        const hasAllergy = Boolean(pet?.allergy_note && pet.allergy_note !== 'Không')
        return (
          <Space align="center" size={10}>
            <PetAvatar species={pet?.species} size={38} style={{ border: '2px solid #e2e8f0' }} />
            <Space direction="vertical" size={2}>
              <Space>
                <Text strong style={{ fontSize: 14, color: '#0f8b8d' }}>
                  🐾 {pet?.name || 'Bé cưng'}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  ({pet?.breed || (pet?.species === 'cat' ? 'Mèo' : 'Chó')}{pet?.weight ? ` · ${pet.weight}kg` : ''})
                </Text>
              </Space>

              <Space wrap size={4}>
                {hasBite && <Tag color="error">⚠️ Hay cắn / Hung dữ</Tag>}
                {hasAllergy && <Tag color="warning">🌸 {pet.allergy_note}</Tag>}
                {pet?.health_tags?.filter((t) => !t.includes('cắn')).map((t, idx) => (
                  <Tag key={idx} color="default" style={{ fontSize: 11 }}>{t}</Tag>
                ))}
              </Space>
            </Space>
          </Space>
        )
      },
    },
    {
      title: 'Khách hàng',
      dataIndex: 'client_info',
      key: 'client',
      width: 170,
      render: (client) => (
        <div>
          <Text strong>{client?.full_name || 'Khách vãng lai'}</Text>
          {client?.phone && (
            <div>
              <Text type="secondary" copyable={{ text: client.phone }}>
                <PhoneOutlined style={{ marginRight: 4, color: '#0f8b8d' }} />
                {client.phone}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Dịch vụ & Gói',
      key: 'service',
      render: (_, record) => (
        <div>
          {record.package_name ? (
            <Tag color="geekblue" style={{ fontWeight: 600 }}>Gói {record.package_name}</Tag>
          ) : (
            <Tag color="blue">Dịch vụ lẻ</Tag>
          )}
          <div style={{ fontSize: 12, marginTop: 4, color: '#555' }}>
            {record.items?.map((it) => (
              <span key={it.id} style={{ marginRight: 8, display: 'inline-block' }}>
                • {it.service_name}
                {it.resource_name && <Text type="secondary"> ({it.resource_name})</Text>}
              </span>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: 'KTV phụ trách',
      dataIndex: 'staff_name',
      key: 'staff',
      width: 150,
      render: (staff) =>
        staff ? (
          <Space>
            <Avatar size="small" style={{ backgroundColor: '#0f8b8d' }} icon={<UserOutlined />} />
            <Text strong>{staff}</Text>
          </Space>
        ) : (
          <Tag color="warning">Chưa gán KTV</Tag>
        ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status) => {
        const cfg = STATUS_CONFIG[status] || { label: status, color: 'default' }
        return <Tag color={cfg.color} style={{ fontWeight: 600 }}>{cfg.label}</Tag>
      },
    },
    {
      title: 'Thanh toán',
      key: 'payment',
      width: 140,
      render: (_, record) => {
        const inv = record.invoice
        if (inv && inv.status === 'paid') {
          return <Tag color="success">Đã thu: {money(inv.total)}</Tag>
        }
        if (record.total_price) {
          return <Tag color="volcano">Chưa thu: {money(record.total_price)}</Tag>
        }
        return <Text type="secondary">—</Text>
      },
    },
    {
      title: 'Thao tác nhanh',
      key: 'actions',
      width: 170,
      render: (_, record) => (
        <Space size={6} wrap>
          {isFrontDesk && record.status === 'confirmed' && (
            <Tooltip title="Tiếp nhận bé tại quầy để chuyển sang hàng đợi chăm sóc">
              <Button
                size="small"
                type="primary"
                style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
                icon={<CheckCircleOutlined />}
                loading={actionLoading}
                onClick={(e) => {
                  e.stopPropagation()
                  handleQuickAction(record.id, 'check-in')
                }}
              >
                Tiếp nhận
              </Button>
            </Tooltip>
          )}

          {(isTech || isManager) && record.status === 'checked_in' && (
            <Tooltip title="Bắt đầu thực hiện liệu trình chăm sóc">
              <Button
                size="small"
                type="primary"
                icon={<PlayCircleOutlined />}
                loading={actionLoading}
                onClick={(e) => {
                  e.stopPropagation()
                  handleQuickAction(record.id, 'start')
                }}
              >
                Bắt đầu
              </Button>
            </Tooltip>
          )}

          {(isTech || isManager) && record.status === 'in_progress' && (
            <Tooltip title="Hoàn tất quy trình chăm sóc">
              <Button
                size="small"
                type="primary"
                style={{ background: '#10b981', borderColor: '#10b981' }}
                icon={<CheckCircleOutlined />}
                loading={actionLoading}
                onClick={(e) => {
                  e.stopPropagation()
                  handleQuickAction(record.id, 'complete')
                }}
              >
                Hoàn tất
              </Button>
            </Tooltip>
          )}

          {isFrontDesk && record.status === 'completed' && !record.checked_out_at && (
            <Tooltip title="Bàn giao thú cưng lại cho khách hàng">
              <Button
                size="small"
                icon={<ClockCircleOutlined />}
                loading={actionLoading}
                onClick={(e) => {
                  e.stopPropagation()
                  handleQuickAction(record.id, 'check-out')
                }}
              >
                Trả thú
              </Button>
            </Tooltip>
          )}

          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              setDetailBooking(record)
              setDetailDrawerOpen(true)
            }}
          >
            Chi tiết
          </Button>
        </Space>
      ),
    },
  ]

  // Tính toán tối đa cho biểu đồ giờ
  const maxHourlyVal = Math.max(
    ...hourlyData.map((h) => {
      if (hourlyMetric === 'in_progress') return h.in_progress
      if (hourlyMetric === 'completed') return h.completed
      return h.count
    }),
    1
  )

  // Tính chu vi SVG Donut
  const donutRadius = 60
  const donutCircumference = 2 * Math.PI * donutRadius
  let cumulativeOffset = 0

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* ===== 1. TIÊU ĐỀ TRANG & BỘ LỌC THỜI GIAN (ĐỒNG BỘ UI TOÀN HỆ THỐNG) ===== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Space align="center" size={10} wrap>
            <Title level={3} style={{ margin: 0 }}>
              {isFrontDesk ? 'Tổng Quan Hoạt Động Spa' : isCustomer ? 'Trung Tâm Khách Hàng' : 'Bàn Làm Việc Kỹ Thuật Viên'}
            </Title>
            <Tag
              color="#0f8b8d"
              style={{
                fontWeight: 700,
                borderRadius: 12,
                padding: '2px 10px',
                color: '#fff',
                border: 'none',
              }}
            >
              {isManager
                ? 'Quản lý điều hành'
                : isFrontDesk
                ? 'Lễ tân tiếp đón'
                : isTech
                ? 'Kỹ thuật viên'
                : 'Khách hàng'}
            </Tag>
          </Space>
          <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            Xin chào, <strong>{user?.full_name || user?.username}</strong>! 👋 · {spa.name} ({spa.address})
          </Paragraph>
        </div>

        {/* Khối chọn ngày & Lối tắt nhanh cho Lễ tân / Quản lý */}
        {isFrontDesk && (
          <Space wrap align="center" size={10}>
            <Button.Group>
              <Button
                icon={<LeftOutlined />}
                onClick={() => setSelectedDate((d) => d.subtract(1, 'day'))}
                title="Xem ngày trước"
              />
              <Button
                type={isToday ? 'primary' : 'default'}
                onClick={() => setSelectedDate(dayjs())}
                style={isToday ? { background: '#0f8b8d', borderColor: '#0f8b8d', fontWeight: 600 } : {}}
              >
                Hôm nay
              </Button>
              <Button
                icon={<RightOutlined />}
                onClick={() => setSelectedDate((d) => d.add(1, 'day'))}
                title="Xem ngày sau"
              />
            </Button.Group>

            <DatePicker
              value={selectedDate}
              onChange={(d) => d && setSelectedDate(d)}
              format="DD/MM/YYYY"
              allowClear={false}
              style={{ width: 140 }}
            />

            <Button
              icon={<ReloadOutlined spin={loading} />}
              onClick={() => loadData(selectedDate)}
              loading={loading}
            >
              Làm mới
            </Button>

            <Button
              icon={<DesktopOutlined />}
              onClick={() => nav('/app/bang-le-tan')}
              style={{ color: '#0f8b8d', borderColor: '#0f8b8d' }}
            >
              Bảng Lễ Tân
            </Button>

            <Button
              type="primary"
              style={{ background: '#0f8b8d', borderColor: '#0f8b8d', fontWeight: 600 }}
              icon={<PlusOutlined />}
              onClick={() => nav('/app/lich-hen?action=new')}
            >
              + Đặt lịch quầy
            </Button>
          </Space>
        )}

        {/* Lối tắt nhanh cho Khách hàng */}
        {isCustomer && (
          <Space wrap align="center" size={10}>
            <Button
              icon={<ReloadOutlined spin={loading} />}
              onClick={() => loadData()}
              loading={loading}
            >
              Cập nhật
            </Button>
            <Button
              type="primary"
              style={{ background: '#0f8b8d', borderColor: '#0f8b8d', fontWeight: 600 }}
              icon={<CalendarOutlined />}
              onClick={() => nav('/app/lich-hen')}
            >
              + Đặt lịch chăm sóc
            </Button>
            <Button
              icon={<IdcardOutlined />}
              onClick={() => nav('/app/thu-cung')}
            >
              Hồ sơ bé cưng
            </Button>
          </Space>
        )}
      </div>

      {/* ============================================================== */}
      {/* ===== GIAO DIỆN DÀNH CHO KHÁCH HÀNG (CUSTOMER DASHBOARD) ===== */}
      {/* ============================================================== */}
      {isCustomer && customerStats && (
        <div style={{ marginBottom: 24 }}>
          {/* 1. THEO DÕI TRỰC TIẾP: BÉ ĐANG TẠI SPA */}
          {customerStats.activeAtSpa && (
            <Card
              style={{
                borderRadius: 14,
                marginBottom: 20,
                border: '2px solid #0f8b8d',
                background: 'linear-gradient(180deg, #f0fdfa 0%, #ffffff 100%)',
                boxShadow: '0 4px 16px rgba(15, 139, 141, 0.12)',
              }}
              styles={{ body: { padding: '18px 22px' } }}
            >
              <Row justify="space-between" align="middle" gutter={[16, 16]}>
                <Col xs={24} md={16}>
                  <Space direction="vertical" size={6} style={{ width: '100%' }}>
                    <Space align="center" wrap>
                      <PetAvatar
                        species={customerStats.activeAtSpa.pet_info?.species}
                        size={44}
                        style={{ border: '2px solid #0f8b8d' }}
                      />
                      <div>
                        <Space align="center" wrap>
                          <Badge status="processing" color="#0f8b8d" />
                          <Text strong style={{ fontSize: 17, color: '#094d4e' }}>
                            🐾 Bé {customerStats.activeAtSpa.pet_info?.name} đang được chăm sóc tại Spa!
                          </Text>
                          <Tag color={customerStats.activeAtSpa.status === 'in_progress' ? 'orange' : 'cyan'} style={{ fontWeight: 600 }}>
                            {customerStats.activeAtSpa.status === 'in_progress' ? '⚡ Đang thực hiện dịch vụ' : 'Đã tiếp nhận tại quầy'}
                          </Tag>
                        </Space>
                      </div>
                    </Space>

                    <Paragraph style={{ margin: 0, color: '#555', fontSize: 14 }}>
                      Dịch vụ:{' '}
                      <Text strong>
                        {customerStats.activeAtSpa.package_name
                          ? `Gói ${customerStats.activeAtSpa.package_name}`
                          : customerStats.activeAtSpa.items?.map((i) => i.service_name).join(', ') || 'Dịch vụ lẻ'}
                      </Text>{' '}
                      · Kỹ thuật viên:{' '}
                      <Text strong style={{ color: '#0f8b8d' }}>
                        {customerStats.activeAtSpa.staff_name || 'Đang thực hiện'}
                      </Text>
                    </Paragraph>

                    <div style={{ marginTop: 14, maxWidth: 640 }}>
                      <Steps
                        size="small"
                        current={customerStats.activeAtSpa.status === 'in_progress' ? 2 : 1}
                        items={[
                          { title: 'Tiếp nhận quầy', description: 'Đã check-in' },
                          {
                            title: 'Chăm sóc tại Spa',
                            description: customerStats.activeAtSpa.status === 'in_progress' ? 'Đang tắm, sấy & cắt tỉa' : 'Sắp thực hiện',
                          },
                          { title: 'Hoàn tất & Đón bé', description: 'Chờ hoàn thành' },
                        ]}
                      />
                    </div>
                  </Space>
                </Col>

                <Col xs={24} md={8} style={{ textAlign: 'right' }}>
                  <Space direction="vertical" size={8} style={{ width: '100%', alignItems: 'flex-end' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Giờ bắt đầu: {dayjs(customerStats.activeAtSpa.start_at).format('HH:mm DD/MM')}
                    </Text>
                    <Button
                      type="primary"
                      icon={<EyeOutlined />}
                      style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
                      onClick={() => {
                        setDetailBooking(customerStats.activeAtSpa)
                        setDetailDrawerOpen(true)
                      }}
                    >
                      Xem chi tiết liệu trình
                    </Button>
                  </Space>
                </Col>
              </Row>
            </Card>
          )}

          {/* 2. CẢNH BÁO TÁI SPA TỪ TRỢ LÝ AI */}
          {myReminders.length > 0 && (
            <Alert
              type="info"
              showIcon
              icon={<RobotOutlined style={{ color: '#0f8b8d', fontSize: 18 }} />}
              style={{
                marginBottom: 20,
                borderRadius: 14,
                border: '1px solid #99f6e4',
                background: '#f0fdfa',
              }}
              message={
                <Space align="center" wrap>
                  <Text strong style={{ color: '#0f8b8d', fontSize: 14 }}>
                    Gợi ý từ Trợ lý AI Pet Spa:
                  </Text>
                  <Text>{myReminders[0].note_vi || 'Đã đến chu kỳ chăm sóc định kỳ cho bé cưng của bạn!'}</Text>
                </Space>
              }
              action={
                <Button
                  size="small"
                  type="primary"
                  style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
                  onClick={() => nav('/app/nhac-tai-spa')}
                >
                  Xem chi tiết gợi ý
                </Button>
              }
            />
          )}

          {/* 3. 4 THẺ CHỈ SỐ CỦA KHÁCH HÀNG */}
          <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            <Col xs={12} sm={6} lg={6}>
              <Card
                size="small"
                hoverable
                onClick={() => nav('/app/thu-cung')}
                style={{
                  borderRadius: 14,
                  borderTop: '4px solid #0f8b8d',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }}
              >
                <Statistic
                  title={<Text type="secondary">Bé cưng của tôi</Text>}
                  value={myPets.length}
                  prefix={<SmileFilled style={{ color: '#0f8b8d' }} />}
                  valueStyle={{ color: '#0f8b8d', fontWeight: 800 }}
                  suffix={<span style={{ fontSize: 13, fontWeight: 400 }}>bé</span>}
                />
                <Text type="secondary" ellipsis style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                  {myPets.map((p) => p.name).join(', ') || 'Chưa thêm bé'}
                </Text>
              </Card>
            </Col>

            <Col xs={12} sm={6} lg={6}>
              <Card
                size="small"
                hoverable
                onClick={() => nav('/app/lich-hen')}
                style={{
                  borderRadius: 14,
                  borderTop: '4px solid #2563eb',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }}
              >
                <Statistic
                  title={<Text type="secondary">Lịch hẹn sắp tới</Text>}
                  value={customerStats.upcoming.length}
                  prefix={<CalendarFilled style={{ color: '#2563eb' }} />}
                  valueStyle={{ color: '#2563eb', fontWeight: 800 }}
                  suffix={<span style={{ fontSize: 13, fontWeight: 400 }}>lịch</span>}
                />
                <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                  {customerStats.upcoming[0]
                    ? dayjs(customerStats.upcoming[0].start_at).format('DD/MM lúc HH:mm')
                    : 'Không có lịch sắp tới'}
                </Text>
              </Card>
            </Col>

            <Col xs={12} sm={6} lg={6}>
              <Card
                size="small"
                hoverable
                onClick={() => nav('/app/lich-hen')}
                style={{
                  borderRadius: 14,
                  borderTop: '4px solid #10b981',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }}
              >
                <Statistic
                  title={<Text type="secondary">Lần spa đã xong</Text>}
                  value={customerStats.completed.length}
                  prefix={<CheckCircleFilled style={{ color: '#10b981' }} />}
                  valueStyle={{ color: '#10b981', fontWeight: 800 }}
                  suffix={<span style={{ fontSize: 13, fontWeight: 400 }}>lần</span>}
                />
                <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                  Bé luôn thơm tho, sạch sẽ
                </Text>
              </Card>
            </Col>

            <Col xs={12} sm={6} lg={6}>
              <Card
                size="small"
                hoverable
                onClick={() => nav('/app/hoa-don')}
                style={{
                  borderRadius: 14,
                  borderTop: '4px solid #faad14',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }}
              >
                <Statistic
                  title={<Text type="secondary">Chi tiêu tích lũy</Text>}
                  value={money(customerStats.totalSpent)}
                  prefix={<DollarCircleFilled style={{ color: '#faad14' }} />}
                  valueStyle={{ color: '#faad14', fontWeight: 800, fontSize: 18 }}
                />
                <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                  {customerStats.unpaidInv.length > 0 ? (
                    <Text type="danger">Có {customerStats.unpaidInv.length} hóa đơn chưa thu</Text>
                  ) : (
                    'Hóa đơn đã đối soát đủ'
                  )}
                </Text>
              </Card>
            </Col>
          </Row>

          {/* 4. HỒ SƠ CÁC BÉ CƯNG CỦA TÔI */}
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <HeartFilled style={{ color: '#ff4d4f' }} />
                  <Text strong style={{ fontSize: 16 }}>Bé cưng của tôi ({myPets.length})</Text>
                </Space>
                <Button
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
                  onClick={() => nav('/app/thu-cung')}
                >
                  Thêm bé mới
                </Button>
              </div>
            }
            style={{ borderRadius: 14, marginBottom: 20 }}
            styles={{ body: { padding: '16px 20px' } }}
          >
            {myPets.length === 0 ? (
              <Empty
                description="Bạn chưa đăng ký hồ sơ thú cưng nào."
                style={{ padding: '12px 0' }}
              >
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  style={{ background: '#0f8b8d' }}
                  onClick={() => nav('/app/thu-cung')}
                >
                  Đăng ký hồ sơ bé cưng ngay
                </Button>
              </Empty>
            ) : (
              <Row gutter={[16, 16]}>
                {myPets.map((pet) => (
                  <Col xs={24} sm={12} lg={8} key={pet.id}>
                    <Card
                      size="small"
                      hoverable
                      style={{
                        borderRadius: 14,
                        border: '1px solid #e2e8f0',
                        background: '#fafafa',
                      }}
                      actions={[
                        <Button
                          key="book"
                          type="link"
                          style={{ color: '#0f8b8d', fontWeight: 600 }}
                          onClick={() => nav(`/app/lich-hen?petId=${pet.id}`)}
                        >
                          📅 Đặt lịch cho bé
                        </Button>,
                        <Button
                          key="profile"
                          type="link"
                          onClick={() => nav('/app/thu-cung')}
                        >
                          Xem hồ sơ
                        </Button>,
                      ]}
                    >
                      <Space align="center" style={{ width: '100%' }}>
                        <PetAvatar
                          species={pet.species}
                          size={54}
                          style={{ border: '2px solid #e2e8f0' }}
                        />
                        <div style={{ marginLeft: 8 }}>
                          <Text strong style={{ fontSize: 16, color: '#0f8b8d' }}>
                            {pet.name}
                          </Text>
                          <div style={{ fontSize: 13, color: '#555' }}>
                            {pet.breed || (pet.species === 'cat' ? 'Mèo' : 'Chó')}
                            {pet.weight_kg ? ` · ${Number(pet.weight_kg).toFixed(2)} kg` : ''}
                          </div>
                          <div style={{ marginTop: 4 }}>
                            <Tag color="cyan" style={{ fontSize: 11 }}>Size {pet.size_class || 'S'}</Tag>
                            {pet.allergy_note && pet.allergy_note !== 'Không' && (
                              <Tag color="warning" style={{ fontSize: 11 }}>🌸 Dị ứng</Tag>
                            )}
                          </div>
                        </div>
                      </Space>
                    </Card>
                  </Col>
                ))}
              </Row>
            )}
          </Card>

          {/* 5. DANH SÁCH LỊCH HẸN SẮP TỚI CỦA BÉ */}
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <CalendarOutlined style={{ color: '#0f8b8d' }} />
                  <Text strong style={{ fontSize: 16 }}>Lịch hẹn sắp tới của các bé</Text>
                  <Badge count={customerStats.upcoming.length} style={{ backgroundColor: '#2563eb' }} />
                </Space>
                <Button type="link" onClick={() => nav('/app/lich-hen')}>
                  Xem tất cả lịch hẹn →
                </Button>
              </div>
            }
            style={{ borderRadius: 14, marginBottom: 20 }}
          >
            {customerStats.upcoming.length === 0 ? (
              <Empty
                description="Các bé cưng hiện chưa có lịch hẹn nào sắp tới."
                style={{ padding: '16px 0' }}
              >
                <Button
                  type="primary"
                  shape="round"
                  icon={<PlusOutlined />}
                  onClick={() => nav('/app/lich-hen')}
                  style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
                >
                  Đặt lịch chăm sóc cho bé ngay
                </Button>
              </Empty>
            ) : (
              <List
                dataSource={customerStats.upcoming}
                renderItem={(b) => (
                  <List.Item
                    actions={[
                      <Button
                        key="view"
                        size="small"
                        type="default"
                        onClick={() => {
                          setDetailBooking(b)
                          setDetailDrawerOpen(true)
                        }}
                      >
                        Chi tiết
                      </Button>,
                      <Button
                        key="cancel"
                        size="small"
                        danger
                        onClick={() => handleCustomerCancelBooking(b)}
                      >
                        Hủy lịch
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={
                        <PetAvatar
                          species={b.pet_info?.species}
                          size={44}
                          style={{ border: '2px solid #e2e8f0' }}
                        />
                      }
                      title={
                        <Space wrap>
                          <Text strong style={{ fontSize: 15 }}>
                            Bé {b.pet_info?.name} — {b.package_name ? `Gói ${b.package_name}` : 'Dịch vụ lẻ'}
                          </Text>
                          <Tag color={STATUS_CONFIG[b.status]?.color || 'blue'}>
                            {STATUS_CONFIG[b.status]?.label || b.status}
                          </Tag>
                        </Space>
                      }
                      description={
                        <Space wrap size={12} style={{ marginTop: 4 }}>
                          <Text type="secondary">
                            <ClockCircleOutlined style={{ marginRight: 4 }} />
                            {dayjs(b.start_at).format('HH:mm - Thứ dddd, DD/MM/YYYY')}
                          </Text>
                          <Text type="secondary">KTV: {b.staff_name || 'Spa đang sắp xếp'}</Text>
                          <Text strong style={{ color: '#0f8b8d' }}>
                            {money(b.total_price)}
                          </Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ===== GIAO DIỆN DÀNH CHO LỄ TÂN & QUẢN LÝ (DAILY DASHBOARD CHUYÊN NGHIỆP) ===== */}
      {/* ========================================================================= */}
      {isFrontDesk && dashboardData && (
        <div style={{ marginBottom: 24 }}>
          {/* Cảnh báo các lịch cần chú ý gấp (Quá giờ hẹn hoặc chờ duyệt quá 24h) */}
          {dashboardData.needs_attention?.length > 0 && (
            <Alert
              type="error"
              showIcon
              icon={<WarningFilled style={{ fontSize: 18, color: '#ef4444' }} />}
              style={{
                marginBottom: 20,
                borderRadius: 14,
                border: '1px solid #fecaca',
                background: '#fef2f2',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.08)',
              }}
              message={
                <Text strong style={{ fontSize: 15, color: '#991b1b' }}>
                  Có {dashboardData.needs_attention.length} lịch hẹn cần xử lý gấp (Quá giờ hẹn hoặc chờ duyệt quá 24h)
                </Text>
              }
              description={
                <div style={{ marginTop: 8 }}>
                  <Row gutter={[12, 8]}>
                    {dashboardData.needs_attention.map((item) => (
                      <Col xs={24} sm={12} lg={8} key={item.id}>
                        <Card
                          size="small"
                          hoverable
                          onClick={() => nav('/app/lich-hen')}
                          style={{
                            borderRadius: 10,
                            border: '1px solid #fca5a5',
                            background: '#fff',
                            cursor: 'pointer',
                          }}
                        >
                          <Space direction="vertical" size={2} style={{ width: '100%' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text strong style={{ color: '#b91c1c' }}>🐾 {item.pet}</Text>
                              <Tag color="error">{item.reason || 'Cần xử lý'}</Tag>
                            </div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              Chủ: {item.client_name || 'Khách hàng'} · {item.client_phone}
                            </Text>
                            <Text style={{ fontSize: 12, color: '#666' }}>
                              Giờ hẹn: {dayjs(item.start_at).format('HH:mm DD/MM/YYYY')}
                            </Text>
                          </Space>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                </div>
              }
            />
          )}

          {/* ===== 2. NĂM THẺ CHỈ SỐ ĐIỀU HÀNH ĐẦU NGÀY (KPI CARDS ĐỒNG BỘ UI) ===== */}
          <Row gutter={[16, 16]}>
            {/* KPI 1: Doanh thu thực thu */}
            <Col xs={24} sm={12} lg={true}>
              <Card
                bordered={false}
                hoverable
                onClick={() => nav('/app/hoa-don?status=paid')}
                style={{
                  borderRadius: 14,
                  boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                  background: 'linear-gradient(135deg, #f0fdfa 0%, #ffffff 100%)',
                  border: '1px solid #ccfbf1',
                  height: '100%',
                  cursor: 'pointer',
                }}
                styles={{ body: { padding: 18 } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                      Doanh Thu Thực Thu Ngày
                    </Text>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#0f8b8d', marginTop: 4 }}>
                      {money(dashboardData.revenue)}
                    </div>
                  </div>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: '#ccfbf1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0f8b8d',
                      fontSize: 18,
                    }}
                  >
                    <DollarCircleFilled />
                  </div>
                </div>
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(15,139,141,0.1)', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary">
                    Khớp <Text strong>{dashboardData.paid_invoices}</Text> hóa đơn đã thu
                  </Text>
                  <Tag color="cyan">Xem sổ quỹ →</Tag>
                </div>
              </Card>
            </Col>

            {/* KPI 2: Tổng số lịch hẹn */}
            <Col xs={24} sm={12} lg={true}>
              <Card
                bordered={false}
                hoverable
                onClick={() => setFeedTab('all')}
                style={{
                  borderRadius: 14,
                  boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                  background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)',
                  border: '1px solid #dbeafe',
                  height: '100%',
                  cursor: 'pointer',
                }}
                styles={{ body: { padding: 18 } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                      Tổng Lịch Hẹn Ngày
                    </Text>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#2563eb', marginTop: 4 }}>
                      {dashboardData.total_bookings} <span style={{ fontSize: 14, fontWeight: 500 }}>ca</span>
                    </div>
                  </div>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: '#dbeafe',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#2563eb',
                      fontSize: 18,
                    }}
                  >
                    <CalendarFilled />
                  </div>
                </div>
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(37,99,235,0.1)', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary">
                    <Text strong style={{ color: '#10b981' }}>{dashboardData.counts?.completed || 0}</Text> xong · <Text strong style={{ color: '#f97316' }}>{dashboardData.counts?.in_progress || 0}</Text> đang làm
                  </Text>
                  <Tag color="blue">Xem tất cả</Tag>
                </div>
              </Card>
            </Col>

            {/* KPI 3: Bé đang tại Spa */}
            <Col xs={24} sm={12} lg={true}>
              <Card
                bordered={false}
                hoverable
                onClick={() => setFeedTab('in_service')}
                style={{
                  borderRadius: 14,
                  boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                  background: 'linear-gradient(135deg, #f5f3ff 0%, #ffffff 100%)',
                  border: '1px solid #ede9fe',
                  height: '100%',
                  cursor: 'pointer',
                }}
                styles={{ body: { padding: 18 } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                      Bé Đang Tại Spa
                    </Text>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#7c3aed', marginTop: 4 }}>
                      {dashboardData.in_service_count || 0} <span style={{ fontSize: 14, fontWeight: 500 }}>bé</span>
                    </div>
                  </div>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: '#ede9fe',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#7c3aed',
                      fontSize: 18,
                    }}
                  >
                    <ThunderboltFilled />
                  </div>
                </div>
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(124,58,237,0.1)', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary">
                    {dashboardData.counts?.checked_in || 0} sảnh · {dashboardData.counts?.in_progress || 0} bàn/bồn
                  </Text>
                  <Tag color="purple">Đang phục vụ</Tag>
                </div>
              </Card>
            </Col>

            {/* KPI 4: Chờ tiếp nhận / Duyệt */}
            <Col xs={24} sm={12} lg={true}>
              <Card
                bordered={false}
                hoverable
                onClick={() => setFeedTab('pending_confirmed')}
                style={{
                  borderRadius: 14,
                  boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                  background: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)',
                  border: '1px solid #fef3c7',
                  height: '100%',
                  cursor: 'pointer',
                }}
                styles={{ body: { padding: 18 } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                      Chờ Tiếp Nhận / Duyệt
                    </Text>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#d97706', marginTop: 4 }}>
                      {(dashboardData.counts?.pending || 0) + (dashboardData.counts?.confirmed || 0)} <span style={{ fontSize: 14, fontWeight: 500 }}>ca</span>
                    </div>
                  </div>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: '#fef3c7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#d97706',
                      fontSize: 18,
                    }}
                  >
                    <ClockCircleFilled />
                  </div>
                </div>
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(217,119,6,0.1)', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary">
                    <Text strong>{dashboardData.counts?.pending || 0}</Text> chờ duyệt · <Text strong>{dashboardData.counts?.confirmed || 0}</Text> sắp đến
                  </Text>
                  <Tag color="gold">Xử lý ngay</Tag>
                </div>
              </Card>
            </Col>

            {/* KPI 5: Hóa đơn chưa thu */}
            <Col xs={24} sm={12} lg={true}>
              <Card
                bordered={false}
                hoverable
                onClick={() => nav('/app/hoa-don?status=unpaid')}
                style={{
                  borderRadius: 14,
                  boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                  background: 'linear-gradient(135deg, #fef2f2 0%, #ffffff 100%)',
                  border: '1px solid #fee2e2',
                  height: '100%',
                  cursor: 'pointer',
                }}
                styles={{ body: { padding: 18 } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                      Hóa Đơn Chưa Thu
                    </Text>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#dc2626', marginTop: 4 }}>
                      {dashboardData.unpaid_count} <span style={{ fontSize: 14, fontWeight: 500 }}>đơn</span>
                    </div>
                  </div>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: '#fee2e2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#dc2626',
                      fontSize: 18,
                    }}
                  >
                    <ExclamationCircleFilled />
                  </div>
                </div>
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(220,38,38,0.1)', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" ellipsis style={{ maxWidth: 120 }}>
                    Nợ: <Text strong style={{ color: '#dc2626' }}>{money(dashboardData.unpaid_total)}</Text>
                  </Text>
                  <Tag color="red">Thu ngân →</Tag>
                </div>
              </Card>
            </Col>
          </Row>

          {/* ===== 3. CÁC BIỂU ĐỒ PHÂN TÍCH VẬN HÀNH ĐA DẠNG & LINH HOẠT ===== */}
          <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
            {/* BIỂU ĐỒ 1: PHÂN BỔ CA THEO KHUNG GIỜ TRONG NGÀY (PEAK HOURS BAR CHART) */}
            <Col xs={24} lg={15}>
              <Card
                title={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <Space align="center">
                      <BarChartOutlined style={{ color: '#0f8b8d', fontSize: 18 }} />
                      <span style={{ fontWeight: 700 }}>Phân Bổ Lịch Hẹn Theo Khung Giờ Trong Ngày</span>
                    </Space>
                    <Segmented
                      value={hourlyMetric}
                      onChange={setHourlyMetric}
                      options={[
                        { label: 'Tất cả ca', value: 'all' },
                        { label: 'Đang chăm sóc', value: 'in_progress' },
                        { label: 'Đã hoàn tất', value: 'completed' },
                      ]}
                      size="small"
                    />
                  </div>
                }
                bordered={false}
                style={{ borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', height: '100%' }}
                styles={{ body: { padding: '16px 20px' } }}
              >
                {/* Thông báo khung giờ cao điểm */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 10,
                    padding: '8px 14px',
                    backgroundColor: '#f8fafc',
                    borderRadius: 8,
                    marginBottom: 16,
                    fontSize: 12,
                  }}
                >
                  <Space size={14} wrap>
                    <div>
                      <FieldTimeOutlined style={{ color: '#0f8b8d', marginRight: 4 }} />
                      <Text type="secondary">Khung giờ mở cửa: </Text>
                      <Text strong>{spa.open_time?.slice(0, 5)} – {spa.close_time?.slice(0, 5)}</Text>
                    </div>
                    {peakHour && (
                      <div>
                        <FireOutlined style={{ color: '#f59e0b', marginRight: 4 }} />
                        <Text type="secondary">Khung giờ cao điểm: </Text>
                        <Text strong style={{ color: '#d97706' }}>{peakHour.hour} ({peakHour.count} ca)</Text>
                      </div>
                    )}
                  </Space>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    💡 Rê chuột vào từng cột để xem chi tiết ca
                  </Text>
                </div>

                {/* Vùng vẽ biểu đồ cột tương tác theo giờ */}
                <div
                  style={{
                    position: 'relative',
                    height: 200,
                    borderBottom: '2px solid #e2e8f0',
                    paddingTop: 10,
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  {hourlyData.map((h, idx) => {
                    const val =
                      hourlyMetric === 'in_progress'
                        ? h.in_progress
                        : hourlyMetric === 'completed'
                        ? h.completed
                        : h.count
                    const pct = Math.round((val / maxHourlyVal) * 100)
                    const isPeak = peakHour && peakHour.hour === h.hour && val > 0
                    const isHovered = hoveredHour === h.hour

                    return (
                      <div
                        key={idx}
                        style={{
                          flex: 1,
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'flex-end',
                          alignItems: 'center',
                          position: 'relative',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={() => setHoveredHour(h.hour)}
                        onMouseLeave={() => setHoveredHour(null)}
                      >
                        {/* Tooltip khi hover */}
                        {isHovered && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: `${Math.max(pct, 15) + 12}%`,
                              left: '50%',
                              transform: 'translateX(-50%)',
                              backgroundColor: '#1e293b',
                              color: '#fff',
                              padding: '6px 10px',
                              borderRadius: 6,
                              fontSize: 11,
                              whiteSpace: 'nowrap',
                              zIndex: 10,
                              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                              pointerEvents: 'none',
                            }}
                          >
                            <div style={{ fontWeight: 700, marginBottom: 2 }}>{h.hour}</div>
                            <div>Tổng ca hẹn: <strong>{h.count}</strong> ca</div>
                            <div style={{ color: '#86efac' }}>• Hoàn tất: {h.completed}</div>
                            <div style={{ color: '#fed7aa' }}>• Đang làm: {h.in_progress}</div>
                            <div style={{ color: '#93c5fd' }}>• Sắp đến: {h.confirmed + h.pending}</div>
                          </div>
                        )}

                        {/* Nhãn số liệu trên đầu cột */}
                        {val > 0 && (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: isPeak ? '#d97706' : '#0f8b8d',
                              marginBottom: 4,
                            }}
                          >
                            {val}
                          </span>
                        )}

                        {/* Cột hiển thị */}
                        <div
                          style={{
                            width: '70%',
                            maxWidth: 32,
                            height: val > 0 ? `${Math.max(pct, 8)}%` : '4px',
                            backgroundColor:
                              val === 0
                                ? '#f1f5f9'
                                : isHovered
                                ? '#0d9488'
                                : isPeak
                                ? '#f59e0b'
                                : '#0f8b8d',
                            borderRadius: '6px 6px 0 0',
                            transition: 'all 0.25s ease',
                            boxShadow: isHovered ? '0 2px 8px rgba(15,139,141,0.4)' : 'none',
                          }}
                        />

                        {/* Nhãn giờ trục X */}
                        <div
                          style={{
                            position: 'absolute',
                            bottom: -24,
                            fontSize: 11,
                            color: isPeak ? '#d97706' : '#64748b',
                            fontWeight: isPeak ? 700 : 500,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {h.hour.slice(0, 5)}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div style={{ height: 28 }} />

                {/* Chú giải trạng thái cột */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
                  <Space size={6} align="center">
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: '#0f8b8d' }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>Ca hẹn tiêu chuẩn</Text>
                  </Space>
                  <Space size={6} align="center">
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: '#f59e0b' }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>Khung giờ cao điểm</Text>
                  </Space>
                  <Space size={6} align="center">
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: '#f1f5f9' }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>Không có lịch</Text>
                  </Space>
                </div>
              </Card>
            </Col>

            {/* BIỂU ĐỒ 2: CƠ CẤU TRẠNG THÁI CA & KÊNH TIẾP NHẬN (DONUT CHART & CHANNEL RATIO) */}
            <Col xs={24} lg={9}>
              <Card
                title={
                  <Space align="center">
                    <PieChartOutlined style={{ color: '#0f8b8d', fontSize: 18 }} />
                    <span style={{ fontWeight: 700 }}>Cơ Cấu Trạng Thái & Tiếp Nhận</span>
                  </Space>
                }
                bordered={false}
                style={{ borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', height: '100%' }}
                styles={{ body: { padding: '16px 20px' } }}
              >
                {/* SVG Donut Chart */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <div style={{ position: 'relative', width: 160, height: 160 }}>
                    <svg width="160" height="160" viewBox="0 0 160 160">
                      {/* Vòng nền mờ */}
                      <circle
                        cx="80"
                        cy="80"
                        r={donutRadius}
                        fill="transparent"
                        stroke="#f1f5f9"
                        strokeWidth="16"
                      />
                      {/* Các cung tròn trạng thái */}
                      {statusBreakdown.map((item, idx) => {
                        const total = dashboardData.total_bookings || 1
                        const sliceLength = (item.count / total) * donutCircumference
                        const offset = cumulativeOffset
                        cumulativeOffset += sliceLength

                        if (item.count === 0) return null

                        return (
                          <circle
                            key={idx}
                            cx="80"
                            cy="80"
                            r={donutRadius}
                            fill="transparent"
                            stroke={item.color}
                            strokeWidth="16"
                            strokeDasharray={`${sliceLength} ${donutCircumference - sliceLength}`}
                            strokeDashoffset={-offset}
                            transform="rotate(-90 80 80)"
                            style={{ transition: 'stroke-dasharray 0.3s ease' }}
                          />
                        )
                      })}
                    </svg>

                    {/* Số liệu trọng tâm Donut */}
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none',
                      }}
                    >
                      <div style={{ fontSize: 24, fontWeight: 800, color: '#0f8b8d', lineHeight: 1 }}>
                        {dashboardData.total_bookings}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>lịch hẹn ngày</div>
                    </div>
                  </div>
                </div>

                {/* Danh sách nhãn trạng thái */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 12px', marginBottom: 16 }}>
                  {statusBreakdown.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                      <Space size={6} align="center">
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                        <span style={{ color: '#475569' }}>{item.label}:</span>
                      </Space>
                      <Text strong style={{ color: item.color }}>
                        {item.count} <span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8' }}>({item.percent}%)</span>
                      </Text>
                    </div>
                  ))}
                </div>

                <Divider style={{ margin: '10px 0' }} />

                {/* Kênh tiếp nhận: Online vs Quầy */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                    <Text type="secondary">Kênh tiếp nhận:</Text>
                    <Space size={12}>
                      <span style={{ color: '#7c3aed', fontWeight: 600 }}>
                        Online: {dashboardData.channel_distribution?.online || 0}
                      </span>
                      <span style={{ color: '#06b6d4', fontWeight: 600 }}>
                        Tại quầy: {dashboardData.channel_distribution?.counter || 0}
                      </span>
                    </Space>
                  </div>
                  <Progress
                    percent={
                      dashboardData.total_bookings > 0
                        ? Math.round(((dashboardData.channel_distribution?.online || 0) / dashboardData.total_bookings) * 100)
                        : 0
                    }
                    success={{
                      percent:
                        dashboardData.total_bookings > 0
                          ? Math.round(((dashboardData.channel_distribution?.counter || 0) / dashboardData.total_bookings) * 100)
                          : 0,
                      strokeColor: '#06b6d4',
                    }}
                    strokeColor="#7c3aed"
                    showInfo={false}
                    size="small"
                  />
                </div>
              </Card>
            </Col>
          </Row>

          {/* ===== 4. KHU VỰC NHÂN SỰ & TÀI NGUYÊN ĐẦU NGÀY ===== */}
          <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
            {/* Kỹ thuật viên & Ca trực hôm nay */}
            <Col xs={24} lg={15}>
              <Card
                title={
                  <Space align="center">
                    <TeamOutlined style={{ color: '#0f8b8d', fontSize: 18 }} />
                    <span style={{ fontWeight: 700 }}>Kỹ Thuật Viên & Phân Bổ Ca Trực Ngày</span>
                  </Space>
                }
                extra={
                  <Button type="link" onClick={() => nav('/app/nhan-su')}>
                    Quản lý nhân sự →
                  </Button>
                }
                bordered={false}
                style={{ borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', height: '100%' }}
                styles={{ body: { padding: '16px 20px' } }}
              >
                {dashboardData.staff_on_duty?.length > 0 ? (
                  <List
                    dataSource={dashboardData.staff_on_duty.filter((s) => s.role === 'technician')}
                    renderItem={(st) => (
                      <List.Item style={{ padding: '10px 0' }}>
                        <div style={{ width: '100%' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <Space align="center" size={10}>
                              <Avatar size="small" style={{ backgroundColor: st.on_leave ? '#ef4444' : '#0f8b8d' }}>
                                {st.name?.slice(0, 1) || 'K'}
                              </Avatar>
                              <div>
                                <Text strong style={{ fontSize: 14 }}>{st.name}</Text>
                                <div>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    Ca: {st.shifts}
                                  </Text>
                                </div>
                              </div>
                            </Space>

                            <Space wrap>
                              {st.on_leave ? (
                                <Tag color="error">Nghỉ phép</Tag>
                              ) : st.in_progress_count > 0 ? (
                                <Tag color="orange">Đang phục vụ {st.in_progress_count} bé</Tag>
                              ) : st.has_shift ? (
                                <Tag color="green">Sẵn sàng nhận bé</Tag>
                              ) : (
                                <Tag color="default">Không có ca</Tag>
                              )}
                              <Tag color="cyan" style={{ fontWeight: 600 }}>{st.assigned_count} lịch hẹn</Tag>
                            </Space>
                          </div>

                          <Progress
                            percent={Math.min(100, Math.round((st.assigned_count / Math.max(1, dashboardData.total_bookings)) * 100))}
                            strokeColor="#0f8b8d"
                            size="small"
                          />
                        </div>
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty description="Chưa có dữ liệu ca trực cho ngày này." />
                )}
              </Card>
            </Col>

            {/* Công suất tài nguyên cơ sở */}
            <Col xs={24} lg={9}>
              <Card
                title={
                  <Space align="center">
                    <ShopOutlined style={{ color: '#0f8b8d', fontSize: 18 }} />
                    <span style={{ fontWeight: 700 }}>Tài Nguyên & Công Suất Thiết Bị</span>
                  </Space>
                }
                extra={
                  <Button type="link" onClick={() => nav('/app/bang-le-tan')}>
                    Sơ đồ vị trí →
                  </Button>
                }
                bordered={false}
                style={{ borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', height: '100%' }}
                styles={{ body: { padding: '16px 20px' } }}
              >
                <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
                  <Descriptions.Item label="Tổng số vị trí phục vụ">
                    <Text strong style={{ color: '#0f8b8d', fontSize: 15 }}>
                      {dashboardData.resources_summary?.total || 0} vị trí
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="🛁 Bồn tắm spa">
                    {dashboardData.resources_summary?.by_type?.bath_tub || 0} bồn tắm
                  </Descriptions.Item>
                  <Descriptions.Item label="✂️ Bàn cắt tỉa Grooming">
                    {dashboardData.resources_summary?.by_type?.grooming_table || 0} bàn kéo
                  </Descriptions.Item>
                  <Descriptions.Item label="💨 Chuồng sấy chuyên dụng">
                    {dashboardData.resources_summary?.by_type?.drying_cage || 0} buồng sấy
                  </Descriptions.Item>
                  <Descriptions.Item label="🐱 Phòng Spa mèo riêng biệt">
                    {dashboardData.resources_summary?.by_type?.spa_room || 0} phòng cách âm
                  </Descriptions.Item>
                </Descriptions>

                <Alert
                  type="info"
                  showIcon
                  message="Lưu ý vận hành an toàn sinh học"
                  description="Khử trùng buồng sấy và bề mặt bàn kéo sau mỗi ca phục vụ để ngăn lây nhiễm chéo."
                  style={{ borderRadius: 10, fontSize: 12 }}
                />
              </Card>
            </Col>
          </Row>

          {/* ===== 5. BẢNG ĐIỀU PHỐI: FEED LỊCH HẸN TRONG NGÀY (FULL WIDTH ĐỒNG BỘ UI) ===== */}
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <Space align="center">
                  <CalendarOutlined style={{ color: '#0f8b8d', fontSize: 18 }} />
                  <Text strong style={{ fontSize: 16 }}>
                    Danh sách Lịch hẹn {isToday ? 'Hôm nay' : `ngày ${selectedDate.format('DD/MM/YYYY')}`}
                  </Text>
                  <Badge count={dashboardData.total_bookings} style={{ backgroundColor: '#0f8b8d' }} />
                </Space>

                <Space wrap align="center">
                  <Input
                    placeholder="Tìm tên bé, chủ, số điện thoại..."
                    prefix={<SearchOutlined style={{ color: '#aaa' }} />}
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    allowClear
                    style={{ width: 240 }}
                  />
                  <RowPerPageSelect value={pageSize} onChange={setPageSize} />
                  <Button
                    type="default"
                    icon={<ShopOutlined />}
                    onClick={() => nav('/app/nhan-su?tab=roster')}
                  >
                    Ma trận ca trực
                  </Button>
                </Space>
              </div>
            }
            bordered={false}
            style={{ borderRadius: 14, marginTop: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}
            styles={{ body: { padding: '16px 20px' } }}
          >
            {/* Thanh Tab phân loại trạng thái */}
            <Tabs
              activeKey={feedTab}
              onChange={setFeedTab}
              style={{ marginBottom: 12 }}
              items={[
                {
                  key: 'all',
                  label: (
                    <span>
                      Tất cả <Badge count={dashboardData.total_bookings} overflowCount={99} style={{ backgroundColor: '#0f8b8d', marginLeft: 4 }} />
                    </span>
                  ),
                },
                {
                  key: 'pending_confirmed',
                  label: (
                    <span>
                      Chờ tiếp nhận / Duyệt{' '}
                      <Badge
                        count={(dashboardData.counts?.pending || 0) + (dashboardData.counts?.confirmed || 0)}
                        overflowCount={99}
                        style={{ backgroundColor: '#f59e0b', marginLeft: 4 }}
                      />
                    </span>
                  ),
                },
                {
                  key: 'in_service',
                  label: (
                    <span>
                      Đang tại Spa{' '}
                      <Badge
                        count={dashboardData.in_service_count || 0}
                        overflowCount={99}
                        style={{ backgroundColor: '#7c3aed', marginLeft: 4 }}
                      />
                    </span>
                  ),
                },
                {
                  key: 'completed',
                  label: (
                    <span>
                      Đã hoàn tất{' '}
                      <Badge
                        count={dashboardData.counts?.completed || 0}
                        overflowCount={99}
                        style={{ backgroundColor: '#10b981', marginLeft: 4 }}
                      />
                    </span>
                  ),
                },
                {
                  key: 'cancelled',
                  label: (
                    <span>
                      Đã hủy / Vắng{' '}
                      <Badge
                        count={(dashboardData.counts?.cancelled || 0) + (dashboardData.counts?.no_show || 0)}
                        overflowCount={99}
                        style={{ backgroundColor: '#94a3b8', marginLeft: 4 }}
                      />
                    </span>
                  ),
                },
              ]}
            />

            {/* Bảng dữ liệu feed */}
            <Table
              columns={feedColumns}
              dataSource={filteredFeed}
              rowKey="id"
              pagination={{
                pageSize,
                showTotal: (total, range) => `${range[0]}-${range[1]} trên tổng số ${total} lịch hẹn`,
              }}
              onRow={(record) => ({
                onClick: () => {
                  setDetailBooking(record)
                  setDetailDrawerOpen(true)
                },
                style: { cursor: 'pointer' },
              })}
              locale={{ emptyText: <Empty description="Không có lịch hẹn nào trong danh mục này." /> }}
            />
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ===== GIAO DIỆN DÀNH CHO KỸ THUẬT VIÊN (TECHNICIAN DASHBOARD) ===== */}
      {/* ========================================================================= */}
      {isTech && (
        <div style={{ marginBottom: 24 }}>
          <Card
            title={
              <Space>
                <CalendarOutlined style={{ color: '#0f8b8d' }} />
                <Text strong>Lịch chăm sóc được phân công cho bạn hôm nay</Text>
              </Space>
            }
            bordered={false}
            style={{ borderRadius: 14, marginBottom: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}
          >
            {myTechBookings.length > 0 ? (
              <Table
                columns={feedColumns
                  .filter((col) => !['actions', 'staff', 'payment'].includes(col.key))
                  .map((col) => ({
                    ...col,
                    width: {
                      time: 120,
                      pet: 280,
                      client: 190,
                      status: 135,
                    }[col.key] || col.width,
                  }))}
                dataSource={myTechBookings}
                rowKey="id"
                pagination={false}
                tableLayout="fixed"
                className="technician-dashboard-bookings"
              />
            ) : (
              <Empty description="Hôm nay bạn chưa có lịch chăm sóc nào được chỉ định." />
            )}
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ===== THÔNG TIN CƠ SỞ & GÓI CHĂM SÓC NỔI BẬT ===== */}
      {/* ========================================================================= */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card title="Thông tin cơ sở & Giờ mở cửa" bordered={false} style={{ borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
            {spa.logo && <Image src={spa.logo} width={96} style={{ marginBottom: 12, borderRadius: 8 }} />}
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Điện thoại">{spa.phone || '02838229999'}</Descriptions.Item>
              <Descriptions.Item label="Email">{spa.email || 'lienhe@longmuot.example'}</Descriptions.Item>
              <Descriptions.Item label="Địa chỉ">{spa.address}</Descriptions.Item>
              <Descriptions.Item label="Giờ mở cửa">
                {spa.open_time?.slice(0, 5)} – {spa.close_time?.slice(0, 5)}
              </Descriptions.Item>
              <Descriptions.Item label="Ngày mở cửa">{openDays}</Descriptions.Item>
              <Descriptions.Item label="Hạn hủy lịch">{spa.cancel_cutoff_hours} giờ trước giờ hẹn</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card
            title="Gói chăm sóc nổi bật"
            extra={<Button type="link" onClick={() => nav('/app/dich-vu')}>Xem tất cả dịch vụ →</Button>}
            bordered={false}
            style={{ borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}
          >
            {packages.length === 0 ? (
              <Empty description="Chưa có gói nào." />
            ) : (
              <Row gutter={[12, 12]}>
                {packages.map((p) => (
                  <Col xs={24} md={12} key={p.id}>
                    <Card
                      size="small"
                      type="inner"
                      title={p.name}
                      style={{ borderRadius: 12, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                    >
                      <div>
                        <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 8, minHeight: 40 }}>
                          {p.items?.map((i) => i.service_name).join(' · ')}
                        </Paragraph>
                        <Tag color="cyan">Từ {money(Math.min(...Object.values(p.prices || {})))}</Tag>
                      </div>
                      <div style={{ marginTop: 12, textAlign: 'right' }}>
                        <Button
                          size="small"
                          type="primary"
                          style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
                          onClick={() => nav(`/app/lich-hen?packageId=${p.id}`)}
                        >
                          Chọn gói này
                        </Button>
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>
            )}
          </Card>
        </Col>
      </Row>

      {/* ===== DRAWER XEM CHI TIẾT LỊCH HẸN ===== */}
      <Drawer
        title={
          <Space>
            <CalendarOutlined style={{ color: '#0f8b8d' }} />
            <span>Chi tiết Lịch hẹn #{detailBooking?.id}</span>
          </Space>
        }
        placement="right"
        width={540}
        onClose={() => setDetailDrawerOpen(false)}
        open={detailDrawerOpen}
        extra={
          <Button
            type="primary"
            style={{ background: '#0f8b8d' }}
            onClick={() => {
              setDetailDrawerOpen(false)
              nav('/app/lich-hen')
            }}
          >
            Mở trong trang Lịch hẹn →
          </Button>
        }
      >
        {detailBooking && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* Thông tin thú cưng */}
            <Card
              size="small"
              title={
                <Space align="center">
                  <PetAvatar species={detailBooking.pet_info?.species} size={28} />
                  <span>🐾 Thông tin Bé cưng</span>
                </Space>
              }
            >
              <Descriptions column={2} size="small">
                <Descriptions.Item label="Tên bé">{detailBooking.pet_info?.name}</Descriptions.Item>
                <Descriptions.Item label="Giống loài">
                  {detailBooking.pet_info?.breed || (detailBooking.pet_info?.species === 'cat' ? 'Mèo' : 'Chó')}
                </Descriptions.Item>
                <Descriptions.Item label="Cân nặng">{detailBooking.pet_info?.weight ? `${detailBooking.pet_info.weight} kg` : '—'}</Descriptions.Item>
                <Descriptions.Item label="Loại lông">{detailBooking.pet_info?.coat_type || '—'}</Descriptions.Item>
              </Descriptions>

              {/* Cảnh báo an toàn */}
              {(detailBooking.pet_info?.safety_note || detailBooking.pet_info?.allergy_note) && (
                <div style={{ marginTop: 8, padding: 8, background: '#fffbeb', borderRadius: 8 }}>
                  <Text strong style={{ color: '#d97706' }}>⚠️ Lưu ý an toàn & Dị ứng:</Text>
                  <div>{detailBooking.pet_info.allergy_note && <span>Dị ứng: {detailBooking.pet_info.allergy_note}. </span>}</div>
                  <div>{detailBooking.pet_info.safety_note && <span>Ghi chú an toàn: {detailBooking.pet_info.safety_note}.</span>}</div>
                </div>
              )}
            </Card>

            {/* Thông tin khách hàng */}
            <Card size="small" title="👤 Thông tin Khách hàng">
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Họ tên">{detailBooking.client_info?.full_name}</Descriptions.Item>
                <Descriptions.Item label="Điện thoại">
                  <Text copyable>{detailBooking.client_info?.phone}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Kênh đặt">
                  {detailBooking.channel === 'online' ? 'Đặt Online qua ứng dụng' : 'Khách đến quầy (Walk-in)'}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {/* Chi tiết dịch vụ */}
            <Card size="small" title="✨ Dịch vụ & Gói chăm sóc">
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Gói dịch vụ">
                  {detailBooking.package_name ? <Tag color="geekblue">Gói {detailBooking.package_name}</Tag> : 'Dịch vụ lẻ'}
                </Descriptions.Item>
                <Descriptions.Item label="Kỹ thuật viên">
                  {detailBooking.staff_name ? <Text strong>{detailBooking.staff_name}</Text> : <Tag color="warning">Chưa gán</Tag>}
                </Descriptions.Item>
                <Descriptions.Item label="Thời gian">
                  {dayjs(detailBooking.start_at).format('HH:mm DD/MM/YYYY')}
                </Descriptions.Item>
                <Descriptions.Item label="Tổng chi phí">
                  <Text strong style={{ color: '#0f8b8d', fontSize: 16 }}>{money(detailBooking.total_price)}</Text>
                </Descriptions.Item>
              </Descriptions>

              <Divider style={{ margin: '8px 0' }} />
              <Text strong style={{ fontSize: 13 }}>Danh sách hạng mục:</Text>
              <List
                size="small"
                dataSource={detailBooking.items || []}
                renderItem={(it) => (
                  <List.Item>
                    <span>{it.service_name} {it.resource_name && <Text type="secondary">({it.resource_name})</Text>}</span>
                    <span>{money(it.unit_price)}</span>
                  </List.Item>
                )}
              />
            </Card>

            {/* Trạng thái & Thao tác chuyển đổi */}
            <Card size="small" title="⚡ Thao tác xử lý">
              <Space direction="vertical" style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text>Trạng thái hiện tại:</Text>
                  <Tag color={STATUS_CONFIG[detailBooking.status]?.color} style={{ fontSize: 13, fontWeight: 700 }}>
                    {STATUS_CONFIG[detailBooking.status]?.label || detailBooking.status}
                  </Tag>
                </div>

                <Space wrap style={{ marginTop: 8 }}>
                  {/* Hành động của Lễ tân */}
                  {isFrontDesk && detailBooking.status === 'pending' && (
                    <Button
                      type="primary"
                      icon={<CheckCircleOutlined />}
                      loading={actionLoading}
                      onClick={() => handleQuickAction(detailBooking.id, 'confirm')}
                    >
                      Duyệt lịch hẹn
                    </Button>
                  )}

                  {isFrontDesk && detailBooking.status === 'confirmed' && (
                    <Button
                      type="primary"
                      style={{ background: '#0f8b8d' }}
                      icon={<CheckCircleOutlined />}
                      loading={actionLoading}
                      onClick={() => handleQuickAction(detailBooking.id, 'check-in')}
                    >
                      Tiếp nhận bé tại quầy (Check-in)
                    </Button>
                  )}

                  {(isTech || isManager) && detailBooking.status === 'checked_in' && (
                    <Button
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      loading={actionLoading}
                      onClick={() => handleQuickAction(detailBooking.id, 'start')}
                    >
                      Bắt đầu chăm sóc
                    </Button>
                  )}

                  {(isTech || isManager) && detailBooking.status === 'in_progress' && (
                    <Button
                      type="primary"
                      style={{ background: '#10b981' }}
                      icon={<CheckCircleOutlined />}
                      loading={actionLoading}
                      onClick={() => handleQuickAction(detailBooking.id, 'complete')}
                    >
                      Hoàn tất dịch vụ
                    </Button>
                  )}

                  {isFrontDesk && detailBooking.status === 'completed' && !detailBooking.checked_out_at && (
                    <Button
                      icon={<ClockCircleOutlined />}
                      loading={actionLoading}
                      onClick={() => handleQuickAction(detailBooking.id, 'check-out')}
                    >
                      Bàn giao trả thú
                    </Button>
                  )}

                  {isFrontDesk && detailBooking.status === 'completed' && (
                    <Button
                      type="primary"
                      style={{ background: '#faad14', borderColor: '#faad14', color: '#000', fontWeight: 600 }}
                      icon={<DollarOutlined />}
                      onClick={() => {
                        setDetailDrawerOpen(false)
                        nav('/app/hoa-don')
                      }}
                    >
                      Thu ngân / Hóa đơn
                    </Button>
                  )}

                  {/* Hành động của Khách hàng: Hủy lịch nếu còn trước thời hạn */}
                  {isCustomer && ['pending', 'confirmed'].includes(detailBooking.status) && (
                    <Button
                      danger
                      onClick={() => {
                        setDetailDrawerOpen(false)
                        handleCustomerCancelBooking(detailBooking)
                      }}
                    >
                      Hủy lịch hẹn này
                    </Button>
                  )}
                </Space>
              </Space>
            </Card>
          </Space>
        )}
      </Drawer>
    </div>
  )
}
