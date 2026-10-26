import { useState, useEffect, useCallback } from 'react'
import {
  Card, Row, Col, Typography, Button, Tag, Space, Table,
  Badge, Modal, Form, Input, Select, Statistic, Popconfirm,
  Divider, Alert, Empty, message, Tooltip, Tabs
} from 'antd'
import {
  SoundOutlined, CheckCircleOutlined, CloseCircleOutlined,
  PlusOutlined, ReloadOutlined, UserOutlined, PhoneOutlined,
  ClockCircleOutlined, DesktopOutlined, SwapOutlined,
  EyeOutlined, AppstoreOutlined, QrcodeOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { api, unwrap } from '../api.js'
import { useAuth } from '../auth.jsx'

const { Title, Text, Paragraph } = Typography

const STATUS_TAGS = {
  waiting: { label: 'Đang chờ', color: 'gold' },
  called: { label: 'Đang gọi vào', color: 'processing' },
  served: { label: 'Đã tiếp nhận', color: 'success' },
  left: { label: 'Đã rời đi / Hủy', color: 'default' },
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
  const [statusFilter, setStatusFilter] = useState('')

  // Dữ liệu hỗ trợ tạo vé & tiếp nhận
  const [services, setServices] = useState([])
  const [packages, setPackages] = useState([])
  const [resources, setResources] = useState([])
  const [staffList, setStaffList] = useState([])

  // Modal Lấy số thứ tự mới
  const [createModalOpen, setCreateModalOpen] = useState(false)
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

  // Tải danh sách hàng đợi hôm nay
  const loadQueue = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      const res = await api(`/walk-ins?${params.toString()}`)
      setData(res || { summary: {}, results: [] })
    } catch (e) {
      message.error(e.message || 'Không thể tải danh sách hàng đợi')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  // Tải dữ liệu ban đầu
  useEffect(() => {
    loadQueue()
    Promise.all([
      api('/services').catch(() => []),
      api('/packages').catch(() => []),
      api('/resources').catch(() => []),
      api('/staff').catch(() => []),
    ]).then(([s, p, r, st]) => {
      setServices(unwrap(s))
      setPackages(unwrap(p))
      setResources(unwrap(r))
      setStaffList(unwrap(st))
    })
  }, [loadQueue])

  // 1. Lấy số thứ tự mới
  const handleCreateTicket = async (values) => {
    setSubmitting(true)
    try {
      const payload = {
        contact_name: values.contact_name,
        phone: values.phone,
        pet_name: values.pet_name,
        pet_species: values.pet_species,
        note: values.note || '',
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

      // Nếu có chọn tài nguyên cụ thể
      if (selectedResource) {
        // Gán cho item đầu tiên của booking
        payload.resources = { 1: selectedResource }
      }

      const res = await api(`/walk-ins/${convertTarget.id}/convert`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      message.success(`Đã tiếp nhận số ${convertTarget.queue_code} (Bé ${convertTarget.pet_name}) vào tiệm thành công!`)
      setConvertModalOpen(false)
      loadQueue()
    } catch (e) {
      message.error(e.message || 'Không thể tiếp nhận khách vãng lai')
    } finally {
      setConverting(false)
    }
  }

  // 5. Khách rời đi / Hủy phiếu
  const handleLeave = async (id, reason = '') => {
    try {
      await api(`/walk-ins/${id}/leave`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      message.info('Đã cập nhật trạng thái khách rời đi')
      loadQueue()
    } catch (e) {
      message.error(e.message || 'Không thể cập nhật trạng thái')
    }
  }

  const summary = data.summary || {
    total: 0, waiting: 0, called: 0, served: 0, left: 0,
    current_called: null, next_waiting: null, average_wait_minutes: 15
  }

  // Các cột bảng hàng đợi
  const columns = [
    {
      title: 'Số TT',
      dataIndex: 'queue_code',
      key: 'queue_code',
      width: 90,
      render: (code, record) => (
        <span style={{
          fontSize: 18,
          fontWeight: 800,
          color: record.status === 'called' ? '#0f8b8d' : '#1e293b',
          background: record.status === 'called' ? '#ccfbf1' : '#f1f5f9',
          padding: '4px 10px',
          borderRadius: 8,
          display: 'inline-block'
        }}>
          {code}
        </span>
      ),
    },
    {
      title: 'Bé cưng & Khách hàng',
      key: 'pet_client',
      render: (_, r) => (
        <div>
          <div>
            <Text strong style={{ fontSize: 15, color: '#0f8b8d' }}>
              🐾 {r.pet_name}
            </Text>{' '}
            <Tag color={r.pet_species === 'dog' ? 'blue' : 'purple'}>
              {r.pet_species === 'dog' ? 'Chó' : 'Mèo'}
            </Tag>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            <UserOutlined style={{ marginRight: 4 }} />
            {r.contact_name} {r.phone && `· 📞 ${r.phone}`}
          </div>
        </div>
      ),
    },
    {
      title: 'Dịch vụ yêu cầu',
      key: 'service',
      render: (_, r) => (
        <div>
          {r.package_name ? (
            <Tag color="cyan">📦 Gói: {r.package_name}</Tag>
          ) : r.service_name ? (
            <Tag color="blue">✂️ {r.service_name}</Tag>
          ) : (
            <Text type="secondary">Tư vấn tại quầy</Text>
          )}
          {r.note && (
            <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>
              💬 {r.note}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Chờ ước tính',
      dataIndex: 'estimated_wait_minutes',
      key: 'wait_time',
      width: 130,
      render: (m, r) => (
        r.status === 'waiting' ? (
          <Space orientation="horizontal" size={4}>
            <ClockCircleOutlined style={{ color: '#d97706' }} />
            <Text style={{ fontWeight: 600, color: '#d97706' }}>~{m} phút</Text>
          </Space>
        ) : r.status === 'called' ? (
          <Tag color="processing">⚡ Đang gọi</Tag>
        ) : (
          <Text type="secondary">—</Text>
        )
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (st) => (
        <Tag color={STATUS_TAGS[st]?.color} style={{ fontWeight: 600 }}>
          {STATUS_TAGS[st]?.label || st}
        </Tag>
      ),
    },
    {
      title: 'Thao tác điều phối',
      key: 'actions',
      width: 260,
      render: (_, r) => (
        <Space wrap>
          {r.status === 'waiting' && (
            <Button
              type="primary"
              size="small"
              icon={<SoundOutlined />}
              style={{ background: '#0284c7', borderColor: '#0284c7' }}
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
              style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
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
              <Button size="small" type="text" danger icon={<CloseCircleOutlined />}>
                Rời đi
              </Button>
            </Popconfirm>
          )}

          {r.status === 'served' && r.booking_id && (
            <Button
              size="small"
              type="link"
              icon={<EyeOutlined />}
              onClick={() => nav('/app/bang-le-tan')}
            >
              Xem trên Bảng Lễ Tân
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      {/* ===== HEADER TIÊU ĐỀ & THANH CÔNG CỤ ===== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            🎟️ Hàng Đợi Khách Vãng Lai Tại Quầy (Walk-in)
          </Title>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            Cấp số thứ tự, ước tính thời gian chờ tự động và điều phối khách không đặt lịch trước vào bàn trống (SPA-18)
          </Paragraph>
        </div>

        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={loadQueue} loading={loading}>
            Làm mới
          </Button>

          <Button icon={<DesktopOutlined />} onClick={() => nav('/app/bang-le-tan')}>
            Bảng Lễ Tân Điều Phối
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
            onClick={() => setCreateModalOpen(true)}
          >
            Lấy số thứ tự mới
          </Button>
        </Space>
      </div>

      {/* ===== CÁC THẺ THỐNG KÊ HÀNG ĐỢI ===== */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6} lg={6}>
          <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #0f8b8d' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>📢 Số đang gọi vào</Text>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#0f8b8d' }}>
              {summary.current_called ? `#${String(summary.current_called).padStart(2, '0')}` : '—'}
            </div>
          </Card>
        </Col>

        <Col xs={12} sm={6} lg={6}>
          <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #0284c7' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>⏭️ Số tiếp theo</Text>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#0284c7' }}>
              {summary.next_waiting ? `#${String(summary.next_waiting).padStart(2, '0')}` : '—'}
            </div>
          </Card>
        </Col>

        <Col xs={12} sm={6} lg={6}>
          <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #d97706' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>⏳ Đang chờ phục vụ</Text>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#d97706' }}>
              {summary.waiting} <span style={{ fontSize: 13, fontWeight: 400, color: '#64748b' }}>khách</span>
            </div>
          </Card>
        </Col>

        <Col xs={12} sm={6} lg={6}>
          <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #10b981' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>⏱️ Thời gian chờ ước tính</Text>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#10b981' }}>
              ~{summary.average_wait_minutes} <span style={{ fontSize: 13, fontWeight: 400, color: '#64748b' }}>phút</span>
            </div>
          </Card>
        </Col>
      </Row>

      {/* ===== TABS CHUYỂN ĐỔI: DANH SÁCH LỄ TÂN & MÀN HÌNH KIOSK/TV ===== */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'list',
            label: <span>📋 Bảng Điều Phối Lễ Tân</span>,
            children: (
              <Card
                size="small"
                style={{ borderRadius: 16 }}
                extra={
                  <Space>
                    <Select
                      value={statusFilter}
                      onChange={setStatusFilter}
                      style={{ width: 170 }}
                      options={[
                        { value: '', label: 'Tất cả trạng thái' },
                        { value: 'waiting', label: 'Đang chờ' },
                        { value: 'called', label: 'Đang gọi vào' },
                        { value: 'served', label: 'Đã tiếp nhận' },
                        { value: 'left', label: 'Đã rời đi / Hủy' },
                      ]}
                    />
                  </Space>
                }
              >
                <Table
                  dataSource={data.results || []}
                  columns={columns}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 10 }}
                  locale={{ emptyText: 'Hôm nay chưa có lượt khách vãng lai nào' }}
                />
              </Card>
            ),
          },
          {
            key: 'kiosk',
            label: <span>📺 Màn Hình Kiosk Phòng Chờ (TV Display)</span>,
            children: (
              <Card style={{ borderRadius: 16, background: '#0b3d3f', color: '#fff', padding: 24, textAlign: 'center' }}>
                <Title level={2} style={{ color: '#fff', marginBottom: 8 }}>
                  🐾 PHÒNG CHỜ PET SPA AI - SỐ THỨ TỰ HÔM NAY
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
                        {data.results.find((t) => t.status === 'called')
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
                        {data.results.find((t) => t.status === 'waiting')
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
                    onClick={() => setCreateModalOpen(true)}
                  >
                    BẤM LẤY SỐ THỨ TỰ TẠI QUẦY
                  </Button>
                </div>
              </Card>
            ),
          },
        ]}
      />

      {/* ===== MODAL LẤY SỐ THỨ TỰ MỚI ===== */}
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
        width={560}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateTicket} initialValues={{ pet_species: 'dog', item_type: 'service' }}>
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

          <Form.Item name="item_type" label="Nhu cầu dịch vụ">
            <Select
              options={[
                { value: 'service', label: 'Dịch vụ lẻ' },
                { value: 'package', label: 'Gói Combo trọn gói' },
              ]}
            />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.item_type !== cur.item_type}
          >
            {({ getFieldValue }) =>
              getFieldValue('item_type') === 'package' ? (
                <Form.Item name="package" label="Chọn gói combo quan tâm">
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
                <Form.Item name="service" label="Chọn dịch vụ lẻ quan tâm">
                  <Select
                    placeholder="Chọn dịch vụ"
                    allowClear
                    options={services.map((svc) => ({
                      value: svc.id,
                      label: `${svc.name} (${svc.duration_minutes} phút)`,
                    }))}
                  />
                </Form.Item>
              )
            }
          </Form.Item>

          <Form.Item name="note" label="Ghi chú dặn dò tiếp nhận">
            <Input.TextArea rows={2} placeholder="Ví dụ: Bé sợ nước, mang theo khăn riêng..." />
          </Form.Item>

          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Space>
              <Button onClick={() => setCreateModalOpen(false)}>Hủy</Button>
              <Button type="primary" htmlType="submit" loading={submitting} style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}>
                Xác nhận cấp số
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* ===== MODAL KẾT QUẢ CẤP PHIẾU THỨ TỰ ===== */}
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
            <Tag color="cyan" style={{ fontSize: 14, padding: '4px 12px' }}>SPA THÚ Y LÔNG MƯỢT</Tag>
            <Title level={4} style={{ marginTop: 12, marginBottom: 4 }}>PHIẾU HÀNG ĐỢI DỊCH VỤ</Title>
            <Text type="secondary">{dayjs(ticketResult.date).format('DD/MM/YYYY')} · Khách vãng lai</Text>

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

      {/* ===== MODAL TIẾP NHẬN VÀO BÀN (CONVERT TO BOOKING & CHECK-IN) ===== */}
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

              <Form.Item label="Chỉ định vị trí bàn / bồn tắm cụ thể (SPA-17)">
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

