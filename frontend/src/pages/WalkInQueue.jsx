import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Card, Row, Col, Typography, Button, Tag, Space, Table,
  Badge, Modal, Form, Input, Select, Statistic, Popconfirm,
  Divider, Alert, Empty, message, Tooltip, Tabs, Segmented,
  DatePicker, Radio, Avatar
} from 'antd'
import {
  SoundOutlined, CheckCircleOutlined, CloseCircleOutlined,
  PlusOutlined, ReloadOutlined, UserOutlined, PhoneOutlined,
  ClockCircleOutlined, DesktopOutlined, SwapOutlined,
  EyeOutlined, AppstoreOutlined, QrcodeOutlined, SearchOutlined,
  FieldTimeOutlined, IdcardOutlined, CalendarOutlined, CheckOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { api, unwrap, money } from '../api.js'
import { useAuth } from '../auth.jsx'
import RowPerPageSelect from '../components/RowPerPageSelect.jsx'
import PetAvatar from '../components/PetAvatar.jsx'

const { Title, Text, Paragraph } = Typography

const STATUS_TAGS = {
  waiting: { label: 'Đang chờ', color: 'gold', icon: '⏳' },
  called: { label: 'Đang gọi vào', color: 'processing', icon: '📢' },
  served: { label: 'Đã tiếp nhận', color: 'success', icon: '✓' },
  left: { label: 'Đã rời đi / Hủy', color: 'default', icon: '✕' },
}

const RESOURCE_TYPE_INFO = {
  grooming_table: { label: 'Bàn cắt Grooming', icon: '✂️' },
  bath_tub: { label: 'Bồn tắm spa', icon: '🛁' },
  drying_cage: { label: 'Chuồng sấy', icon: '💨' },
  spa_room: { label: 'Phòng Spa mèo', icon: '🐱' },
}

export default function WalkInQueue() {
  const { user } = useAuth()
  const nav = useNavigate()
  const isFrontDesk = ['receptionist', 'manager'].includes(user?.role)

  const [loading, setLoading] = useState(false)
  const [data, setData] = useState({ summary: {}, results: [] })
  const [activeTab, setActiveTab] = useState('list') // 'list' | 'kiosk'

  // Bộ lọc
  const [statusFilter, setStatusFilter] = useState('')
  const [searchText, setSearchText] = useState('')
  const [selectedDate, setSelectedDate] = useState(dayjs())
  const [dateMode, setDateMode] = useState('today') // 'today' | 'custom' | 'all'

  // Phân trang
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Dữ liệu hỗ trợ tạo vé & tiếp nhận từ các trang khác
  const [clients, setClients] = useState([])
  const [services, setServices] = useState([])
  const [packages, setPackages] = useState([])
  const [resources, setResources] = useState([])
  const [staffList, setStaffList] = useState([])

  // Modal Lấy số thứ tự mới
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [customerMode, setCustomerMode] = useState('existing') // 'existing' | 'new'
  const [selectedClientPets, setSelectedClientPets] = useState([])
  const [createForm] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  // Modal Tiếp nhận vào bàn (Convert to Booking & Check-in)
  const [convertModalOpen, setConvertModalOpen] = useState(false)
  const [convertTarget, setConvertTarget] = useState(null)
  const [selectedStaff, setSelectedStaff] = useState(null)
  const [selectedResource, setSelectedResource] = useState(null)
  const [converting, setConverting] = useState(false)

  // Modal Chi tiết phiếu vừa tạo
  const [ticketResult, setTicketResult] = useState(null)
  const [resultModalOpen, setResultModalOpen] = useState(false)

  // Tải danh sách hàng đợi theo ngày & trạng thái
  const loadQueue = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateMode === 'all') {
        params.append('date', 'all')
      } else if (selectedDate) {
        params.append('date', selectedDate.format('YYYY-MM-DD'))
      }
      if (statusFilter) params.append('status', statusFilter)
      if (searchText) params.append('q', searchText)

      const res = await api(`/walk-ins?${params.toString()}`)
      setData(res || { summary: {}, results: [] })
    } catch (e) {
      message.error(e.message || 'Không thể tải danh sách hàng đợi')
    } finally {
      setLoading(false)
    }
  }, [dateMode, selectedDate, statusFilter, searchText])

  // Tải dữ liệu ban đầu từ các nguồn dữ liệu thật khác
  useEffect(() => {
    loadQueue()
  }, [loadQueue])

  useEffect(() => {
    Promise.all([
      api('/clients').catch(() => []),
      api('/services').catch(() => []),
      api('/packages').catch(() => []),
      api('/resources').catch(() => []),
      api('/staff').catch(() => []),
    ]).then(([c, s, p, r, st]) => {
      setClients(unwrap(c))
      setServices(unwrap(s))
      setPackages(unwrap(p))
      setResources(unwrap(r))
      setStaffList(unwrap(st))
    })
  }, [])

  // Xử lý khi chọn khách hàng có sẵn trong Modal Cấp số
  const handleClientSelect = (clientId) => {
    const client = clients.find((c) => c.id === clientId)
    if (client) {
      createForm.setFieldsValue({
        contact_name: client.full_name,
        phone: client.phone,
      })
      const pets = client.pets || []
      setSelectedClientPets(pets)
      if (pets.length > 0) {
        createForm.setFieldsValue({
          pet_id: pets[0].id,
          pet_name: pets[0].name,
          pet_species: pets[0].species || 'dog',
        })
      } else {
        createForm.setFieldsValue({
          pet_id: null,
          pet_name: '',
          pet_species: 'dog',
        })
      }
    } else {
      setSelectedClientPets([])
    }
  }

  // Xử lý khi chọn thú cưng của khách hàng có sẵn
  const handlePetSelect = (petId) => {
    const pet = selectedClientPets.find((p) => p.id === petId)
    if (pet) {
      createForm.setFieldsValue({
        pet_name: pet.name,
        pet_species: pet.species || 'dog',
      })
    }
  }

  // 1. Cấp số thứ tự mới
  const handleCreateTicket = async (values) => {
    setSubmitting(true)
    try {
      const payload = {
        contact_name: values.contact_name,
        phone: values.phone || '',
        pet_name: values.pet_name,
        pet_species: values.pet_species || 'dog',
        note: values.note || '',
      }

      if (customerMode === 'existing' && values.client_id) {
        payload.client = values.client_id
        if (values.pet_id) {
          payload.pet = values.pet_id
        }
      }

      if (values.item_type === 'package') {
        payload.package = values.package
      } else if (values.service) {
        payload.service = values.service
      }

      const res = await api('/walk-ins', { method: 'POST', body: JSON.stringify(payload) })
      message.success(`Đã cấp số thứ tự ${res.queue_code} cho bé ${res.pet_name}!`)
      setCreateModalOpen(false)
      createForm.resetFields()
      setSelectedClientPets([])
      setTicketResult(res)
      setResultModalOpen(true)
      loadQueue()
    } catch (e) {
      message.error(e.message || 'Không thể cấp số thứ tự')
    } finally {
      setSubmitting(false)
    }
  }

  // 2. Gọi số thứ tự (waiting -> called)
  const handleCall = async (id, queueCode, petName) => {
    try {
      await api(`/walk-ins/${id}/call`, { method: 'POST' })
      message.success(`Đang gọi số ${queueCode} (Bé ${petName}) vào tiếp nhận!`)
      loadQueue()
    } catch (e) {
      message.error(e.message || 'Không thể gọi số')
    }
  }

  // 3. Mở Modal chuyển đổi & Tiếp nhận vào bàn
  const openConvertModal = (ticket) => {
    setConvertTarget(ticket)
    setSelectedStaff(null)
    setSelectedResource(null)
    setConvertModalOpen(true)
  }

  // 4. Thực hiện Chuyển đổi thành Booking & Check-in
  const submitConvert = async () => {
    if (!convertTarget) return
    setConverting(true)
    try {
      const payload = {}
      if (selectedStaff) payload.staff = selectedStaff
      if (selectedResource) payload.resources = { 1: selectedResource }

      await api(`/walk-ins/${convertTarget.id}/convert`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      message.success(`Đã tiếp nhận bé ${convertTarget.pet_name} (${convertTarget.queue_code}) vào tiệm thành công!`)
      setConvertModalOpen(false)
      loadQueue()
    } catch (e) {
      message.error(e.message || 'Lỗi khi tiếp nhận vào làm')
    } finally {
      setConverting(false)
    }
  }

  // 5. Đánh dấu khách rời đi / hủy chờ
  const handleLeave = async (id, reason) => {
    try {
      await api(`/walk-ins/${id}/leave`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason || 'Khách rời đi' }),
      })
      message.info('Đã cập nhật trạng thái khách rời đi')
      loadQueue()
    } catch (e) {
      message.error(e.message || 'Không thể cập nhật')
    }
  }

  const summary = data?.summary || {}

  // Đếm theo trạng thái để hiển thị trên các nút Segmented/Pill
  const statusCounts = useMemo(() => {
    return {
      all: summary.total || 0,
      waiting: summary.waiting || 0,
      called: summary.called || 0,
      served: summary.served || 0,
      left: summary.left || 0,
    }
  }, [summary])

  // Cột bảng dữ liệu chuẩn hóa đồng bộ với các trang khác
  const columns = [
    {
      title: 'Số TT',
      dataIndex: 'queue_code',
      key: 'queue_code',
      width: 100,
      align: 'center',
      render: (code, r) => (
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 10px',
              borderRadius: 8,
              fontWeight: 800,
              fontSize: 15,
              background:
                r.status === 'called'
                  ? '#e0f2fe'
                  : r.status === 'waiting'
                  ? '#fef3c7'
                  : r.status === 'served'
                  ? '#dcfce7'
                  : '#f1f5f9',
              color:
                r.status === 'called'
                  ? '#0284c7'
                  : r.status === 'waiting'
                  ? '#d97706'
                  : r.status === 'served'
                  ? '#16a34a'
                  : '#64748b',
              border: `1px solid ${
                r.status === 'called'
                  ? '#bae6fd'
                  : r.status === 'waiting'
                  ? '#fde68a'
                  : r.status === 'served'
                  ? '#bbf7d0'
                  : '#e2e8f0'
              }`,
            }}
          >
            {code}
          </div>
        </div>
      ),
    },
    {
      title: 'Bé cưng',
      key: 'pet',
      width: 220,
      render: (_, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PetAvatar
            species={r.pet_species || 'dog'}
            size={40}
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#134e4a' }}>
              {r.pet_name}
            </div>
            <Space size={4} style={{ marginTop: 2 }}>
              <Tag color={r.pet_species === 'cat' ? 'orange' : 'cyan'} style={{ margin: 0, fontSize: 11 }}>
                {r.pet_species === 'cat' ? '🐱 Mèo' : '🐶 Chó'}
              </Tag>
              {r.pet_breed && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {r.pet_breed}
                </Text>
              )}
              {r.pet_size_class && (
                <Tag color="default" style={{ margin: 0, fontSize: 10 }}>
                  Size {r.pet_size_class}
                </Tag>
              )}
            </Space>
          </div>
        </div>
      ),
    },
    {
      title: 'Khách hàng',
      key: 'customer',
      width: 200,
      render: (_, r) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Avatar size={20} icon={<UserOutlined />} style={{ backgroundColor: '#0f8b8d' }} />
            <Text strong style={{ fontSize: 13, color: '#0f172a' }}>{r.contact_name}</Text>
            {r.client && (
              <Tag color="cyan" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', margin: 0, borderRadius: 4 }}>
                Khách quen
              </Tag>
            )}
          </div>
          {r.phone && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, paddingLeft: 26 }}>
              <span>📞 {r.phone}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Dịch vụ yêu cầu',
      key: 'service',
      width: 200,
      render: (_, r) => (
        <div>
          {r.package_name ? (
            <div>
              <Tag color="purple" style={{ margin: 0, fontWeight: 600 }}>Combo: {r.package_name}</Tag>
            </div>
          ) : r.service_name ? (
            <div>
              <Tag color="blue" style={{ margin: 0 }}>{r.service_name}</Tag>
            </div>
          ) : (
            <Text type="secondary" style={{ fontStyle: 'italic', fontSize: 12 }}>Tắm cơ bản</Text>
          )}

          {r.note && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>📝</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }} title={r.note}>
                {r.note}
              </span>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Thời gian chờ',
      key: 'wait_time',
      width: 150,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0f8b8d', fontSize: 13 }}>
            ~{r.estimated_wait_minutes} phút
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            Vào lúc: {dayjs(r.created_at).format('HH:mm')}
          </div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (st) => {
        const meta = STATUS_TAGS[st] || { label: st, color: 'default', icon: '' }
        return (
          <Tag color={meta.color} style={{ borderRadius: 6, fontWeight: 600, padding: '2px 8px' }}>
            {meta.icon} {meta.label}
          </Tag>
        )
      },
    },
    {
      title: 'Thao tác điều phối',
      key: 'actions',
      width: 260,
      render: (_, r) => (
        <Space size={6} wrap>
          {r.status === 'waiting' && (
            <Button
              type="primary"
              size="small"
              icon={<SoundOutlined />}
              style={{ background: '#0284c7', borderColor: '#0284c7', borderRadius: 6 }}
              onClick={() => handleCall(r.id, r.queue_code, r.pet_name)}
            >
              Gọi số
            </Button>
          )}

          {['waiting', 'called'].includes(r.status) && (
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              style={{ background: '#0f8b8d', borderColor: '#0f8b8d', borderRadius: 6 }}
              onClick={() => openConvertModal(r)}
            >
              Tiếp nhận vào làm
            </Button>
          )}

          {['waiting', 'called'].includes(r.status) && (
            <Popconfirm
              title="Khách không còn chờ hoặc đã rời đi?"
              okText="Xác nhận"
              cancelText="Hủy"
              onConfirm={() => handleLeave(r.id, 'Khách rời đi')}
            >
              <Button size="small" type="text" danger icon={<CloseCircleOutlined />} style={{ borderRadius: 6 }}>
                Rời đi
              </Button>
            </Popconfirm>
          )}

          {r.status === 'served' && (
            <Button
              size="small"
              type="link"
              icon={<EyeOutlined />}
              onClick={() => {
                if (r.booking_id) {
                  nav(`/app/lich-hen?id=${r.booking_id}`)
                } else {
                  nav('/app/bang-le-tan')
                }
              }}
              style={{ padding: 0 }}
            >
              Xem lịch hẹn #{r.booking_id || ''}
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* ===== 1. HEADER TIÊU ĐỀ & THANH CÔNG CỤ (Chuẩn đồng bộ UI) ===== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Hàng Đợi Khách Vãng Lai Tại Quầy (Walk-in)
          </Title>
          <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            Cấp số thứ tự, ước tính thời gian chờ tự động và điều phối khách không đặt lịch trước vào bàn phục vụ
          </Paragraph>
        </div>

        <Space wrap align="center" size={10}>
          <Button icon={<ReloadOutlined spin={loading} />} onClick={loadQueue} loading={loading}>
            Làm mới
          </Button>

          <Button icon={<DesktopOutlined />} onClick={() => nav('/app/bang-le-tan')}>
            Bảng Lễ Tân Điều Phối
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
            onClick={() => {
              createForm.resetFields()
              setSelectedClientPets([])
              setCustomerMode('existing')
              setCreateModalOpen(true)
            }}
          >
            Lấy số thứ tự mới
          </Button>
        </Space>
      </div>

      {/* ===== 2. CÁC THẺ THỐNG KÊ HÀNG ĐỢI (Đồng bộ Style) ===== */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {/* Số đang gọi vào */}
        <Col xs={12} sm={6} lg={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: 14,
              boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
              background: 'linear-gradient(135deg, #f0fdfa 0%, #ffffff 100%)',
              border: '1px solid #ccfbf1',
              height: '100%',
            }}
            styles={{ body: { padding: 18 } }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                  Số Đang Gọi Vào
                </Text>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#0f8b8d', marginTop: 4 }}>
                  {summary.current_called ? `#${String(summary.current_called).padStart(2, '0')}` : '—'}
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
                <SoundOutlined />
              </div>
            </div>
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(15,139,141,0.1)', fontSize: 12, color: '#64748b' }}>
              {data.results?.find((t) => t.status === 'called')
                ? `Bé ${data.results.find((t) => t.status === 'called').pet_name} · ${data.results.find((t) => t.status === 'called').contact_name}`
                : 'Chưa có lượt đang gọi'}
            </div>
          </Card>
        </Col>

        {/* Số tiếp theo */}
        <Col xs={12} sm={6} lg={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: 14,
              boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
              background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)',
              border: '1px solid #dbeafe',
              height: '100%',
            }}
            styles={{ body: { padding: 18 } }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                  Số Tiếp Theo
                </Text>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#0284c7', marginTop: 4 }}>
                  {summary.next_waiting ? `#${String(summary.next_waiting).padStart(2, '0')}` : '—'}
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
                  color: '#0284c7',
                  fontSize: 18,
                }}
              >
                <ClockCircleOutlined />
              </div>
            </div>
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(2,132,199,0.1)', fontSize: 12, color: '#64748b' }}>
              {data.results?.find((t) => t.status === 'waiting')
                ? `Bé ${data.results.find((t) => t.status === 'waiting').pet_name} · Đang chờ sảnh`
                : 'Hàng đợi đang trống'}
            </div>
          </Card>
        </Col>

        {/* Đang chờ phục vụ */}
        <Col xs={12} sm={6} lg={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: 14,
              boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
              background: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)',
              border: '1px solid #fef3c7',
              height: '100%',
            }}
            styles={{ body: { padding: 18 } }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                  Đang Chờ Phục Vụ
                </Text>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#d97706', marginTop: 4 }}>
                  {summary.waiting || 0} <span style={{ fontSize: 14, fontWeight: 400 }}>khách</span>
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
                <UserOutlined />
              </div>
            </div>
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(217,119,6,0.1)', fontSize: 12, color: '#64748b' }}>
              {summary.total || 0} tổng lượt khách vãng lai
            </div>
          </Card>
        </Col>

        {/* Thời gian chờ ước tính */}
        <Col xs={12} sm={6} lg={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: 14,
              boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
              background: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)',
              border: '1px solid #bbf7d0',
              height: '100%',
            }}
            styles={{ body: { padding: 18 } }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                  Thời Gian Chờ Ước Tính
                </Text>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#16a34a', marginTop: 4 }}>
                  ~{summary.average_wait_minutes || 15} <span style={{ fontSize: 14, fontWeight: 400 }}>phút</span>
                </div>
              </div>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: '#bbf7d0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#16a34a',
                  fontSize: 18,
                }}
              >
                <FieldTimeOutlined />
              </div>
            </div>
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(22,163,74,0.1)', fontSize: 12, color: '#64748b' }}>
              Tự động tính theo công suất bàn trống
            </div>
          </Card>
        </Col>
      </Row>

      {/* ===== 3. TABS CHUYỂN ĐỔI: DANH SÁCH LỄ TÂN & MÀN HÌNH KIOSK/TV ===== */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        type="card"
        style={{ marginBottom: 20 }}
        items={[
          {
            key: 'list',
            label: (
              <Space>
                <AppstoreOutlined />
                <span>Bảng Điều Phối Lễ Tân</span>
                <Badge count={data.results?.length || 0} style={{ backgroundColor: '#0f8b8d' }} />
              </Space>
            ),
            children: (
              <div>
                {/* Thanh tìm kiếm & Bộ lọc chuẩn phong cách ứng dụng */}
                <Card
                  bordered={false}
                  style={{ borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', marginBottom: 16 }}
                  styles={{ body: { padding: '16px 20px' } }}
                >
                  <Row gutter={[16, 12]} align="middle" justify="space-between">
                    <Col xs={24} md={12} lg={10}>
                      <Input.Search
                        placeholder="Tìm theo số TT, tên bé, khách hàng, SĐT, dịch vụ..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        onSearch={loadQueue}
                        allowClear
                        enterButton
                        size="middle"
                      />
                    </Col>

                    <Col xs={24} md={12} lg={14} style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
                      <Space wrap>
                        <DatePicker
                          value={selectedDate}
                          onChange={(d) => {
                            if (d) {
                              setSelectedDate(d)
                              setDateMode('custom')
                            }
                          }}
                          format="DD/MM/YYYY"
                          allowClear={false}
                          size="middle"
                          style={{ width: 140 }}
                        />

                        <Button
                          type={dateMode === 'today' ? 'primary' : 'default'}
                          size="middle"
                          onClick={() => {
                            setSelectedDate(dayjs())
                            setDateMode('today')
                          }}
                          style={dateMode === 'today' ? { background: '#0f8b8d', borderColor: '#0f8b8d' } : {}}
                        >
                          Hôm nay
                        </Button>

                        <Button
                          type={dateMode === 'all' ? 'primary' : 'default'}
                          size="middle"
                          onClick={() => setDateMode('all')}
                          style={dateMode === 'all' ? { background: '#0f8b8d', borderColor: '#0f8b8d' } : {}}
                        >
                          Tất cả ngày
                        </Button>

                        <Divider type="vertical" />

                        <RowPerPageSelect
                          value={pageSize}
                          onChange={(v) => {
                            setPageSize(v)
                            setPage(1)
                          }}
                        />
                      </Space>
                    </Col>
                  </Row>

                  {/* Thanh chọn nhanh trạng thái (Pill tabs) */}
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <Segmented
                      value={statusFilter}
                      onChange={(val) => {
                        setStatusFilter(val)
                        setPage(1)
                      }}
                      options={[
                        { label: `Tất cả (${statusCounts.all})`, value: '' },
                        { label: `⏳ Đang chờ (${statusCounts.waiting})`, value: 'waiting' },
                        { label: `📢 Đang gọi (${statusCounts.called})`, value: 'called' },
                        { label: `✓ Đã tiếp nhận (${statusCounts.served})`, value: 'served' },
                        { label: `✕ Đã rời đi (${statusCounts.left})`, value: 'left' },
                      ]}
                      size="middle"
                    />

                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Ngày: <Text strong style={{ color: '#0f8b8d' }}>
                        {dateMode === 'all' ? 'Toàn bộ thời gian' : selectedDate.format('DD/MM/YYYY')}
                      </Text>
                    </Text>
                  </div>
                </Card>

                {/* Bảng Hàng Đợi */}
                <Card
                  bordered={false}
                  style={{ borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}
                  styles={{ body: { padding: 16 } }}
                >
                  <Table
                    dataSource={data.results || []}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    size="middle"
                    scroll={{ x: 'max-content' }}
                    pagination={{
                      current: page,
                      pageSize: pageSize,
                      total: data.results?.length || 0,
                      showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} lượt khách`,
                      onChange: (p, ps) => {
                        setPage(p)
                        setPageSize(ps)
                      },
                    }}
                    locale={{ emptyText: 'Chưa có lượt khách vãng lai nào trong danh sách' }}
                  />
                </Card>
              </div>
            ),
          },
          {
            key: 'kiosk',
            label: (
              <Space>
                <DesktopOutlined />
                <span>Màn Hình Kiosk Phòng Chờ (TV Display)</span>
              </Space>
            ),
            children: (
              <Card style={{ borderRadius: 16, background: '#0b3d3f', color: '#fff', padding: 24, textAlign: 'center' }}>
                <Title level={2} style={{ color: '#fff', marginBottom: 8 }}>
                  PHÒNG CHỜ PET SPA AI - SỐ THỨ TỰ HÔM NAY
                </Title>
                <Paragraph style={{ color: '#94a3b8', fontSize: 16 }}>
                  Quý khách vui lòng theo dõi số thứ tự hiển thị trên màn hình. Khi đến lượt, lễ tân sẽ mời quý khách và bé cưng vào khu vực chăm sóc.
                </Paragraph>

                <Row gutter={[24, 24]} style={{ marginTop: 32 }}>
                  <Col xs={24} md={12}>
                    <div style={{ background: '#0f8b8d', padding: 32, borderRadius: 20, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                      <div style={{ fontSize: 18, color: '#ccfbf1', textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700 }}>
                        📢 ĐANG PHỤC VỤ (NOW SERVING)
                      </div>
                      <div style={{ fontSize: 72, fontWeight: 900, color: '#fff', margin: '16px 0' }}>
                        {summary.current_called ? `#${String(summary.current_called).padStart(2, '0')}` : '—'}
                      </div>
                      <div style={{ fontSize: 16, color: '#f0fdfa' }}>
                        {data.results?.find((t) => t.status === 'called')
                          ? `🐾 Bé ${data.results.find((t) => t.status === 'called').pet_name} · ${data.results.find((t) => t.status === 'called').contact_name}`
                          : 'Hiện không có số đang gọi'}
                      </div>
                    </div>
                  </Col>

                  <Col xs={24} md={12}>
                    <div style={{ background: '#134e4a', padding: 32, borderRadius: 20, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                      <div style={{ fontSize: 18, color: '#fed7aa', textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700 }}>
                        ⏭️ CHUẨN BỊ VÀO (NEXT IN LINE)
                      </div>
                      <div style={{ fontSize: 72, fontWeight: 900, color: '#fed7aa', margin: '16px 0' }}>
                        {summary.next_waiting ? `#${String(summary.next_waiting).padStart(2, '0')}` : '—'}
                      </div>
                      <div style={{ fontSize: 16, color: '#fef3c7' }}>
                        {data.results?.find((t) => t.status === 'waiting')
                          ? `🐾 Bé ${data.results.find((t) => t.status === 'waiting').pet_name} · Ước tính ~${summary.average_wait_minutes} phút`
                          : 'Hàng đợi đang trống'}
                      </div>
                    </div>
                  </Col>
                </Row>

                <div style={{ marginTop: 40, textAlign: 'center' }}>
                  <Button
                    type="primary"
                    size="large"
                    icon={<PlusOutlined />}
                    style={{ background: '#10b981', borderColor: '#10b981', height: 50, padding: '0 32px', fontSize: 18, borderRadius: 12 }}
                    onClick={() => {
                      createForm.resetFields()
                      setSelectedClientPets([])
                      setCustomerMode('existing')
                      setCreateModalOpen(true)
                    }}
                  >
                    BẤM LẤY SỐ THỨ TỰ TẠI QUẦY
                  </Button>
                </div>
              </Card>
            ),
          },
        ]}
      />

      {/* ===== 4. MODAL LẤY SỐ THỨ TỰ MỚI (TÍCH HỢP DỮ LIỆU THẬT TỪ KHÁCH HÀNG & DỊCH VỤ) ===== */}
      <Modal
        title={
          <Space>
            <PlusOutlined style={{ color: '#0f8b8d' }} />
            <span>Cấp Số Thứ Tự Khách Vãng Lai (Walk-in Ticket)</span>
          </Space>
        }
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        footer={null}
        width={600}
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreateTicket}
          initialValues={{ pet_species: 'dog', item_type: 'service' }}
        >
          {/* Lựa chọn: Khách có sẵn hay Khách mới */}
          <div style={{ marginBottom: 16 }}>
            <Segmented
              block
              value={customerMode}
              onChange={(val) => {
                setCustomerMode(val)
                createForm.resetFields(['contact_name', 'phone', 'pet_name', 'pet_species', 'client_id', 'pet_id'])
                setSelectedClientPets([])
              }}
              options={[
                { label: '👤 Chọn khách hàng có sẵn (Hồ sơ Spa)', value: 'existing' },
                { label: '✨ Khách vãng lai mới hoàn toàn', value: 'new' },
              ]}
              style={{ marginBottom: 16 }}
            />
          </div>

          {customerMode === 'existing' ? (
            <div>
              <Form.Item
                name="client_id"
                label="Chọn khách hàng từ hồ sơ spa"
                rules={[{ required: true, message: 'Vui lòng chọn khách hàng' }]}
              >
                <Select
                  showSearch
                  placeholder="Tìm theo tên hoặc số điện thoại..."
                  optionFilterProp="label"
                  onChange={handleClientSelect}
                  options={clients.map((c) => ({
                    value: c.id,
                    label: `${c.full_name} (${c.phone || 'Chưa có SĐT'})`,
                  }))}
                />
              </Form.Item>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="contact_name" label="Tên khách hàng" rules={[{ required: true }]}>
                    <Input prefix={<UserOutlined />} placeholder="Họ tên khách" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="phone" label="Số điện thoại">
                    <Input prefix={<PhoneOutlined />} placeholder="SĐT khách" />
                  </Form.Item>
                </Col>
              </Row>

              {/* Danh sách bé cưng của khách này */}
              {selectedClientPets.length > 0 ? (
                <Row gutter={16}>
                  <Col span={14}>
                    <Form.Item
                      name="pet_id"
                      label="Chọn bé cưng của khách"
                      rules={[{ required: true, message: 'Vui lòng chọn bé cưng' }]}
                    >
                      <Select
                        placeholder="Chọn bé cưng đi spa hôm nay"
                        onChange={handlePetSelect}
                        options={selectedClientPets.map((p) => ({
                          value: p.id,
                          label: `🐾 ${p.name} (${p.species === 'cat' ? 'Mèo' : 'Chó'}${p.breed ? ` · ${p.breed}` : ''}${p.size_class ? ` · Size ${p.size_class}` : ''})`,
                        }))}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={10}>
                    <Form.Item name="pet_species" label="Loài thú cưng">
                      <Select
                        disabled
                        options={[
                          { value: 'dog', label: '🐶 Chó' },
                          { value: 'cat', label: '🐱 Mèo' },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              ) : (
                <Row gutter={16}>
                  <Col span={14}>
                    <Form.Item name="pet_name" label="Tên bé cưng mới" rules={[{ required: true, message: 'Nhập tên bé' }]}>
                      <Input placeholder="Ví dụ: Bé Bông" />
                    </Form.Item>
                  </Col>
                  <Col span={10}>
                    <Form.Item name="pet_species" label="Loài thú cưng" rules={[{ required: true }]}>
                      <Select
                        options={[
                          { value: 'dog', label: '🐶 Chó' },
                          { value: 'cat', label: '🐱 Mèo' },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              )}
            </div>
          ) : (
            <div>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="contact_name" label="Tên khách hàng" rules={[{ required: true, message: 'Nhập tên khách hàng' }]}>
                    <Input placeholder="Ví dụ: Anh Tuấn" prefix={<UserOutlined />} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="phone" label="Số điện thoại">
                    <Input placeholder="0901234567" prefix={<PhoneOutlined />} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={14}>
                  <Form.Item name="pet_name" label="Tên bé cưng" rules={[{ required: true, message: 'Nhập tên bé cưng' }]}>
                    <Input placeholder="Ví dụ: Bé Bông" />
                  </Form.Item>
                </Col>
                <Col span={10}>
                  <Form.Item name="pet_species" label="Loài thú cưng" rules={[{ required: true }]}>
                    <Select
                      options={[
                        { value: 'dog', label: '🐶 Chó' },
                        { value: 'cat', label: '🐱 Mèo' },
                      ]}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </div>
          )}

          <Divider style={{ margin: '14px 0' }} />

          {/* Chọn nhu cầu dịch vụ */}
          <Form.Item name="item_type" label="Nhu cầu dịch vụ">
            <Radio.Group buttonStyle="solid">
              <Radio.Button value="service">Dịch vụ lẻ</Radio.Button>
              <Radio.Button value="package">Gói Combo trọn gói</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.item_type !== cur.item_type}>
            {({ getFieldValue }) =>
              getFieldValue('item_type') === 'package' ? (
                <Form.Item name="package" label="Chọn gói combo chăm sóc" rules={[{ required: true, message: 'Vui lòng chọn gói combo' }]}>
                  <Select
                    placeholder="Chọn gói chăm sóc"
                    allowClear
                    options={packages.map((pkg) => ({
                      value: pkg.id,
                      label: `${pkg.name} (${pkg.species_scope === 'dog' ? 'Chó' : pkg.species_scope === 'cat' ? 'Mèo' : 'Chung'})`,
                    }))}
                  />
                </Form.Item>
              ) : (
                <Form.Item name="service" label="Chọn dịch vụ chăm sóc" rules={[{ required: true, message: 'Vui lòng chọn dịch vụ' }]}>
                  <Select
                    placeholder="Chọn dịch vụ"
                    allowClear
                    options={services.map((svc) => ({
                      value: svc.id,
                      label: `${svc.name} (${svc.duration_minutes} phút - ${money(svc.base_price || 0)})`,
                    }))}
                  />
                </Form.Item>
              )
            }
          </Form.Item>

          <Form.Item name="note" label="Ghi chú dặn dò tiếp nhận">
            <Input.TextArea rows={2} placeholder="Ví dụ: Bé sợ nước, dặn KTV nhẹ tay, mang theo khăn riêng..." />
          </Form.Item>

          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Space>
              <Button onClick={() => setCreateModalOpen(false)}>Hủy</Button>
              <Button type="primary" htmlType="submit" loading={submitting} style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}>
                Xác nhận cấp số thứ tự
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* ===== 5. MODAL KẾT QUẢ CẤP PHIẾU THỨ TỰ ===== */}
      <Modal
        open={resultModalOpen}
        onCancel={() => setResultModalOpen(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setResultModalOpen(false)} style={{ background: '#0f8b8d' }}>
            Đóng
          </Button>,
        ]}
        width={420}
        centered
      >
        {ticketResult && (
          <div style={{ textAlign: 'center', padding: '16px 8px' }}>
            <Tag color="cyan" style={{ fontSize: 13, padding: '4px 12px' }}>PET SPA AI - SPA THÚ CƯNG</Tag>
            <Title level={4} style={{ marginTop: 12, marginBottom: 4 }}>PHIẾU HÀNG ĐỢI DỊCH VỤ</Title>
            <Text type="secondary">{dayjs(ticketResult.date).format('DD/MM/YYYY')} · Khách vãng lai tại quầy</Text>

            <div style={{ background: '#f0fdfa', padding: '20px 0', borderRadius: 16, margin: '20px 0', border: '2px dashed #0f8b8d' }}>
              <div style={{ fontSize: 14, color: '#0f8b8d', fontWeight: 600 }}>SỐ THỨ TỰ CỦA BẠN</div>
              <div style={{ fontSize: 56, fontWeight: 900, color: '#0f8b8d', lineHeight: 1.2 }}>
                {ticketResult.queue_code}
              </div>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                🐾 Bé <strong>{ticketResult.pet_name}</strong> ({ticketResult.contact_name})
              </div>
            </div>

            <Alert
              type="info"
              showIcon
              message={<Text strong>Thời gian chờ ước tính: ~{ticketResult.estimated_wait_minutes} phút</Text>}
              description="Xin quý khách vui lòng ngồi chờ tại sảnh. Khi đến lượt, nhân viên sẽ xướng số thứ tự của bạn."
            />
          </div>
        )}
      </Modal>

      {/* ===== 6. MODAL TIẾP NHẬN VÀO BÀN (CONVERT TO BOOKING & CHECK-IN) ===== */}
      <Modal
        title={
          <Space>
            <CheckCircleOutlined style={{ color: '#0f8b8d' }} />
            <span>Tiếp Nhận Khách Vãng Lai Vào Làm ({convertTarget?.queue_code})</span>
          </Space>
        }
        open={convertModalOpen}
        onCancel={() => setConvertModalOpen(false)}
        onOk={submitConvert}
        okText="Xác nhận tiếp nhận vào tiệm"
        okButtonProps={{ style: { background: '#0f8b8d', borderColor: '#0f8b8d' }, loading: converting }}
        cancelText="Hủy"
        width={560}
      >
        {convertTarget && (
          <div>
            <Paragraph>
              Chuyển đổi phiếu hàng đợi <strong>{convertTarget.queue_code}</strong> của bé <strong>{convertTarget.pet_name}</strong> thành lịch hẹn chính thức và check-in vào bàn phục vụ:
            </Paragraph>

            <Card size="small" style={{ marginBottom: 16, background: '#f8fafc', borderRadius: 10 }}>
              <div>👤 Chủ nuôi: <strong>{convertTarget.contact_name}</strong> {convertTarget.phone && `· ${convertTarget.phone}`}</div>
              <div>🐾 Thú cưng: <strong>{convertTarget.pet_name}</strong> ({convertTarget.pet_species === 'dog' ? 'Chó' : 'Mèo'})</div>
              <div>✨ Dịch vụ: <strong>{convertTarget.package_name || convertTarget.service_name || 'Tắm cơ bản'}</strong></div>
            </Card>

            <Form layout="vertical">
              <Form.Item label="Phân công Kỹ thuật viên (tùy chọn)">
                <Select
                  placeholder="Chọn KTV phụ trách"
                  value={selectedStaff}
                  onChange={setSelectedStaff}
                  allowClear
                  options={staffList.map((st) => ({
                    value: st.id,
                    label: `${st.full_name || st.name} (${st.specialties?.map((s) => s.name_vi).join(', ') || 'Đa năng'})`,
                  }))}
                />
              </Form.Item>

              <Form.Item label="Chỉ định vị trí bàn / bồn tắm cụ thể">
                <Select
                  placeholder="Chọn vị trí thực địa trống"
                  value={selectedResource}
                  onChange={setSelectedResource}
                  allowClear
                  options={resources.filter((r) => r.is_active).map((r) => {
                    const meta = RESOURCE_TYPE_INFO[r.resource_type] || { icon: '🏷️' }
                    return {
                      value: r.id,
                      label: `${meta.icon} ${r.name}`,
                    }
                  })}
                />
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>
    </div>
  )
}
