import { useEffect, useState, useCallback } from 'react'
import {
  Alert, Badge, Button, Calendar, Card, Col, DatePicker, Descriptions, Drawer, Empty,
  Form, Input, Modal, Radio, Row, Segmented, Select, Space, Spin, Table, Tag, Timeline,
  Typography, message,
} from 'antd'
import {
  CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined,
  CloseCircleOutlined, DesktopOutlined, DollarOutlined, EditOutlined, PlayCircleOutlined,
  PlusOutlined, ReloadOutlined, RobotOutlined, TableOutlined, UserOutlined, WarningOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { api, money, toFormErrors, unwrap } from '../api.js'
import { useAuth } from '../auth.jsx'
import AiPackageModal from '../components/AiPackageModal.jsx'
import RowPerPageSelect from '../components/RowPerPageSelect.jsx'
import PetAvatar from '../components/PetAvatar.jsx'

const { Title, Text, Paragraph } = Typography

export const STATUS_MAP = {
  pending: { label: 'Chờ duyệt', color: 'gold' },
  confirmed: { label: 'Đã xác nhận', color: 'blue' },
  checked_in: { label: 'Đã nhận thú', color: 'cyan' },
  in_progress: { label: 'Đang làm', color: 'processing' },
  completed: { label: 'Hoàn tất', color: 'success' },
  cancelled: { label: 'Đã hủy', color: 'default' },
}

export default function Bookings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const isCustomer = user?.role === 'customer'
  const isTech = user?.role === 'technician'
  const isFrontDesk = ['receptionist', 'manager'].includes(user?.role)

  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedDate, setSelectedDate] = useState(dayjs())
  const [statusFilter, setStatusFilter] = useState('')
  const [detailBooking, setDetailBooking] = useState(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [viewMode, setViewMode] = useState('table') // 'table' | 'calendar'
  const [calendarMonth, setCalendarMonth] = useState(dayjs())

  // Dữ liệu hỗ trợ tạo lịch
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [myPets, setMyPets] = useState([])
  const [allPets, setAllPets] = useState([])
  const [packages, setPackages] = useState([])
  const [services, setServices] = useState([])
  const [staffList, setStaffList] = useState([])
  const [quoteData, setQuoteData] = useState(null)
  const [quoting, setQuoting] = useState(false)

  // Form sửa / dời lịch
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [editQuoteData, setEditQuoteData] = useState(null)
  const [editQuoting, setEditQuoting] = useState(false)
  const [editForm] = Form.useForm()

  // AI Modal
  const [aiPetModalOpen, setAiPetModalOpen] = useState(false)
  const [aiPetTarget, setAiPetTarget] = useState(null)

  // AI Staff Suggestion
  const [aiStaffSuggestions, setAiStaffSuggestions] = useState([])
  const [loadingAiStaff, setLoadingAiStaff] = useState(false)

  // Form hủy lịch
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelTarget, setCancelTarget] = useState(null)

  // Form gán thợ
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [selectedStaffId, setSelectedStaffId] = useState(null)

  const [form] = Form.useForm()

  const loadBookings = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (viewMode === 'calendar') {
        params.append('date_from', calendarMonth.startOf('month').format('YYYY-MM-DD'))
        params.append('date_to', calendarMonth.endOf('month').format('YYYY-MM-DD'))
      } else if (selectedDate) {
        params.append('date', selectedDate.format('YYYY-MM-DD'))
      }
      if (statusFilter) params.append('status', statusFilter)
      const res = await api(`/bookings?${params.toString()}`)
      setBookings(unwrap(res))
    } catch (e) {
      message.error(e.message || 'Không thể tải danh sách lịch hẹn')
    } finally {
      setLoading(false)
    }
  }, [selectedDate, statusFilter, viewMode, calendarMonth])

  useEffect(() => {
    loadBookings()
  }, [loadBookings])

  const ensureMetaLoaded = async () => {
    if (packages.length && services.length) {
      return { petList: isCustomer ? myPets : allPets, pkgs: packages }
    }
    try {
      const [pkgs, svcs, stf, pts] = await Promise.all([
        api('/packages'),
        api('/services'),
        isFrontDesk ? api('/staff?role=technician') : Promise.resolve([]),
        api('/pets'),
      ])
      const pList = unwrap(pts)
      const pkgList = unwrap(pkgs)
      setPackages(pkgList)
      setServices(unwrap(svcs))
      setStaffList(unwrap(stf))
      if (isCustomer) {
        setMyPets(pList)
      } else {
        setAllPets(pList)
      }
      return { petList: pList, pkgs: pkgList }
    } catch {
      return {}
    }
  }

  // Load danh mục khi mở modal tạo lịch
  const openCreateModal = async () => {
    form.resetFields()
    setQuoteData(null)
    setCreateModalOpen(true)
    return ensureMetaLoaded()
  }

  // Mở modal sửa / dời lịch
  const openEditModal = async (bk) => {
    setEditTarget(bk)
    setEditQuoteData(null)
    setEditModalOpen(true)
    await ensureMetaLoaded()
    editForm.setFieldsValue({
      pet: bk.pet,
      booking_type: bk.package ? 'package' : 'services',
      package: bk.package || undefined,
      services: bk.items?.map((i) => i.service) || [],
      start_at: dayjs(bk.start_at),
      staff: bk.staff || undefined,
      customer_note: bk.customer_note || '',
      note: bk.note_internal || '',
    })
  }

  const handleEditQuote = async () => {
    if (!editTarget) return
    try {
      const values = await editForm.validateFields(['pet', 'booking_type', 'package', 'services', 'start_at'])
      setEditQuoting(true)
      const payload = {
        pet: values.pet,
        start_at: values.start_at.toISOString(),
        exclude_id: editTarget.id,
      }
      if (values.booking_type === 'package') {
        payload.package = values.package
      } else {
        payload.services = values.services
      }
      if (values.staff) payload.staff = values.staff

      const q = await api('/bookings/quote', { method: 'POST', body: JSON.stringify(payload) })
      setEditQuoteData(q)
    } catch (e) {
      if (e.errorFields) return
      setEditQuoteData({ feasible: false, conflict: { detail: e.message } })
    } finally {
      setEditQuoting(false)
    }
  }

  const handleUpdateBooking = async () => {
    if (!editTarget) return
    try {
      const values = await editForm.validateFields()
      setLoading(true)
      const payload = {
        pet: values.pet,
        start_at: values.start_at.toISOString(),
        customer_note: values.customer_note || '',
        note: values.note || '',
      }
      if (values.booking_type === 'package') {
        payload.package = values.package
        payload.services = []
      } else {
        payload.services = values.services
        payload.package = null
      }
      if (values.staff) payload.staff = values.staff

      const res = await api(`/bookings/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      message.success('Cập nhật lịch hẹn thành công!')
      setEditModalOpen(false)
      if (detailOpen && detailBooking?.id === editTarget.id) {
        setDetailBooking(res)
      }
      loadBookings()
    } catch (e) {
      const fields = toFormErrors(e)
      if (fields.length) editForm.setFields(fields)
      message.error(e.message || 'Lỗi khi cập nhật lịch hẹn')
    } finally {
      setLoading(false)
    }
  }

  // Tự động nhận diện query params khi chuyển từ trang khác sang
  useEffect(() => {
    const petParam = searchParams.get('pet')
    const pkgParam = searchParams.get('package')
    if (petParam) {
      openCreateModal().then(() => {
        form.setFieldsValue({
          pet: Number(petParam),
          booking_type: 'package',
          package: pkgParam ? Number(pkgParam) : undefined,
        })
      })
      setSearchParams({}, { replace: true })
    }
  }, [searchParams])

  // Mở AI gợi ý thợ khi phân công
  const openAssignStaffModal = async (bk) => {
    setSelectedStaffId(bk.staff)
    setAssignModalOpen(true)
    setLoadingAiStaff(true)
    try {
      const res = await api('/ai/suggest-staff', {
        method: 'POST',
        body: JSON.stringify({ booking: bk.id }),
      })
      const suggestions = Array.isArray(res) ? res : (res?.suggestions || [])
      setAiStaffSuggestions(suggestions)
      if (!bk.staff && suggestions.length > 0) {
        setSelectedStaffId(suggestions[0].staff || suggestions[0].staff_id)
      }
    } catch {
      setAiStaffSuggestions([])
    } finally {
      setLoadingAiStaff(false)
    }
  }

  // Mở AI gợi ý gói cho thú cưng đang chọn trong form
  const openAiModalForSelectedPet = () => {
    const currentPetId = form.getFieldValue('pet')
    if (!currentPetId) {
      message.warning('Vui lòng chọn bé cưng ở trên trước để AI phân tích')
      return
    }
    const all = isCustomer ? myPets : allPets
    const target = all.find((p) => p.id === currentPetId)
    if (target) {
      setAiPetTarget(target)
      setAiPetModalOpen(true)
    } else {
      message.warning('Không tìm thấy thông tin bé cưng đã chọn')
    }
  }

  // Báo giá tự động khi điền xong form
  const handleQuote = async () => {
    try {
      const values = await form.validateFields(['pet', 'booking_type', 'package', 'services', 'start_at'])
      setQuoting(true)
      const payload = {
        pet: values.pet,
        start_at: values.start_at.toISOString(),
      }
      if (values.booking_type === 'package') {
        payload.package = values.package
      } else {
        payload.services = values.services
      }
      if (values.staff) payload.staff = values.staff

      const q = await api('/bookings/quote', { method: 'POST', body: JSON.stringify(payload) })
      setQuoteData(q)
    } catch (e) {
      if (e.errorFields) return
      setQuoteData({ feasible: false, conflict: { detail: e.message } })
    } finally {
      setQuoting(false)
    }
  }

  // Gửi tạo lịch
  const handleCreateBooking = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)
      const payload = {
        pet: values.pet,
        start_at: values.start_at.toISOString(),
        customer_note: values.customer_note || '',
        note: values.note || '',
      }
      if (values.booking_type === 'package') {
        payload.package = values.package
      } else {
        payload.services = values.services
      }
      if (values.staff) payload.staff = values.staff

      await api('/bookings', { method: 'POST', body: JSON.stringify(payload) })
      message.success(isCustomer ? 'Đã gửi yêu cầu đặt lịch (chờ spa duyệt)!' : 'Đã tạo lịch hẹn thành công!')
      setCreateModalOpen(false)
      loadBookings()
    } catch (e) {
      const fields = toFormErrors(e)
      if (fields.length) form.setFields(fields)
      message.error(e.message || 'Lỗi khi đặt lịch')
    } finally {
      setLoading(false)
    }
  }

  // Xem chi tiết
  const openDetail = async (id) => {
    try {
      const res = await api(`/bookings/${id}`)
      setDetailBooking(res)
      setDetailOpen(true)
    } catch (e) {
      message.error(e.message || 'Không thể xem chi tiết')
    }
  }

  // Thao tác vòng đời lịch hẹn
  const handleAction = async (actionPath, payload = {}) => {
    if (!detailBooking) return
    try {
      setLoading(true)
      const res = await api(`/bookings/${detailBooking.id}/${actionPath}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      message.success('Thao tác thành công!')
      setDetailBooking(res)
      loadBookings()
    } catch (e) {
      message.error(e.message || 'Thao tác không thành công')
    } finally {
      setLoading(false)
    }
  }

  // Hủy lịch
  const submitCancel = async () => {
    if (!cancelReason.trim()) {
      message.warning('Vui lòng nhập lý do hủy lịch')
      return
    }
    try {
      await api(`/bookings/${cancelTarget.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason }),
      })
      message.success('Đã hủy lịch hẹn')
      setCancelModalOpen(false)
      setCancelReason('')
      if (detailOpen) setDetailOpen(false)
      loadBookings()
    } catch (e) {
      message.error(e.message || 'Không thể hủy lịch')
    }
  }

  // Giao thợ
  const submitAssign = async () => {
    if (!selectedStaffId) {
      message.warning('Vui lòng chọn kỹ thuật viên')
      return
    }
    await handleAction('assign-staff', { staff: selectedStaffId })
    setAssignModalOpen(false)
  }

  const columns = [
    {
      title: 'Mã',
      dataIndex: 'id',
      width: 70,
      render: (id) => <Text strong>#{id}</Text>,
    },
    {
      title: 'Giờ hẹn',
      dataIndex: 'start_at',
      width: 140,
      render: (time) => (
        <div>
          <div><Text strong>{dayjs(time).format('HH:mm')}</Text></div>
          <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(time).format('DD/MM/YYYY')}</Text>
        </div>
      ),
    },
    {
      title: 'Bé cưng',
      key: 'pet',
      render: (_, b) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PetAvatar species={b.pet_info?.species} size={36} />
          <div>
            <a
              style={{ fontWeight: 700, color: '#0f8b8d', fontSize: 14, cursor: 'pointer' }}
              onClick={() => nav(`/app/thu-cung?q=${b.pet_info?.name}`)}
              title="Bấm để xem hồ sơ bé cưng này"
            >
              {b.pet_info?.name}
            </a>
            <div>
              <Tag color={b.pet_info?.species === 'dog' ? 'blue' : 'purple'}>
                {b.pet_info?.species === 'dog' ? 'Chó' : 'Mèo'} ({b.pet_info?.size_class || '—'})
              </Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>{b.pet_info?.breed}</Text>
            </div>
          </div>
        </div>
      ),
    },
    ...(!isCustomer
      ? [{
          title: 'Khách hàng',
          key: 'client',
          render: (_, b) => (
            <div>
              <a
                style={{ fontWeight: 600, color: '#0b3d3f', cursor: 'pointer' }}
                onClick={() => nav(`/app/khach-hang?q=${b.client_info?.full_name}`)}
                title="Bấm để xem hồ sơ chủ nuôi"
              >
                👤 {b.client_info?.full_name}
              </a>
              <div><Text type="secondary" style={{ fontSize: 12 }}>📞 {b.client_info?.phone}</Text></div>
            </div>
          ),
        }]
      : []),
    {
      title: 'Dịch vụ / Gói',
      key: 'service',
      render: (_, b) => (
        <div>
          {b.package_name ? (
            <Tag color="cyan">Gói: {b.package_name}</Tag>
          ) : (
            <Text>{b.items?.map((i) => i.service_name).join(', ') || 'Dịch vụ lẻ'}</Text>
          )}
          <div style={{ marginTop: 2 }}>
            <Text strong style={{ color: '#0f8b8d', fontSize: 13 }}>{money(b.total_price)}</Text>
          </div>
        </div>
      ),
    },
    {
      title: 'KTV phụ trách',
      dataIndex: 'staff_name',
      render: (st) => st ? <Tag icon={<UserOutlined />}>{st}</Tag> : <Text type="secondary">Chưa giao</Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 130,
      render: (st) => {
        const s = STATUS_MAP[st] || { label: st, color: 'default' }
        return <Badge status={s.color === 'processing' ? 'processing' : undefined}><Tag color={s.color}>{s.label}</Tag></Badge>
      },
    },
    {
      title: 'Thao tác',
      key: 'act',
      width: 170,
      render: (_, b) => (
        <Space size="small" wrap onClick={(e) => e.stopPropagation()}>
          <Button type="link" size="small" style={{ padding: 0 }} onClick={(e) => { e.stopPropagation(); openDetail(b.id) }}>
            Chi tiết
          </Button>
          {['pending', 'confirmed'].includes(b.status) && !isTech && (
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={(e) => { e.stopPropagation(); openEditModal(b) }}
              title="Sửa / dời lịch hẹn"
            >
              Sửa
            </Button>
          )}
          {b.status === 'completed' && b.invoice && (
            <Button
              size="small"
              icon={<DollarOutlined />}
              onClick={(e) => { e.stopPropagation(); nav(`/app/hoa-don?id=${b.invoice.id}`) }}
              style={{ color: '#0f8b8d', borderColor: '#0f8b8d' }}
              title="Xem hóa đơn thanh toán"
            >
              Xem HĐ
            </Button>
          )}
          {b.status === 'completed' && !b.invoice && isFrontDesk && (
            <Button
              size="small"
              type="primary"
              icon={<DollarOutlined />}
              onClick={(e) => { e.stopPropagation(); nav(`/app/hoa-don?booking_id=${b.id}`) }}
              style={{ background: '#d97706', borderColor: '#d97706' }}
              title="Lập hóa đơn và thu tiền"
            >
              Lập HĐ
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
          <Title level={3} style={{ margin: 0 }}>
            {isCustomer ? 'Lịch Hẹn Của Tôi' : isTech ? 'Lịch Hẹn Được Phân Công' : 'Quản Lý Lịch Hẹn Spa'}
          </Title>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            Theo dõi tiến trình tiếp nhận, chăm sóc và thanh toán theo thời gian thực (Bấm vào dòng để xem chi tiết)
          </Paragraph>
        </div>

        <Space wrap>
          <Segmented
            value={viewMode}
            onChange={(val) => {
              setViewMode(val)
              setPage(1)
            }}
            options={[
              { label: 'Danh sách', value: 'table', icon: <TableOutlined /> },
              { label: 'Lịch tháng', value: 'calendar', icon: <CalendarOutlined /> },
            ]}
          />

          {viewMode === 'table' && (
            <DatePicker
              value={selectedDate}
              onChange={(d) => setSelectedDate(d)}
              allowClear
              placeholder="Xem theo ngày"
              style={{ width: 140 }}
            />
          )}

          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 150 }}
            options={[
              { value: '', label: 'Tất cả trạng thái' },
              { value: 'pending', label: 'Chờ duyệt' },
              { value: 'confirmed', label: 'Đã xác nhận' },
              { value: 'checked_in', label: 'Đã nhận thú' },
              { value: 'in_progress', label: 'Đang thực hiện' },
              { value: 'completed', label: 'Hoàn tất' },
              { value: 'cancelled', label: 'Đã hủy' },
            ]}
          />

          <Button icon={<ReloadOutlined />} onClick={loadBookings}>Làm mới</Button>

          {isFrontDesk && (
            <Button
              type="primary"
              ghost
              icon={<DesktopOutlined />}
              onClick={() => nav('/app/bang-le-tan')}
            >
              Bảng Lễ Tân Điều Phối
            </Button>
          )}

          {!isTech && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              {isCustomer ? 'Đặt lịch ngay' : 'Tạo lịch mới'}
            </Button>
          )}
          {viewMode === 'table' && (
            <RowPerPageSelect value={pageSize} onChange={(ps) => { setPageSize(ps); setPage(1); }} />
          )}
        </Space>
      </div>

      {viewMode === 'calendar' ? (
        <Card style={{ borderRadius: 16 }}>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <Space>
              <CalendarOutlined style={{ fontSize: 18, color: '#0f8b8d' }} />
              <Text strong style={{ fontSize: 16 }}>Lịch theo tháng: {calendarMonth.format('MM/YYYY')}</Text>
            </Space>
            <Text type="secondary">Bấm vào ngày để xem chi tiết hoặc bấm trực tiếp vào lịch hẹn để xem nhanh</Text>
          </div>
          <Calendar
            value={selectedDate}
            onSelect={(d) => setSelectedDate(d)}
            onPanelChange={(d) => setCalendarMonth(d)}
            cellRender={(current, info) => {
              if (info.type !== 'date') return info.originNode
              const dStr = current.format('YYYY-MM-DD')
              const dayBookings = bookings.filter((b) => dayjs(b.start_at).format('YYYY-MM-DD') === dStr)
              if (!dayBookings.length) return null
              return (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {dayBookings.slice(0, 3).map((item) => (
                    <li
                      key={item.id}
                      onClick={(e) => { e.stopPropagation(); openDetail(item.id) }}
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontSize: 11,
                        marginBottom: 2,
                        cursor: 'pointer',
                        padding: '1px 4px',
                        borderRadius: 4,
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                      }}
                      title={`#${item.id} ${item.pet_info?.name} - ${dayjs(item.start_at).format('HH:mm')} (${STATUS_MAP[item.status]?.label})`}
                    >
                      <Badge color={STATUS_MAP[item.status]?.color} />
                      <span style={{ fontWeight: 600, marginLeft: 3 }}>{dayjs(item.start_at).format('HH:mm')}</span>{' '}
                      <span>{item.pet_info?.name}</span>
                    </li>
                  ))}
                  {dayBookings.length > 3 && (
                    <li style={{ fontSize: 10, color: '#0f8b8d', fontWeight: 600, paddingLeft: 4 }}>
                      +{dayBookings.length - 3} lịch nữa
                    </li>
                  )}
                </ul>
              )
            }}
          />
          {selectedDate && (
            <div style={{ marginTop: 24, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Title level={5} style={{ margin: 0 }}>
                  📅 Danh sách lịch hẹn ngày {selectedDate.format('DD/MM/YYYY')} ({bookings.filter((b) => dayjs(b.start_at).format('YYYY-MM-DD') === selectedDate.format('YYYY-MM-DD')).length} lịch)
                </Title>
                {!isTech && (
                  <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      openCreateModal().then(() => {
                        form.setFieldsValue({
                          start_at: selectedDate.hour(9).minute(0),
                        })
                      })
                    }}
                  >
                    Đặt lịch ngày này
                  </Button>
                )}
              </div>
              <Table
                dataSource={bookings.filter((b) => dayjs(b.start_at).format('YYYY-MM-DD') === selectedDate.format('YYYY-MM-DD'))}
                columns={columns}
                rowKey="id"
                pagination={false}
                size="small"
                rowClassName={() => 'clickable-row'}
                onRow={(record) => ({
                  onClick: () => openDetail(record.id),
                  style: { cursor: 'pointer' },
                })}
                locale={{ emptyText: <Empty description="Chưa có lịch hẹn nào trong ngày này." /> }}
              />
            </div>
          )}
        </Card>
      ) : (
        <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 16, overflow: 'hidden' }}>
          <Table
            dataSource={bookings}
            columns={columns}
            rowKey="id"
            loading={loading}
            scroll={{ x: 'max-content' }}
            rowClassName={() => 'clickable-row'}
            onRow={(record) => ({
              onClick: () => openDetail(record.id),
              style: { cursor: 'pointer' },
            })}
            pagination={{
              position: ['bottomRight'],
              current: page,
              pageSize: pageSize,
              showSizeChanger: false,
              showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} lịch hẹn`,
              onChange: (p) => setPage(p),
            }}
            locale={{ emptyText: <Empty description="Không có lịch hẹn nào trong ngày đã chọn." /> }}
          />
        </Card>
      )}

      {/* ===== DRAWER CHI TIẾT LỊCH HẸN ===== */}
      <Drawer
        title={detailBooking ? `Chi tiết lịch hẹn #${detailBooking.id}` : ''}
        placement="right"
        width={580}
        onClose={() => setDetailOpen(false)}
        open={detailOpen}
        extra={
          detailBooking && (
            <Tag color={STATUS_MAP[detailBooking.status]?.color}>
              {STATUS_MAP[detailBooking.status]?.label}
            </Tag>
          )
        }
      >
        {detailBooking && (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {/* Cảnh báo an toàn cho KTV / Lễ tân */}
            {detailBooking.pet_info?.safety_note && (
              <Alert
                type="warning"
                showIcon
                icon={<WarningOutlined />}
                message={<Text strong style={{ color: '#d97706' }}>Cảnh báo an toàn kỹ thuật viên</Text>}
                description={detailBooking.pet_info.safety_note}
              />
            )}

            {detailBooking.pet_info?.allergy_note && detailBooking.pet_info.allergy_note !== 'Không' && (
              <Alert
                type="error"
                showIcon
                message="Lưu ý dị ứng của thú cưng"
                description={detailBooking.pet_info.allergy_note}
              />
            )}

            {/* Thông tin chính */}
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Bé cưng">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <PetAvatar species={detailBooking.pet_info?.species} size={40} />
                  <div>
                    <a
                      style={{ fontWeight: 700, color: '#0f8b8d', cursor: 'pointer', fontSize: 15 }}
                      onClick={() => { setDetailOpen(false); nav(`/app/thu-cung?q=${detailBooking.pet_info?.name}`) }}
                      title="Xem hồ sơ chi tiết bé cưng này"
                    >
                      {detailBooking.pet_info?.name}
                    </a> ({detailBooking.pet_info?.species === 'dog' ? 'Chó' : 'Mèo'} - {detailBooking.pet_info?.breed || 'Chưa rõ giống'})
                    <div><Tag color="cyan">Size: {detailBooking.pet_info?.size_class}</Tag></div>
                  </div>
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="Chủ thú">
                <a
                  style={{ fontWeight: 600, color: '#0b3d3f', cursor: 'pointer' }}
                  onClick={() => { setDetailOpen(false); nav(`/app/khach-hang?q=${detailBooking.client_info?.full_name}`) }}
                  title="Xem hồ sơ chủ nuôi"
                >
                  👤 {detailBooking.client_info?.full_name}
                </a> - 📞 {detailBooking.client_info?.phone}
              </Descriptions.Item>
              <Descriptions.Item label="Khung giờ">
                {dayjs(detailBooking.start_at).format('HH:mm DD/MM/YYYY')} - {dayjs(detailBooking.end_at).format('HH:mm')}
              </Descriptions.Item>
              <Descriptions.Item label="Kỹ thuật viên phụ trách">
                {detailBooking.staff_name || 'Chưa phân công'}
                {isFrontDesk && detailBooking.status in { pending: 1, confirmed: 1, checked_in: 1 } && (
                  <Button type="link" size="small" icon={<RobotOutlined />} onClick={() => openAssignStaffModal(detailBooking)}>
                    Đổi KTV (Gợi ý AI)
                  </Button>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Tổng tiền">{money(detailBooking.total_price)}</Descriptions.Item>
              {detailBooking.customer_note && (
                <Descriptions.Item label="Ghi chú của khách">{detailBooking.customer_note}</Descriptions.Item>
              )}
              {detailBooking.note_internal && (
                <Descriptions.Item label="Ghi chú nội bộ">{detailBooking.note_internal}</Descriptions.Item>
              )}
            </Descriptions>

            {/* Các bước dịch vụ trong lịch */}
            <Card size="small" title="Quy trình dịch vụ thực hiện">
              {detailBooking.items?.map((it) => (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <div>
                    <Text strong>{it.service_name}</Text>
                    {it.resource_name && <div><Tag color="purple">Tại: {it.resource_name}</Tag></div>}
                  </div>
                  <div>
                    <Text type="secondary">{dayjs(it.start_at).format('HH:mm')} - {dayjs(it.end_at).format('HH:mm')}</Text>
                    <div style={{ textAlign: 'right', fontWeight: 600 }}>{money(it.unit_price)}</div>
                  </div>
                </div>
              ))}
            </Card>

            {/* Hóa đơn đính kèm (nếu đã xong) */}
            {detailBooking.invoice ? (
              <Card size="small" title="Thông tin Hóa đơn thanh toán" style={{ background: '#f0fdfa', borderColor: '#99f6e4' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Text strong style={{ fontSize: 15 }}>HĐ: {detailBooking.invoice.invoice_no}</Text>
                    <div>Tổng tiền: <Text strong style={{ color: '#0f8b8d', fontSize: 16 }}>{money(detailBooking.invoice.total)}</Text></div>
                  </div>
                  <Space>
                    <Tag color={detailBooking.invoice.status === 'paid' ? 'success' : 'gold'}>
                      {detailBooking.invoice.status === 'paid' ? 'Đã thu tiền' : 'Chưa thu tiền'}
                    </Tag>
                    <Button
                      type="primary"
                      size="small"
                      icon={<DollarOutlined />}
                      onClick={() => { setDetailOpen(false); nav(`/app/hoa-don?id=${detailBooking.invoice.id}`) }}
                      style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
                    >
                      Xem hóa đơn & In
                    </Button>
                  </Space>
                </div>
              </Card>
            ) : detailBooking.status === 'completed' && isFrontDesk ? (
              <Card size="small" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Text strong style={{ color: '#b45309' }}>Lịch hẹn hoàn tất — Chưa có hóa đơn</Text>
                    <div style={{ fontSize: 12, color: '#78350f' }}>Lập phiếu hóa đơn để ghi nhận thu ngân</div>
                  </div>
                  <Button
                    type="primary"
                    icon={<DollarOutlined />}
                    onClick={() => { setDetailOpen(false); nav(`/app/hoa-don?booking_id=${detailBooking.id}`) }}
                    style={{ background: '#d97706', borderColor: '#d97706', fontWeight: 600 }}
                  >
                    Lập hóa đơn & Thu tiền
                  </Button>
                </div>
              </Card>
            ) : null}

            {/* CÁC NÚT ĐIỀU HƯỚNG VÒNG ĐỜI TRẠNG THÁI */}
            <Card size="small" title="Thao tác chuyển trạng thái">
              <Space wrap>
                {/* Lễ tân duyệt lịch */}
                {isFrontDesk && detailBooking.status === 'pending' && (
                  <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => handleAction('confirm')}>
                    Duyệt lịch hẹn
                  </Button>
                )}

                {/* Lễ tân Check-in nhận thú */}
                {isFrontDesk && detailBooking.status === 'confirmed' && (
                  <Button type="primary" style={{ background: '#0f8b8d' }} icon={<CheckCircleOutlined />} onClick={() => handleAction('check-in')}>
                    Check-in nhận thú
                  </Button>
                )}

                {/* KTV hoặc Quản lý bắt đầu làm */}
                {(isTech || user?.role === 'manager') && detailBooking.status === 'checked_in' && (
                  <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => handleAction('start')}>
                    Bắt đầu thực hiện
                  </Button>
                )}

                {/* KTV hoặc Quản lý hoàn tất */}
                {(isTech || user?.role === 'manager') && detailBooking.status === 'in_progress' && (
                  <Button type="primary" style={{ background: '#10b981' }} icon={<CheckCircleOutlined />} onClick={() => handleAction('complete')}>
                    Hoàn tất dịch vụ
                  </Button>
                )}

                {/* Lễ tân trả thú */}
                {isFrontDesk && detailBooking.status === 'completed' && !detailBooking.checked_out_at && (
                  <Button type="primary" icon={<ClockCircleOutlined />} onClick={() => handleAction('check-out')}>
                    Bàn giao trả thú
                  </Button>
                )}

                {/* Nút sửa / dời lịch */}
                {['pending', 'confirmed'].includes(detailBooking.status) && !isTech && (
                  <Button icon={<EditOutlined />} onClick={() => openEditModal(detailBooking)}>
                    Sửa / Dời lịch
                  </Button>
                )}

                {/* Nút hủy lịch */}
                {['pending', 'confirmed'].includes(detailBooking.status) && (
                  <Button danger icon={<CloseCircleOutlined />} onClick={() => { setCancelTarget(detailBooking); setCancelModalOpen(true) }}>
                    Hủy lịch
                  </Button>
                )}
              </Space>
            </Card>

            {/* Lịch sử trạng thái */}
            {detailBooking.logs?.length > 0 && (
              <Card size="small" title="Nhật ký chuyển trạng thái">
                <Timeline
                  items={detailBooking.logs.map((l) => ({
                    children: (
                      <div>
                        <Text strong>{STATUS_MAP[l.to_status]?.label || l.to_status}</Text>
                        <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                          {dayjs(l.changed_at).format('HH:mm DD/MM')} {l.changed_by ? `bởi ${l.changed_by}` : ''}
                        </Text>
                        {l.reason && <div><Text type="secondary">Lý do: {l.reason}</Text></div>}
                      </div>
                    ),
                  }))}
                />
              </Card>
            )}
          </Space>
        )}
      </Drawer>

      {/* ===== MODAL ĐẶT LỊCH HẸN ===== */}
      <Modal
        centered
        title={isCustomer ? '🐾 Đặt Lịch Chăm Sóc Cho Bé' : 'Tạo Lịch Hẹn Mới Tại Quầy'}
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        width={680}
        footer={[
          <Button key="back" onClick={() => setCreateModalOpen(false)}>Hủy</Button>,
          <Button key="quote" loading={quoting} onClick={handleQuote}>Kiểm tra chỗ & Báo giá</Button>,
          <Button key="submit" type="primary" loading={loading} onClick={handleCreateBooking}>Xác nhận đặt</Button>,
        ]}
      >
        <Form form={form} layout="vertical" initialValues={{ booking_type: 'package' }}>
          <Form.Item
            name="pet"
            label={
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <span>Chọn bé cưng</span>
                <Button
                  type="link"
                  size="small"
                  icon={<RobotOutlined />}
                  onClick={openAiModalForSelectedPet}
                  style={{ padding: 0, height: 'auto', color: '#0f8b8d', fontWeight: 600 }}
                >
                  AI Gợi ý gói cho bé này
                </Button>
              </div>
            }
            rules={[{ required: true, message: 'Vui lòng chọn thú cưng' }]}
          >
            <Select
              placeholder="Chọn thú cưng"
              options={(isCustomer ? myPets : allPets).map((p) => ({
                value: p.id,
                label: `${p.name} (${p.species === 'dog' ? 'Chó' : 'Mèo'} - ${p.breed || 'chưa rõ'}) [Size: ${p.size_class || 'chưa rõ'}]`,
              }))}
            />
          </Form.Item>

          <Form.Item name="booking_type" label="Hình thức dịch vụ">
            <Radio.Group onChange={() => { form.setFieldsValue({ package: undefined, services: undefined }); setQuoteData(null) }}>
              <Radio.Button value="package">Đặt theo Gói combo</Radio.Button>
              <Radio.Button value="services">Chọn Dịch vụ lẻ</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.booking_type !== cur.booking_type}
          >
            {({ getFieldValue }) =>
              getFieldValue('booking_type') === 'package' ? (
                <Form.Item name="package" label="Chọn gói chăm sóc" rules={[{ required: true, message: 'Chọn gói' }]}>
                  <Select
                    placeholder="Chọn gói chăm sóc"
                    options={packages.map((pkg) => ({
                      value: pkg.id,
                      label: `${pkg.name} — ${pkg.items.map((i) => i.service_name).join(' + ')}`,
                    }))}
                  />
                </Form.Item>
              ) : (
                <Form.Item name="services" label="Chọn một hoặc nhiều dịch vụ" rules={[{ required: true, message: 'Chọn dịch vụ' }]}>
                  <Select
                    mode="multiple"
                    placeholder="Chọn các dịch vụ"
                    options={services.map((s) => ({
                      value: s.id,
                      label: `${s.name} (~${s.duration_minutes} phút)`,
                    }))}
                  />
                </Form.Item>
              )
            }
          </Form.Item>

          <Row gutter={16}>
            <Col span={14}>
              <Form.Item
                name="start_at"
                label="Ngày và giờ hẹn"
                rules={[{ required: true, message: 'Chọn thời gian bắt đầu' }]}
              >
                <DatePicker
                  showTime={{ format: 'HH:mm' }}
                  format="YYYY-MM-DD HH:mm"
                  style={{ width: '100%' }}
                  placeholder="Chọn ngày và giờ"
                  disabledDate={(d) => d && d < dayjs().startOf('day')}
                />
              </Form.Item>
            </Col>
            {!isCustomer && (
              <Col span={10}>
                <Form.Item name="staff" label="KTV phụ trách (tùy chọn)">
                  <Select
                    allowClear
                    placeholder="Tự động hoặc chọn thợ"
                    options={staffList.map((st) => ({
                      value: st.id,
                      label: st.full_name || st.username,
                    }))}
                  />
                </Form.Item>
              </Col>
            )}
          </Row>

          <Form.Item name="customer_note" label="Ghi chú đặc biệt cho spa (nếu có)">
            <Input.TextArea rows={2} placeholder="Ví dụ: Bé sợ tiếng sấy mạnh, bé đang hơi nhát người lạ..." />
          </Form.Item>

          {/* KẾT QUẢ BÁO GIÁ VÀ KIỂM TRA CHỖ */}
          {quoteData && (
            <div style={{ marginTop: 12 }}>
              {quoteData.feasible ? (
                <Alert
                  type="success"
                  showIcon
                  message={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Khung giờ khả dụng & còn tài nguyên!</span>
                      <Text strong style={{ fontSize: 16, color: '#0f8b8d' }}>
                        Tổng giá: {money(quoteData.total_price)}
                      </Text>
                    </div>
                  }
                  description={
                    <div>
                      <div>Thời gian dự kiến: {dayjs(quoteData.start_at).format('HH:mm')} - {dayjs(quoteData.end_at).format('HH:mm')}</div>
                      {quoteData.warnings?.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          {quoteData.warnings.map((w, idx) => (
                            <Tag key={idx} color="warning" icon={<WarningOutlined />}>{w.detail}</Tag>
                          ))}
                        </div>
                      )}
                    </div>
                  }
                />
              ) : (
                <Alert
                  type="error"
                  showIcon
                  message="Khung giờ này không khả dụng"
                  description={quoteData.conflict?.detail || 'Đã hết chỗ hoặc lịch bị trùng. Vui lòng chọn giờ khác.'}
                />
              )}
            </div>
          )}
        </Form>
      </Modal>

      {/* ===== MODAL HỦY LỊCH ===== */}
      <Modal
        centered
        title="Xác nhận hủy lịch hẹn"
        open={cancelModalOpen}
        onCancel={() => setCancelModalOpen(false)}
        onOk={submitCancel}
        okText="Xác nhận hủy"
        okButtonProps={{ danger: true }}
      >
        <Paragraph>Bạn có chắc chắn muốn hủy lịch hẹn cho bé <Text strong>{cancelTarget?.pet_info?.name}</Text>?</Paragraph>
        <Input.TextArea
          rows={3}
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="Nhập lý do hủy lịch hẹn (bắt buộc)..."
        />
      </Modal>

      {/* ===== MODAL GIAO THỢ ===== */}
      <Modal
        centered
        title={
          <Space>
            <RobotOutlined style={{ color: '#0f8b8d' }} />
            <span>Phân công Kỹ thuật viên (Gợi ý AI)</span>
          </Space>
        }
        open={assignModalOpen}
        onCancel={() => setAssignModalOpen(false)}
        onOk={submitAssign}
        okText="Xác nhận giao"
        cancelText="Đóng"
        width={560}
      >
        {loadingAiStaff ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Spin tip="AI đang phân tích ca làm việc, chuyên môn và lịch sử phục vụ thú cưng..." />
          </div>
        ) : (
          <div>
            {aiStaffSuggestions && aiStaffSuggestions.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <Text strong style={{ color: '#0f8b8d', fontSize: 13 }}>
                  ⭐ Đề xuất KTV phù hợp nhất cho lịch này:
                </Text>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {aiStaffSuggestions.map((sug, idx) => {
                    const stId = sug.staff || sug.staff_id
                    const isSelected = selectedStaffId === stId
                    return (
                      <Card
                        key={sug.id || stId}
                        size="small"
                        onClick={() => setSelectedStaffId(stId)}
                        style={{
                          cursor: 'pointer',
                          borderRadius: 8,
                          border: isSelected ? '2px solid #0f8b8d' : '1px solid #e2e8f0',
                          background: isSelected ? '#f0fdfa' : '#fff',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <Space>
                              <Text strong>{sug.staff_name || `KTV #${stId}`}</Text>
                              {idx === 0 && (
                                <Tag color="green">AI Khuyên chọn</Tag>
                              )}
                              {sug.score !== undefined && <Tag color="cyan">Điểm: {sug.score}</Tag>}
                            </Space>
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                              {sug.reason_text || (Array.isArray(sug.reasons) ? sug.reasons.join(' · ') : '')}
                            </div>
                          </div>
                          <Radio checked={isSelected} />
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Hoặc chọn thủ công kỹ thuật viên khác:
              </Text>
              <Select
                style={{ width: '100%', marginTop: 6 }}
                placeholder="Chọn kỹ thuật viên"
                value={selectedStaffId}
                onChange={setSelectedStaffId}
                options={staffList.map((st) => ({
                  value: st.id,
                  label: st.full_name || st.username,
                }))}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* ===== MODAL SỬA / DỜI LỊCH HẸN ===== */}
      <Modal
        centered
        title={`✏️ Sửa / Dời Lịch Hẹn #${editTarget?.id}`}
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        width={680}
        footer={[
          <Button key="back" onClick={() => setEditModalOpen(false)}>Hủy</Button>,
          <Button key="quote" loading={editQuoting} onClick={handleEditQuote}>Kiểm tra chỗ & Báo giá lại</Button>,
          <Button key="submit" type="primary" loading={loading} onClick={handleUpdateBooking}>Lưu thay đổi</Button>,
        ]}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="pet" label="Bé cưng" rules={[{ required: true, message: 'Chọn bé cưng' }]}>
            <Select
              placeholder="Chọn bé cưng"
              disabled={isCustomer}
              options={(isCustomer ? myPets : allPets).map((p) => ({
                value: p.id,
                label: `🐾 ${p.name} (${p.species === 'dog' ? 'Chó' : 'Mèo'} - ${p.breed || 'Không rõ'})`,
              }))}
            />
          </Form.Item>

          <Form.Item name="booking_type" label="Hình thức dịch vụ">
            <Radio.Group onChange={() => setEditQuoteData(null)}>
              <Radio.Button value="package">Gói combo</Radio.Button>
              <Radio.Button value="services">Dịch vụ lẻ</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) => prev.booking_type !== curr.booking_type}
          >
            {({ getFieldValue }) =>
              getFieldValue('booking_type') === 'package' ? (
                <Form.Item name="package" label="Chọn gói dịch vụ" rules={[{ required: true, message: 'Vui lòng chọn gói' }]}>
                  <Select
                    placeholder="Chọn gói chăm sóc"
                    onChange={() => setEditQuoteData(null)}
                    options={packages.map((pkg) => ({
                      value: pkg.id,
                      label: `${pkg.name} (${pkg.species_scope === 'cat' ? 'Dành cho mèo' : pkg.species_scope === 'dog' ? 'Dành cho chó' : 'Chó & Mèo'})`,
                    }))}
                  />
                </Form.Item>
              ) : (
                <Form.Item name="services" label="Chọn một hoặc nhiều dịch vụ lẻ" rules={[{ required: true, message: 'Vui lòng chọn dịch vụ' }]}>
                  <Select
                    mode="multiple"
                    placeholder="Chọn các dịch vụ"
                    onChange={() => setEditQuoteData(null)}
                    options={services.map((s) => ({
                      value: s.id,
                      label: `${s.name} (${s.duration_minutes} phút)`,
                    }))}
                  />
                </Form.Item>
              )
            }
          </Form.Item>

          <Row gutter={16}>
            <Col span={14}>
              <Form.Item
                name="start_at"
                label="Ngày và giờ hẹn mới"
                rules={[{ required: true, message: 'Chọn thời gian bắt đầu mới' }]}
              >
                <DatePicker
                  showTime={{ format: 'HH:mm' }}
                  format="YYYY-MM-DD HH:mm"
                  style={{ width: '100%' }}
                  placeholder="Chọn ngày và giờ mới"
                  disabledDate={(d) => d && d < dayjs().startOf('day')}
                  onChange={() => setEditQuoteData(null)}
                />
              </Form.Item>
            </Col>

            {isFrontDesk && (
              <Col span={10}>
                <Form.Item name="staff" label="Kỹ thuật viên phụ trách">
                  <Select
                    allowClear
                    placeholder="Để trống để gợi ý/chọn sau"
                    options={staffList.map((st) => ({
                      value: st.id,
                      label: st.full_name || st.username,
                    }))}
                  />
                </Form.Item>
              </Col>
            )}
          </Row>

          <Form.Item name="customer_note" label="Ghi chú yêu cầu của khách">
            <Input.TextArea rows={2} placeholder="Yêu cầu riêng (ví dụ: cắt ngắn lông đuôi, dùng sữa tắm dịu nhẹ...)" />
          </Form.Item>

          {isFrontDesk && (
            <Form.Item name="note" label="Ghi chú nội bộ spa">
              <Input.TextArea rows={2} placeholder="Lưu ý nội bộ cho kỹ thuật viên..." />
            </Form.Item>
          )}

          {editQuoteData && (
            <div style={{ marginTop: 12, marginBottom: 16 }}>
              {editQuoteData.feasible ? (
                <Alert
                  type="success"
                  showIcon
                  message={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Khung giờ khả dụng & còn tài nguyên!</span>
                      <Text strong style={{ fontSize: 16, color: '#0f8b8d' }}>
                        Tổng giá: {money(editQuoteData.total_price)}
                      </Text>
                    </div>
                  }
                  description={
                    <div>
                      <div>Thời gian dự kiến: {dayjs(editQuoteData.start_at).format('HH:mm')} - {dayjs(editQuoteData.end_at).format('HH:mm')}</div>
                      {editQuoteData.warnings?.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          {editQuoteData.warnings.map((w, idx) => (
                            <Tag key={idx} color="warning" icon={<WarningOutlined />}>{w.detail}</Tag>
                          ))}
                        </div>
                      )}
                    </div>
                  }
                />
              ) : (
                <Alert
                  type="error"
                  showIcon
                  message="Khung giờ này không khả dụng"
                  description={editQuoteData.conflict?.detail || 'Trùng lịch hoặc hết bàn/chuồng trong khung giờ này. Vui lòng chọn giờ khác.'}
                />
              )}
            </div>
          )}
        </Form>
      </Modal>

      {/* ===== AI PACKAGE MODAL ===== */}
      <AiPackageModal
        open={aiPetModalOpen}
        pet={aiPetTarget}
        onClose={() => setAiPetModalOpen(false)}
        onSelectPackage={(pkg) => {
          form.setFieldsValue({
            booking_type: 'package',
            package: pkg.id,
          })
          setQuoteData(null)
          // nếu đã có start_at thì tự động tính giá
          if (form.getFieldValue('start_at')) {
            handleQuote()
          }
        }}
      />
    </div>
  )
}
