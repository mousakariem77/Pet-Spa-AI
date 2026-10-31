import { useEffect, useState, useCallback } from 'react'
import {
  Alert, App, Badge, Button, Card, Col, Descriptions, Divider, Drawer, Dropdown, Empty, Form, Input,
  Modal, Row, Segmented, Select, Space, Statistic, Switch, Table, Tag, TimePicker,
  Tooltip, Typography,
} from 'antd'
import {
  BellOutlined, CalendarOutlined, CheckCircleOutlined,
  ClockCircleOutlined, CloseCircleOutlined, CustomerServiceOutlined,
  ExclamationCircleOutlined, EyeOutlined, FilterOutlined, HistoryOutlined,
  InfoCircleOutlined, MoreOutlined, ReloadOutlined,
  SearchOutlined, SendOutlined, SettingOutlined, SyncOutlined, CheckOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { api, money, unwrap } from '../api.js'
import { useAuth } from '../auth.jsx'
import RowPerPageSelect from '../components/RowPerPageSelect.jsx'
import PetAvatar from '../components/PetAvatar.jsx'

const { Title, Text, Paragraph } = Typography

const STATUS_TAGS = {
  suggested: { label: 'Chờ duyệt', color: 'gold' },
  approved: { label: 'Đã duyệt', color: 'blue' },
  sent: { label: 'Đã gửi thông báo', color: 'cyan' },
  booked: { label: 'Đã đặt lại lịch', color: 'green' },
  dismissed: { label: 'Đã bỏ qua', color: 'default' },
}

const TIME_PRESET_OPTIONS = [
  { value: '06:00', label: '06:00 sáng' },
  { value: '07:00', label: '07:00 sáng' },
  { value: '08:00', label: '08:00 sáng (Khuyên dùng)' },
  { value: '09:00', label: '09:00 sáng' },
  { value: '10:00', label: '10:00 sáng' },
  { value: '12:00', label: '12:00 trưa' },
  { value: '15:00', label: '15:00 chiều' },
  { value: '18:00', label: '18:00 chiều' },
  { value: '20:00', label: '20:00 tối' },
  { value: 'custom', label: '⏰ Tùy chỉnh giờ khác...' },
]
const PRESET_VALUES = ['06:00', '07:00', '08:00', '09:00', '10:00', '12:00', '15:00', '18:00', '20:00']

export default function RebookReminders() {
  const { user } = useAuth()
  const { message, modal } = App.useApp()
  const nav = useNavigate()
  const isCustomer = user?.role === 'customer'
  const isStaff = ['receptionist', 'manager'].includes(user?.role)

  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [reminders, setReminders] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [scanning, setScanning] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState(null)
  const [detailReminder, setDetailReminder] = useState(null)

  // Cài đặt tự động quét
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [settings, setSettings] = useState(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [runningScan, setRunningScan] = useState(false)
  const [timeMode, setTimeMode] = useState('preset') // 'preset' | 'custom'
  const [selectedPreset, setSelectedPreset] = useState('08:00')
  const [customTime, setCustomTime] = useState(dayjs('08:00', 'HH:mm'))
  const [formSettings] = Form.useForm()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      const res = await api(`/rebook-reminders?${params.toString()}`)
      setReminders(unwrap(res))
    } catch (e) {
      message.error(e.message || 'Không thể tải danh sách nhắc tái spa')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, message])

  const loadSettings = useCallback(async () => {
    if (!isStaff) return
    try {
      const res = await api('/rebook-reminders/settings')
      setSettings(res)
      const curTime = res.scan_time || '08:00'
      const isPreset = PRESET_VALUES.includes(curTime)
      setTimeMode(isPreset ? 'preset' : 'custom')
      setSelectedPreset(isPreset ? curTime : '08:00')
      setCustomTime(dayjs(curTime, 'HH:mm'))
      formSettings.setFieldsValue({
        auto_scan_enabled: res.auto_scan_enabled,
        auto_approve: res.auto_approve,
        advance_days: res.advance_days ?? 0,
      })
    } catch {
      // Bỏ qua lỗi nếu chưa có quyền
    }
  }, [isStaff, formSettings])

  useEffect(() => {
    loadData()
    loadSettings()
  }, [loadData, loadSettings])

  // Quét và sinh nhắc mới theo chu kỳ
  const handleGenerate = async () => {
    setScanning(true)
    try {
      const res = await api('/rebook-reminders/generate', { method: 'POST' })
      message.success(
        res.message || (res.created_count > 0
          ? `Đã phân tích xong: Tạo mới ${res.created_count} lời nhắc tái spa định kỳ!`
          : 'Đã quét xong: Chưa có thú cưng nào đến chu kỳ tái spa mới.')
      )
      loadData()
      loadSettings()
    } catch (e) {
      message.error(e.message || 'Không thể quét nhắc tái spa')
    } finally {
      setScanning(false)
    }
  }

  // Lưu cấu hình cài đặt tự động
  const handleSaveSettings = async (values) => {
    let finalScanTime = '08:00'
    if (timeMode === 'custom') {
      if (customTime && customTime.isValid && customTime.isValid()) {
        finalScanTime = customTime.format('HH:mm')
      } else {
        message.warning('Vui lòng chọn thời gian quét hợp lệ (HH:mm)')
        return
      }
    } else {
      finalScanTime = (selectedPreset && selectedPreset !== 'custom') ? selectedPreset : '08:00'
    }

    setSavingSettings(true)
    try {
      const res = await api('/rebook-reminders/settings', {
        method: 'POST',
        body: {
          ...values,
          scan_time: finalScanTime,
        },
      })
      setSettings(res)
      message.success('Đã lưu cấu hình tự động quét & nhắc tái spa!')
      setSettingsModalOpen(false)
    } catch (e) {
      message.error(e.message || 'Không thể lưu cấu hình')
    } finally {
      setSavingSettings(false)
    }
  }

  // Chạy quét tự động ngay từ modal cài đặt
  const handleRunScanNow = async () => {
    setRunningScan(true)
    try {
      const res = await api('/rebook-reminders/run-auto-scan', { method: 'POST' })
      message.success(res.message || 'Đã chạy quét tự động xong!')
      loadData()
      loadSettings()
    } catch (e) {
      message.error(e.message || 'Không thể chạy quét tự động')
    } finally {
      setRunningScan(false)
    }
  }

  // Duyệt và gửi thông báo
  const handleApprove = async (id) => {
    setActionLoadingId(id)
    try {
      await api(`/rebook-reminders/${id}/approve`, { method: 'POST' })
      message.success('Đã duyệt và gửi thông báo nhắc lịch cho khách hàng!')
      loadData()
    } catch (e) {
      message.error(e.message || 'Không thể duyệt nhắc nhở')
    } finally {
      setActionLoadingId(null)
    }
  }

  // Bỏ qua lời nhắc
  const handleDismiss = async (id) => {
    setActionLoadingId(id)
    try {
      await api(`/rebook-reminders/${id}/dismiss`, { method: 'POST' })
      message.info('Đã bỏ qua lời nhắc này.')
      loadData()
    } catch (e) {
      message.error(e.message || 'Không thể bỏ qua nhắc nhở')
    } finally {
      setActionLoadingId(null)
    }
  }

  // Đánh dấu đã đặt lịch
  const handleMarkBooked = async (id) => {
    setActionLoadingId(id)
    try {
      await api(`/rebook-reminders/${id}/mark-booked`, { method: 'POST' })
      message.success('Đã chuyển trạng thái sang "Đã đặt lại lịch"!')
      loadData()
      if (detailReminder?.id === id) {
        setDetailReminder(null)
      }
    } catch (e) {
      message.error(e.message || 'Không thể cập nhật trạng thái')
    } finally {
      setActionLoadingId(null)
    }
  }

  // Hộp thoại xác nhận duyệt & gửi
  const confirmApprove = (r) => {
    modal.confirm({
      title: `Duyệt & gửi thông báo nhắc tái spa?`,
      icon: <SendOutlined style={{ color: '#0f8b8d', fontSize: 22 }} />,
      content: (
        <div style={{ marginTop: 8 }}>
          <div>Hệ thống sẽ gửi thông báo trong ứng dụng cho khách hàng <strong>{r.client_name || 'Khách hàng'}</strong> ({r.client_phone || 'Chưa có SĐT'}) để nhắc lịch cho bé <strong>{r.pet_name}</strong>.</div>
          <div style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>
            Gói chăm sóc đề xuất: <strong>{r.suggested_package_name || r.package_name || 'Gói Chăm Sóc Định Kỳ'}</strong>
            {r.suggested_package_price ? ` (${money(r.suggested_package_price)})` : ''}
          </div>
        </div>
      ),
      okText: 'Duyệt & Gửi ngay',
      cancelText: 'Hủy',
      okButtonProps: { style: { background: '#0f8b8d', borderColor: '#0f8b8d' } },
      onOk: async () => {
        await handleApprove(r.id)
        if (detailReminder?.id === r.id) {
          setDetailReminder(null)
        }
      },
    })
  }

  // Hộp thoại xác nhận bỏ qua (đồng bộ Modal.confirm)
  const confirmDismiss = (r) => {
    modal.confirm({
      title: `Bỏ qua nhắc nhở cho bé ${r.pet_name}?`,
      icon: <ExclamationCircleOutlined style={{ color: '#ef4444', fontSize: 22 }} />,
      content: (
        <div style={{ marginTop: 8 }}>
          Lời nhắc tái spa cho bé <strong>{r.pet_name}</strong> sẽ được chuyển sang trạng thái <strong>Đã bỏ qua</strong> và không gửi thông báo tới khách hàng.
        </div>
      ),
      okText: 'Bỏ qua nhắc nhở',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: async () => {
        await handleDismiss(r.id)
        if (detailReminder?.id === r.id) {
          setDetailReminder(null)
        }
      },
    })
  }

  // Chuyển sang trang tạo lịch hẹn
  const handleBookNow = (r) => {
    const petId = r.pet
    const pkgId = r.package_id || ''
    if (detailReminder) setDetailReminder(null)
    nav(`/app/lich-hen?pet=${petId}${pkgId ? `&package=${pkgId}` : ''}`)
  }

  // Thống kê nhanh
  const counts = {
    all: reminders.length,
    suggested: reminders.filter((r) => r.status === 'suggested').length,
    sent: reminders.filter((r) => ['approved', 'sent'].includes(r.status)).length,
    booked: reminders.filter((r) => r.status === 'booked').length,
  }

  // Lọc tìm kiếm
  const filteredReminders = reminders.filter((r) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      (r.pet_name && r.pet_name.toLowerCase().includes(q)) ||
      (r.client_name && r.client_name.toLowerCase().includes(q)) ||
      (r.client_phone && r.client_phone.includes(q)) ||
      (r.suggested_package_name && r.suggested_package_name.toLowerCase().includes(q)) ||
      (r.package_name && r.package_name.toLowerCase().includes(q))
    )
  })

  // Định dạng cân nặng gọn gàng, bỏ phần thập phân nếu chẵn (.00)
  const formatWeight = (w) => {
    if (w == null) return ''
    const num = Number(w)
    return isNaN(num) ? `${w}kg` : `${num}kg`
  }

  const columns = [
    ...(!isCustomer
      ? [
        {
          title: 'Khách hàng',
          key: 'client',
          render: (_, r) => (
            <div>
              <Text strong style={{ color: '#1e293b' }}>{r.client_name || 'Khách vãng lai'}</Text>
              {r.client_phone && (
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  📞 {r.client_phone}
                </div>
              )}
            </div>
          ),
        },
      ]
      : []),
    {
      title: 'Thú cưng',
      key: 'pet',
      render: (_, r) => {
        const species = r.pet_species || r.pet_info?.species || 'dog'
        const breed = r.pet_breed || r.pet_info?.breed
        const weight = r.pet_weight_kg ?? r.pet_info?.weight_kg
        const sizeClass = r.pet_size || r.pet_info?.size_class

        return (
          <Space align="center" size={12}>
            <Tooltip
              placement="topLeft"
              title={
                <div style={{ padding: '2px 4px' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#fff', marginBottom: 2 }}>
                    {r.pet_name || `Bé #${r.pet}`}
                  </div>
                  <div style={{ fontSize: 12, color: '#e2e8f0' }}>
                    {breed || (species === 'cat' ? 'Mèo' : 'Chó')}
                  </div>
                  {weight != null && (
                    <div style={{ fontSize: 11, color: '#93c5fd', marginTop: 2 }}>
                      {formatWeight(weight)} {sizeClass ? `(Size ${sizeClass})` : ''}
                    </div>
                  )}
                </div>
              }
            >
              <div
                style={{
                  cursor: 'pointer',
                  display: 'inline-block',
                  borderRadius: '50%',
                  transition: 'transform 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)' }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none' }}
              >
                <PetAvatar
                  species={species}
                  size={40}
                  style={{
                    border: '2.5px solid #ffffff',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                  }}
                />
              </div>
            </Tooltip>
            <div>
              <div style={{ color: '#0b3d3f', fontSize: 14, fontWeight: 700 }}>
                {r.pet_name || `Bé #${r.pet}`}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {breed || '—'}
                {weight != null ? ` (${formatWeight(weight)})` : ''}
              </div>
            </div>
          </Space>
        )
      },
    },
    {
      title: 'Lần spa gần nhất',
      dataIndex: 'last_booking_date',
      render: (d) => (
        <div>
          <div style={{ fontWeight: 500 }}>{d ? dayjs(d).format('DD/MM/YYYY') : 'Chưa có'}</div>
          {d && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              ({dayjs().diff(dayjs(d), 'day')} ngày trước)
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Gói chăm sóc đề xuất',
      key: 'pkg',
      render: (_, r) => (
        <div>
          <Tooltip title={r.reason || r.reason_text} placement="topLeft">
            <Tag color="cyan" style={{ fontWeight: 600, fontSize: 13, padding: '2px 8px', cursor: 'pointer' }}>
              {r.suggested_package_name || r.package_name || 'Gói Chăm Sóc Định Kỳ'}
            </Tag>
          </Tooltip>
          {r.suggested_package_price != null && (
            <div style={{ fontSize: 12, color: '#d97706', fontWeight: 600, marginTop: 4 }}>
              {money(r.suggested_package_price)}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Hạn chu kỳ',
      key: 'due',
      render: (_, r) => {
        const overdue = (r.days_overdue ?? r.overdue_days) || 0
        const isOverdue = overdue > 0
        return (
          <div>
            <Tag color={isOverdue ? 'red' : 'blue'}>
              Chu kỳ {r.cycle_days || 14} ngày
            </Tag>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {isOverdue ? (
                <Text type="danger" strong>
                  Quá hạn {overdue} ngày
                </Text>
              ) : (
                <Text type="secondary">
                  Đến hạn: {r.due_date ? dayjs(r.due_date).format('DD/MM/YYYY') : 'Hôm nay'}
                </Text>
              )}
            </div>
          </div>
        )
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (st) => {
        const item = STATUS_TAGS[st] || { label: st, color: 'default' }
        return <Tag color={item.color}>{item.label}</Tag>
      },
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 120,
      render: (_, r) => {
        const moreItems = []

        if (isStaff) {
          if (r.status === 'suggested') {
            moreItems.push(
              {
                key: 'approve',
                label: 'Duyệt & Gửi tin',
                icon: <SendOutlined style={{ color: '#0f8b8d' }} />,
                onClick: () => confirmApprove(r),
              },
              {
                key: 'book',
                label: 'Đặt lịch cho bé',
                icon: <CalendarOutlined />,
                onClick: () => handleBookNow(r),
              },
              {
                type: 'divider',
              },
              {
                key: 'dismiss',
                label: 'Bỏ qua nhắc nhở',
                icon: <CloseCircleOutlined />,
                danger: true,
                onClick: () => confirmDismiss(r),
              }
            )
          } else if (['approved', 'sent'].includes(r.status)) {
            moreItems.push(
              {
                key: 'book',
                label: 'Đặt lịch cho bé',
                icon: <CalendarOutlined />,
                onClick: () => handleBookNow(r),
              },
              {
                key: 'mark_booked',
                label: 'Đánh dấu đã đặt lịch',
                icon: <CheckCircleOutlined style={{ color: '#16a34a' }} />,
                onClick: () => handleMarkBooked(r.id),
              },
              {
                type: 'divider',
              },
              {
                key: 'dismiss',
                label: 'Bỏ qua nhắc nhở',
                icon: <CloseCircleOutlined />,
                danger: true,
                onClick: () => confirmDismiss(r),
              }
            )
          } else if (r.status === 'booked') {
            moreItems.push(
              {
                key: 'book_more',
                label: 'Đặt thêm lịch mới',
                icon: <CalendarOutlined />,
                onClick: () => handleBookNow(r),
              }
            )
          }
        }

        if (isCustomer && ['suggested', 'approved', 'sent'].includes(r.status)) {
          moreItems.push(
            {
              key: 'book_now',
              label: 'Đặt lịch ngay',
              icon: <CalendarOutlined style={{ color: '#0f8b8d' }} />,
              onClick: () => nav('/app/lich-hen'),
            }
          )
        }

        return (
          <Space size={6} onClick={(e) => e.stopPropagation()}>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={(e) => {
                e.stopPropagation()
                setDetailReminder(r)
              }}
              style={{ borderRadius: 6 }}
            >
              Chi tiết
            </Button>
            {moreItems.length > 0 && (
              <span onClick={(e) => e.stopPropagation()}>
                <Dropdown
                  menu={{ items: moreItems }}
                  trigger={['click']}
                  placement="bottomRight"
                >
                  <Button
                    size="small"
                    icon={<MoreOutlined />}
                    style={{ borderRadius: 6, padding: '0 8px' }}
                  />
                </Dropdown>
              </span>
            )}
          </Space>
        )
      },
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Title level={3} style={{ margin: 0, color: '#0b3d3f' }}>
              <HistoryOutlined style={{ marginRight: 8, color: '#0f8b8d' }} />
              {isCustomer ? 'Nhắc Tái Spa Định Kỳ Cho Thú Cưng' : 'Quản Lý Nhắc Tái Spa Định Kỳ'}
            </Title>
            {isStaff && settings && (
              <Tag
                color={settings.auto_scan_enabled ? 'processing' : 'default'}
                style={{ borderRadius: 12, padding: '2px 10px', fontSize: 12 }}
              >
                {settings.auto_scan_enabled
                  ? `Tự động quét: BẬT (${settings.scan_time || '08:00'})`
                  : 'Tự động quét: ĐANG TẮT'}
              </Tag>
            )}
          </div>
          <Text type="secondary">
            {isCustomer
              ? 'Lịch sử và khuyến nghị chu kỳ chăm sóc tối ưu để các bé luôn sạch sẽ, thơm tho và khỏe mạnh.'
              : 'Hệ thống tự động tính toán chu kỳ theo quy chuẩn từng giống, loại lông và lần làm trước để nhắc khách đặt lại đúng hạn.'}
          </Text>
        </div>

        {isStaff && (
          <Space wrap>
            <Button
              icon={<SettingOutlined />}
              onClick={() => {
                const curTime = settings?.scan_time || '08:00'
                const isPreset = PRESET_VALUES.includes(curTime)
                setTimeMode(isPreset ? 'preset' : 'custom')
                setSelectedPreset(isPreset ? curTime : '08:00')
                setCustomTime(dayjs(curTime, 'HH:mm'))
                formSettings.setFieldsValue({
                  auto_scan_enabled: settings?.auto_scan_enabled ?? true,
                  auto_approve: settings?.auto_approve ?? false,
                  advance_days: settings?.advance_days ?? 0,
                })
                setSettingsModalOpen(true)
              }}
            >
              Cài đặt tự động
            </Button>
            <Button
              type="primary"
              icon={<SyncOutlined spin={scanning} />}
              loading={scanning}
              onClick={handleGenerate}
              style={{ background: '#0f8b8d', borderColor: '#0f8b8d', fontWeight: 600 }}
            >
              Quét Nhắc Tái Spa Mới
            </Button>
            <Button icon={<ReloadOutlined />} onClick={loadData}>
              Làm mới
            </Button>
          </Space>
        )}
      </div>

      {/* Banner hướng dẫn nhanh */}
      {isStaff && (
        <Alert
          message="Cơ chế tự động phân tích & tạo lời nhắc chu kỳ"
          description={
            <div style={{ fontSize: 13, lineHeight: 1.6, color: '#334155' }}>
              <div>• <strong>Đối tượng quét:</strong> Tất cả thú cưng đã hoàn tất dịch vụ trước đó và chưa có lịch hẹn mới trong tương lai.</div>
              <div>• <strong>Thuật toán chu kỳ:</strong> Đối chiếu ngày hoàn tất lần trước với cấu hình <em>Quy Chuẩn Chu Kỳ Tái Spa</em> (trong menu Quản trị AI & SOP) để xác định các bé đã đến hạn hoặc quá hạn chăm sóc.</div>
              <div>• <strong>Quy trình xử lý:</strong> Hệ thống tự động tạo lời nhắc ➔ Tự động gửi thông báo (nếu bật cấu hình Auto) hoặc lễ tân bấm duyệt ➔ Khách nhận thông báo và đặt lịch mới ➔ Trạng thái tự động đổi thành <Tag color="green">Đã đặt lại lịch</Tag>.</div>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: 20, borderRadius: 8, background: '#f0fdfa', borderColor: '#99f6e4' }}
        />
      )}

      {/* Thống kê cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col span={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Tổng lượt nhắc"
              value={counts.all}
              prefix={<BellOutlined style={{ color: '#0f8b8d' }} />}
            />
          </Card>
        </Col>
        <Col span={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Chờ duyệt gửi"
              value={counts.suggested}
              valueStyle={{ color: '#d97706' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Đã gửi thông báo"
              value={counts.sent}
              valueStyle={{ color: '#0284c7' }}
              prefix={<SendOutlined />}
            />
          </Card>
        </Col>
        <Col span={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Khách đã đặt lại"
              value={counts.booked}
              valueStyle={{ color: '#16a34a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Bộ lọc & Tìm kiếm */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 8 }}>
        <Row gutter={[16, 12]} align="middle">
          <Col span={24} md={10}>
            <Input
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              placeholder="Tìm theo tên bé, chủ nuôi hoặc số điện thoại..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              allowClear
            />
          </Col>
          <Col span={24} md={8}>
            <Select
              style={{ width: '100%' }}
              placeholder="Lọc theo trạng thái"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: '', label: 'Tất cả trạng thái' },
                { value: 'suggested', label: 'Chờ duyệt (Suggested)' },
                { value: 'approved', label: 'Đã duyệt (Approved)' },
                { value: 'sent', label: 'Đã gửi thông báo (Sent)' },
                { value: 'booked', label: 'Đã đặt lại lịch (Booked)' },
                { value: 'dismissed', label: 'Đã bỏ qua (Dismissed)' },
              ]}
            />
          </Col>
          <Col span={24} md={6} style={{ textAlign: 'right' }}>
            <Text type="secondary">
              Hiển thị: <strong>{filteredReminders.length}</strong> kết quả
            </Text>
          </Col>
        </Row>
      </Card>

      {/* Thanh tùy chọn & số dòng hiển thị */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>💡 Bấm vào bất kỳ dòng nào để xem chi tiết phân tích & gửi tin</Text>
        <RowPerPageSelect value={pageSize} onChange={(ps) => { setPageSize(ps); setPage(1); }} />
      </div>

      {/* Bảng danh sách */}
      <Table
        rowKey="id"
        loading={loading}
        dataSource={filteredReminders}
        columns={columns}
        scroll={{ x: 'max-content' }}
        rowClassName={() => 'clickable-row'}
        onRow={(record) => ({
          onClick: () => setDetailReminder(record),
          style: { cursor: 'pointer' },
        })}
        locale={{
          emptyText: (
            <Empty
              description="Chưa có lời nhắc tái spa nào."
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              {isStaff && (
                <Button type="primary" onClick={handleGenerate} style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}>
                  Quét tự động ngay
                </Button>
              )}
            </Empty>
          ),
        }}
        pagination={{
          position: ['bottomRight'],
          current: page,
          pageSize: pageSize,
          showSizeChanger: false,
          showTotal: (t, range) => `${range[0]}-${range[1]} / ${t} lời nhắc`,
          onChange: (p) => setPage(p),
        }}
      />

      {/* ===== DRAWER XEM CHI TIẾT NHẮC TÁI SPA ===== */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <PetAvatar
              species={detailReminder?.pet_species || detailReminder?.pet_info?.species}
              size={44}
              style={{
                border: '2px solid #ffffff',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            />
            <div>
              <Typography.Text strong style={{ fontSize: 16, color: '#0b3d3f' }}>
                Chi tiết nhắc tái spa: {detailReminder?.pet_name}
              </Typography.Text>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Mã nhắc nhở: #{detailReminder?.id}
                </Typography.Text>
              </div>
            </div>
          </div>
        }
        open={!!detailReminder}
        onClose={() => setDetailReminder(null)}
        width={560}
        extra={
          <Space>
            {isStaff && detailReminder?.status === 'suggested' && (
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={actionLoadingId === detailReminder?.id}
                onClick={() => confirmApprove(detailReminder)}
                style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
              >
                Duyệt & Gửi
              </Button>
            )}
            {isStaff && ['suggested', 'approved', 'sent'].includes(detailReminder?.status) && (
              <Button
                type="primary"
                icon={<CalendarOutlined />}
                onClick={() => handleBookNow(detailReminder)}
                style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
              >
                Đặt lịch hẹn
              </Button>
            )}
          </Space>
        }
      >
        {detailReminder && (
          <div>
            <Descriptions bordered column={1} size="small" style={{ marginBottom: 20 }}>
              <Descriptions.Item label="Thú cưng">
                <Space align="center" size={10}>
                  <PetAvatar
                    species={detailReminder.pet_species || detailReminder.pet_info?.species}
                    size={32}
                  />
                  <div>
                    <Typography.Link onClick={() => { setDetailReminder(null); nav(`/app/thu-cung?q=${detailReminder.pet_name}`) }}>
                      <strong>{detailReminder.pet_name}</strong>
                    </Typography.Link>
                    <span style={{ fontSize: 12, color: '#64748b', marginLeft: 6 }}>
                      ({detailReminder.pet_breed || detailReminder.pet_info?.breed || 'Chưa rõ giống'}
                      {detailReminder.pet_weight_kg || detailReminder.pet_info?.weight_kg ? ` · ${formatWeight(detailReminder.pet_weight_kg || detailReminder.pet_info?.weight_kg)}` : ''})
                    </span>
                  </div>
                </Space>
              </Descriptions.Item>

              <Descriptions.Item label="Chủ nuôi">
                <Typography.Link onClick={() => { setDetailReminder(null); nav(`/app/khach-hang?q=${detailReminder.client_name}`) }}>
                  👤 <strong>{detailReminder.client_name || 'Khách vãng lai'}</strong> {detailReminder.client_phone ? `(${detailReminder.client_phone})` : ''}
                </Typography.Link>
              </Descriptions.Item>

              <Descriptions.Item label="Trạng thái">
                <Tag color={STATUS_TAGS[detailReminder.status]?.color}>
                  {STATUS_TAGS[detailReminder.status]?.label}
                </Tag>
              </Descriptions.Item>

              <Descriptions.Item label="Gói dịch vụ đề xuất">
                <strong style={{ color: '#0f8b8d', fontSize: 15 }}>
                  {detailReminder.suggested_package_name || detailReminder.package_name || 'Gói Chăm Sóc Định Kỳ'}
                </strong>
                {detailReminder.suggested_package_price != null && (
                  <div style={{ color: '#d97706', fontWeight: 600, marginTop: 4 }}>
                    Giá dịch vụ ước tính: {money(detailReminder.suggested_package_price)}
                  </div>
                )}
              </Descriptions.Item>

              <Descriptions.Item label="Lý do đề xuất chu kỳ">
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  💡 {detailReminder.reason || detailReminder.reason_text || 'Đến hạn chu kỳ chăm sóc lông da định kỳ theo khuyến nghị chuyên gia.'}
                </div>
              </Descriptions.Item>

              <Descriptions.Item label="Chu kỳ chăm sóc chuẩn">
                <Tag color="cyan">Mỗi {detailReminder.cycle_days || 14} ngày</Tag>
              </Descriptions.Item>

              <Descriptions.Item label="Tình trạng đến hạn">
                {(detailReminder.days_overdue ?? detailReminder.overdue_days) > 0 ? (
                  <Text type="danger" strong>
                    Quá hạn {detailReminder.days_overdue ?? detailReminder.overdue_days} ngày (Hạn tái spa: {dayjs(detailReminder.due_date).format('DD/MM/YYYY')})
                  </Text>
                ) : (
                  <Text type="success">
                    Đến hạn hôm nay ({dayjs(detailReminder.due_date).format('DD/MM/YYYY')})
                  </Text>
                )}
              </Descriptions.Item>

              <Descriptions.Item label="Lịch hẹn gần nhất">
                {detailReminder.last_booking_date ? (
                  <span>Lịch #{detailReminder.last_booking} vào ngày {dayjs(detailReminder.last_booking_date).format('DD/MM/YYYY')}</span>
                ) : (
                  <Text type="secondary">Chưa có thông tin lịch hẹn cũ</Text>
                )}
              </Descriptions.Item>
            </Descriptions>

            {/* Thao tác bổ sung trong drawer */}
            {isStaff && (
              <Card size="small" title="Thao tác nhanh cho nhân viên" style={{ borderRadius: 8, background: '#f8fafc' }}>
                <Space wrap>
                  {['suggested', 'approved', 'sent'].includes(detailReminder.status) && (
                    <Button
                      icon={<CheckOutlined />}
                      loading={actionLoadingId === detailReminder.id}
                      onClick={() => handleMarkBooked(detailReminder.id)}
                    >
                      Đánh dấu đã đặt lịch
                    </Button>
                  )}
                  {detailReminder.status === 'suggested' && (
                    <Button
                      danger
                      icon={<CloseCircleOutlined />}
                      loading={actionLoadingId === detailReminder.id}
                      onClick={() => confirmDismiss(detailReminder)}
                    >
                      Bỏ qua nhắc nhở này
                    </Button>
                  )}
                </Space>
              </Card>
            )}
          </div>
        )}
      </Drawer>

      {/* ===== MODAL CÀI ĐẶT TỰ ĐỘNG QUÉT & NHẮC TÁI SPA ===== */}
      <Modal
        title={
          <Space>
            <SettingOutlined style={{ color: '#0f8b8d', fontSize: 18 }} />
            <span style={{ color: '#0b3d3f', fontWeight: 700 }}>Cài Đặt Tự Động Quét & Nhắc Tái Spa Định Kỳ</span>
          </Space>
        }
        open={settingsModalOpen}
        onCancel={() => setSettingsModalOpen(false)}
        footer={null}
        width={560}
      >
        <Form
          form={formSettings}
          layout="vertical"
          onFinish={handleSaveSettings}
          style={{ marginTop: 16 }}
        >
          <Card size="small" style={{ marginBottom: 16, background: '#f8fafc', borderColor: '#e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ paddingRight: 16 }}>
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>
                  1. Tự động quét chu kỳ hàng ngày
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Hệ thống tự động chạy rà soát các bé đến hạn chăm sóc theo khung giờ đã đặt bên dưới.
                </div>
              </div>
              <Form.Item name="auto_scan_enabled" valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
            </div>

            <Divider style={{ margin: '12px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ paddingRight: 16 }}>
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>
                  2. Tự động gửi thông báo (Không cần duyệt thủ công)
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Tự động phát thông báo quả chuông cho khách ngay khi quét xong. Nếu tắt, lời nhắc sẽ ở trạng thái <Tag color="gold" style={{ margin: '0 2px' }}>Chờ duyệt</Tag> để lễ tân kiểm tra trước khi gửi.
                </div>
              </div>
              <Form.Item name="auto_approve" valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
            </div>
          </Card>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Khung giờ quét"
                tooltip="Hệ thống sẽ chạy kiểm tra tự động hàng ngày khi đến khung giờ này"
                style={{ marginBottom: 16 }}
              >
                {timeMode === 'preset' ? (
                  <Select
                    value={selectedPreset}
                    onChange={(val) => {
                      if (val === 'custom') {
                        setTimeMode('custom')
                      } else {
                        setSelectedPreset(val)
                      }
                    }}
                    options={TIME_PRESET_OPTIONS}
                    style={{ width: '100%' }}
                  />
                ) : (
                  <TimePicker
                    format="HH:mm"
                    minuteStep={1}
                    needConfirm={false}
                    style={{ width: '100%' }}
                    placeholder="Chọn giờ : phút (HH:mm)"
                    value={customTime}
                    onChange={(t) => setCustomTime(t)}
                  />
                )}
                <div style={{ fontSize: 11, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {timeMode === 'preset' ? (
                    <>
                      <span style={{ color: '#64748b' }}>Giờ chuẩn gợi ý</span>
                      <Button
                        type="link"
                        size="small"
                        style={{ padding: 0, height: 'auto', fontSize: 11, color: '#0f8b8d' }}
                        onClick={() => setTimeMode('custom')}
                      >
                        ⏰ Tự chọn giờ khác
                      </Button>
                    </>
                  ) : (
                    <>
                      <span style={{ color: '#0f8b8d' }}>⏰ Giờ tùy chỉnh linh hoạt</span>
                      <Button
                        type="link"
                        size="small"
                        style={{ padding: 0, height: 'auto', fontSize: 11, color: '#64748b' }}
                        onClick={() => {
                          setTimeMode('preset')
                          setSelectedPreset('08:00')
                        }}
                      >
                        Dùng giờ gợi ý
                      </Button>
                    </>
                  )}
                </div>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="advance_days"
                label="Thời điểm kích hoạt nhắc"
                tooltip="Tạo lời nhắc trước khi đến hạn chu kỳ bao nhiêu ngày"
                style={{ marginBottom: 16 }}
              >
                <Select
                  options={[
                    { value: 0, label: 'Đúng ngày đến hạn (0 ngày)' },
                    { value: 3, label: 'Trước hạn 3 ngày' },
                    { value: 5, label: 'Trước hạn 5 ngày' },
                    { value: 7, label: 'Trước hạn 7 ngày' },
                  ]}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: 11, marginTop: 4, color: '#64748b' }}>
                  Tạo trước hạn để kịp liên hệ và sắp xếp lịch
                </div>
              </Form.Item>
            </Col>
          </Row>

          <Alert
            type="info"
            showIcon
            message="Thông tin vận hành & kiểm thử"
            description={
              <div style={{ fontSize: 12, lineHeight: 1.6, color: '#334155' }}>
                <div>• <strong>Hình thức thông báo:</strong> Thông báo quả chuông nội bộ trong ứng dụng (In-app Notification).</div>
                <div>• <strong>Lần quét tự động gần nhất:</strong> {settings?.last_scanned_at ? dayjs(settings.last_scanned_at).format('DD/MM/YYYY HH:mm:ss') : 'Chưa quét lần nào'}.</div>
              </div>
            }
            style={{ marginBottom: 20 }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button
              icon={<SyncOutlined spin={runningScan} />}
              loading={runningScan}
              onClick={handleRunScanNow}
            >
              Chạy quét thử ngay
            </Button>
            <Space>
              <Button onClick={() => setSettingsModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={savingSettings}
                style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
              >
                Lưu cấu hình
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  )
}
