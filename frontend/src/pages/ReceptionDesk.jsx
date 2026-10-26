import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Card, Row, Col, Typography, Button, Tag, Space, DatePicker,
  Badge, Modal, Select, message, Spin, Statistic, Empty, Progress,
  Divider, Tooltip, Drawer, Timeline, Form, Input, Descriptions, Alert
} from 'antd'
import {
  DesktopOutlined, CheckCircleOutlined, PlayCircleOutlined, LogoutOutlined,
  ClockCircleOutlined, UserOutlined, PhoneOutlined, AlertOutlined,
  DollarOutlined, ReloadOutlined, PlusOutlined, EyeOutlined,
  AppstoreOutlined, SwapOutlined, ToolOutlined, ShopOutlined, QrcodeOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import { api, unwrap } from '../api.js'

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

  // Phân nhóm lịch hẹn theo 3 cột Kanban
  const confirmedList = useMemo(() => {
    return bookings.filter((b) => b.status === 'confirmed')
  }, [bookings])

  const inHouseList = useMemo(() => {
    return bookings.filter((b) => ['checked_in', 'in_progress'].includes(b.status))
  }, [bookings])

  const readyList = useMemo(() => {
    return bookings.filter((b) => b.status === 'completed' && !b.checked_out_at)
  }, [bookings])

  const checkedOutList = useMemo(() => {
    return bookings.filter((b) => b.status === 'completed' && b.checked_out_at)
  }, [bookings])

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
      message.success('Dịch vụ hoàn tất! Lịch đã chuyển sang cột Chờ đón về và tự động tạo hóa đơn.')
      loadData()
    } catch (e) {
      message.error(e.message || 'Không thể hoàn tất dịch vụ')
    } finally {
      setActionLoading(false)
    }
  }

  // Check-out trả thú
  const handleCheckOut = (bk) => {
    const isPaid = bk.invoice?.status === 'paid'

    Modal.confirm({
      title: `Xác nhận trả bé ${bk.pet_info?.name || 'cưng'} cho chủ?`,
      icon: <LogoutOutlined style={{ color: '#0f8b8d' }} />,
      content: (
        <div>
          <Paragraph>Bé đã được làm xong dịch vụ và sẵn sàng trao trả lại cho chủ nuôi.</Paragraph>
          {!isPaid && (
            <Alert
              type="warning"
              showIcon
              message="Chưa thu tiền!"
              description={`Hóa đơn của bé này hiện chưa thanh toán (${Number(bk.total_estimate || 0).toLocaleString()} đ). Hãy thu ngân trước hoặc ghi nhận trả thú.`}
              style={{ marginBottom: 12 }}
            />
          )}
        </div>
      ),
      okText: 'Xác nhận trả thú',
      okButtonProps: { style: { background: '#0f8b8d' } },
      cancelText: 'Đóng',
      onOk: async () => {
        try {
          await api(`/bookings/${bk.id}/check-out`, { method: 'POST' })
          message.success(`Đã hoàn tất trả bé ${bk.pet_info?.name || 'cưng'} cho chủ!`)
          loadData()
        } catch (e) {
          message.error(e.message || 'Không thể check-out trả thú')
        }
      },
    })
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
    <div>
      {/* ===== HEADER TIÊU ĐỀ & THANH CÔNG CỤ ===== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            🐾 Bảng Lễ Tân & Điều Phối Vận Hành
          </Title>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            Tiếp nhận thú, kiểm soát công suất bàn grooming / chuồng sấy và trả thú theo thời gian thực (SPA-15, SPA-16, SPA-17)
          </Paragraph>
        </div>

        <Space wrap>
          <DatePicker
            value={selectedDate}
            onChange={(d) => d && setSelectedDate(d)}
            format="DD/MM/YYYY"
            allowClear={false}
            style={{ width: 140 }}
          />

          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
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

      {/* Cảnh báo khách vãng lai đang chờ tại sảnh (SPA-18) */}
      {walkInSummary?.waiting > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<QrcodeOutlined />}
          style={{ marginBottom: 16, borderRadius: 12 }}
          message={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span>
                📢 <strong>Hàng đợi vãng lai:</strong> Đang có <strong>{walkInSummary.waiting}</strong> khách chờ tại sảnh
                {walkInSummary.next_waiting && ` (Số tiếp theo: #${String(walkInSummary.next_waiting).padStart(2, '0')})`}
                . Ước tính chờ ~{walkInSummary.average_wait_minutes} phút.
              </span>
              <Button
                size="small"
                type="primary"
                onClick={() => nav('/app/hang-doi-walk-in')}
                style={{ background: '#d97706', borderColor: '#d97706' }}
              >
                Mở hàng đợi gọi số
              </Button>
            </div>
          }
        />
      )}

      {/* ===== CÁC THẺ THỐNG KÊ NHANH ===== */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6} lg={4}>
          <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #0284c7' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>📥 Sắp đến hôm nay</Text>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0284c7' }}>
              {confirmedList.length} <span style={{ fontSize: 13, fontWeight: 400, color: '#64748b' }}>lịch</span>
            </div>
          </Card>
        </Col>

        <Col xs={12} sm={6} lg={4}>
          <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #d97706' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>✂️ Đang tại Spa</Text>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#d97706' }}>
              {inHouseList.length} <span style={{ fontSize: 13, fontWeight: 400, color: '#64748b' }}>bé</span>
            </div>
          </Card>
        </Col>

        <Col xs={12} sm={6} lg={4}>
          <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #10b981' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>🏠 Chờ đón về</Text>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#10b981' }}>
              {readyList.length} <span style={{ fontSize: 13, fontWeight: 400, color: '#64748b' }}>bé</span>
            </div>
          </Card>
        </Col>

        <Col xs={12} sm={6} lg={4}>
          <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #64748b' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>🚪 Đã trả về</Text>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#64748b' }}>
              {checkedOutList.length} <span style={{ fontSize: 13, fontWeight: 400, color: '#64748b' }}>bé</span>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #0f8b8d' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>📊 Tải công suất vị trí spa (SPA-16)</Text>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0f8b8d' }}>
                  {summary.occupied}/{summary.total} chỗ đang dùng ({summary.rate}%)
                </div>
              </div>
              <Progress
                type="circle"
                percent={summary.rate}
                size={40}
                strokeColor="#0f8b8d"
              />
            </div>
          </Card>
        </Col>
      </Row>

      {/* ===== SƠ ĐỒ VỊ TRÍ BÀN GROOMING / CHUỒNG SẤY (SPA-16, SPA-17) ===== */}
      {showResourceGrid && (
        <Card
          title={
            <Space>
              <ToolOutlined style={{ color: '#0f8b8d' }} />
              <span>Sơ đồ hiện trạng vị trí làm việc & Chuồng sấy (SPA-17)</span>
            </Space>
          }
          size="small"
          style={{ borderRadius: 16, marginBottom: 24, background: '#fafafa' }}
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
              {/* Thống kê công suất theo từng nhóm tài nguyên (SPA-16) */}
              <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                {Object.entries(summary.by_type || {}).map(([key, item]) => {
                  const meta = RESOURCE_TYPE_INFO[key] || { label: key, icon: '🏷️' }
                  return (
                    <Col xs={12} sm={6} key={key}>
                      <div style={{ background: '#fff', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                          <span>{meta.icon} <strong>{meta.label}</strong></span>
                          <span>{item.occupied}/{item.total}</span>
                        </div>
                        <Progress percent={item.rate} size="small" strokeColor={item.rate >= 100 ? '#ef4444' : '#0f8b8d'} />
                      </div>
                    </Col>
                  )
                })}
              </Row>

              {/* Lưới các ô vị trí vật lý cụ thể (SPA-17) */}
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
                          borderColor: isOcc ? '#f59e0b' : '#10b981',
                          background: isOcc ? '#fffbeb' : '#f0fdf4',
                          height: '100%',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <Space size="small">
                            <span style={{ fontSize: 16 }}>{meta.icon}</span>
                            <Text strong style={{ fontSize: 13 }}>{r.name}</Text>
                          </Space>
                          <Tag color={isOcc ? 'warning' : 'success'} style={{ margin: 0 }}>
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
      )}

      {/* ===== BẢNG ĐIỀU PHỐI KANBAN 3 CỘT (SPA-15) ===== */}
      <Row gutter={[16, 16]}>
        {/* --- CỘT 1: SẮP ĐẾN (Confirmed) --- */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <ClockCircleOutlined style={{ color: '#0284c7' }} />
                  <span style={{ color: '#0369a1' }}>1. Sắp đến hôm nay</span>
                </Space>
                <Badge count={confirmedList.length} style={{ backgroundColor: '#0284c7' }} />
              </div>
            }
            bodyStyle={{ background: '#f8fafc', minHeight: 480, padding: 12 }}
            style={{ borderRadius: 16, borderColor: '#bae6fd' }}
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <Tag color="blue" style={{ fontWeight: 600 }}>
                        ⏰ {dayjs(bk.start_at).format('HH:mm')} - {dayjs(bk.end_at).format('HH:mm')}
                      </Tag>
                      <Text type="secondary" style={{ fontSize: 11 }}>#{bk.id}</Text>
                    </div>

                    <div style={{ marginBottom: 6 }}>
                      <Text strong style={{ fontSize: 15, color: '#0f8b8d' }}>
                        🐾 {bk.pet_info?.name}
                      </Text>{' '}
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        ({bk.pet_info?.species === 'dog' ? 'Chó' : 'Mèo'} - {bk.pet_info?.breed || 'Chưa rõ giống'})
                      </Text>
                    </div>

                    <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>
                      <UserOutlined style={{ marginRight: 4 }} />
                      Chủ nuôi: <strong>{bk.client_info?.full_name}</strong> · {bk.client_info?.phone}
                    </div>

                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                      ✨ Dịch vụ: <strong>{bk.package_info ? bk.package_info.name : bk.items?.map((i) => i.service?.name).join(', ')}</strong>
                    </div>

                    {bk.staff_name ? (
                      <Tag icon={<UserOutlined />} color="cyan" style={{ marginBottom: 8 }}>
                        KTV: {bk.staff_name}
                      </Tag>
                    ) : (
                      <Tag color="default" style={{ marginBottom: 8 }}>Chưa gán KTV</Tag>
                    )}

                    {bk.customer_note && (
                      <div style={{ fontSize: 11, color: '#b45309', background: '#fffbeb', padding: '4px 8px', borderRadius: 6, marginBottom: 8 }}>
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
                        style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
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

        {/* --- CỘT 2: ĐANG TẠI SPA (In-House: Checked-in / In progress) --- */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <ShopOutlined style={{ color: '#d97706' }} />
                  <span style={{ color: '#b45309' }}>2. Đang ở trong tiệm (In-House)</span>
                </Space>
                <Badge count={inHouseList.length} style={{ backgroundColor: '#d97706' }} />
              </div>
            }
            bodyStyle={{ background: '#f8fafc', minHeight: 480, padding: 12 }}
            style={{ borderRadius: 16, borderColor: '#fde68a' }}
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <Tag color={isInProgress ? 'processing' : 'warning'} style={{ fontWeight: 600 }}>
                          {isInProgress ? '⚡ Đang thực hiện' : '⏳ Đã nhận thú'}
                        </Tag>
                        <Text type="secondary" style={{ fontSize: 11 }}>#{bk.id}</Text>
                      </div>

                      <div style={{ marginBottom: 6 }}>
                        <Text strong style={{ fontSize: 15, color: '#0f8b8d' }}>
                          🐾 {bk.pet_info?.name}
                        </Text>{' '}
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          ({bk.pet_info?.species === 'dog' ? 'Chó' : 'Mèo'})
                        </Text>
                      </div>

                      {/* Thông tin vị trí bàn/chuồng đang gán (SPA-17) */}
                      <div style={{ fontSize: 12, color: '#0f8b8d', marginBottom: 4, background: '#f0fdfa', padding: '4px 8px', borderRadius: 6 }}>
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
                                  style={{ color: '#d97706', borderColor: '#fed7aa' }}
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
                                style={{ background: '#10b981', borderColor: '#10b981' }}
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
                                  style={{ color: '#059669', borderColor: '#a7f3d0' }}
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

        {/* --- CỘT 3: CHỜ ĐÓN VỀ (Completed / Ready for Pick-up) --- */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <LogoutOutlined style={{ color: '#10b981' }} />
                  <span style={{ color: '#047857' }}>3. Chờ đón về (Ready)</span>
                </Space>
                <Badge count={readyList.length} style={{ backgroundColor: '#10b981' }} />
              </div>
            }
            bodyStyle={{ background: '#f8fafc', minHeight: 480, padding: 12 }}
            style={{ borderRadius: 16, borderColor: '#a7f3d0' }}
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <Tag color="success" style={{ fontWeight: 600 }}>
                          ✓ Đã làm xong
                        </Tag>
                        {isPaid ? (
                          <Tag color="green">Đã thanh toán</Tag>
                        ) : (
                          <Tag color="volcano">Chưa thu tiền</Tag>
                        )}
                      </div>

                      <div style={{ marginBottom: 6 }}>
                        <Text strong style={{ fontSize: 15, color: '#0f8b8d' }}>
                          🐾 {bk.pet_info?.name}
                        </Text>{' '}
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          ({bk.pet_info?.species === 'dog' ? 'Chó' : 'Mèo'})
                        </Text>
                      </div>

                      <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>
                        <PhoneOutlined style={{ marginRight: 4 }} />
                        Liên hệ chủ: <strong>{bk.client_info?.full_name}</strong> · {bk.client_info?.phone}
                      </div>

                      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                        💰 Chi phí: <strong>{Number(bk.total_estimate || 0).toLocaleString()} đ</strong>
                      </div>

                      <Divider style={{ margin: '8px 0' }} />

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <Button
                          size="small"
                          icon={<DollarOutlined />}
                          onClick={() => nav(`/app/hoa-don?booking_id=${bk.id}`)}
                        >
                          {isPaid ? 'Xem HĐ' : 'Lập/Thu HĐ'}
                        </Button>

                        <Button
                          type="primary"
                          size="small"
                          icon={<LogoutOutlined />}
                          style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
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
      </Row>

      {/* ===== MODAL CHECK-IN TIẾP NHẬN THÚ (GÁN TÀI NGUYÊN VẬT LÝ) ===== */}
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
                  Chọn vị trí làm việc / chuồng sấy trống (SPA-17):
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

      {/* ===== DRAWER CHI TIẾT LỊCH HẸN ===== */}
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
                <strong>{detailBooking.pet_info?.name}</strong> ({detailBooking.pet_info?.species === 'dog' ? 'Chó' : 'Mèo'} - {detailBooking.pet_info?.breed})
              </Descriptions.Item>
              <Descriptions.Item label="Chủ nuôi">
                {detailBooking.client_info?.full_name} ({detailBooking.client_info?.phone})
              </Descriptions.Item>
              <Descriptions.Item label="Thời gian hẹn">
                {dayjs(detailBooking.start_at).format('DD/MM/YYYY HH:mm')} - {dayjs(detailBooking.end_at).format('HH:mm')}
              </Descriptions.Item>
              <Descriptions.Item label="Kỹ thuật viên">
                {detailBooking.staff_name || 'Chưa gán'}
              </Descriptions.Item>
              <Descriptions.Item label="Gói / Dịch vụ">
                {detailBooking.package_info ? detailBooking.package_info.name : detailBooking.items?.map((i) => i.service?.name).join(', ')}
              </Descriptions.Item>
              <Descriptions.Item label="Chi phí dự tính">
                <strong>{Number(detailBooking.total_estimate || 0).toLocaleString()} đ</strong>
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
    </div>
  )
}
