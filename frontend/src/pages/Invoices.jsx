import { useEffect, useState, useCallback } from 'react'
import {
  Alert, Button, Card, Checkbox, Col, Descriptions, Divider, Drawer, Empty,
  Form, Input, Modal, Radio, Row, Select, Space, Statistic, Switch, Table,
  Tabs, Tag, Typography, message,
} from 'antd'
import {
  CalendarOutlined, CheckCircleOutlined, DollarOutlined, IdcardOutlined,
  PlusOutlined, PrinterOutlined, ReloadOutlined, UserOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { api, money, toFormErrors, unwrap } from '../api.js'
import { useAuth } from '../auth.jsx'
import RowPerPageSelect from '../components/RowPerPageSelect.jsx'
import PetAvatar from '../components/PetAvatar.jsx'

const { Title, Text, Paragraph } = Typography

export const INVOICE_STATUS = {
  unpaid: { label: 'Chưa thu', color: 'gold' },
  paid: { label: 'Đã thu tiền', color: 'success' },
  void: { label: 'Đã hủy', color: 'default' },
}

export default function Invoices() {
  const [searchParams, setSearchParams] = useSearchParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const isManager = user?.role === 'manager'
  const isFrontDesk = ['receptionist', 'manager'].includes(user?.role)

  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [statusFilter, setStatusFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '')
  const [detailInvoice, setDetailInvoice] = useState(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Thu tiền
  const [payModalOpen, setPayModalOpen] = useState(false)
  const [payTarget, setPayTarget] = useState(null)
  const [payMethod, setPayMethod] = useState('cash')
  const [paying, setPaying] = useState(false)

  // Hủy hóa đơn
  const [voidModalOpen, setVoidModalOpen] = useState(false)
  const [voidTarget, setVoidTarget] = useState(null)
  const [voidReason, setVoidReason] = useState('')
  const [voiding, setVoiding] = useState(false)

  // Lập hóa đơn mới
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [unbilledBookings, setUnbilledBookings] = useState([])
  const [pets, setPets] = useState([])
  const [packages, setPackages] = useState([])
  const [services, setServices] = useState([])
  const [createMode, setCreateMode] = useState('booking') // 'booking' | 'walk_in'
  const [createForm] = Form.useForm()

  const loadInvoices = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      if (searchQuery) params.append('q', searchQuery)
      const res = await api(`/invoices?${params.toString()}`)
      const list = unwrap(res)
      setInvoices(list)

      // Kiểm tra URL param id để mở detail nếu có
      const paramId = searchParams.get('id')
      if (paramId) {
        const found = list.find((i) => String(i.id) === String(paramId))
        if (found) {
          setDetailInvoice(found)
          setDetailOpen(true)
        }
      }
    } catch (e) {
      message.error(e.message || 'Không thể tải danh sách hóa đơn')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, searchQuery, searchParams])

  useEffect(() => {
    loadInvoices()
  }, [loadInvoices])

  // Xử lý mở modal lập hóa đơn nếu có booking_id từ trang khác sang
  useEffect(() => {
    const bookingParam = searchParams.get('booking_id')
    if (bookingParam && isFrontDesk) {
      openCreateModal(bookingParam)
    }
  }, [searchParams, isFrontDesk])

  const openCreateModal = async (preselectedBookingId = null) => {
    createForm.resetFields()
    setCreateMode(preselectedBookingId ? 'booking' : 'booking')
    setCreateModalOpen(true)
    createForm.setFieldsValue({
      booking_id: preselectedBookingId ? Number(preselectedBookingId) : undefined,
      is_paid: true,
      payment_method: 'cash',
      booking_type: 'package',
    })

    try {
      const [unbilled, pts, pkgs, svcs] = await Promise.all([
        api('/invoices/unbilled-bookings').catch(() => []),
        api('/pets').catch(() => []),
        api('/packages').catch(() => []),
        api('/services').catch(() => []),
      ])
      setUnbilledBookings(unwrap(unbilled))
      setPets(unwrap(pts))
      setPackages(unwrap(pkgs))
      setServices(unwrap(svcs))
    } catch {
      // ignore
    }
  }

  const handleSaveInvoice = async () => {
    try {
      const values = await createForm.validateFields()
      setCreateBusy(true)

      let payload = {
        is_paid: values.is_paid,
        payment_method: values.is_paid ? values.payment_method : undefined,
      }

      if (createMode === 'booking') {
        payload.booking_id = values.booking_id
      } else {
        payload.pet_id = values.pet_id
        payload.note = values.note
        if (values.booking_type === 'package') {
          payload.package_id = values.package_id
        } else {
          payload.services = values.services
        }
      }

      const res = await api('/invoices', {
        method: 'POST',
        body: payload,
      })

      message.success(`Đã lập hóa đơn ${res.invoice_no} thành công!`)
      setCreateModalOpen(false)
      loadInvoices()
      if (res?.id) {
        setDetailInvoice(res)
        setDetailOpen(true)
      }
    } catch (e) {
      createForm.setFields(toFormErrors(e))
      message.error(e.message || 'Lỗi khi lập hóa đơn')
    } finally {
      setCreateBusy(false)
    }
  }

  const openPay = (inv) => {
    setPayTarget(inv)
    setPayMethod('cash')
    setPayModalOpen(true)
  }

  const submitPay = async () => {
    if (!payTarget) return
    setPaying(true)
    try {
      await api(`/invoices/${payTarget.id}/pay`, {
        method: 'POST',
        body: { payment_method: payMethod },
      })
      message.success('Ghi nhận thanh toán thành công!')
      setPayModalOpen(false)
      if (detailInvoice?.id === payTarget.id) {
        setDetailInvoice((prev) => ({
          ...prev,
          status: 'paid',
          payment_method: payMethod,
          paid_at: new Date().toISOString(),
        }))
      }
      loadInvoices()
    } catch (e) {
      message.error(e.message || 'Lỗi khi thu tiền')
    } finally {
      setPaying(false)
    }
  }

  const openVoid = (inv) => {
    setVoidTarget(inv)
    setVoidReason('')
    setVoidModalOpen(true)
  }

  const submitVoid = async () => {
    if (!voidReason.trim()) {
      message.warning('Vui lòng nhập lý do hủy hóa đơn')
      return
    }
    setVoiding(true)
    try {
      await api(`/invoices/${voidTarget.id}/void`, {
        method: 'POST',
        body: { reason: voidReason },
      })
      message.success('Đã hủy hóa đơn')
      setVoidModalOpen(false)
      if (detailInvoice?.id === voidTarget.id) {
        setDetailInvoice((prev) => ({
          ...prev,
          status: 'void',
          void_reason: voidReason,
        }))
      }
      loadInvoices()
    } catch (e) {
      message.error(e.message || 'Không thể hủy hóa đơn')
    } finally {
      setVoiding(false)
    }
  }

  const printInvoice = () => {
    window.print()
  }

  // Thống kê nhanh
  const totalRevenue = invoices
    .filter((i) => i.status === 'paid')
    .reduce((sum, i) => sum + Number(i.total || 0), 0)
  const unpaidCount = invoices.filter((i) => i.status === 'unpaid').length

  const columns = [
    {
      title: 'Số Hóa Đơn',
      dataIndex: 'invoice_no',
      width: 160,
      render: (no, r) => (
        <div>
          <Button
            type="link"
            style={{ padding: 0, fontWeight: 700, fontSize: 14 }}
            onClick={() => { setDetailInvoice(r); setDetailOpen(true) }}
          >
            {no}
          </Button>
          {r.booking && (
            <div>
              <a
                style={{ fontSize: 12, color: '#64748b' }}
                onClick={() => nav(`/app/lich-hen?id=${r.booking}`)}
                title="Bấm để xem lịch hẹn liên quan"
              >
                Lịch: #{r.booking}
              </a>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Khách hàng',
      key: 'client',
      render: (_, r) => (
        <div>
          <a
            style={{ fontWeight: 600, color: '#0f8b8d', cursor: 'pointer' }}
            onClick={() => nav(`/app/khach-hang?q=${r.client_name}`)}
            title="Xem hồ sơ khách hàng"
          >
            👤 {r.client_name || 'Khách vãng lai'}
          </a>
          {r.client_phone && <div><Text type="secondary" style={{ fontSize: 12 }}>📞 {r.client_phone}</Text></div>}
        </div>
      ),
    },
    {
      title: 'Thú cưng',
      key: 'pet',
      render: (_, r) => (
        <a
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={() => nav(`/app/thu-cung?q=${r.pet_name}`)}
          title="Xem hồ sơ thú cưng này"
        >
          <PetAvatar species={r.pet_species} size={22} style={{ border: 'none', boxShadow: 'none' }} />
          <Tag color="cyan">{r.pet_name || 'Chưa rõ'}</Tag>
        </a>
      ),
    },
    {
      title: 'Tổng tiền',
      dataIndex: 'total',
      render: (t) => <Text strong style={{ color: '#0f8b8d', fontSize: 15 }}>{money(t)}</Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 130,
      render: (st) => {
        const s = INVOICE_STATUS[st] || { label: st, color: 'default' }
        return <Tag color={s.color}>{s.label}</Tag>
      },
    },
    {
      title: 'Hình thức',
      dataIndex: 'payment_method',
      render: (m) => (m === 'cash' ? 'Tiền mặt' : m === 'transfer' ? 'Chuyển khoản' : '—'),
    },
    {
      title: 'Ngày lập',
      dataIndex: 'created_at',
      width: 140,
      render: (t) => dayjs(t).format('HH:mm DD/MM/YYYY'),
    },
    {
      title: 'Thao tác',
      key: 'act',
      width: 170,
      render: (_, r) => (
        <Space size="small" wrap onClick={(e) => e.stopPropagation()}>
          <Button size="small" onClick={(e) => { e.stopPropagation(); setDetailInvoice(r); setDetailOpen(true) }}>
            Xem
          </Button>
          {isFrontDesk && r.status === 'unpaid' && (
            <Button
              type="primary"
              size="small"
              icon={<DollarOutlined />}
              onClick={(e) => { e.stopPropagation(); openPay(r) }}
              style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
            >
              Thu tiền
            </Button>
          )}
          {isManager && r.status !== 'void' && (
            <Button danger size="small" onClick={(e) => { e.stopPropagation(); openVoid(r) }}>
              Hủy
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0, color: '#0b3d3f' }}>
            <DollarOutlined style={{ marginRight: 8, color: '#0f8b8d' }} />
            Hóa Đơn & Thu Ngân
          </Title>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            Quản lý thanh toán dịch vụ spa, ghi nhận tiền mặt/chuyển khoản và in chứng từ tài chính
          </Paragraph>
        </div>

        <Space wrap>
          <Input.Search
            placeholder="Tìm theo số HĐ, tên khách, thú cưng..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onSearch={loadInvoices}
            style={{ width: 260 }}
            allowClear
          />

          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 140 }}
            options={[
              { value: '', label: 'Tất cả trạng thái' },
              { value: 'unpaid', label: 'Chưa thu' },
              { value: 'paid', label: 'Đã thu tiền' },
              { value: 'void', label: 'Đã hủy' },
            ]}
          />

          <Button icon={<ReloadOutlined />} onClick={loadInvoices}>Làm mới</Button>

          {isFrontDesk && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openCreateModal()}
              style={{ background: '#0f8b8d', borderColor: '#0f8b8d', fontWeight: 600 }}
            >
              Lập hóa đơn mới
            </Button>
          )}
        </Space>
      </div>

      {/* Thống kê nhanh */}
      {isFrontDesk && (
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={24} sm={8}>
            <Card size="small" style={{ borderRadius: 8 }}>
              <Statistic title="Tổng hóa đơn" value={invoices.length} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card size="small" style={{ borderRadius: 8 }}>
              <Statistic
                title="Hóa đơn chờ thu"
                value={unpaidCount}
                valueStyle={{ color: unpaidCount > 0 ? '#d97706' : '#10b981' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card size="small" style={{ borderRadius: 8 }}>
              <Statistic
                title="Doanh thu thực thu"
                value={money(totalRevenue)}
                valueStyle={{ color: '#0f8b8d', fontWeight: 700 }}
              />
            </Card>
          </Col>
        </Row>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>💡 Bấm vào bất kỳ dòng nào để xem chi tiết & in hóa đơn</Text>
        <RowPerPageSelect value={pageSize} onChange={(ps) => { setPageSize(ps); setPage(1); }} />
      </div>

      <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 8, overflow: 'hidden' }}>
        <Table
          dataSource={invoices}
          columns={columns}
          rowKey="id"
          loading={loading}
          scroll={{ x: 'max-content' }}
          rowClassName={() => 'clickable-row'}
          onRow={(record) => ({
            onClick: () => {
              setDetailInvoice(record)
              setDetailOpen(true)
            },
            style: { cursor: 'pointer' },
          })}
          pagination={{
            position: ['bottomRight'],
            current: page,
            pageSize: pageSize,
            showSizeChanger: false,
            showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} hóa đơn`,
            onChange: (p) => setPage(p),
          }}
          locale={{ emptyText: <Empty description="Chưa có hóa đơn nào phù hợp." /> }}
        />
      </Card>

      {/* ===== DRAWER XEM CHI TIẾT & IN HÓA ĐƠN ===== */}
      <Drawer
        title={detailInvoice ? `Hóa đơn: ${detailInvoice.invoice_no}` : ''}
        placement="right"
        width={560}
        onClose={() => setDetailOpen(false)}
        open={detailOpen}
        extra={
          <Space>
            <Button icon={<PrinterOutlined />} onClick={printInvoice}>In hóa đơn</Button>
            {isFrontDesk && detailInvoice?.status === 'unpaid' && (
              <Button
                type="primary"
                icon={<DollarOutlined />}
                onClick={() => openPay(detailInvoice)}
                style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
              >
                Thu tiền
              </Button>
            )}
          </Space>
        }
      >
        {detailInvoice && (
          <div className="printable-invoice">
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <Title level={4} style={{ margin: 0, color: '#0b3d3f' }}>🐾 SPA THÚ Y LÔNG MƯỢT</Title>
              <Text type="secondary">25 Lê Văn Thịnh, P. Bình Trưng Tây, TP. Thủ Đức, TP.HCM</Text>
              <Divider style={{ margin: '12px 0' }} />
              <Title level={3} style={{ margin: '8px 0' }}>PHIẾU THANH TOÁN DỊCH VỤ</Title>
              <Text type="secondary">Số: {detailInvoice.invoice_no} — Ngày: {dayjs(detailInvoice.created_at).format('DD/MM/YYYY HH:mm')}</Text>
            </div>

            <Descriptions column={1} size="small" bordered style={{ marginBottom: 20 }}>
              <Descriptions.Item label="Khách hàng">
                <a onClick={() => nav(`/app/khach-hang?q=${detailInvoice.client_name}`)} style={{ fontWeight: 600 }}>
                  {detailInvoice.client_name}
                </a> ({detailInvoice.client_phone || '—'})
              </Descriptions.Item>
              <Descriptions.Item label="Bé cưng">
                <Space align="center" size={8}>
                  <PetAvatar species={detailInvoice.pet_species} size={28} />
                  <a onClick={() => nav(`/app/thu-cung?q=${detailInvoice.pet_name}`)} style={{ fontWeight: 600 }}>
                    {detailInvoice.pet_name}
                  </a>
                </Space>
              </Descriptions.Item>
              {detailInvoice.booking && (
                <Descriptions.Item label="Lịch hẹn tương ứng">
                  <a onClick={() => nav(`/app/lich-hen?id=${detailInvoice.booking}`)} style={{ color: '#0f8b8d' }}>
                    #{detailInvoice.booking} (Bấm xem lịch)
                  </a>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Trạng thái">
                <Tag color={INVOICE_STATUS[detailInvoice.status]?.color}>
                  {INVOICE_STATUS[detailInvoice.status]?.label}
                </Tag>
              </Descriptions.Item>
              {detailInvoice.status === 'paid' && (
                <>
                  <Descriptions.Item label="Hình thức thanh toán">
                    {detailInvoice.payment_method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Thời gian thu">
                    {dayjs(detailInvoice.paid_at).format('HH:mm DD/MM/YYYY')}
                  </Descriptions.Item>
                  <Descriptions.Item label="Người thu tiền">
                    {detailInvoice.received_by_name || 'Hệ thống'}
                  </Descriptions.Item>
                </>
              )}
              {detailInvoice.status === 'void' && (
                <Descriptions.Item label="Lý do hủy">
                  <Text type="danger">{detailInvoice.void_reason}</Text>
                </Descriptions.Item>
              )}
            </Descriptions>

            <Title level={5} style={{ marginBottom: 8 }}>Chi tiết dịch vụ:</Title>
            <Table
              dataSource={detailInvoice.lines || []}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                { title: 'Dịch vụ', dataIndex: 'description' },
                { title: 'SL', dataIndex: 'quantity', width: 50, align: 'center' },
                { title: 'Đơn giá', dataIndex: 'unit_price', align: 'right', render: (p) => money(p) },
                { title: 'Thành tiền', dataIndex: 'amount', align: 'right', render: (a) => <Text strong>{money(a)}</Text> },
              ]}
            />

            <div style={{ textAlign: 'right', marginTop: 16 }}>
              <Paragraph style={{ fontSize: 16 }}>
                Tổng cộng thanh toán: <Text strong style={{ fontSize: 20, color: '#0f8b8d' }}>{money(detailInvoice.total)}</Text>
              </Paragraph>
              <Text type="secondary" italic style={{ fontSize: 12 }}>
                Cảm ơn Quý khách đã tin tưởng và đồng hành cùng Pet Spa AI!
              </Text>
            </div>
          </div>
        )}
      </Drawer>

      {/* ===== MODAL LẬP HÓA ĐƠN MỚI TẠI QUẦY ===== */}
      <Modal
        centered
        open={createModalOpen}
        title="Lập Hóa Đơn Thu Ngân Tại Quầy"
        onCancel={() => setCreateModalOpen(false)}
        onOk={handleSaveInvoice}
        confirmLoading={createBusy}
        okText="Xác nhận tạo & Xuất hóa đơn"
        cancelText="Hủy"
        width={680}
        destroyOnHidden
      >
        <Radio.Group
          value={createMode}
          onChange={(e) => setCreateMode(e.target.value)}
          style={{ marginBottom: 16, width: '100%' }}
          buttonStyle="solid"
        >
          <Radio.Button value="booking" style={{ width: '50%', textAlign: 'center' }}>
            Xuất từ Lịch hẹn hoàn tất
          </Radio.Button>
          <Radio.Button value="walk_in" style={{ width: '50%', textAlign: 'center' }}>
            Thu ngân trực tiếp (Khách vãng lai / Walk-in)
          </Radio.Button>
        </Radio.Group>

        <Form form={createForm} layout="vertical">
          {createMode === 'booking' ? (
            <div>
              <Form.Item
                name="booking_id"
                label="Chọn lịch hẹn đã hoàn tất cần lập hóa đơn"
                rules={[{ required: true, message: 'Vui lòng chọn lịch hẹn' }]}
              >
                <Select
                  placeholder="Chọn lịch hẹn hoàn tất..."
                  options={unbilledBookings.map((b) => ({
                    value: b.id,
                    label: `#BK-${b.id} — ${b.client_name} (${b.client_phone}) · Bé: ${b.pet_name} · Gói: ${b.package_name} [${money(b.total_price)}]`,
                  }))}
                />
              </Form.Item>
              {unbilledBookings.length === 0 && (
                <Alert
                  type="info"
                  showIcon
                  message="Không có lịch hẹn hoàn tất nào đang chờ xuất hóa đơn."
                  description='Nếu khách sử dụng dịch vụ tại quầy không đặt trước, vui lòng chuyển sang tab "Thu ngân trực tiếp (Khách vãng lai)".'
                  style={{ marginBottom: 12 }}
                />
              )}
            </div>
          ) : (
            <div>
              <Form.Item
                name="pet_id"
                label="Chọn bé cưng"
                rules={[{ required: true, message: 'Vui lòng chọn thú cưng' }]}
              >
                <Select
                  showSearch
                  placeholder="Gõ tìm tên bé hoặc chủ..."
                  filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                  options={pets.map((p) => ({
                    value: p.id,
                    label: `${p.name} (Chủ: ${p.client_name || 'Khách'}) — ${p.species === 'dog' ? 'Chó' : 'Mèo'}, Size ${p.size_class || '—'} (${p.weight_kg}kg)`,
                  }))}
                />
              </Form.Item>

              <Form.Item name="booking_type" label="Hình thức tính tiền">
                <Radio.Group>
                  <Radio value="package">Gói combo</Radio>
                  <Radio value="services">Dịch vụ lẻ</Radio>
                </Radio.Group>
              </Form.Item>

              <Form.Item noStyle shouldUpdate={(p, c) => p.booking_type !== c.booking_type}>
                {({ getFieldValue }) =>
                  getFieldValue('booking_type') === 'package' ? (
                    <Form.Item name="package_id" label="Chọn gói dịch vụ" rules={[{ required: true, message: 'Chọn gói' }]}>
                      <Select
                        placeholder="Chọn gói..."
                        options={packages.map((pkg) => ({
                          value: pkg.id,
                          label: `${pkg.name} (${pkg.items?.map((i) => i.service_name).join(' + ')})`,
                        }))}
                      />
                    </Form.Item>
                  ) : (
                    <Form.Item name="services" label="Chọn một hoặc nhiều dịch vụ lẻ" rules={[{ required: true, message: 'Chọn dịch vụ' }]}>
                      <Select
                        mode="multiple"
                        placeholder="Chọn các dịch vụ lẻ..."
                        options={services.map((s) => ({
                          value: s.id,
                          label: `${s.name} (~${s.duration_minutes} phút)`,
                        }))}
                      />
                    </Form.Item>
                  )
                }
              </Form.Item>

              <Form.Item name="note" label="Ghi chú dịch vụ tại quầy">
                <Input placeholder="ví dụ: Khách ghé cắt tỉa móng nhanh..." />
              </Form.Item>
            </div>
          )}

          <Divider style={{ margin: '16px 0' }} />

          <Row gutter={16} align="middle">
            <Col span={12}>
              <Form.Item name="is_paid" valuePropName="checked" style={{ marginBottom: 0 }}>
                <Checkbox defaultChecked>
                  <Text strong>Ghi nhận đã thu tiền ngay</Text>
                </Checkbox>
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item noStyle shouldUpdate={(p, c) => p.is_paid !== c.is_paid}>
                {({ getFieldValue }) =>
                  getFieldValue('is_paid') ? (
                    <Form.Item name="payment_method" label="Phương thức nhận tiền" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                      <Radio.Group>
                        <Radio value="cash">Tiền mặt</Radio>
                        <Radio value="transfer">Chuyển khoản</Radio>
                      </Radio.Group>
                    </Form.Item>
                  ) : null
                }
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* ===== MODAL THU TIỀN HÓA ĐƠN CÓ SẴN ===== */}
      <Modal
        centered
        title="Ghi nhận thanh toán hóa đơn"
        open={payModalOpen}
        onCancel={() => setPayModalOpen(false)}
        onOk={submitPay}
        confirmLoading={paying}
        okText="Xác nhận đã thu tiền"
        cancelText="Đóng"
      >
        <Paragraph>Hóa đơn: <Text strong>{payTarget?.invoice_no}</Text></Paragraph>
        <Paragraph>Khách hàng: <Text strong>{payTarget?.client_name}</Text></Paragraph>
        <Paragraph>
          Số tiền cần thu: <Text strong style={{ fontSize: 18, color: '#0f8b8d' }}>{money(payTarget?.total)}</Text>
        </Paragraph>

        <Divider />
        <Paragraph strong>Chọn hình thức nhận tiền:</Paragraph>
        <Radio.Group value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
          <Space direction="vertical">
            <Radio value="cash">Tiền mặt tại quầy</Radio>
            <Radio value="transfer">Chuyển khoản ngân hàng / QR</Radio>
          </Space>
        </Radio.Group>
      </Modal>

      {/* ===== MODAL HỦY HÓA ĐƠN ===== */}
      <Modal
        centered
        title="Xác nhận hủy hóa đơn"
        open={voidModalOpen}
        onCancel={() => setVoidModalOpen(false)}
        onOk={submitVoid}
        confirmLoading={voiding}
        okText="Hủy hóa đơn"
        okButtonProps={{ danger: true }}
        cancelText="Đóng"
      >
        <Alert
          type="warning"
          showIcon
          message="Lưu ý thao tác quản lý"
          description="Hóa đơn sau khi hủy sẽ không thể phục hồi hoặc thu tiền được nữa."
          style={{ marginBottom: 12 }}
        />
        <Paragraph>Hóa đơn: <Text strong>{voidTarget?.invoice_no}</Text></Paragraph>
        <Input.TextArea
          rows={3}
          value={voidReason}
          onChange={(e) => setVoidReason(e.target.value)}
          placeholder="Nhập lý do hủy hóa đơn (bắt buộc)..."
        />
      </Modal>
    </div>
  )
}
