import { useCallback, useEffect, useState } from 'react'
import {
  Alert, App, Avatar, Badge, Button, Card, Col, DatePicker, Descriptions,
  Divider, Drawer, Dropdown, Empty, Form, Input, Modal, Popconfirm,
  Row, Select, Space, Switch, Table, Tag, Tooltip,
  Typography,
} from 'antd'
import {
  CalendarOutlined, DeleteOutlined, DollarOutlined, EditOutlined,
  ExclamationCircleOutlined, EyeOutlined, HistoryOutlined, IdcardOutlined,
  LockOutlined, MedicineBoxOutlined, MoreOutlined, PlusOutlined,
  ReloadOutlined, RobotOutlined, ThunderboltOutlined, UserOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { api, money, toFormErrors, unwrap } from '../api.js'
import RowPerPageSelect from '../components/RowPerPageSelect.jsx'
import AiPackageModal from '../components/AiPackageModal.jsx'
import PetFormModal, { COAT, SEX, SPECIES } from '../components/PetFormModal.jsx'
import VaccinationModal from '../components/VaccinationModal.jsx'
import PetAvatar from '../components/PetAvatar.jsx'

const { Title, Text, Paragraph } = Typography

const SOURCE = {
  walk_in: 'Đến quầy',
  online: 'Đăng ký web',
  referral: 'Giới thiệu',
  other: 'Khác',
}


export default function Clients() {
  const { message, modal } = App.useApp()
  const nav = useNavigate()
  const [form] = Form.useForm()
  const [searchParams] = useSearchParams()

  const [data, setData] = useState({ results: [], count: 0 })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [q, setQ] = useState(searchParams.get('q') || '')
  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '')
  const [source, setSource] = useState(undefined)
  const [statusFilter, setStatusFilter] = useState(undefined)
  const [ordering, setOrdering] = useState('-created_at')
  const [loading, setLoading] = useState(true)

  const hasFilter = Boolean(q || searchInput || source || statusFilter || ordering !== '-created_at')

  const handleResetFilters = () => {
    setSearchInput('')
    setQ('')
    setSource(undefined)
    setStatusFilter(undefined)
    setOrdering('-created_at')
    setPage(1)
  }

  // Modal sửa/thêm khách
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)

  // Modal đổi mật khẩu khách
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [resetClient, setResetClient] = useState(null)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetForm] = Form.useForm()

  // Drawer chi tiết khách & danh sách thú cưng của khách
  const [detailClient, setDetailClient] = useState(null)
  const [clientPets, setClientPets] = useState([])
  const [loadingPets, setLoadingPets] = useState(false)

  // Modal thêm/sửa thú cưng + tiêm phòng
  const [petModal, setPetModal] = useState(null)
  const [petOwner, setPetOwner] = useState(null)
  const [vaccPet, setVaccPet] = useState(null)
  const [healthTags, setHealthTags] = useState([])
  const tagMap = Object.fromEntries(healthTags.map((t) => [t.id, t]))

  // AI Modal
  const [aiPet, setAiPet] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, page_size: pageSize, q }
      if (source) params.source = source
      if (statusFilter) params.status = statusFilter
      if (ordering) params.ordering = ordering
      const res = await api('/clients', { params })
      setData(res)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, q, source, statusFilter, ordering])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    api('/health-tags').then((t) => setHealthTags(unwrap(t))).catch(() => {})
  }, [])

  useEffect(() => {
    if (editing) {
      form.setFieldsValue({
        source: 'walk_in',
        allow_reminders: true,
        ...editing,
        birthday: editing.birthday ? dayjs(editing.birthday) : null,
      })
    } else {
      form.resetFields()
    }
  }, [editing, form])

  // Tự động sinh mật khẩu ngẫu nhiên an toàn
  const generateRandomPassword = () => {
    const prefixes = ['PetSpa', 'SpaAI', 'HappyPet', 'PawsCare', 'ProGroom', 'SpaVet']
    const symbols = ['@', '#', '$', '!']
    const randPrefix = prefixes[Math.floor(Math.random() * prefixes.length)]
    const randSym = symbols[Math.floor(Math.random() * symbols.length)]
    const randNum = Math.floor(1000 + Math.random() * 9000)
    const genPass = `${randPrefix}${randSym}${randNum}`
    resetForm.setFieldsValue({
      new_password: genPass,
      confirm_password: genPass,
    })
    navigator.clipboard?.writeText(genPass)
    message.success(`Đã tạo mật khẩu an toàn: ${genPass} (Đã sao chép vào bộ nhớ tạm)`)
  }

  // Đặt lại mật khẩu cho khách có tài khoản
  const handleResetPassword = async () => {
    try {
      const values = await resetForm.validateFields()
      setResetBusy(true)
      await api(`/auth/users/${resetClient.user_id}/reset-password`, {
        method: 'POST',
        body: { new_password: values.new_password },
      })
      message.success(`Đã đặt lại mật khẩu cho khách hàng ${resetClient.full_name}!`)
      setResetModalOpen(false)
      resetForm.resetFields()
    } catch (e) {
      if (e.fields && Object.keys(e.fields).length > 0) {
        resetForm.setFields(toFormErrors(e))
      }
      message.error(e.message || 'Lỗi khi đặt lại mật khẩu')
    } finally {
      setResetBusy(false)
    }
  }

  // Mở Drawer chi tiết khách hàng và nạp thú cưng
  const openDetailDrawer = async (client) => {
    setDetailClient(client)
    setLoadingPets(true)
    try {
      const res = await api('/pets', { params: { client: client.id } })
      const list = unwrap(res)
      setClientPets(list.length > 0 ? list : client.pets || [])
    } catch {
      setClientPets(client.pets || [])
    } finally {
      setLoadingPets(false)
    }
  }

  // Lưu khách hàng
  const save = async () => {
    try {
      const values = await form.validateFields()
      setBusy(true)
      const payload = {
        full_name: values.full_name?.trim(),
        phone: values.phone?.trim(),
        secondary_phone: values.secondary_phone?.trim() || '',
        birthday: values.birthday ? dayjs(values.birthday).format('YYYY-MM-DD') : null,
        email: values.email?.trim() || '',
        address: values.address?.trim() || '',
        note: values.note?.trim() || '',
        source: values.source || 'walk_in',
        allow_reminders: !!values.allow_reminders,
      }
      if (editing?.id) {
        await api(`/clients/${editing.id}`, { method: 'PATCH', body: payload })
      } else {
        await api('/clients', { method: 'POST', body: payload })
      }
      message.success('Đã lưu hồ sơ khách hàng thành công.')
      setEditing(null)
      load()
    } catch (e) {
      if (e.fields && Object.keys(e.fields).length > 0) {
        form.setFields(toFormErrors(e))
      }
      message.error(e.message || 'Lỗi khi lưu khách hàng.')
    } finally {
      setBusy(false)
    }
  }

  // Ẩn khách
  const hide = async (id) => {
    try {
      await api(`/clients/${id}`, { method: 'DELETE' })
      message.success('Đã ẩn khách hàng thành công.')
      load()
      if (detailClient?.id === id) {
        setDetailClient(null)
      }
    } catch (e) {
      message.error(e.message || 'Lỗi khi ẩn khách hàng.')
    }
  }

  // Thêm / sửa / ẩn thú cưng (thao tác ngay trong hồ sơ khách)
  const handleOpenAddPet = (client) => {
    setPetOwner(client)
    setPetModal({})
  }

  const handleOpenEditPet = (pet) => {
    setPetOwner(detailClient)
    setPetModal(pet)
  }

  const refreshAfterPetChange = async () => {
    await load()
    if (detailClient) {
      try {
        const fresh = await api(`/clients/${detailClient.id}`)
        setDetailClient(fresh)
        const res = await api('/pets', { params: { client: detailClient.id } })
        setClientPets(unwrap(res))
      } catch { /* giữ nguyên dữ liệu cũ */ }
    }
  }

  const hidePet = async (id) => {
    try {
      await api(`/pets/${id}`, { method: 'DELETE' })
      message.success('Đã ẩn hồ sơ thú.')
      refreshAfterPetChange()
    } catch (e) {
      message.error(e.message || 'Lỗi khi ẩn hồ sơ thú.')
    }
  }


  const columns = [
    {
      title: 'Khách hàng',
      key: 'name',
      width: 220,
      render: (_, r) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar style={{ background: '#0f8b8d' }} icon={<UserOutlined />} />
            <div>
              <Text strong style={{ fontSize: 15, color: '#0b3d3f' }}>{r.full_name}</Text>
              <div style={{ fontSize: 13, color: '#475569' }}>
                <span>📞 {r.phone}</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b', marginTop: 4 }}>
            {r.address && <div>📍 {r.address}</div>}
          </div>
        </div>
      ),
    },
    {
      title: 'Thú cưng sở hữu',
      key: 'pets',
      width: 130,
      render: (_, r) => {
        const pets = r.pets || []
        const maxVisible = 2
        const displayedPets = pets.slice(0, maxVisible)
        const remainingPets = pets.slice(maxVisible)
        const remainingCount = remainingPets.length

        if (pets.length === 0) {
          return <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>Chưa đăng ký bé nào</Text>
        }

        return (
          <div
            style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', padding: '4px 0' }}
            onClick={(e) => {
              e.stopPropagation()
              openDetailDrawer(r)
            }}
            title="Bấm vào để xem chi tiết hồ sơ thú cưng"
          >
            {displayedPets.map((p, index) => (
              <Tooltip
                key={p.id}
                placement="top"
                title={
                  <div style={{ padding: '3px 4px' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', marginBottom: 2 }}>
                      🐾 {p.name}
                    </div>
                    <div style={{ fontSize: 12, color: '#e2e8f0' }}>
                      {p.species === 'dog' ? 'Chó' : 'Mèo'}{p.breed ? ` · ${p.breed}` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 2 }}>
                      Cân nặng: <strong>{p.weight_kg} kg</strong> {p.size_class ? `· Size ${p.size_class}` : ''}
                    </div>
                    {p.allergy_note && p.allergy_note !== 'Không' && (
                      <div style={{ color: '#fca5a5', fontSize: 11, marginTop: 3 }}>
                        ⚠️ Dị ứng: {p.allergy_note}
                      </div>
                    )}
                  </div>
                }
              >
                <div
                  style={{
                    marginLeft: index === 0 ? 0 : -10,
                    zIndex: index + 1,
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    borderRadius: '50%',
                    display: 'inline-block',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px) scale(1.08)'
                    e.currentTarget.style.zIndex = '20'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'none'
                    e.currentTarget.style.zIndex = String(index + 1)
                  }}
                >
                  <PetAvatar
                    species={p.species}
                    size={36}
                    style={{
                      border: '2.5px solid #ffffff',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                      cursor: 'pointer',
                    }}
                  />
                </div>
              </Tooltip>
            ))}

            {remainingCount > 0 && (
              <Tooltip
                placement="top"
                title={
                  <div style={{ padding: '3px 4px' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#fff', marginBottom: 4 }}>
                      Còn {remainingCount} bé cưng khác:
                    </div>
                    {remainingPets.map((p) => (
                      <div key={p.id} style={{ fontSize: 12, color: '#e2e8f0', marginBottom: 2 }}>
                        🐾 <strong>{p.name}</strong> ({p.species === 'dog' ? 'Chó' : 'Mèo'}{p.breed ? ` · ${p.breed}` : ''} · {p.weight_kg}kg)
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: '#5eead4', marginTop: 4 }}>
                      💡 Bấm vào để xem toàn bộ hồ sơ
                    </div>
                  </div>
                }
              >
                <div
                  style={{
                    marginLeft: -10,
                    zIndex: displayedPets.length + 1,
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    backgroundColor: '#f1f5f9',
                    border: '2.5px solid #ffffff',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 13,
                    color: '#0f766e',
                    transition: 'transform 0.2s',
                    userSelect: 'none',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px) scale(1.08)'
                    e.currentTarget.style.zIndex = '20'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'none'
                    e.currentTarget.style.zIndex = String(displayedPets.length + 1)
                  }}
                >
                  +{remainingCount}
                </div>
              </Tooltip>
            )}
          </div>
        )
      },
    },
    {
      title: 'Nguồn & Tùy chọn',
      key: 'opt',
      width: 140,
      render: (_, r) => (
        <Space direction="vertical" size={2}>
          <Tag color="cyan">{SOURCE[r.source] || r.source}</Tag>
          {r.allow_reminders ? (
            <Tag color="green">Nhận nhắc spa</Tag>
          ) : (
            <Tag color="default">Từ chối nhắc</Tag>
          )}
          {r.user_id && <Tag color="blue" style={{ fontSize: 11 }}>Có TK web</Tag>}
        </Space>
      ),
    },
    {
      title: 'Chi tiêu & Lượt spa',
      key: 'spend_stats',
      width: 175,
      sorter: (a, b) => (a.total_spent || 0) - (b.total_spent || 0),
      render: (_, r) => {
        const spent = Number(r.total_spent || 0)
        const completed = Number(r.completed_bookings_count || 0)
        const isVip = spent >= 1000000 || completed >= 5
        const isLoyal = completed >= 2 && !isVip

        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 700, color: spent > 0 ? '#0f8b8d' : '#64748b', fontSize: 14 }}>
                {money(spent)}
              </span>
              {isVip && (
                <Tag color="gold" style={{ fontSize: 10, padding: '0 5px', lineHeight: '16px', margin: 0, fontWeight: 700, borderRadius: 4 }}>
                  VIP
                </Tag>
              )}
              {isLoyal && (
                <Tag color="cyan" style={{ fontSize: 10, padding: '0 5px', lineHeight: '16px', margin: 0, fontWeight: 600, borderRadius: 4 }}>
                  Thân thiết
                </Tag>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {completed > 0 ? (
                <span>🎯 <strong>{completed}</strong> lịch hoàn tất</span>
              ) : (
                <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Chưa có lượt nào</span>
              )}
            </div>
          </div>
        )
      },
    },
    {
      title: 'Trạng thái',
      key: 'crm_status',
      width: 140,
      render: (_, r) => {
        const completed = Number(r.completed_bookings_count || 0)
        const lastDate = r.last_booking_date

        if (!lastDate || completed === 0) {
          return (
            <div>
              <Tag color="blue" style={{ borderRadius: 4, fontWeight: 600, margin: 0 }}>
                Khách mới
              </Tag>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                Chưa có lịch hoàn tất
              </div>
            </div>
          )
        }

        const diffDays = dayjs().diff(dayjs(lastDate), 'day')
        let tagColor = 'success'
        let tagLabel = 'Đang đi đều'

        if (diffDays <= 30) {
          tagColor = 'success'
          tagLabel = 'Đang đi đều'
        } else if (diffDays <= 60) {
          tagColor = 'warning'
          tagLabel = 'Cần chăm sóc'
        } else {
          tagColor = 'default'
          tagLabel = 'Lâu chưa ghé'
        }

        const tooltipText = `Ghé gần nhất: ${dayjs(lastDate).format('DD/MM/YYYY')} (${diffDays === 0 ? 'Hôm nay' : `${diffDays} ngày trước`})`

        return (
          <Tooltip title={tooltipText} placement="top">
            <div style={{ cursor: 'pointer' }}>
              <Tag color={tagColor} style={{ borderRadius: 4, fontWeight: 600, margin: 0 }}>
                {tagLabel}
              </Tag>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                {diffDays === 0 ? 'Ghé hôm nay' : `${diffDays} ngày trước`}
              </div>
            </div>
          </Tooltip>
        )
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 95,
      render: (_, r) => {
        const moreItems = [
          {
            key: 'bookings',
            label: 'Lịch hẹn của khách',
            icon: <CalendarOutlined style={{ color: '#0f8b8d' }} />,
            onClick: () => nav(`/app/lich-hen?q=${encodeURIComponent(r.phone || r.full_name)}`),
          },
          {
            key: 'invoices',
            label: 'Hóa đơn của khách',
            icon: <DollarOutlined style={{ color: '#0f8b8d' }} />,
            onClick: () => nav(`/app/hoa-don?q=${encodeURIComponent(r.phone || r.full_name)}`),
          },
          {
            key: 'add-pet',
            label: 'Thêm nhanh thú cưng',
            icon: <PlusOutlined style={{ color: '#0f8b8d' }} />,
            onClick: () => handleOpenAddPet(r),
          },
          {
            type: 'divider',
          },
          ...(r.user_id ? [
            {
              key: 'reset-pwd',
              label: 'Đặt lại mật khẩu',
              icon: <LockOutlined style={{ color: '#fa8c16' }} />,
              onClick: () => {
                setResetClient(r)
                resetForm.resetFields()
                setResetModalOpen(true)
              },
            },
          ] : [
            {
              key: 'no-acc',
              label: 'Chưa có tài khoản web',
              icon: <UserOutlined style={{ color: '#94a3b8' }} />,
              disabled: true,
            },
          ]),
          {
            type: 'divider',
          },
          {
            key: 'delete',
            label: 'Ẩn khách hàng',
            icon: <DeleteOutlined />,
            danger: true,
            onClick: () => {
              modal.confirm({
                title: 'Ẩn khách hàng?',
                icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
                content: `Bạn có chắc chắn muốn ẩn khách hàng ${r.full_name} (${r.phone}) khỏi danh sách không?`,
                okText: 'Ẩn',
                okType: 'danger',
                cancelText: 'Hủy',
                centered: true,
                onOk: () => hide(r.id),
              })
            },
          },
        ]

        return (
          <Space size={6} onClick={(e) => e.stopPropagation()}>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={(e) => {
                e.stopPropagation()
                setEditing(r)
              }}
              style={{ borderRadius: 6 }}
            >
              Sửa
            </Button>
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
          </Space>
        )
      },
    },
  ]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0, color: '#0b3d3f' }}>Hồ Sơ Khách Hàng</Title>
          <Text type="secondary">Quản lý danh sách chủ nuôi và liên kết chặt chẽ với từng bé thú cưng sở hữu</Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setEditing({})}
          style={{ background: '#0f8b8d', borderColor: '#0f8b8d', fontWeight: 600, height: 38 }}
        >
          Thêm khách hàng
        </Button>
      </div>

      {/* Toolbar: Tìm kiếm, Bộ lọc trạng thái & nguồn, Sắp xếp, Phân trang */}
      <div
        style={{
          background: '#fff',
          padding: '12px 16px',
          borderRadius: 10,
          border: '1px solid #e8f0f0',
          marginBottom: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Space wrap size={10} style={{ flex: 1 }}>
          <Input.Search
            placeholder="Tìm theo tên khách, SĐT, tên thú cưng..."
            allowClear
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value)
              if (!e.target.value && q) {
                setPage(1)
                setQ('')
              }
            }}
            onSearch={(v) => {
              setPage(1)
              setQ(v ? v.trim() : '')
            }}
            style={{ width: 280 }}
          />

          <Select
            placeholder="Trạng thái khách hàng"
            allowClear
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val)
              setPage(1)
            }}
            style={{ width: 185 }}
            options={[
              { value: 'active', label: '🟢 Đang đi đều (<30 ngày)' },
              { value: 'at_risk', label: '🟡 Cần chăm sóc (30-60 ngày)' },
              { value: 'inactive', label: '⚪ Lâu chưa ghé (>60 ngày)' },
              { value: 'new', label: '🔵 Khách mới' },
            ]}
          />

          <Select
            placeholder="Nguồn khách"
            allowClear
            value={source}
            onChange={(val) => {
              setSource(val)
              setPage(1)
            }}
            style={{ width: 140 }}
            options={[
              { value: 'walk_in', label: 'Đến quầy' },
              { value: 'online', label: 'Đăng ký web' },
              { value: 'referral', label: 'Giới thiệu' },
              { value: 'other', label: 'Khác' },
            ]}
          />

          <Select
            value={ordering}
            onChange={(val) => {
              setOrdering(val)
              setPage(1)
            }}
            style={{ width: 195 }}
            options={[
              { value: '-created_at', label: '🕒 Tạo mới nhất' },
              { value: '-total_spent', label: '💰 Chi tiêu cao nhất' },
              { value: '-completed_bookings', label: '🎯 Đi spa nhiều nhất' },
              { value: '-last_booking_date', label: '📅 Ghé spa gần nhất' },
              { value: 'full_name', label: '🔤 Tên khách (A - Z)' },
            ]}
          />

          {hasFilter && (
            <Button
              icon={<ReloadOutlined />}
              onClick={handleResetFilters}
              style={{ borderRadius: 6 }}
            >
              Đặt lại bộ lọc
            </Button>
          )}
        </Space>

        <RowPerPageSelect value={pageSize} onChange={(ps) => { setPageSize(ps); setPage(1); }} />
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={data.results}
        columns={columns}
        scroll={{ x: 'max-content' }}
        rowClassName={() => 'clickable-row'}
        onRow={(record) => ({
          onClick: () => openDetailDrawer(record),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          position: ['bottomRight'],
          current: page,
          total: data.count,
          pageSize: pageSize,
          showSizeChanger: false,
          showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} khách hàng`,
          onChange: (p) => setPage(p),
        }}
      />

      {/* ===== DRAWER XEM CHI TIẾT KHÁCH HÀNG & THÚ CƯNG ===== */}
      <Drawer
        title={
          <Space>
            <UserOutlined style={{ color: '#0f8b8d' }} />
            <span>Hồ sơ khách: {detailClient?.full_name}</span>
          </Space>
        }
        open={!!detailClient}
        onClose={() => setDetailClient(null)}
        width={680}
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => handleOpenAddPet(detailClient)}
            style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
          >
            Thêm bé cưng cho khách
          </Button>
        }
      >
        {detailClient && (
          <div>
            {/* Thẻ chỉ số CRM Khách hàng */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
                marginBottom: 18,
              }}
            >
              <div
                style={{
                  background: 'linear-gradient(135deg, #f0fdfa 0%, #e6fffa 100%)',
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: '1px solid #99f6e4',
                }}
              >
                <div style={{ fontSize: 12, color: '#0f766e', marginBottom: 2 }}>💰 Tổng chi tiêu</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0f8b8d' }}>
                  {money(detailClient.total_spent || 0)}
                </div>
              </div>
              <div
                style={{
                  background: '#f8fafc',
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>🎯 Lịch hoàn tất</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#334155' }}>
                  {detailClient.completed_bookings_count || 0} <span style={{ fontSize: 12, fontWeight: 'normal' }}>lượt</span>
                </div>
              </div>
              <div
                style={{
                  background: '#f8fafc',
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>⭐ Phân hạng</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                  {(Number(detailClient.total_spent || 0) >= 1000000 || Number(detailClient.completed_bookings_count || 0) >= 5) ? (
                    <Tag color="gold" style={{ fontWeight: 700 }}>Khách VIP</Tag>
                  ) : Number(detailClient.completed_bookings_count || 0) >= 2 ? (
                    <Tag color="cyan" style={{ fontWeight: 600 }}>Thân thiết</Tag>
                  ) : (
                    <Tag color="default">Khách mới</Tag>
                  )}
                </div>
              </div>
            </div>

            {/* Thông tin liên hệ */}
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 20 }}>
              <Descriptions.Item label="Họ tên" span={2}>
                <Text strong style={{ fontSize: 16, color: '#0b3d3f' }}>{detailClient.full_name}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Số điện thoại chính">📞 {detailClient.phone}</Descriptions.Item>
              <Descriptions.Item label="SĐT phụ / Zalo">
                {detailClient.secondary_phone ? `📱 ${detailClient.secondary_phone}` : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Ngày sinh">
                {detailClient.birthday ? `🎂 ${dayjs(detailClient.birthday).format('DD/MM/YYYY')}` : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Email">{detailClient.email || '—'}</Descriptions.Item>
              <Descriptions.Item label="Địa chỉ" span={2}>{detailClient.address || '—'}</Descriptions.Item>
              <Descriptions.Item label="Nguồn đến">{SOURCE[detailClient.source] || detailClient.source}</Descriptions.Item>
              <Descriptions.Item label="Nhận nhắc spa">
                {detailClient.allow_reminders ? <Tag color="green">Có</Tag> : <Tag color="default">Không</Tag>}
              </Descriptions.Item>
              {detailClient.note && (
                <Descriptions.Item label="Ghi chú nội bộ" span={2}>{detailClient.note}</Descriptions.Item>
              )}
            </Descriptions>

            {/* Các liên kết nhanh */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <Button
                icon={<CalendarOutlined />}
                onClick={() => {
                  setDetailClient(null)
                  nav(`/app/lich-hen?q=${encodeURIComponent(detailClient.phone || detailClient.full_name)}`)
                }}
              >
                Xem tất cả lịch hẹn của khách
              </Button>
              <Button
                icon={<DollarOutlined />}
                onClick={() => {
                  setDetailClient(null)
                  nav(`/app/hoa-don?q=${encodeURIComponent(detailClient.phone || detailClient.full_name)}`)
                }}
              >
                Xem tất cả hóa đơn của khách
              </Button>
            </div>

            <Divider orientation="left" style={{ margin: '16px 0' }}>
              <Space>
                <IdcardOutlined style={{ color: '#0f8b8d' }} />
                <span style={{ fontWeight: 600 }}>Danh sách thú cưng của khách ({clientPets.length})</span>
              </Space>
            </Divider>

            {clientPets.length === 0 ? (
              <Empty description="Khách hàng này chưa có thú cưng nào trong hệ thống.">
                <Button type="primary" onClick={() => handleOpenAddPet(detailClient)}>
                  Đăng ký thú cưng ngay
                </Button>
              </Empty>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {clientPets.map((p) => (
                  <Card
                    key={p.id}
                    size="small"
                    style={{
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <PetAvatar species={p.species} size={48} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Space align="center" wrap>
                          <Text strong style={{ fontSize: 16, color: '#0f766e' }}>{p.name}</Text>
                          <Tag color="cyan">{SPECIES[p.species] || p.species}{p.breed ? ` · ${p.breed}` : ''}</Tag>
                          <Tag color="blue">{p.weight_kg} kg (Size {p.size_class || '—'})</Tag>
                          {p.coat_type && <Tag color="geekblue">Lông: {COAT[p.coat_type] || p.coat_type}</Tag>}
                          {p.sex && (
                            <Tag color={p.sex === 'male' ? 'blue' : p.sex === 'female' ? 'magenta' : 'default'}>
                              Giới tính: {SEX[p.sex] || p.sex}
                            </Tag>
                          )}
                          {p.birth_date && (
                            <Tag color="purple">
                              Sinh: {dayjs(p.birth_date).format('DD/MM/YYYY')}
                            </Tag>
                          )}
                        </Space>
                        <div style={{ marginTop: 6, fontSize: 12 }}>
                          <Text type="secondary">Dị ứng: </Text>
                          {p.allergy_note && p.allergy_note !== 'Không'
                            ? <Text type="danger" strong>{p.allergy_note}</Text>
                            : <Text>Không</Text>}
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <Space size={[4, 4]} wrap>
                            {(p.health_tags || []).map((id) => (
                              <Tag color="orange" key={id}>{tagMap[id]?.name_vi || id}</Tag>
                            ))}
                            {(p.vaccinations || []).length === 0
                              ? <Tag color="red">Chưa có tiêm phòng</Tag>
                              : <Tag color="green">{p.vaccinations.length} mũi tiêm</Tag>}
                          </Space>
                        </div>
                        {p.safety_note && (
                          <Alert type="warning" message={p.safety_note} style={{ padding: '4px 10px', marginTop: 8 }} />
                        )}
                      </div>
                    </div>
                    <Divider style={{ margin: '10px 0' }} />
                    <Space wrap>
                      <Button
                        type="primary"
                        size="small"
                        icon={<CalendarOutlined />}
                        onClick={() => {
                          setDetailClient(null)
                          nav(`/app/lich-hen?pet=${p.id}`)
                        }}
                        style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
                      >
                        Đặt lịch
                      </Button>
                      <Button
                        size="small"
                        icon={<RobotOutlined />}
                        onClick={() => setAiPet(p)}
                        style={{ borderColor: '#0f8b8d', color: '#0f8b8d' }}
                      >
                        AI Gợi ý gói
                      </Button>
                      <Button size="small" icon={<EditOutlined />} onClick={() => handleOpenEditPet(p)}>Sửa</Button>
                      <Button size="small" icon={<MedicineBoxOutlined />} onClick={() => setVaccPet(p)}>Tiêm phòng</Button>
                      <Popconfirm title="Ẩn hồ sơ thú này?" okText="Ẩn" cancelText="Hủy" onConfirm={() => hidePet(p.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  </Card>
                ))}
              </Space>
            )}
          </div>
        )}
      </Drawer>

      {/* ===== MODAL SỬA/THÊM KHÁCH HÀNG ===== */}
      <Modal
        centered
        open={!!editing}
        title={editing?.id ? 'Sửa thông tin khách hàng' : 'Thêm khách hàng mới'}
        onCancel={() => setEditing(null)}
        onOk={save}
        okText="Lưu hồ sơ"
        cancelText="Hủy"
        confirmLoading={busy}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="full_name"
            label="Họ tên"
            rules={[
              { required: true, message: 'Nhập họ tên' },
              { min: 2, message: 'Họ tên tối thiểu 2 ký tự' },
            ]}
          >
            <Input placeholder="ví dụ: Nguyễn Văn A" />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="phone"
                label="Số điện thoại chính"
                rules={[
                  { required: true, message: 'Nhập số điện thoại' },
                  { pattern: /^(0|\+84)[0-9]{9,10}$/, message: 'Số điện thoại không hợp lệ' },
                ]}
              >
                <Input placeholder="ví dụ: 0901234567" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="secondary_phone"
                label="SĐT phụ / Zalo"
                rules={[
                  { pattern: /^(0|\+84)[0-9]{9,10}$/, message: 'Số điện thoại không hợp lệ' },
                ]}
              >
                <Input placeholder="ví dụ: 0909888999" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="birthday" label="Ngày sinh">
                <DatePicker
                  placeholder="Chọn ngày sinh"
                  format="DD/MM/YYYY"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="email"
                label="Email"
                rules={[{ type: 'email', message: 'Email không hợp lệ' }]}
              >
                <Input placeholder="ví dụ: a@gmail.com" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="address" label="Địa chỉ">
            <Input placeholder="ví dụ: 123 Đường ABC, Quận 1" />
          </Form.Item>
          <Form.Item name="source" label="Nguồn đến" rules={[{ required: true }]}>
            <Select options={Object.entries(SOURCE).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="allow_reminders" label="Nhận nhắc tái spa định kỳ" valuePropName="checked">
            <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú nội bộ">
            <Input.TextArea rows={3} placeholder="Ghi chú tính cách, yêu cầu đặc biệt của khách..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* ===== MODAL THÊM/SỬA THÚ CƯNG (dùng chung) ===== */}
      <PetFormModal
        pet={petModal}
        clientId={petOwner?.id}
        clientName={petOwner?.full_name}
        onClose={() => setPetModal(null)}
        onSaved={refreshAfterPetChange}
      />

      <VaccinationModal pet={vaccPet} canEdit onClose={() => setVaccPet(null)} onChanged={refreshAfterPetChange} />

      {/* AI Modal */}
      <AiPackageModal
        open={!!aiPet}
        pet={aiPet}
        onClose={() => setAiPet(null)}
        onSelectPackage={(pkg, pet) => {
          setDetailClient(null)
          nav(`/app/lich-hen?pet=${pet.id}&package=${pkg.id}`)
        }}
      />

      {/* Modal Đặt lại mật khẩu khách hàng */}
      <Modal
        centered
        title={`Đặt lại mật khẩu cho khách: ${resetClient?.full_name || ''} (${resetClient?.phone || ''})`}
        open={resetModalOpen}
        onCancel={() => setResetModalOpen(false)}
        onOk={handleResetPassword}
        okText="Cập nhật mật khẩu"
        confirmLoading={resetBusy}
      >
        <Form form={resetForm} layout="vertical">
          <Paragraph type="secondary" style={{ marginBottom: 14 }}>
            Nhập mật khẩu mới hỗ trợ cho khách hàng tại quầy. Mật khẩu mới tối thiểu 8 ký tự.
          </Paragraph>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>
              <span style={{ color: '#ff4d4f' }}>* </span>Mật khẩu mới
            </span>
            <Button
              type="dashed"
              size="small"
              icon={<ThunderboltOutlined style={{ color: '#0f8b8d' }} />}
              onClick={generateRandomPassword}
              style={{ fontSize: 12, borderRadius: 6, borderColor: '#cbd5e1' }}
            >
              Tạo mật khẩu nhanh
            </Button>
          </div>

          <Form.Item
            name="new_password"
            rules={[
              { required: true, message: 'Nhập mật khẩu mới' },
              { min: 8, message: 'Mật khẩu phải có tối thiểu 8 ký tự' },
              {
                validator(_, value) {
                  if (value && /^\d+$/.test(value)) {
                    return Promise.reject(new Error('Mật khẩu không được hoàn toàn là chữ số. Vui lòng kết hợp thêm chữ cái.'))
                  }
                  return Promise.resolve()
                },
              },
            ]}
            extra={<span style={{ fontSize: 12, color: '#64748b' }}>Gợi ý: Tối thiểu 8 ký tự, có thể bấm nút "Tạo mật khẩu nhanh" để tự sinh mật khẩu an toàn.</span>}
            style={{ marginBottom: 14 }}
          >
            <Input.Password prefix={<LockOutlined style={{ color: '#0f8b8d' }} />} placeholder="Tối thiểu 8 ký tự" />
          </Form.Item>

          <Form.Item
            name="confirm_password"
            label="Xác nhận lại mật khẩu mới"
            dependencies={['new_password']}
            rules={[
              { required: true, message: 'Vui lòng xác nhận lại mật khẩu' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('Mật khẩu xác nhận không khớp!'))
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined style={{ color: '#0f8b8d' }} />} placeholder="Nhập lại chính xác mật khẩu mới" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
