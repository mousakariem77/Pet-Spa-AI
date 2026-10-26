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
  DollarCircleFilled, DollarOutlined, ExclamationCircleFilled, EyeOutlined,
  FilterOutlined, FireOutlined, HeartFilled, IdcardOutlined, InfoCircleOutlined,
  LeftOutlined, MedicineBoxOutlined, PhoneOutlined, PlayCircleOutlined,
  PlusOutlined, ReloadOutlined, RightOutlined, RobotOutlined,
  SafetyCertificateOutlined, SearchOutlined, ShopOutlined, SmileFilled,
  SyncOutlined, TeamOutlined, ThunderboltFilled, UserOutlined, WarningFilled,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { api, money, unwrap } from '../api.js'
import { useAuth } from '../auth.jsx'
import PetAvatar from '../components/PetAvatar.jsx'

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

  // Bộ lọc feed hôm nay cho Lễ tân
  const [feedTab, setFeedTab] = useState('all')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [detailBooking, setDetailBooking] = useState(null)
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)

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
    // Bé đang có mặt tại spa (đang làm hoặc vừa check-in)
    const activeAtSpa = myBookings.find((b) => ['checked_in', 'in_progress'].includes(b.status))
    // Lịch sắp tới
    const upcoming = myBookings
      .filter((b) => ['pending', 'confirmed'].includes(b.status))
      .sort((a, b) => dayjs(a.start_at).diff(dayjs(b.start_at)))
    // Lịch đã hoàn thành
    const completed = myBookings.filter((b) => b.status === 'completed')
    // Tổng chi tiêu thực tế
    const totalSpent = myInvoices
      .filter((i) => i.status === 'paid')
      .reduce((sum, i) => sum + Number(i.total || 0), 0)
    // Hóa đơn chưa thanh toán
    const unpaidInv = myInvoices.filter((i) => i.status === 'unpaid')

    return {
      activeAtSpa,
      upcoming,
      completed,
      totalSpent,
      unpaidInv,
    }
  }, [isCustomer, myPets, myBookings, myInvoices])

  if (loading && !dashboardData && !spa && myPets.length === 0) {
    return <Skeleton active paragraph={{ rows: 10 }} />
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
                <Text strong style={{ fontSize: 15, color: '#0f8b8d' }}>
                  🐾 {pet?.name || 'Bé cưng'}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  ({pet?.breed || (pet?.species === 'cat' ? 'Mèo' : 'Chó')}{pet?.weight ? ` · ${pet.weight}kg` : ''})
                </Text>
              </Space>

              {/* Cảnh báo an toàn cho bé */}
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
      title: 'Dịch vụ & Tài nguyên',
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

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* ===== HERO BANNER ===== */}
      <Card
        style={{
          borderRadius: 16,
          marginBottom: 20,
          background: 'linear-gradient(135deg, #094d4e 0%, #0f8b8d 50%, #1bb2b5 100%)',
          color: '#fff',
          boxShadow: '0 8px 24px rgba(15, 139, 141, 0.22)',
          border: 'none',
        }}
        bodyStyle={{ padding: '20px 24px' }}
      >
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={13}>
            <Space direction="vertical" size={4}>
              <Space align="center" wrap>
                <Title level={3} style={{ color: '#fff', margin: 0 }}>
                  Xin chào, {user?.full_name || user?.username}! 👋
                </Title>
                <Tag
                  color="#faad14"
                  style={{
                    fontWeight: 700,
                    borderRadius: 12,
                    padding: '2px 10px',
                    color: '#1a1a1a',
                  }}
                >
                  {isManager
                    ? 'Quản lý điều hành'
                    : isFrontDesk
                    ? 'Lễ tân tiếp đón'
                    : isTech
                    ? 'Kỹ thuật viên'
                    : 'Khách hàng thân thiết'}
                </Tag>
              </Space>
              <Text style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: 14 }}>
                {spa.name} — {spa.address}
              </Text>
            </Space>
          </Col>

          {/* Khối chọn ngày & Lối tắt cho Lễ tân / Quản lý */}
          {isFrontDesk && (
            <Col xs={24} md={11} style={{ textAlign: 'right' }}>
              <Space wrap style={{ justifyContent: 'flex-end' }}>
                <Button.Group>
                  <Button
                    icon={<LeftOutlined />}
                    onClick={() => setSelectedDate((d) => d.subtract(1, 'day'))}
                    title="Xem ngày trước"
                  />
                  <Button
                    type={isToday ? 'primary' : 'default'}
                    onClick={() => setSelectedDate(dayjs())}
                    style={isToday ? { background: '#faad14', borderColor: '#faad14', color: '#000', fontWeight: 600 } : {}}
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
                  style={{ width: 135 }}
                />

                <Button
                  icon={<ReloadOutlined spin={loading} />}
                  onClick={() => loadData(selectedDate)}
                >
                  Làm mới
                </Button>

                <Button
                  type="primary"
                  style={{ background: '#faad14', borderColor: '#faad14', color: '#1a1a1a', fontWeight: 600 }}
                  icon={<PlusOutlined />}
                  onClick={() => nav('/app/lich-hen?action=new')}
                >
                  + Đặt lịch quầy
                </Button>
              </Space>
            </Col>
          )}

          {/* Lối tắt nhanh cho Khách hàng */}
          {isCustomer && (
            <Col xs={24} md={11} style={{ textAlign: 'right' }}>
              <Space wrap style={{ justifyContent: 'flex-end' }}>
                <Button
                  icon={<ReloadOutlined spin={loading} />}
                  onClick={() => loadData()}
                  style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)', background: 'transparent' }}
                >
                  Cập nhật
                </Button>
                <Button
                  type="primary"
                  style={{ background: '#faad14', borderColor: '#faad14', color: '#1a1a1a', fontWeight: 700 }}
                  icon={<CalendarOutlined />}
                  onClick={() => nav('/app/lich-hen')}
                >
                  + Đặt lịch chăm sóc
                </Button>
                <Button
                  type="default"
                  icon={<IdcardOutlined />}
                  onClick={() => nav('/app/thu-cung')}
                  style={{ fontWeight: 600 }}
                >
                  Hồ sơ bé cưng
                </Button>
              </Space>
            </Col>
          )}
        </Row>
      </Card>

      {/* ============================================================== */}
      {/* ===== GIAO DIỆN DÀNH CHO KHÁCH HÀNG (CUSTOMER DASHBOARD) ===== */}
      {/* ============================================================== */}
      {isCustomer && customerStats && (
        <div style={{ marginBottom: 24 }}>
          {/* 1. THEO DÕI TRỰC TIẾP (LIVE TRACKER): BÉ ĐANG TẠI SPA */}
          {customerStats.activeAtSpa && (
            <Card
              style={{
                borderRadius: 16,
                marginBottom: 20,
                border: '2px solid #0f8b8d',
                background: 'linear-gradient(180deg, #f0fdfa 0%, #ffffff 100%)',
                boxShadow: '0 8px 24px rgba(15, 139, 141, 0.14)',
              }}
              bodyStyle={{ padding: '20px 24px' }}
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

                    {/* Tiến trình các bước */}
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

          {/* 2. CẢNH BÁO TÁI SPA TỪ TRỢ LÝ AI (NẾU CÓ) */}
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

          {/* 3. 4 THẺ CHỈ SỐ HOẠT ĐỘNG CỦA KHÁCH HÀNG */}
          <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            {/* Số bé cưng */}
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

            {/* Lịch hẹn sắp tới */}
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

            {/* Lần spa đã xong */}
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

            {/* Tổng chi tiêu tích lũy */}
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

          {/* 4. HỒ SƠ CÁC BÉ CƯNG CỦA TÔI (MY PETS CARDS) */}
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
            style={{ borderRadius: 16, marginBottom: 20 }}
            bodyStyle={{ padding: '16px 20px' }}
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
            style={{ borderRadius: 16, marginBottom: 20 }}
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
      {/* ===== GIAO DIỆN DÀNH CHO LỄ TÂN & QUẢN LÝ (DAILY DASHBOARD - SPA-20) ===== */}
      {/* ========================================================================= */}
      {isFrontDesk && dashboardData && (
        <div style={{ marginBottom: 24 }}>
          {/* Cảnh báo các lịch cần chú ý gấp */}
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

          {/* 5 Thẻ Chỉ số Điều hành Đầu ngày (KPI Cards) */}
          <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            {/* Doanh thu thực thu */}
            <Col xs={24} sm={12} lg={8} xl={true}>
              <Card
                size="small"
                hoverable
                onClick={() => nav('/app/hoa-don?status=paid')}
                style={{
                  borderRadius: 14,
                  cursor: 'pointer',
                  borderTop: '4px solid #0f8b8d',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                }}
              >
                <Statistic
                  title={<Text type="secondary" style={{ fontSize: 13 }}>Doanh thu thực thu ngày</Text>}
                  value={money(dashboardData.revenue)}
                  prefix={<DollarCircleFilled style={{ color: '#0f8b8d' }} />}
                  valueStyle={{ color: '#0f8b8d', fontWeight: 800, fontSize: 22 }}
                />
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Khớp {dashboardData.paid_invoices} hóa đơn đã thu
                  </Text>
                  <Tag color="cyan">Xem sổ quỹ →</Tag>
                </div>
              </Card>
            </Col>

            {/* Tổng số lịch hẹn */}
            <Col xs={24} sm={12} lg={8} xl={true}>
              <Card
                size="small"
                hoverable
                onClick={() => setFeedTab('all')}
                style={{
                  borderRadius: 14,
                  cursor: 'pointer',
                  borderTop: '4px solid #2563eb',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                }}
              >
                <Statistic
                  title={<Text type="secondary" style={{ fontSize: 13 }}>Tổng lịch hẹn ngày</Text>}
                  value={dashboardData.total_bookings}
                  prefix={<CalendarFilled style={{ color: '#2563eb' }} />}
                  valueStyle={{ color: '#2563eb', fontWeight: 800, fontSize: 22 }}
                />
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {dashboardData.counts?.completed || 0} xong · {dashboardData.counts?.in_progress || 0} đang làm
                  </Text>
                  <Tag color="blue">Xem tất cả</Tag>
                </div>
              </Card>
            </Col>

            {/* Đang phục vụ tại Spa */}
            <Col xs={24} sm={12} lg={8} xl={true}>
              <Card
                size="small"
                hoverable
                onClick={() => setFeedTab('in_service')}
                style={{
                  borderRadius: 14,
                  cursor: 'pointer',
                  borderTop: '4px solid #7c3aed',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                }}
              >
                <Statistic
                  title={<Text type="secondary" style={{ fontSize: 13 }}>Bé đang tại Spa</Text>}
                  value={dashboardData.in_service_count || 0}
                  prefix={<ThunderboltFilled style={{ color: '#7c3aed' }} />}
                  valueStyle={{ color: '#7c3aed', fontWeight: 800, fontSize: 22 }}
                />
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {dashboardData.counts?.checked_in || 0} quầy · {dashboardData.counts?.in_progress || 0} bàn/bồn
                  </Text>
                  <Tag color="purple">Đang phục vụ</Tag>
                </div>
              </Card>
            </Col>

            {/* Hàng chờ duyệt / Tiếp nhận */}
            <Col xs={24} sm={12} lg={8} xl={true}>
              <Card
                size="small"
                hoverable
                onClick={() => setFeedTab('pending_confirmed')}
                style={{
                  borderRadius: 14,
                  cursor: 'pointer',
                  borderTop: '4px solid #f59e0b',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                }}
              >
                <Statistic
                  title={<Text type="secondary" style={{ fontSize: 13 }}>Chờ tiếp nhận / Duyệt</Text>}
                  value={dashboardData.counts?.pending || 0}
                  prefix={<ClockCircleFilled style={{ color: '#f59e0b' }} />}
                  valueStyle={{
                    color: (dashboardData.counts?.pending || 0) > 0 ? '#f59e0b' : '#10b981',
                    fontWeight: 800,
                    fontSize: 22,
                  }}
                />
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    + {dashboardData.counts?.confirmed || 0} sắp đến
                  </Text>
                  <Tag color="gold">Xử lý ngay</Tag>
                </div>
              </Card>
            </Col>

            {/* Hóa đơn chưa thu */}
            <Col xs={24} sm={12} lg={8} xl={true}>
              <Card
                size="small"
                hoverable
                onClick={() => nav('/app/hoa-don?status=unpaid')}
                style={{
                  borderRadius: 14,
                  cursor: 'pointer',
                  borderTop: '4px solid #ef4444',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                }}
              >
                <Statistic
                  title={<Text type="secondary" style={{ fontSize: 13 }}>Hóa đơn chưa thu</Text>}
                  value={dashboardData.unpaid_count}
                  prefix={<ExclamationCircleFilled style={{ color: '#ef4444' }} />}
                  valueStyle={{
                    color: dashboardData.unpaid_count > 0 ? '#ef4444' : '#10b981',
                    fontWeight: 800,
                    fontSize: 22,
                  }}
                />
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Nợ: {money(dashboardData.unpaid_total)}
                  </Text>
                  <Tag color="red">Thu ngân →</Tag>
                </div>
              </Card>
            </Col>
          </Row>

          {/* ===== BẢNG ĐIỀU PHỐI: FEED LỊCH HẸN TRONG NGÀY ===== */}
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

                <Space wrap>
                  <Input
                    placeholder="Tìm tên bé, chủ, số điện thoại..."
                    prefix={<SearchOutlined style={{ color: '#aaa' }} />}
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    allowClear
                    style={{ width: 250 }}
                  />
                  <Button
                    type="default"
                    icon={<ShopOutlined />}
                    onClick={() => nav('/app/nhan-su?tab=roster')}
                  >
                    Xem ma trận ca trực
                  </Button>
                </Space>
              </div>
            }
            style={{ borderRadius: 16, marginBottom: 24, boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}
            bodyStyle={{ padding: '16px 20px' }}
          >
            {/* Thanh Tab phân loại nhanh */}
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
              pagination={{ pageSize: 8, showTotal: (t) => `Tổng ${t} lịch hẹn` }}
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

          {/* ===== KHU VỰC NHÂN SỰ & TÀI NGUYÊN ĐẦU NGÀY ===== */}
          <Row gutter={[16, 16]}>
            {/* Nhân sự & Ca trực hôm nay */}
            <Col xs={24} lg={14}>
              <Card
                title={
                  <Space>
                    <TeamOutlined style={{ color: '#0f8b8d' }} />
                    <Text strong>Kỹ thuật viên & Ca trực hôm nay</Text>
                  </Space>
                }
                extra={
                  <Button type="link" onClick={() => nav('/app/nhan-su')}>
                    Chi tiết nhân sự →
                  </Button>
                }
                style={{ borderRadius: 16, height: '100%' }}
              >
                {dashboardData.staff_on_duty?.length > 0 ? (
                  <List
                    dataSource={dashboardData.staff_on_duty.filter((s) => s.role === 'technician')}
                    renderItem={(st) => (
                      <List.Item>
                        <div style={{ width: '100%' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <Space>
                              <Avatar style={{ backgroundColor: st.on_leave ? '#ff4d4f' : '#0f8b8d' }}>
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

                            <Space>
                              {st.on_leave ? (
                                <Tag color="error">Nghỉ phép</Tag>
                              ) : st.in_progress_count > 0 ? (
                                <Tag color="orange">Đang phục vụ {st.in_progress_count} bé</Tag>
                              ) : st.has_shift ? (
                                <Tag color="green">Sẵn sàng</Tag>
                              ) : (
                                <Tag color="default">Không có ca</Tag>
                              )}
                              <Tag color="cyan">{st.assigned_count} lịch hẹn</Tag>
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
            <Col xs={24} lg={10}>
              <Card
                title={
                  <Space>
                    <ShopOutlined style={{ color: '#0f8b8d' }} />
                    <Text strong>Tài nguyên & Cơ sở vật chất</Text>
                  </Space>
                }
                style={{ borderRadius: 16, height: '100%' }}
              >
                <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
                  <Descriptions.Item label="Tổng tài nguyên phục vụ">
                    <Text strong style={{ color: '#0f8b8d', fontSize: 16 }}>
                      {dashboardData.resources_summary?.total || 0} vị trí
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="Bồn tắm spa">
                    {dashboardData.resources_summary?.by_type?.bath_tub || 0} bồn
                  </Descriptions.Item>
                  <Descriptions.Item label="Bàn cắt tỉa">
                    {dashboardData.resources_summary?.by_type?.grooming_table || 0} bàn
                  </Descriptions.Item>
                  <Descriptions.Item label="Chuồng sấy chuyên dụng">
                    {dashboardData.resources_summary?.by_type?.drying_cage || 0} chuồng
                  </Descriptions.Item>
                  <Descriptions.Item label="Phòng spa riêng">
                    {dashboardData.resources_summary?.by_type?.spa_room || 0} phòng
                  </Descriptions.Item>
                </Descriptions>

                <Alert
                  type="info"
                  showIcon
                  message="Lưu ý điều phối đầu ngày"
                  description="Kiểm tra khử trùng bồn tắm và bàn kéo trước mỗi ca phục vụ để đảm bảo tiêu chuẩn an toàn sinh học."
                  style={{ borderRadius: 10 }}
                />
              </Card>
            </Col>
          </Row>
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
            style={{ borderRadius: 16, marginBottom: 20 }}
          >
            {myTechBookings.length > 0 ? (
              <Table
                columns={feedColumns.filter((col) => col.key !== 'actions')}
                dataSource={myTechBookings}
                rowKey="id"
                pagination={false}
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
          <Card title="Thông tin cơ sở & Giờ mở cửa" style={{ borderRadius: 16 }}>
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
            style={{ borderRadius: 16 }}
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
