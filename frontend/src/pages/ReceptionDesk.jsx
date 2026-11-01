import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Card, Row, Col, Typography, Button, Tag, Space, DatePicker,
  Badge, Modal, Select, message, Spin, Statistic, Empty, Progress,
  Divider, Tooltip, Drawer, Timeline, Form, Input, Descriptions, Alert,
  Segmented, Avatar
} from 'antd'
import {
  DesktopOutlined, CheckCircleOutlined, PlayCircleOutlined, LogoutOutlined,
  ClockCircleOutlined, UserOutlined, PhoneOutlined, AlertOutlined,
  DollarOutlined, ReloadOutlined, PlusOutlined, EyeOutlined,
  AppstoreOutlined, SwapOutlined, ToolOutlined, ShopOutlined, QrcodeOutlined,
  SearchOutlined, FieldTimeOutlined, CheckOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import { api, unwrap, money } from '../api.js'
import PetAvatar from '../components/PetAvatar.jsx'

const { Title, Text, Paragraph } = Typography

const RESOURCE_TYPE_INFO = {
  grooming_table: { label: 'Bàn cắt Grooming', icon: '✂️', color: '#0f8b8d' },
  bath_tub: { label: 'Bồn tắm spa', icon: '🛁', color: '#0284c7' },
  drying_cage: { label: 'Chuồng sấy', icon: '💨', color: '#d97706' },
  spa_room: { label: 'Phòng Spa mèo', icon: '🐱', color: '#8b5cf6' },
}

export default function ReceptionDesk() {
  const { user } = useAuth()
  const nav = useNavigate()
  const canExecute = ['manager', 'technician'].includes(user?.role)

  const [selectedDate, setSelectedDate] = useState(dayjs())
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  // Tìm kiếm nhanh trong bảng điều phối
  const [searchQuery, setSearchQuery] = useState('')
  const [columnFilter, setColumnFilter] = useState('all') // 'all' | 'confirmed' | 'in_house' | 'ready'

  // Dữ liệu lịch hẹn hôm nay & sơ đồ tài nguyên
  const [bookings, setBookings] = useState([])
  const [occupancyData, setOccupancyData] = useState(null)
  const [showResourceGrid, setShowResourceGrid] = useState(true)
  const [walkInSummary, setWalkInSummary] = useState(null)

  // Modal Check-in (gán tài nguyên)
  const [checkInModalOpen, setCheckInModalOpen] = useState(false)
  const [checkInTarget, setCheckInTarget] = useState(null)
  const [resourceAssignments, setResourceAssignments] = useState({})
  const [checkInNote, setCheckInNote] = useState('')

  // Drawer xem chi tiết
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailBooking, setDetailBooking] = useState(null)

  // Tải dữ liệu toàn bộ bảng điều phối
  const loadData = useCallback(async () => {
    setLoading(true)
    const dateStr = selectedDate.format('YYYY-MM-DD')
    try {
      const [bksRes, occRes, walkInRes] = await Promise.all([
        api(`/bookings?date=${dateStr}`),
        api(`/resources/occupancy?date=${dateStr}`),
        api(`/walk-ins?date=${dateStr}`).catch(() => null),
      ])
      setBookings(unwrap(bksRes) || [])
      setOccupancyData(occRes || null)
      setWalkInSummary(walkInRes?.summary || null)
    } catch (e) {
      message.error(e.message || 'Không thể tải dữ liệu bảng lễ tân')
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Lọc theo từ khóa tìm kiếm
  const filteredBookings = useMemo(() => {
    if (!searchQuery.trim()) return bookings
    const q = searchQuery.toLowerCase().trim()
    return bookings.filter((b) => {
      const petName = (b.pet_info?.name || '').toLowerCase()
      const clientName = (b.client_info?.full_name || '').toLowerCase()
      const clientPhone = (b.client_info?.phone || '').toLowerCase()
      const staffName = (b.staff_name || '').toLowerCase()
      const pkgName = (b.package_info?.name || '').toLowerCase()
      return (
        petName.includes(q) ||
        clientName.includes(q) ||
        clientPhone.includes(q) ||
        staffName.includes(q) ||
        pkgName.includes(q)
      )
    })
  }, [bookings, searchQuery])

  // Phân nhóm lịch hẹn theo 3 cột Kanban
  const confirmedList = useMemo(() => {
    return filteredBookings.filter((b) => b.status === 'confirmed')
  }, [filteredBookings])

  const inHouseList = useMemo(() => {
    return filteredBookings.filter((b) => ['checked_in', 'in_progress'].includes(b.status))
  }, [filteredBookings])

  const readyList = useMemo(() => {
    return filteredBookings.filter((b) => b.status === 'completed' && !b.checked_out_at)
  }, [filteredBookings])

  const checkedOutList = useMemo(() => {
    return filteredBookings.filter((b) => b.status === 'completed' && b.checked_out_at)
  }, [filteredBookings])

  // Mở modal Check-in nhận thú
  const openCheckInModal = (bk) => {
    setCheckInTarget(bk)
    setCheckInNote('')

    // Tự động tìm tài nguyên trống phù hợp cho từng item
    const initialAssignments = {}
    if (occupancyData?.resources && bk.items) {
      bk.items.forEach((item) => {
        const freeRes = occupancyData.resources.filter(
          (r) => r.resource_type === item.resource_type && r.is_active && !r.is_occupied
        )
        if (freeRes.length > 0) {
          initialAssignments[item.id] = freeRes[0].id
        }
      })
    }
    setResourceAssignments(initialAssignments)
    setCheckInModalOpen(true)
  }

  // Thực hiện Check-in
  const submitCheckIn = async () => {
    if (!checkInTarget) return
    setActionLoading(true)
    try {
      await api(`/bookings/${checkInTarget.id}/check-in`, {
        method: 'POST',
        body: JSON.stringify({
          resources: resourceAssignments,
          note: checkInNote,
        }),
      })
      message.success(`Đã tiếp nhận bé ${checkInTarget.pet_info?.name || 'cưng'} vào tiệm!`)
      setCheckInModalOpen(false)
      loadData()
    } catch (e) {
      message.error(e.message || 'Lỗi khi tiếp nhận thú')
    } finally {
      setActionLoading(false)
    }
  }

  // Bắt đầu làm (start)
  const handleStart = async (bookingId) => {
    setActionLoading(true)
    try {
      await api(`/bookings/${bookingId}/start`, { method: 'POST' })
      message.success('Đã chuyển sang trạng thái Đang thực hiện!')
      loadData()
    } catch (e) {
      message.error(e.message || 'Không thể bắt đầu thực hiện')
    } finally {
      setActionLoading(false)
    }
  }

  // Hoàn tất dịch vụ (complete)
  const handleComplete = async (bookingId) => {
    setActionLoading(true)
    try {
      await api(`/bookings/${bookingId}/complete`, { method: 'POST' })
      message.success('Dịch vụ đã hoàn tất! Chuyển sang cột Chờ đón về.')
      loadData()
    } catch (e) {
      message.error(e.message || 'Không thể cập nhật hoàn tất')
    } finally {
      setActionLoading(false)
    }
  }

  // Trả thú (check-out)
  const handleCheckOut = async (booking) => {
    const isPaid = booking.invoice?.status === 'paid'
    if (!isPaid) {
      Modal.confirm({
        title: 'Hóa đơn chưa thu tiền',
        content: `Lịch hẹn của bé ${booking.pet_info?.name || ''} chưa được thanh toán (${money(booking.total_price || booking.total_estimate || 0)}). Bạn có muốn thu tiền ngay?`,
        okText: 'Lập & Thu hóa đơn ngay',
        cancelText: 'Vẫn trả thú (Ghi nợ)',
        onOk: () => {
          nav(`/app/hoa-don?booking_id=${booking.id}`)
        },
        onCancel: async () => {
          try {
            await api(`/bookings/${booking.id}/check-out`, { method: 'POST' })
            message.success('Đã trả thú cưng cho chủ nuôi!')
            loadData()
          } catch (e) {
            message.error(e.message || 'Lỗi khi trả thú')
          }
        },
      })
    } else {
      setActionLoading(true)
      try {
        await api(`/bookings/${booking.id}/check-out`, { method: 'POST' })
        message.success('Đã hoàn tất trả thú cưng cho khách hàng!')
        loadData()
      } catch (e) {
        message.error(e.message || 'Lỗi khi trả thú')
      } finally {
        setActionLoading(false)
      }
    }
  }

  // Xem chi tiết lịch hẹn
  const openDetail = async (id) => {
    try {
      const res = await api(`/bookings/${id}`)
      setDetailBooking(res)
      setDetailOpen(true)
    } catch (e) {
      message.error(e.message || 'Không thể xem chi tiết')
    }
  }

  const summary = occupancyData?.summary || { total: 0, occupied: 0, free: 0, rate: 0, by_type: {} }

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* ===== 1. HEADER TIÊU ĐỀ & THANH CÔNG CỤ (Đồng bộ UI chuẩn) ===== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Bảng Lễ Tân & Điều Phối Vận Hành
          </Title>
          <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            Tiếp nhận thú, kiểm soát công suất bàn grooming, chuồng sấy và trả thú theo thời gian thực
          </Paragraph>
        </div>

        <Space wrap align="center" size={10}>
          <DatePicker
            value={selectedDate}
            onChange={(d) => d && setSelectedDate(d)}
            format="DD/MM/YYYY"
            allowClear={false}
            size="middle"
            style={{ width: 140 }}
          />

          <Button
            size="middle"
            type={selectedDate.isSame(dayjs(), 'day') ? 'primary' : 'default'}
            onClick={() => setSelectedDate(dayjs())}
            style={selectedDate.isSame(dayjs(), 'day') ? { background: '#0f8b8d', borderColor: '#0f8b8d' } : {}}
          >
            Hôm nay
          </Button>

        <Button icon={<ReloadOutlined spin={loading} />} onClick={loadData} loading={loading}>
          Làm mới
        </Button>

        <Button
          icon={<AppstoreOutlined />}
          onClick={() => setShowResourceGrid(!showResourceGrid)}
        >
          {showResourceGrid ? 'Ẩn sơ đồ vị trí' : 'Hiện sơ đồ vị trí'}
        </Button>

        <Button
          icon={<QrcodeOutlined />}
          onClick={() => nav('/app/hang-doi-walk-in')}
          style={{ color: '#0f8b8d', borderColor: '#0f8b8d' }}
        >
          Hàng đợi vãng lai {walkInSummary?.waiting > 0 && (
            <Badge count={walkInSummary.waiting} style={{ marginLeft: 6, backgroundColor: '#f59e0b' }} />
          )}
        </Button>

        <Button
          type="primary"
          icon={<PlusOutlined />}
          style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
          onClick={() => nav('/app/lich-hen')}
        >
          Quản lý lịch hẹn
        </Button>
      </Space>
    </div>

      {/* Cảnh báo khách vãng lai đang chờ tại sảnh */ }
  {
    walkInSummary?.waiting > 0 && (
      <Alert
        type="warning"
        showIcon
        icon={<QrcodeOutlined />}
        style={{ marginBottom: 16, borderRadius: 12, border: '1px solid #fde68a' }}
        message={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span>
              📢 <strong>Hàng đợi vãng lai:</strong> Đang có <strong>{walkInSummary.waiting}</strong> khách chờ tại sảnh
              {walkInSummary.next_waiting && ` (Số tiếp theo: #${String(walkInSummary.next_waiting).padStart(2, '0')})`}
              . Thời gian chờ ước tính ~{walkInSummary.average_wait_minutes} phút.
            </span>
            <Button
              size="small"
              type="primary"
              onClick={() => nav('/app/hang-doi-walk-in')}
              style={{ background: '#d97706', borderColor: '#d97706', borderRadius: 6 }}
            >
              Mở hàng đợi gọi số
            </Button>
          </div>
        }
      />
    )
  }

  {/* ===== 2. CÁC THẺ THỐNG KÊ NHANH (Chuẩn đồng bộ UI) ===== */ }
  <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
    {/* Card 1: Sắp đến hôm nay */}
    <Col xs={12} sm={6} lg={4}>
      <Card
        bordered={false}
        style={{
          borderRadius: 14,
          boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
          background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)',
          border: '1px solid #dbeafe',
          height: '100%',
        }}
        styles={{ body: { padding: 16 } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
              Sắp Đến Hôm Nay
            </Text>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0284c7', marginTop: 4 }}>
              {confirmedList.length} <span style={{ fontSize: 13, fontWeight: 400 }}>lịch</span>
            </div>
          </div>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: '#dbeafe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0284c7',
              fontSize: 16,
            }}
          >
            <ClockCircleOutlined />
          </div>
        </div>
      </Card>
    </Col>

    {/* Card 2: Đang tại Spa */}
    <Col xs={12} sm={6} lg={4}>
      <Card
        bordered={false}
        style={{
          borderRadius: 14,
          boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
          background: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)',
          border: '1px solid #fef3c7',
          height: '100%',
        }}
        styles={{ body: { padding: 16 } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
              Đang Tại Spa
            </Text>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#d97706', marginTop: 4 }}>
              {inHouseList.length} <span style={{ fontSize: 13, fontWeight: 400 }}>bé</span>
            </div>
          </div>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: '#fef3c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#d97706',
              fontSize: 16,
            }}
          >
            <ShopOutlined />
          </div>
        </div>
      </Card>
    </Col>

    {/* Card 3: Chờ đón về */}
    <Col xs={12} sm={6} lg={4}>
      <Card
        bordered={false}
        style={{
          borderRadius: 14,
          boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
          background: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)',
          border: '1px solid #bbf7d0',
          height: '100%',
        }}
        styles={{ body: { padding: 16 } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
              Chờ Đón Về
            </Text>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a', marginTop: 4 }}>
              {readyList.length} <span style={{ fontSize: 13, fontWeight: 400 }}>bé</span>
            </div>
          </div>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: '#bbf7d0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#16a34a',
              fontSize: 16,
            }}
          >
            <LogoutOutlined />
          </div>
        </div>
      </Card>
    </Col>

    {/* Card 4: Đã trả về */}
    <Col xs={12} sm={6} lg={4}>
      <Card
        bordered={false}
        style={{
          borderRadius: 14,
          boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
          background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
          border: '1px solid #e2e8f0',
          height: '100%',
        }}
        styles={{ body: { padding: 16 } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
              Đã Trả Về
            </Text>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#64748b', marginTop: 4 }}>
              {checkedOutList.length} <span style={{ fontSize: 13, fontWeight: 400 }}>bé</span>
            </div>
          </div>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b',
              fontSize: 16,
            }}
          >
            <CheckCircleOutlined />
          </div>
        </div>
      </Card>
    </Col>

    {/* Card 5: Tải công suất vị trí spa */}
    <Col xs={24} sm={12} lg={8}>
      <Card
        bordered={false}
        style={{
          borderRadius: 14,
          boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
          background: 'linear-gradient(135deg, #f0fdfa 0%, #ffffff 100%)',
          border: '1px solid #ccfbf1',
          height: '100%',
        }}
        styles={{ body: { padding: 16 } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
              Tải Công Suất Vị Trí Spa
            </Text>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0f8b8d', marginTop: 4 }}>
              {summary.occupied}/{summary.total} chỗ đang dùng ({summary.rate}%)
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Còn trống {summary.free} vị trí bàn & chuồng
            </div>
          </div>
          <Progress
            type="circle"
            percent={summary.rate}
            size={44}
            strokeColor="#0f8b8d"
          />
        </div>
      </Card>
    </Col>
  </Row>

  {/* ===== 3. SƠ ĐỒ VỊ TRÍ BÀN GROOMING / CHUỒNG SẤY ===== */ }
  {
    showResourceGrid && (
      <Card
        title={
          <Space>
            <ToolOutlined style={{ color: '#0f8b8d' }} />
            <span style={{ fontWeight: 700 }}>Sơ đồ hiện trạng vị trí làm việc & Chuồng sấy</span>
          </Space>
        }
        bordered={false}
        style={{ borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.03)', marginBottom: 20, background: '#fafafa' }}
        extra={
          <Space size="middle">
            <span style={{ fontSize: 12, color: '#64748b' }}>
              <Badge color="#10b981" /> Trống ({summary.free})
            </span>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              <Badge color="#d97706" /> Đang dùng ({summary.occupied})
            </span>
          </Space>
        }
      >
        {loading && !occupancyData ? (
          <div style={{ textAlign: 'center', padding: '30px 0' }}><Spin tip="Đang tải sơ đồ vị trí..." /></div>
        ) : (
          <div>
            {/* Thống kê công suất theo từng nhóm tài nguyên */}
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
              {Object.entries(summary.by_type || {}).map(([key, item]) => {
                const meta = RESOURCE_TYPE_INFO[key] || { label: key, icon: '🏷️' }
                return (
                  <Col xs={12} sm={6} key={key}>
                    <div style={{ background: '#fff', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span>{meta.icon} <strong>{meta.label}</strong></span>
                        <span style={{ fontWeight: 600 }}>{item.occupied}/{item.total}</span>
                      </div>
                      <Progress percent={item.rate} size="small" strokeColor={item.rate >= 100 ? '#ef4444' : '#0f8b8d'} />
                    </div>
                  </Col>
                )
              })}
            </Row>

            {/* Lưới các ô vị trí vật lý cụ thể */}
            <Row gutter={[12, 12]}>
              {(occupancyData?.resources || []).map((r) => {
                const meta = RESOURCE_TYPE_INFO[r.resource_type] || { label: r.resource_type, icon: '🏷️' }
                const isOcc = r.is_occupied
                const cur = r.current

                return (
                  <Col xs={24} sm={12} md={8} lg={6} key={r.id}>
                    <Card
                      size="small"
                      style={{
                        borderRadius: 10,
                        borderColor: isOcc ? '#f59e0b' : '#bbf7d0',
                        background: isOcc ? '#fffbeb' : '#f0fdf4',
                        height: '100%',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <Space size="small">
                          <span style={{ fontSize: 16 }}>{meta.icon}</span>
                          <Text strong style={{ fontSize: 13 }}>{r.name}</Text>
                        </Space>
                        <Tag color={isOcc ? 'warning' : 'success'} style={{ margin: 0, borderRadius: 4 }}>
                          {isOcc ? 'Đang dùng' : 'Trống'}
                        </Tag>
                      </div>

                      {isOcc && cur ? (
                        <div style={{ fontSize: 12, color: '#334155' }}>
                          <div style={{ fontWeight: 600, color: '#0f8b8d' }}>
                            🐾 {cur.pet_name} ({cur.pet_species === 'dog' ? 'Chó' : 'Mèo'})
                          </div>
                          <div style={{ color: '#475569', marginTop: 2 }}>
                            ✂️ {cur.service_name}
                          </div>
                          {cur.staff_name && (
                            <div style={{ color: '#64748b', marginTop: 2 }}>
                              👤 KTV: {cur.staff_name}
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: '#d97706', marginTop: 4, fontWeight: 500 }}>
                            ⏱️ {dayjs(cur.start_at).format('HH:mm')} - {dayjs(cur.end_at).format('HH:mm')}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#16a34a', padding: '4px 0' }}>
                          ✓ Sẵn sàng tiếp nhận thú cưng
                        </div>
                      )}
                    </Card>
                  </Col>
                )
              })}
            </Row>
          </div>
        )}
      </Card>
    )
  }

  {/* ===== 4. BẢNG ĐIỀU PHỐI KANBAN 3 CỘT (Đồng bộ UI & Dữ liệu thật) ===== */ }
  <Card
    bordered={false}
    style={{ borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.03)', marginBottom: 16 }}
    styles={{ body: { padding: '16px 20px' } }}
  >
    <Row gutter={[16, 12]} align="middle" justify="space-between">
      <Col xs={24} md={12} lg={10}>
        <Input.Search
          placeholder="Tìm theo tên bé, khách hàng, SĐT, KTV..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          allowClear
          enterButton
          size="middle"
        />
      </Col>

      <Col xs={24} md={12} lg={14} style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
        <Segmented
          value={columnFilter}
          onChange={setColumnFilter}
          options={[
            { label: `Tất cả cột (${filteredBookings.length})`, value: 'all' },
            { label: `📥 Sắp đến (${confirmedList.length})`, value: 'confirmed' },
            { label: `✂️ Đang ở tiệm (${inHouseList.length})`, value: 'in_house' },
            { label: `🏠 Chờ đón về (${readyList.length})`, value: 'ready' },
          ]}
          size="middle"
        />
      </Col>
    </Row>
  </Card>

  {/* Bảng 3 Cột Kanban */ }
  <Row gutter={[16, 16]}>
    {/* --- CỘT 1: SẮP ĐẾN HÔM NAY (Confirmed) --- */}
    {(columnFilter === 'all' || columnFilter === 'confirmed') && (
      <Col xs={24} lg={columnFilter === 'all' ? 8 : 24}>
        <Card
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <ClockCircleOutlined style={{ color: '#0284c7' }} />
                <span style={{ color: '#0369a1', fontWeight: 700 }}>1. Sắp đến hôm nay</span>
              </Space>
              <Badge count={confirmedList.length} style={{ backgroundColor: '#0284c7' }} />
            </div>
          }
          styles={{ body: { background: '#f8fafc', minHeight: 480, padding: 12 } }}
          style={{ borderRadius: 14, borderColor: '#bae6fd' }}
        >
          {confirmedList.length === 0 ? (
            <Empty description="Không có lịch hẹn chờ tiếp nhận trong ngày này" style={{ marginTop: 60 }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {confirmedList.map((bk) => (
                <Card
                  key={bk.id}
                  size="small"
                  style={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <Tag color="blue" style={{ fontWeight: 600, margin: 0 }}>
                      ⏰ {dayjs(bk.start_at).format('HH:mm')} - {dayjs(bk.end_at).format('HH:mm')}
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 11 }}>#{bk.id}</Text>
                  </div>

                  {/* Thông tin bé cưng với PetAvatar đồng bộ */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <PetAvatar species={bk.pet_info?.species || 'dog'} size={38} />
                    <div>
                      <Text strong style={{ fontSize: 15, color: '#0f8b8d' }}>
                        {bk.pet_info?.name}
                      </Text>
                      <div>
                        <Tag color={bk.pet_info?.species === 'cat' ? 'orange' : 'cyan'} style={{ margin: 0, fontSize: 11 }}>
                          {bk.pet_info?.species === 'cat' ? '🐱 Mèo' : '🐶 Chó'}
                        </Tag>
                        {bk.pet_info?.breed && (
                          <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                            {bk.pet_info.breed}
                          </Text>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>
                    <UserOutlined style={{ marginRight: 6 }} />
                    Chủ nuôi: <strong>{bk.client_info?.full_name}</strong> · {bk.client_info?.phone}
                  </div>

                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                    ✨ Dịch vụ: <strong>{bk.package_info ? bk.package_info.name : bk.items?.map((i) => i.service?.name).join(', ') || 'Chăm sóc spa'}</strong>
                  </div>

                  {bk.staff_name ? (
                    <Tag icon={<UserOutlined />} color="cyan" style={{ marginBottom: 8 }}>
                      KTV: {bk.staff_name}
                    </Tag>
                  ) : (
                    <Tag color="default" style={{ marginBottom: 8 }}>Chưa gán KTV</Tag>
                  )}

                  {bk.customer_note && (
                    <div style={{ fontSize: 11, color: '#b45309', background: '#fffbeb', padding: '6px 10px', borderRadius: 6, marginBottom: 8 }}>
                      💬 Khách dặn: {bk.customer_note}
                    </div>
                  )}

                  <Divider style={{ margin: '8px 0' }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openDetail(bk.id)} style={{ padding: 0 }}>
                      Chi tiết
                    </Button>

                    <Button
                      type="primary"
                      size="small"
                      icon={<CheckCircleOutlined />}
                      style={{ background: '#0f8b8d', borderColor: '#0f8b8d', borderRadius: 6 }}
                      onClick={() => openCheckInModal(bk)}
                    >
                      Tiếp nhận (Check-in)
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>
      </Col>
    )}

    {/* --- CỘT 2: ĐANG TẠI SPA (In-House: Checked-in / In progress) --- */}
    {(columnFilter === 'all' || columnFilter === 'in_house') && (
      <Col xs={24} lg={columnFilter === 'all' ? 8 : 24}>
        <Card
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <ShopOutlined style={{ color: '#d97706' }} />
                <span style={{ color: '#b45309', fontWeight: 700 }}>2. Đang ở trong tiệm (In-House)</span>
              </Space>
              <Badge count={inHouseList.length} style={{ backgroundColor: '#d97706' }} />
            </div>
          }
          styles={{ body: { background: '#f8fafc', minHeight: 480, padding: 12 } }}
          style={{ borderRadius: 14, borderColor: '#fde68a' }}
        >
          {inHouseList.length === 0 ? (
            <Empty description="Hiện không có bé cưng nào đang ở tiệm" style={{ marginTop: 60 }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {inHouseList.map((bk) => {
                const isInProgress = bk.status === 'in_progress'

                return (
                  <Card
                    key={bk.id}
                    size="small"
                    style={{
                      borderRadius: 10,
                      border: '1px solid #fed7aa',
                      background: isInProgress ? '#fff' : '#fffbeb',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Tag color={isInProgress ? 'processing' : 'warning'} style={{ fontWeight: 600, margin: 0 }}>
                        {isInProgress ? '⚡ Đang thực hiện' : '⏳ Đã nhận thú'}
                      </Tag>
                      <Text type="secondary" style={{ fontSize: 11 }}>#{bk.id}</Text>
                    </div>

                    {/* Thông tin bé cưng với PetAvatar đồng bộ */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <PetAvatar species={bk.pet_info?.species || 'dog'} size={38} />
                      <div>
                        <Text strong style={{ fontSize: 15, color: '#0f8b8d' }}>
                          {bk.pet_info?.name}
                        </Text>
                        <div>
                          <Tag color={bk.pet_info?.species === 'cat' ? 'orange' : 'cyan'} style={{ margin: 0, fontSize: 11 }}>
                            {bk.pet_info?.species === 'cat' ? '🐱 Mèo' : '🐶 Chó'}
                          </Tag>
                        </div>
                      </div>
                    </div>

                    {/* Thông tin vị trí bàn/chuồng đang gán */}
                    <div style={{ fontSize: 12, color: '#0f8b8d', marginBottom: 6, background: '#f0fdfa', padding: '6px 10px', borderRadius: 6 }}>
                      🏷️ <strong>Vị trí: </strong>
                      {bk.items?.map((it) => it.resource?.name || 'Chưa gán bàn').filter(Boolean).join(', ') || 'Chưa gán bàn'}
                    </div>

                    <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>
                      👤 KTV: <strong>{bk.staff_name || 'Chưa phân công'}</strong>
                    </div>

                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                      ⏱️ Tiếp nhận lúc: {bk.checked_in_at ? dayjs(bk.checked_in_at).format('HH:mm') : 'Vừa xong'}
                    </div>

                    <Divider style={{ margin: '8px 0' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openDetail(bk.id)} style={{ padding: 0 }}>
                        Chi tiết
                      </Button>

                      <Space>
                        {!isInProgress ? (
                          canExecute ? (
                            <Button
                              type="primary"
                              size="small"
                              icon={<PlayCircleOutlined />}
                              onClick={() => handleStart(bk.id)}
                              loading={actionLoading}
                              style={{ background: '#0284c7', borderColor: '#0284c7', borderRadius: 6 }}
                            >
                              Bắt đầu làm
                            </Button>
                          ) : (
                            <Tooltip title="Kỹ thuật viên phụ trách hoặc Quản lý sẽ bấm bắt đầu khi vào dịch vụ">
                              <Button
                                type="dashed"
                                size="small"
                                icon={<PlayCircleOutlined />}
                                disabled
                                style={{ color: '#d97706', borderColor: '#fed7aa', borderRadius: 6 }}
                              >
                                Chờ KTV làm
                              </Button>
                            </Tooltip>
                          )
                        ) : (
                          canExecute ? (
                            <Button
                              type="primary"
                              size="small"
                              icon={<CheckCircleOutlined />}
                              style={{ background: '#10b981', borderColor: '#10b981', borderRadius: 6 }}
                              onClick={() => handleComplete(bk.id)}
                              loading={actionLoading}
                            >
                              Hoàn tất dịch vụ
                            </Button>
                          ) : (
                            <Tooltip title="Kỹ thuật viên phụ trách hoặc Quản lý sẽ bấm hoàn tất dịch vụ">
                              <Button
                                type="dashed"
                                size="small"
                                icon={<CheckCircleOutlined />}
                                disabled
                                style={{ color: '#059669', borderColor: '#a7f3d0', borderRadius: 6 }}
                              >
                                KTV đang làm...
                              </Button>
                            </Tooltip>
                          )
                        )}
                      </Space>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </Card>
      </Col>
    )}

    {/* --- CỘT 3: CHỜ ĐÓN VỀ (Completed / Ready for Pick-up) --- */}
    {(columnFilter === 'all' || columnFilter === 'ready') && (
      <Col xs={24} lg={columnFilter === 'all' ? 8 : 24}>
        <Card
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <LogoutOutlined style={{ color: '#10b981' }} />
                <span style={{ color: '#047857', fontWeight: 700 }}>3. Chờ đón về (Ready)</span>
              </Space>
              <Badge count={readyList.length} style={{ backgroundColor: '#10b981' }} />
            </div>
          }
          styles={{ body: { background: '#f8fafc', minHeight: 480, padding: 12 } }}
          style={{ borderRadius: 14, borderColor: '#a7f3d0' }}
        >
          {readyList.length === 0 ? (
            <Empty description="Không có bé nào đang chờ đón về" style={{ marginTop: 60 }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {readyList.map((bk) => {
                const isPaid = bk.invoice?.status === 'paid'

                return (
                  <Card
                    key={bk.id}
                    size="small"
                    style={{
                      borderRadius: 10,
                      border: '1px solid #bbf7d0',
                      background: '#f0fdf4',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Tag color="success" style={{ fontWeight: 600, margin: 0 }}>
                        ✓ Đã làm xong
                      </Tag>
                      {isPaid ? (
                        <Tag color="green" style={{ margin: 0 }}>Đã thanh toán</Tag>
                      ) : (
                        <Tag color="volcano" style={{ margin: 0 }}>Chưa thu tiền</Tag>
                      )}
                    </div>

                    {/* Thông tin bé cưng với PetAvatar đồng bộ */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <PetAvatar species={bk.pet_info?.species || 'dog'} size={38} />
                      <div>
                        <Text strong style={{ fontSize: 15, color: '#0f8b8d' }}>
                          {bk.pet_info?.name}
                        </Text>
                        <div>
                          <Tag color={bk.pet_info?.species === 'cat' ? 'orange' : 'cyan'} style={{ margin: 0, fontSize: 11 }}>
                            {bk.pet_info?.species === 'cat' ? '🐱 Mèo' : '🐶 Chó'}
                          </Tag>
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>
                      <PhoneOutlined style={{ marginRight: 6 }} />
                      Liên hệ chủ: <strong>{bk.client_info?.full_name}</strong> · {bk.client_info?.phone}
                    </div>

                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                      💰 Chi phí: <strong>{money(bk.total_price || bk.total_estimate || 0)}</strong>
                    </div>

                    <Divider style={{ margin: '8px 0' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <Button
                        size="small"
                        icon={<DollarOutlined />}
                        onClick={() => nav(`/app/hoa-don?booking_id=${bk.id}`)}
                        style={{ borderRadius: 6 }}
                      >
                        {isPaid ? 'Xem HĐ' : 'Lập/Thu HĐ'}
                      </Button>

                      <Button
                        type="primary"
                        size="small"
                        icon={<LogoutOutlined />}
                        style={{ background: '#0f8b8d', borderColor: '#0f8b8d', borderRadius: 6 }}
                        onClick={() => handleCheckOut(bk)}
                      >
                        Trả thú (Check-out)
                      </Button>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </Card>
      </Col>
    )}
  </Row>

  {/* ===== 5. MODAL CHECK-IN TIẾP NHẬN THÚ (GÁN TÀI NGUYÊN VẬT LÝ) ===== */ }
  <Modal
    centered
    title={
      <Space>
        <CheckCircleOutlined style={{ color: '#0f8b8d' }} />
        <span>Tiếp nhận bé {checkInTarget?.pet_info?.name || ''} vào tiệm (Check-in)</span>
      </Space>
    }
    open={checkInModalOpen}
    onCancel={() => setCheckInModalOpen(false)}
    onOk={submitCheckIn}
    okText="Xác nhận tiếp nhận"
    okButtonProps={{ style: { background: '#0f8b8d', borderColor: '#0f8b8d' }, loading: actionLoading }}
    cancelText="Đóng"
    width={560}
  >
    <Paragraph>
      Vui lòng chọn vị trí bàn grooming hoặc chuồng sấy để phục vụ cho từng dịch vụ của bé:
    </Paragraph>

    {checkInTarget?.items?.map((item) => {
      const meta = RESOURCE_TYPE_INFO[item.resource_type] || { label: item.resource_type, icon: '🏷️' }
      const availableForType = (occupancyData?.resources || []).filter(
        (r) => r.resource_type === item.resource_type && r.is_active
      )

      return (
        <Card key={item.id} size="small" style={{ marginBottom: 12, borderRadius: 8, background: '#f8fafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text strong>{meta.icon} {item.service?.name}</Text>
            <Tag color="cyan">{meta.label}</Tag>
          </div>

          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Chọn vị trí làm việc / chuồng sấy trống:
            </Text>
            <Select
              style={{ width: '100%' }}
              placeholder="Chọn vị trí cụ thể"
              value={resourceAssignments[item.id]}
              onChange={(val) => setResourceAssignments((prev) => ({ ...prev, [item.id]: val }))}
              options={availableForType.map((r) => ({
                value: r.id,
                label: `${r.name} ${r.is_occupied ? '(⚠️ Đang có thú)' : '(✓ Trống)'}`,
              }))}
            />
          </div>
        </Card>
      )
    })}

    <div style={{ marginTop: 12 }}>
      <Text strong style={{ fontSize: 12 }}>Ghi chú tiếp nhận (nếu có vật dụng mang theo):</Text>
      <Input.TextArea
        rows={2}
        value={checkInNote}
        onChange={(e) => setCheckInNote(e.target.value)}
        placeholder="Ví dụ: Mang theo dây dắt màu đỏ, dặn dò của khách..."
        style={{ marginTop: 6 }}
      />
    </div>
  </Modal>

  {/* ===== 6. DRAWER CHI TIẾT LỊCH HẸN ===== */ }
  <Drawer
    title={`Chi tiết lịch hẹn #${detailBooking?.id}`}
    placement="right"
    width={480}
    open={detailOpen}
    onClose={() => setDetailOpen(false)}
  >
    {detailBooking && (
      <div>
        <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Bé cưng">
            <strong>{detailBooking.pet_info?.name}</strong> ({detailBooking.pet_info?.species === 'dog' ? 'Chó' : 'Mèo'} - {detailBooking.pet_info?.breed || 'Chưa rõ giống'})
          </Descriptions.Item>
          <Descriptions.Item label="Chủ nuôi">
            {detailBooking.client_info?.full_name} ({detailBooking.client_info?.phone})
          </Descriptions.Item>
          <Descriptions.Item label="Thời gian hẹn">
            {dayjs(detailBooking.start_at).format('DD/MM/YYYY HH:mm')} - {dayjs(detailBooking.end_at).format('HH:mm')}
          </Descriptions.Item>
          <Descriptions.Item label="Kỹ thuật viên">
            {detailBooking.staff_name || 'Chưa gán KTV'}
          </Descriptions.Item>
          <Descriptions.Item label="Gói / Dịch vụ">
            {detailBooking.package_info ? detailBooking.package_info.name : detailBooking.items?.map((i) => i.service?.name).join(', ')}
          </Descriptions.Item>
          <Descriptions.Item label="Chi phí dự tính">
            <Text strong style={{ color: '#0f8b8d', fontSize: 15 }}>
              {money(detailBooking.total_price || detailBooking.total_estimate || 0)}
            </Text>
          </Descriptions.Item>
        </Descriptions>

        {detailBooking.status_logs && detailBooking.status_logs.length > 0 && (
          <div>
            <Title level={5} style={{ fontSize: 14 }}>Nhật ký trạng thái:</Title>
            <Timeline
              items={detailBooking.status_logs.map((log) => ({
                color: '#0f8b8d',
                children: (
                  <div style={{ fontSize: 12 }}>
                    <strong>{log.to_status}</strong> · {dayjs(log.created_at).format('HH:mm DD/MM')}
                    {log.reason && <div>{log.reason}</div>}
                  </div>
                ),
              }))}
            />
          </div>
        )}
      </div>
    )}
  </Drawer>
    </div >
  )
}
