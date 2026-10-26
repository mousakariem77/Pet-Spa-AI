import { useCallback, useEffect, useState } from 'react'
import {
  App, Button, Card, Empty, Input, List, Popconfirm, Radio, Select, Space,
  Spin, Tag, Tooltip, Typography,
} from 'antd'
import {
  BellOutlined, CalendarOutlined, CheckOutlined,
  DeleteOutlined, DollarOutlined, ExclamationCircleOutlined,
  HistoryOutlined, ReloadOutlined, RobotOutlined, UserOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { api, unwrap } from '../api.js'
import { useAuth } from '../auth.jsx'
import RowPerPageSelect from '../components/RowPerPageSelect.jsx'

const { Title, Text, Paragraph } = Typography

export const NOTIF_KIND_MAP = {
  booking: { label: 'Lịch hẹn', color: 'cyan', icon: <CalendarOutlined style={{ color: '#0f8b8d' }} />, bg: '#e6fffa' },
  booking_new: { label: 'Lịch mới', color: 'cyan', icon: <CalendarOutlined style={{ color: '#0f8b8d' }} />, bg: '#e6fffa' },
  booking_confirmed: { label: 'Đã xác nhận', color: 'green', icon: <CalendarOutlined style={{ color: '#10b981' }} />, bg: '#ecfdf5' },
  booking_assigned: { label: 'Phân công ca', color: 'blue', icon: <CalendarOutlined style={{ color: '#3b82f6' }} />, bg: '#eff6ff' },
  booking_status: { label: 'Trạng thái lịch', color: 'cyan', icon: <CalendarOutlined style={{ color: '#0f8b8d' }} />, bg: '#e6fffa' },
  booking_completed: { label: 'Hoàn tất spa', color: 'success', icon: <CheckOutlined style={{ color: '#16a34a' }} />, bg: '#f0fdf4' },
  booking_cancelled: { label: 'Lịch bị hủy', color: 'error', icon: <ExclamationCircleOutlined style={{ color: '#ef4444' }} />, bg: '#fef2f2' },
  invoice: { label: 'Hóa đơn', color: 'gold', icon: <DollarOutlined style={{ color: '#d97706' }} />, bg: '#fffbeb' },
  invoice_new: { label: 'Hóa đơn mới', color: 'gold', icon: <DollarOutlined style={{ color: '#d97706' }} />, bg: '#fffbeb' },
  invoice_paid: { label: 'Đã thanh toán', color: 'green', icon: <DollarOutlined style={{ color: '#10b981' }} />, bg: '#ecfdf5' },
  reminder: { label: 'Nhắc tái spa', color: 'purple', icon: <RobotOutlined style={{ color: '#8b5cf6' }} />, bg: '#f5f3ff' },
  rebook_reminder: { label: 'Nhắc tái spa', color: 'purple', icon: <RobotOutlined style={{ color: '#8b5cf6' }} />, bg: '#f5f3ff' },
  staff: { label: 'Nhân sự', color: 'blue', icon: <UserOutlined style={{ color: '#2563eb' }} />, bg: '#eff6ff' },
  staff_timeoff: { label: 'Nghỉ phép', color: 'orange', icon: <UserOutlined style={{ color: '#ea580c' }} />, bg: '#fff7ed' },
  staff_timeoff_status: { label: 'Nghỉ phép', color: 'cyan', icon: <UserOutlined style={{ color: '#0284c7' }} />, bg: '#f0f9ff' },
  system: { label: 'Hệ thống', color: 'default', icon: <BellOutlined style={{ color: '#64748b' }} />, bg: '#f8fafc' },
}

export function getNotifMeta(kind, refType) {
  return (
    NOTIF_KIND_MAP[kind] ||
    NOTIF_KIND_MAP[refType] || {
      label: 'Thông báo',
      color: 'default',
      icon: <BellOutlined style={{ color: '#0f8b8d' }} />,
      bg: '#f1f5f9',
    }
  )
}

export default function Notifications() {
  const { message } = App.useApp()
  const nav = useNavigate()
  const { user } = useAuth()

  const [data, setData] = useState({ results: [], count: 0 })
  const [unreadCount, setUnreadCount] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'unread' | 'read'
  const [kindFilter, setKindFilter] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  const hasFilter = Boolean(statusFilter !== 'all' || kindFilter !== 'all' || q)

  const resetFilters = () => {
    setStatusFilter('all')
    setKindFilter('all')
    setSearchInput('')
    setQ('')
    setPage(1)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        page,
        page_size: pageSize,
      }
      if (statusFilter !== 'all') params.status = statusFilter
      if (kindFilter !== 'all') params.kind = kindFilter
      if (q) params.q = q

      const [resList, resUnread] = await Promise.all([
        api('/notifications', { params }),
        api('/notifications/unread-count').catch(() => ({ count: 0 })),
      ])

      setData(resList)
      setUnreadCount(resUnread.count || 0)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, statusFilter, kindFilter, q])

  useEffect(() => {
    load()
  }, [load])

  const markAllRead = async () => {
    try {
      await api('/notifications/read-all', { method: 'POST' })
      message.success('Đã đánh dấu tất cả thông báo là đã đọc (vẫn lưu trữ trong hòm thư)!')
      load()
    } catch (e) {
      message.error(e.message || 'Lỗi khi thao tác')
    }
  }

  const toggleReadStatus = async (item) => {
    try {
      if (item.is_read) {
        await api(`/notifications/${item.id}/unread`, { method: 'POST' })
      } else {
        await api(`/notifications/${item.id}/read`, { method: 'POST' })
      }
      load()
    } catch (e) {
      message.error(e.message || 'Lỗi khi cập nhật trạng thái')
    }
  }

  const deleteNotification = async (id) => {
    try {
      await api(`/notifications/${id}`, { method: 'DELETE' })
      message.success('Đã xóa thông báo khỏi hòm thư.')
      load()
    } catch (e) {
      message.error(e.message || 'Lỗi khi xóa thông báo')
    }
  }

  const handleClickItem = (item) => {
    if (!item.is_read) {
      api(`/notifications/${item.id}/read`, { method: 'POST' }).catch(() => {})
    }
    if (item.link) {
      nav(item.link)
    } else if (item.ref_type === 'booking') {
      nav('/app/lich-hen')
    } else if (item.ref_type === 'invoice') {
      nav('/app/hoa-don')
    } else if (item.ref_type === 'reminder') {
      nav('/app/nhac-tai-spa')
    } else if (item.ref_type === 'staff') {
      nav('/app/nhan-su')
    }
  }

  return (
    <div>
      {/* Tiêu đề trang & Hành động hàng loạt */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0, color: '#0b3d3f' }}>
            Hộp Thư Thông Báo
          </Title>
          <Text type="secondary">
            Tất cả thông báo được lưu trữ an toàn trong hòm thư để bạn theo dõi lịch sử dịch vụ, hóa đơn và bé cưng
          </Text>
        </div>

        <Space wrap>
          {unreadCount > 0 && (
            <Button
              type="primary"
              icon={<CheckOutlined />}
              onClick={markAllRead}
              style={{ background: '#0f8b8d', borderColor: '#0f8b8d', fontWeight: 600, height: 38, borderRadius: 8 }}
            >
              Đánh dấu tất cả đã đọc ({unreadCount})
            </Button>
          )}
          <Button
            icon={<ReloadOutlined />}
            onClick={() => load()}
            style={{ height: 38, borderRadius: 8 }}
          >
            Làm mới
          </Button>
        </Space>
      </div>

      {/* Toolbar bộ lọc & tìm kiếm */}
      <div
        style={{
          background: '#fff',
          padding: '12px 16px',
          borderRadius: 10,
          border: '1px solid #e8f0f0',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Space wrap size={10} style={{ flex: 1 }}>
          <Radio.Group
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
            buttonStyle="solid"
          >
            <Radio.Button value="all">Tất cả</Radio.Button>
            <Radio.Button value="unread">
              Chưa đọc {unreadCount > 0 && <span style={{ marginLeft: 4, fontWeight: 700, color: '#0f8b8d' }}>({unreadCount})</span>}
            </Radio.Button>
            <Radio.Button value="read">Đã đọc</Radio.Button>
          </Radio.Group>

          <Select
            value={kindFilter}
            onChange={(val) => {
              setKindFilter(val)
              setPage(1)
            }}
            style={{ width: 190 }}
            options={[
              { value: 'all', label: 'Tất cả phân loại' },
              { value: 'booking', label: '📅 Lịch hẹn & Dịch vụ' },
              { value: 'invoice', label: '💵 Hóa đơn & Thu ngân' },
              { value: 'reminder', label: '🤖 Nhắc tái spa & AI' },
              { value: 'staff', label: '👤 Nhân sự & Nghỉ phép' },
              { value: 'system', label: '🔔 Hệ thống' },
            ]}
          />

          <Input.Search
            placeholder="Tìm theo tiêu đề hoặc nội dung..."
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

          {hasFilter && (
            <Button icon={<ReloadOutlined />} onClick={resetFilters}>
              Đặt lại
            </Button>
          )}
        </Space>

        <Space size={12}>
          <RowPerPageSelect value={pageSize} onChange={(ps) => { setPageSize(ps); setPage(1) }} />
        </Space>
      </div>

      {/* Danh sách thông báo */}
      <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 16, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <Spin tip="Đang tải danh sách thông báo..." />
          </div>
        ) : data.results?.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div>
                  <Text strong style={{ fontSize: 15, color: '#475569' }}>
                    Không có thông báo nào phù hợp
                  </Text>
                  <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                    Khi có lịch hẹn mới, hóa đơn hoặc cập nhật từ hệ thống, thông báo sẽ hiển thị tại đây.
                  </div>
                </div>
              }
            />
          </div>
        ) : (
          <List
            itemLayout="horizontal"
            dataSource={data.results}
            renderItem={(item) => {
              const meta = getNotifMeta(item.kind, item.ref_type)
              return (
                <List.Item
                  key={item.id}
                  onClick={() => handleClickItem(item)}
                  style={{
                    padding: '16px 20px',
                    background: item.is_read ? '#fff' : '#f0fdfa',
                    borderLeft: item.is_read ? '4px solid transparent' : '4px solid #0f8b8d',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  className="clickable-notif-item"
                  actions={[
                    item.link || item.ref_type ? (
                      <Button
                        key="view"
                        type="link"
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleClickItem(item)
                        }}
                        style={{ color: '#0f8b8d', fontWeight: 600 }}
                      >
                        Xem chi tiết →
                      </Button>
                    ) : null,
                    <Tooltip
                      key="toggle-read"
                      title={item.is_read ? 'Đánh dấu là chưa đọc' : 'Đánh dấu là đã đọc'}
                    >
                      <Button
                        size="small"
                        icon={<CheckOutlined />}
                        type={item.is_read ? 'default' : 'primary'}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleReadStatus(item)
                        }}
                        style={!item.is_read ? { background: '#0f8b8d', borderColor: '#0f8b8d' } : {}}
                      >
                        {item.is_read ? 'Đánh dấu chưa đọc' : 'Đã đọc'}
                      </Button>
                    </Tooltip>,
                    <Popconfirm
                      key="delete"
                      title="Xóa thông báo này?"
                      description="Thông báo này sẽ được xóa khỏi hòm thư của bạn."
                      okText="Xóa"
                      cancelText="Hủy"
                      okButtonProps={{ danger: true }}
                      onConfirm={(e) => {
                        e?.stopPropagation()
                        deleteNotification(item.id)
                      }}
                      onCancel={(e) => e?.stopPropagation()}
                    >
                      <Tooltip title="Xóa thông báo này">
                        <Button
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Tooltip>
                    </Popconfirm>,
                  ].filter(Boolean)}
                >
                  <List.Item.Meta
                    avatar={
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: '50%',
                          background: meta.bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 20,
                          flexShrink: 0,
                          border: '1px solid rgba(0,0,0,0.06)',
                        }}
                      >
                        {meta.icon}
                      </div>
                    }
                    title={
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text strong style={{ fontSize: 14, color: item.is_read ? '#1e293b' : '#0b3d3f' }}>
                          {item.title}
                        </Text>
                        <Tag color={meta.color} style={{ fontSize: 11, borderRadius: 4, margin: 0 }}>
                          {meta.label}
                        </Tag>
                        {!item.is_read && (
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              backgroundColor: '#0f8b8d',
                              display: 'inline-block',
                            }}
                          />
                        )}
                      </div>
                    }
                    description={
                      <div>
                        <Paragraph
                          style={{
                            margin: '4px 0 6px',
                            color: '#475569',
                            fontSize: 13,
                            lineHeight: 1.5,
                          }}
                        >
                          {item.body}
                        </Paragraph>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          🕒 {dayjs(item.created_at).format('HH:mm · DD/MM/YYYY')}
                        </Text>
                      </div>
                    }
                  />
                </List.Item>
              )
            }}
          />
        )}
      </Card>

      {/* Phân trang */}
      {data.count > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {data.count} thông báo tổng cộng
            </Text>
            <Button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              size="small"
            >
              Trước
            </Button>
            <Text strong style={{ fontSize: 13 }}>
              Trang {page} / {Math.ceil(data.count / pageSize) || 1}
            </Text>
            <Button
              disabled={page >= Math.ceil(data.count / pageSize)}
              onClick={() => setPage((p) => p + 1)}
              size="small"
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
