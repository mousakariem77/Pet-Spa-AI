import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Avatar, Badge, Button, Card, Col, DatePicker, Descriptions,
  Divider, Drawer, Empty, Progress, Radio, Row, Segmented, Skeleton,
  Space, Statistic, Table, Tabs, Tag, Tooltip, Typography, message,
} from 'antd'
import {
  ArrowDownOutlined, ArrowUpOutlined, BankOutlined, BarChartOutlined,
  CalendarOutlined, CheckCircleFilled, CheckCircleOutlined, CloseCircleFilled,
  CloseCircleOutlined, CreditCardOutlined, DollarOutlined, EyeOutlined,
  FieldTimeOutlined, FireOutlined, LineChartOutlined, MinusCircleOutlined,
  PieChartOutlined, ReloadOutlined, RightOutlined, RiseOutlined, RobotOutlined,
  SafetyCertificateOutlined, ShopOutlined, SyncOutlined, TeamOutlined,
  ThunderboltOutlined, TrophyOutlined, UserOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, money } from '../api.js'
import RowPerPageSelect from '../components/RowPerPageSelect.jsx'

const { Title, Text, Paragraph } = Typography
const { RangePicker } = DatePicker

// Huy hiệu xếp hạng
const RANK_BADGES = {
  1: { text: '🥇 #1', color: '#faad14' },
  2: { text: '🥈 #2', color: '#8c8c8c' },
  3: { text: '🥉 #3', color: '#d46b08' },
}

export default function Analytics() {
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  // Tab đang chọn: 'overview' | 'bookings' | 'staff' | 'services'
  const [activeTab, setActiveTab] = useState('overview')

  // Bộ lọc thời gian: preset hoặc custom dates
  const [preset, setPreset] = useState('30days')
  const [dateRange, setDateRange] = useState([dayjs().subtract(29, 'day'), dayjs()])

  // Chế độ xem biểu đồ xu hướng theo ngày: 'revenue' | 'bookings' | 'completed'
  const [trendMetric, setTrendMetric] = useState('revenue')
  const [hoveredPoint, setHoveredPoint] = useState(null)

  // Phân trang bảng
  const [servicePageSize, setServicePageSize] = useState(10)
  const [servicePage, setServicePage] = useState(1)

  const [packagePageSize, setPackagePageSize] = useState(10)
  const [packagePage, setPackagePage] = useState(1)

  const [staffPageSize, setStaffPageSize] = useState(10)
  const [staffPage, setStaffPage] = useState(1)

  // Drawer xem chi tiết
  const [selectedService, setSelectedService] = useState(null)
  const [selectedStaff, setSelectedStaff] = useState(null)

  // Hàm tải dữ liệu
  const loadAnalytics = async (customPreset, customRange) => {
    setLoading(true)
    try {
      const activePreset = customPreset !== undefined ? customPreset : preset
      const activeRange = customRange !== undefined ? customRange : dateRange

      const params = {}
      if (activePreset === 'custom' && activeRange?.[0] && activeRange?.[1]) {
        params.start_date = activeRange[0].format('YYYY-MM-DD')
        params.end_date = activeRange[1].format('YYYY-MM-DD')
      } else if (activePreset && activePreset !== 'custom') {
        params.preset = activePreset
      }

      const res = await api('/analytics/overview', { params })
      setData(res)

      // Cập nhật lại dateRange hiển thị theo khoảng ngày backend trả về nếu dùng preset
      if (res?.period && activePreset !== 'custom') {
        setDateRange([dayjs(res.period.start_date), dayjs(res.period.end_date)])
      }
    } catch (e) {
      message.error(e.message || 'Không thể tải số liệu thống kê.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAnalytics()
  }, [])

  // Xử lý đổi Preset nhanh
  const handlePresetChange = (e) => {
    const val = e.target.value
    setPreset(val)
    if (val === 'custom') return

    let r = null
    const today = dayjs()
    if (val === 'today') r = [today, today]
    else if (val === '7days') r = [today.subtract(6, 'day'), today]
    else if (val === '30days') r = [today.subtract(29, 'day'), today]
    else if (val === 'this_month') r = [today.startOf('month'), today]
    else if (val === 'last_month') {
      const lastMonth = today.subtract(1, 'month')
      r = [lastMonth.startOf('month'), lastMonth.endOf('month')]
    } else if (val === 'all_time') {
      r = [today.subtract(1, 'year'), today]
    }
    if (r) setDateRange(r)
    loadAnalytics(val, r)
  }

  // Xử lý chọn khoảng ngày tùy chọn
  const handleRangeChange = (dates) => {
    if (!dates || !dates[0] || !dates[1]) return
    setDateRange(dates)
    setPreset('custom')
    loadAnalytics('custom', dates)
  }

  // Dữ liệu bóc tách
  const financial = data?.financial || {}
  const bookings = data?.bookings || {}
  const dailyTrend = data?.daily_trend || []
  const topServices = data?.top_services || []
  const topPackages = data?.top_packages || []
  const staffPerf = data?.staff_performance || []
  const insights = data?.insights || {}
  const aiRebook = data?.ai_rebook || {}

  // Tính toán biểu đồ xu hướng
  const trendStats = useMemo(() => {
    if (!dailyTrend.length) return { max: 1, avg: 0, total: 0, peak: null }
    const vals = dailyTrend.map((d) => {
      if (trendMetric === 'revenue') return d.revenue || 0
      if (trendMetric === 'completed') return d.completed_bookings || 0
      return d.total_bookings || 0
    })
    const max = Math.max(...vals, 1)
    const sum = vals.reduce((a, b) => a + b, 0)
    const avg = Math.round(sum / dailyTrend.length)

    let peakIdx = 0
    let peakVal = -1
    vals.forEach((v, i) => {
      if (v > peakVal) {
        peakVal = v
        peakIdx = i
      }
    })
    const peak = dailyTrend[peakIdx] || null

    return { max, avg, total: sum, peak, peakVal }
  }, [dailyTrend, trendMetric])

  // Phân bổ theo thứ trong tuần (Day-of-Week)
  const weekdayStats = useMemo(() => {
    const days = [
      { key: 0, label: 'Thứ 2', short: 'T2', bookings: 0, completed: 0, revenue: 0 },
      { key: 1, label: 'Thứ 3', short: 'T3', bookings: 0, completed: 0, revenue: 0 },
      { key: 2, label: 'Thứ 4', short: 'T4', bookings: 0, completed: 0, revenue: 0 },
      { key: 3, label: 'Thứ 5', short: 'T5', bookings: 0, completed: 0, revenue: 0 },
      { key: 4, label: 'Thứ 6', short: 'T6', bookings: 0, completed: 0, revenue: 0 },
      { key: 5, label: 'Thứ 7', short: 'T7', bookings: 0, completed: 0, revenue: 0 },
      { key: 6, label: 'Chủ nhật', short: 'CN', bookings: 0, completed: 0, revenue: 0 },
    ]
    dailyTrend.forEach((d) => {
      const idx = d.weekday != null ? d.weekday : (dayjs(d.date).day() + 6) % 7
      if (days[idx]) {
        days[idx].bookings += d.total_bookings || 0
        days[idx].completed += d.completed_bookings || 0
        days[idx].revenue += d.revenue || 0
      }
    })
    const maxBookings = Math.max(...days.map((d) => d.bookings), 1)
    return { days, maxBookings }
  }, [dailyTrend])

  // Cột bảng dịch vụ
  const serviceColumns = [
    {
      title: 'Hạng',
      key: 'rank',
      width: 75,
      align: 'center',
      render: (_, __, idx) => {
        const rank = (servicePage - 1) * servicePageSize + idx + 1
        const badge = RANK_BADGES[rank]
        return badge ? (
          <Tag color={badge.color} style={{ fontWeight: 700, margin: 0 }}>{badge.text}</Tag>
        ) : (
          <Text type="secondary" strong>#{rank}</Text>
        )
      },
    },
    {
      title: 'Dịch vụ',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <div>
          <Text strong style={{ color: '#0f8b8d', cursor: 'pointer' }}>{name}</Text>
          <div>
            <Tag color="cyan" style={{ fontSize: 11, marginTop: 2 }}>{record.category}</Tag>
          </div>
        </div>
      ),
    },
    {
      title: 'Lượt đặt',
      dataIndex: 'count',
      key: 'count',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.count - b.count,
      render: (c) => <Text strong>{c} lượt</Text>,
    },
    {
      title: 'Doanh thu',
      dataIndex: 'revenue',
      key: 'revenue',
      width: 140,
      align: 'right',
      sorter: (a, b) => a.revenue - b.revenue,
      render: (rev) => <Text strong style={{ color: '#0f8b8d' }}>{money(rev)}</Text>,
    },
    {
      title: 'Tỷ trọng',
      key: 'share',
      width: 130,
      render: (_, r) => {
        const pct = financial.total_revenue > 0 ? Math.round((r.revenue / financial.total_revenue) * 100) : 0
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Progress percent={pct} size="small" showInfo={false} strokeColor="#0f8b8d" style={{ width: 60, margin: 0 }} />
            <Text style={{ fontSize: 12 }}>{pct}%</Text>
          </div>
        )
      },
    },
  ]

  // Cột bảng combo
  const packageColumns = [
    {
      title: 'Hạng',
      key: 'rank',
      width: 75,
      align: 'center',
      render: (_, __, idx) => {
        const rank = (packagePage - 1) * packagePageSize + idx + 1
        const badge = RANK_BADGES[rank]
        return badge ? (
          <Tag color={badge.color} style={{ fontWeight: 700, margin: 0 }}>{badge.text}</Tag>
        ) : (
          <Text type="secondary" strong>#{rank}</Text>
        )
      },
    },
    {
      title: 'Gói combo',
      dataIndex: 'name',
      key: 'name',
      render: (name) => <Text strong style={{ color: '#134e4a' }}>{name}</Text>,
    },
    {
      title: 'Lượt mua',
      dataIndex: 'count',
      key: 'count',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.count - b.count,
      render: (c) => <Text strong>{c} lượt</Text>,
    },
    {
      title: 'Doanh thu',
      dataIndex: 'revenue',
      key: 'revenue',
      width: 150,
      align: 'right',
      sorter: (a, b) => a.revenue - b.revenue,
      render: (rev) => <Text strong style={{ color: '#0f8b8d' }}>{money(rev)}</Text>,
    },
  ]

  // Cột bảng nhân viên
  const staffColumns = [
    {
      title: 'Hạng',
      key: 'rank',
      width: 75,
      align: 'center',
      render: (_, __, idx) => {
        const rank = (staffPage - 1) * staffPageSize + idx + 1
        const badge = RANK_BADGES[rank]
        return badge ? (
          <Tag color={badge.color} style={{ fontWeight: 700, margin: 0 }}>{badge.text}</Tag>
        ) : (
          <Text type="secondary" strong>#{rank}</Text>
        )
      },
    },
    {
      title: 'Kỹ thuật viên',
      key: 'name',
      render: (_, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar style={{ backgroundColor: '#0f8b8d', fontWeight: 600 }}>
            {r.name ? r.name[0] : 'S'}
          </Avatar>
          <div>
            <Text strong style={{ color: '#0f8b8d', cursor: 'pointer' }}>{r.name}</Text>
            <div style={{ fontSize: 12, color: '#64748b' }}>{r.phone || 'Chưa cập nhật SĐT'}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Chuyên môn',
      dataIndex: 'specialties',
      key: 'specialties',
      render: (specs) => (
        <Space wrap size={[0, 4]}>
          {specs?.length ? (
            specs.map((s) => (
              <Tag key={s} color="cyan" style={{ fontSize: 11, margin: 0, marginRight: 4 }}>
                {s}
              </Tag>
            ))
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Ca được giao',
      dataIndex: 'total_assigned',
      key: 'total_assigned',
      width: 115,
      align: 'right',
      sorter: (a, b) => a.total_assigned - b.total_assigned,
      render: (c) => <Text strong>{c} ca</Text>,
    },
    {
      title: 'Hoàn tất',
      dataIndex: 'completed_count',
      key: 'completed_count',
      width: 105,
      align: 'right',
      sorter: (a, b) => a.completed_count - b.completed_count,
      render: (c) => <Text strong style={{ color: '#16a34a' }}>{c} ca</Text>,
    },
    {
      title: 'Ca hủy',
      dataIndex: 'cancelled_count',
      key: 'cancelled_count',
      width: 95,
      align: 'right',
      sorter: (a, b) => a.cancelled_count - b.cancelled_count,
      render: (c) => <Text type={c > 0 ? 'danger' : 'secondary'}>{c} ca</Text>,
    },
    {
      title: 'Tỷ lệ hoàn thành',
      dataIndex: 'completion_rate',
      key: 'completion_rate',
      width: 150,
      sorter: (a, b) => a.completion_rate - b.completion_rate,
      render: (rate) => (
        <Space size={8} style={{ width: '100%' }}>
          <Progress
            percent={rate}
            size="small"
            strokeColor={rate >= 80 ? '#16a34a' : rate >= 50 ? '#faad14' : '#ef4444'}
            style={{ width: 70, margin: 0 }}
          />
          <Text strong style={{ fontSize: 12 }}>{rate}%</Text>
        </Space>
      ),
    },
    {
      title: 'Doanh số đóng góp',
      dataIndex: 'revenue',
      key: 'revenue',
      width: 160,
      align: 'right',
      sorter: (a, b) => a.revenue - b.revenue,
      render: (rev) => <Text strong style={{ color: '#0f8b8d' }}>{money(rev)}</Text>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 130,
      align: 'center',
      render: (_, r) => (
        <Space size={6}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setSelectedStaff(r)}
            style={{ borderRadius: 6 }}
          >
            Chi tiết
          </Button>
          <Tooltip title="Xem hồ sơ đầy đủ tại trang Nhân sự">
            <Button
              size="small"
              icon={<UserOutlined />}
              onClick={() => nav(`/app/nhan-su?staff_id=${r.id}`)}
              style={{ borderRadius: 6 }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ]

  if (loading && !data) {
    return (
      <div style={{ padding: '8px 0' }}>
        <Skeleton active paragraph={{ rows: 12 }} />
      </div>
    )
  }

  // Tiền mặt & Chuyển khoản
  const cashTotal = financial.payment_methods?.cash?.total || 0
  const cashCount = financial.payment_methods?.cash?.count || 0
  const transferTotal = financial.payment_methods?.transfer?.total || 0
  const transferCount = financial.payment_methods?.transfer?.count || 0
  const totalRev = financial.total_revenue || 1
  const cashPct = Math.round((cashTotal / totalRev) * 100)
  const transferPct = 100 - cashPct

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* 1. Tiêu đề trang & Bộ lọc thời gian chuẩn UI */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Thống Kê & Báo Cáo Hoạt Động Spa</Title>
          <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            Theo dõi biến động doanh thu, công suất lịch hẹn, năng suất nhân viên và hiệu quả dịch vụ
          </Paragraph>
        </div>

        <Space wrap align="center" size={10}>
          <Radio.Group
            value={preset}
            onChange={handlePresetChange}
            buttonStyle="solid"
          >
            <Radio.Button value="today">Hôm nay</Radio.Button>
            <Radio.Button value="7days">7 ngày</Radio.Button>
            <Radio.Button value="30days">30 ngày</Radio.Button>
            <Radio.Button value="this_month">Tháng này</Radio.Button>
            <Radio.Button value="last_month">Tháng trước</Radio.Button>
            <Radio.Button value="all_time">Toàn bộ</Radio.Button>
          </Radio.Group>

          <RangePicker
            value={dateRange}
            onChange={handleRangeChange}
            format="DD/MM/YYYY"
            allowClear={false}
            style={{ width: 240 }}
          />

          <Button
            icon={<ReloadOutlined spin={loading} />}
            onClick={() => loadAnalytics()}
            loading={loading}
          >
            Làm mới
          </Button>
        </Space>
      </div>

      {/* 2. Dải tóm tắt kỳ báo cáo */}
      {data?.period && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            padding: '10px 16px',
            background: '#f8fafc',
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            marginBottom: 20,
          }}
        >
          <Space split={<Divider type="vertical" />} size={12} wrap>
            <Text style={{ fontSize: 13 }}>
              📅 Kỳ báo cáo: <Text strong style={{ color: '#0f8b8d' }}>
                {dayjs(data.period.start_date).format('DD/MM/YYYY')} — {dayjs(data.period.end_date).format('DD/MM/YYYY')}
              </Text> ({data.period.days_count} ngày)
            </Text>
            <Text style={{ fontSize: 13 }}>
              🧾 Số hóa đơn đã thu: <Text strong style={{ color: '#16a34a' }}>{financial.paid_invoices_count || 0}</Text>
            </Text>
            {financial.unpaid_count > 0 && (
              <Text style={{ fontSize: 13, color: '#dc2626' }}>
                ⚠️ Có <Text strong style={{ color: '#dc2626' }}>{financial.unpaid_count}</Text> hóa đơn chưa thanh toán ({money(financial.unpaid_total)})
              </Text>
            )}
          </Space>
          <Tag color="cyan" style={{ margin: 0, fontWeight: 500 }}>
            Dữ liệu thời gian thực
          </Tag>
        </div>
      )}

      {/* 3. Hệ thống Tabs Thống Kê Chuyên Biệt */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        type="card"
        style={{ marginBottom: 20 }}
        items={[
          {
            key: 'overview',
            label: (
              <Space>
                <BarChartOutlined />
                <span>Tổng Quan Chung</span>
              </Space>
            ),
          },
          {
            key: 'bookings',
            label: (
              <Space>
                <CalendarOutlined />
                <span>Thống Kê Lịch Hẹn</span>
                <Badge count={bookings.total || 0} style={{ backgroundColor: '#0f8b8d' }} />
              </Space>
            ),
          },
          {
            key: 'staff',
            label: (
              <Space>
                <TeamOutlined />
                <span>Năng Suất Nhân Viên</span>
                <Badge count={staffPerf.length} style={{ backgroundColor: '#108ee9' }} />
              </Space>
            ),
          },
          {
            key: 'services',
            label: (
              <Space>
                <ShopOutlined />
                <span>Dịch Vụ & Thú Cưng</span>
                <Badge count={topServices.length} style={{ backgroundColor: '#14b8a6' }} />
              </Space>
            ),
          },
        ]}
      />

      {/* ========================================================
          TAB 1: TỔNG QUAN CHUNG (OVERVIEW)
         ======================================================== */}
      {activeTab === 'overview' && (
        <div>
          {/* Hàng 4 Thẻ KPI */}
          <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            {/* KPI 1: Doanh Thu Thực Thu */}
            <Col xs={24} sm={12} lg={6}>
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
                      Tổng Doanh Thu Thực Thu
                    </Text>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#0f8b8d', marginTop: 4 }}>
                      {money(financial.total_revenue || 0)}
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
                    <DollarOutlined />
                  </div>
                </div>
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(15,139,141,0.1)', fontSize: 12 }}>
                  <Space split={<Text type="secondary">·</Text>}>
                    <Text type="secondary">TM: <Text strong style={{ color: '#0f8b8d' }}>{money(cashTotal)}</Text></Text>
                    <Text type="secondary">CK: <Text strong style={{ color: '#3b82f6' }}>{money(transferTotal)}</Text></Text>
                  </Space>
                </div>
              </Card>
            </Col>

            {/* KPI 2: Tổng Lịch Hẹn */}
            <Col xs={24} sm={12} lg={6}>
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
                      Tổng Lịch Hẹn Tiếp Nhận
                    </Text>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#2563eb', marginTop: 4 }}>
                      {bookings.total || 0} <span style={{ fontSize: 15, fontWeight: 500 }}>lượt</span>
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
                      color: '#2563eb',
                      fontSize: 18,
                    }}
                  >
                    <CalendarOutlined />
                  </div>
                </div>
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(37,99,235,0.1)', fontSize: 12 }}>
                  <Space split={<Text type="secondary">·</Text>}>
                    <Text type="secondary">
                      Xong: <Text strong style={{ color: '#16a34a' }}>{bookings.completed || 0} ({bookings.completion_rate || 0}%)</Text>
                    </Text>
                    <Text type="secondary">
                      Hủy: <Text strong style={{ color: '#dc2626' }}>{bookings.cancelled || 0}</Text>
                    </Text>
                  </Space>
                </div>
              </Card>
            </Col>

            {/* KPI 3: Giá Trị Trung Bình / Đơn */}
            <Col xs={24} sm={12} lg={6}>
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
                      Giá Trị Trung Bình / Đơn
                    </Text>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#d97706', marginTop: 4 }}>
                      {money(financial.average_order_value || 0)}
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
                    <RiseOutlined />
                  </div>
                </div>
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(217,119,6,0.1)', fontSize: 12 }}>
                  <Text type="secondary">
                    Dựa trên <Text strong>{financial.paid_invoices_count || 0}</Text> hóa đơn thanh toán
                  </Text>
                </div>
              </Card>
            </Col>

            {/* KPI 4: Hiệu Quả AI Nhắc Tái Hẹn */}
            <Col xs={24} sm={12} lg={6}>
              <Card
                bordered={false}
                style={{
                  borderRadius: 14,
                  boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                  background: 'linear-gradient(135deg, #faf5ff 0%, #ffffff 100%)',
                  border: '1px solid #f3e8ff',
                  height: '100%',
                }}
                styles={{ body: { padding: 18 } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                      Hiệu Quả AI Nhắc Tái Spa
                    </Text>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#7c3aed', marginTop: 4 }}>
                      {aiRebook.conversion_rate || 0}% <span style={{ fontSize: 14, fontWeight: 500 }}>chuyển đổi</span>
                    </div>
                  </div>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: '#f3e8ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#7c3aed',
                      fontSize: 18,
                    }}
                  >
                    <RobotOutlined />
                  </div>
                </div>
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(124,58,237,0.1)', fontSize: 12 }}>
                  <Text type="secondary">
                    Đã đặt lại: <Text strong style={{ color: '#7c3aed' }}>{aiRebook.total_booked || 0}</Text> / {aiRebook.total_sent || 0} đã gửi
                  </Text>
                </div>
              </Card>
            </Col>
          </Row>

          {/* Biểu đồ xu hướng ngày & Cơ cấu vận hành */}
          <Row gutter={[16, 16]}>
            {/* Cột trái: Biểu Đồ Xu Hướng Hoạt Động Theo Ngày */}
            <Col xs={24} lg={16}>
              <Card
                title={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <Space align="center">
                      <LineChartOutlined style={{ color: '#0f8b8d', fontSize: 18 }} />
                      <span style={{ fontWeight: 700 }}>Xu Hướng Hoạt Động Theo Ngày</span>
                    </Space>
                    <Segmented
                      value={trendMetric}
                      onChange={setTrendMetric}
                      options={[
                        { label: 'Doanh thu (VNĐ)', value: 'revenue' },
                        { label: 'Lịch hẹn (Lượt)', value: 'bookings' },
                        { label: 'Ca hoàn tất (Ca)', value: 'completed' },
                      ]}
                      size="small"
                    />
                  </div>
                }
                bordered={false}
                style={{ borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.03)' }}
                styles={{ body: { padding: '20px 24px' } }}
              >
                {/* Thanh tóm tắt nhanh biểu đồ */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    padding: '8px 14px',
                    backgroundColor: '#f8fafc',
                    borderRadius: 8,
                    marginBottom: 16,
                    fontSize: 12,
                  }}
                >
                  <Space size={16} wrap>
                    <div>
                      <Text type="secondary">Trung bình/ngày: </Text>
                      <Text strong style={{ color: '#0f8b8d' }}>
                        {trendMetric === 'revenue' ? money(trendStats.avg) : `${trendStats.avg} ca`}
                      </Text>
                    </div>
                    {trendStats.peak && (
                      <div>
                        <Text type="secondary">Cao nhất: </Text>
                        <Text strong style={{ color: '#d97706' }}>
                          {trendMetric === 'revenue' ? money(trendStats.peakVal) : `${trendStats.peakVal} ca`}
                        </Text>
                        <Text type="secondary"> ({trendStats.peak.display_date})</Text>
                      </div>
                    )}
                  </Space>
                  <Text type="secondary">
                    💡 Rê chuột vào từng cột để xem chi tiết
                  </Text>
                </div>

                {dailyTrend.length === 0 ? (
                  <Empty description="Không có số liệu trong khoảng thời gian này" style={{ margin: '40px 0' }} />
                ) : (
                  <div>
                    {/* Vùng vẽ biểu đồ cột tương tác */}
                    <div
                      style={{
                        position: 'relative',
                        height: 220,
                        borderBottom: '2px solid #e2e8f0',
                        paddingTop: 10,
                        overflowX: 'auto',
                      }}
                    >
                      {/* Đường chuẩn trung bình (Dotted benchmark line) */}
                      {trendStats.max > 0 && (
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            bottom: `${Math.round((trendStats.avg / trendStats.max) * 190)}px`,
                            borderTop: '1px dashed #94a3b8',
                            zIndex: 1,
                            pointerEvents: 'none',
                          }}
                        >
                          <span
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: -16,
                              fontSize: 10,
                              color: '#64748b',
                              background: '#fff',
                              padding: '1px 4px',
                              borderRadius: 4,
                            }}
                          >
                            TB: {trendMetric === 'revenue' ? money(trendStats.avg) : `${trendStats.avg} ca`}
                          </span>
                        </div>
                      )}

                      {/* Các cột ngày */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-end',
                          height: '100%',
                          minWidth: dailyTrend.length > 20 ? dailyTrend.length * 28 : '100%',
                          gap: dailyTrend.length > 30 ? 2 : 4,
                          position: 'relative',
                          zIndex: 2,
                        }}
                      >
                        {dailyTrend.map((d, idx) => {
                          const val = trendMetric === 'revenue' ? d.revenue : trendMetric === 'completed' ? d.completed_bookings : d.total_bookings
                          const heightPct = trendStats.max > 0 ? Math.max((val / trendStats.max) * 100, val > 0 ? 6 : 2) : 2
                          const isHovered = hoveredPoint === idx

                          return (
                            <div
                              key={d.date}
                              style={{
                                flex: 1,
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'flex-end',
                                alignItems: 'center',
                                position: 'relative',
                                cursor: 'pointer',
                              }}
                              onMouseEnter={() => setHoveredPoint(idx)}
                              onMouseLeave={() => setHoveredPoint(null)}
                            >
                              {/* Cột Bar */}
                              <div
                                style={{
                                  width: '80%',
                                  maxWidth: 24,
                                  minWidth: 6,
                                  height: `${heightPct}%`,
                                  background: isHovered
                                    ? 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)'
                                    : val > 0
                                    ? 'linear-gradient(180deg, #0f8b8d 0%, #14b8a6 100%)'
                                    : '#e2e8f0',
                                  borderRadius: '4px 4px 0 0',
                                  transition: 'all 0.2s ease',
                                  transform: isHovered ? 'scaleY(1.03)' : 'none',
                                }}
                              />

                              {/* Tooltip khi hover */}
                              {isHovered && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    bottom: `${Math.min(heightPct + 10, 160)}%`,
                                    background: 'rgba(15, 23, 42, 0.95)',
                                    color: '#fff',
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    fontSize: 12,
                                    whiteSpace: 'nowrap',
                                    zIndex: 100,
                                    boxShadow: '0 6px 16px rgba(0,0,0,0.25)',
                                    pointerEvents: 'none',
                                  }}
                                >
                                  <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: 2 }}>
                                    📅 {d.display_date} ({['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'][d.weekday] || ''})
                                  </div>
                                  <div>💰 Doanh thu: <strong>{money(d.revenue)}</strong> ({d.paid_count} hóa đơn)</div>
                                  <div>📋 Lịch hẹn: <strong>{d.total_bookings} ca</strong> (Hoàn tất: {d.completed_bookings} · Hủy: {d.cancelled_bookings})</div>
                                </div>
                              )}

                              {/* Nhãn ngày bên dưới */}
                              <div
                                style={{
                                  fontSize: 10,
                                  color: isHovered ? '#0f8b8d' : '#94a3b8',
                                  fontWeight: isHovered ? 700 : 400,
                                  marginTop: 6,
                                  textAlign: 'center',
                                  userSelect: 'none',
                                }}
                              >
                                {dailyTrend.length > 20 && idx % 3 !== 0 ? '' : d.display_date}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Khoảng thời gian: {data.period.days_count} ngày
                      </Text>
                      <Space size={16}>
                        <Space size={6}>
                          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#0f8b8d' }} />
                          <Text style={{ fontSize: 12 }}>
                            {trendMetric === 'revenue' ? 'Doanh thu ngày' : trendMetric === 'completed' ? 'Ca hoàn tất' : 'Số ca đặt'}
                          </Text>
                        </Space>
                        <Space size={6}>
                          <span style={{ display: 'inline-block', width: 10, height: 2, borderTop: '1px dashed #94a3b8' }} />
                          <Text style={{ fontSize: 12 }}>Mức trung bình</Text>
                        </Space>
                      </Space>
                    </div>
                  </div>
                )}
              </Card>
            </Col>

            {/* Cột phải: Cơ Cấu Phương Thức Thanh Toán & Kênh Tiếp Nhận */}
            <Col xs={24} lg={8}>
              <Card
                title={
                  <Space align="center">
                    <PieChartOutlined style={{ color: '#0f8b8d', fontSize: 18 }} />
                    <span style={{ fontWeight: 700 }}>Cơ Cấu Vận Hành</span>
                  </Space>
                }
                bordered={false}
                style={{ borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.03)', height: '100%' }}
                styles={{ body: { padding: '20px 24px' } }}
              >
                {/* 1. Phương thức thanh toán */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text strong style={{ fontSize: 13 }}>Phương thức thanh toán</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Tổng: {money(financial.total_revenue || 0)}
                    </Text>
                  </div>

                  {financial.total_revenue > 0 ? (
                    <div>
                      {/* Thanh tỷ lệ hai màu */}
                      <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: '#f1f5f9', marginBottom: 10 }}>
                        <div
                          style={{ width: `${cashPct}%`, backgroundColor: '#0f8b8d', transition: 'width 0.3s' }}
                          title={`Tiền mặt: ${cashPct}%`}
                        />
                        <div
                          style={{ width: `${transferPct}%`, backgroundColor: '#3b82f6', transition: 'width 0.3s' }}
                          title={`Chuyển khoản: ${transferPct}%`}
                        />
                      </div>
                      <Row gutter={8}>
                        <Col span={12}>
                          <div style={{ borderLeft: '3px solid #0f8b8d', paddingLeft: 8 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>Tiền mặt ({cashPct}%)</Text>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#0f8b8d' }}>
                              {money(cashTotal)}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{cashCount} giao dịch</div>
                          </div>
                        </Col>
                        <Col span={12}>
                          <div style={{ borderLeft: '3px solid #3b82f6', paddingLeft: 8 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>Chuyển khoản ({transferPct}%)</Text>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#3b82f6' }}>
                              {money(transferTotal)}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{transferCount} giao dịch</div>
                          </div>
                        </Col>
                      </Row>
                    </div>
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>Chưa có hóa đơn thanh toán trong kỳ</Text>
                  )}
                </div>

                <Divider style={{ margin: '16px 0' }} />

                {/* 2. Phân bổ kênh đặt hẹn */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text strong style={{ fontSize: 13 }}>Kênh tiếp nhận lịch hẹn</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{bookings.total || 0} lịch</Text>
                  </div>

                  {bookings.channels?.map((ch) => {
                    const total = bookings.total || 1
                    const pct = Math.round((ch.count / total) * 100)
                    const color = ch.channel === 'online' ? '#10b981' : ch.channel === 'counter' ? '#0f8b8d' : '#f59e0b'
                    return (
                      <div key={ch.channel} style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                          <Text>{ch.label}</Text>
                          <Text strong>{ch.count} ca ({pct}%)</Text>
                        </div>
                        <Progress percent={pct} strokeColor={color} size="small" showInfo={false} />
                      </div>
                    )
                  })}
                </div>

                <Divider style={{ margin: '16px 0' }} />

                {/* 3. Tương tác Khách hàng & Chủ nuôi */}
                <div>
                  <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 10 }}>Khách hàng & Chủ nuôi</Text>
                  <Row gutter={10}>
                    <Col span={12}>
                      <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>Khách hoạt động</Text>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#0f8b8d', marginTop: 2 }}>
                          {insights.active_clients || 0} <span style={{ fontSize: 11, fontWeight: 400 }}>chủ nuôi</span>
                        </div>
                      </div>
                    </Col>
                    <Col span={12}>
                      <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>Khách mới trong kỳ</Text>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a', marginTop: 2 }}>
                          {insights.new_clients || 0} <span style={{ fontSize: 11, fontWeight: 400 }}>người</span>
                        </div>
                      </div>
                    </Col>
                  </Row>
                </div>
              </Card>
            </Col>
          </Row>
        </div>
      )}

      {/* ========================================================
          TAB 2: THỐNG KÊ LỊCH HẸN CHI TIẾT (BOOKINGS)
         ======================================================== */}
      {activeTab === 'bookings' && (
        <div>
          {/* Hàng chỉ số KPI Lịch Hẹn */}
          <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            <Col xs={24} sm={12} lg={6}>
              <Card
                bordered={false}
                style={{ borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', background: '#f0fdf4', border: '1px solid #bbf7d0' }}
                styles={{ body: { padding: 18 } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>TỶ LỆ HOÀN THÀNH CA</Text>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#16a34a', marginTop: 4 }}>
                      {bookings.completion_rate || 0}%
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>{bookings.completed || 0} ca hoàn tất thành công</Text>
                  </div>
                  <Progress
                    type="circle"
                    percent={bookings.completion_rate || 0}
                    width={48}
                    strokeColor="#16a34a"
                    strokeWidth={10}
                    showInfo={false}
                  />
                </div>
              </Card>
            </Col>

            <Col xs={24} sm={12} lg={6}>
              <Card
                bordered={false}
                style={{ borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', background: '#fef2f2', border: '1px solid #fecaca' }}
                styles={{ body: { padding: 18 } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>TỶ LỆ HỦY LỊCH</Text>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#dc2626', marginTop: 4 }}>
                      {bookings.cancellation_rate || 0}%
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>{bookings.cancelled || 0} ca bị hủy trong kỳ</Text>
                  </div>
                  <Progress
                    type="circle"
                    percent={bookings.cancellation_rate || 0}
                    width={48}
                    strokeColor="#dc2626"
                    strokeWidth={10}
                    showInfo={false}
                  />
                </div>
              </Card>
            </Col>

            <Col xs={24} sm={12} lg={6}>
              <Card
                bordered={false}
                style={{ borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', background: '#f0f9ff', border: '1px solid #bae6fd' }}
                styles={{ body: { padding: 18 } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>ĐANG TIẾP NHẬN / PHỤC VỤ</Text>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#0284c7', marginTop: 4 }}>
                      {bookings.in_progress || 0} <span style={{ fontSize: 14, fontWeight: 400 }}>ca</span>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>Đã check-in hoặc đang làm đẹp</Text>
                  </div>
                  <SyncOutlined spin style={{ fontSize: 32, color: '#0284c7' }} />
                </div>
              </Card>
            </Col>

            <Col xs={24} sm={12} lg={6}>
              <Card
                bordered={false}
                style={{ borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', background: '#fffbeb', border: '1px solid #fef3c7' }}
                styles={{ body: { padding: 18 } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>CHỜ DUYỆT / XÁC NHẬN</Text>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#d97706', marginTop: 4 }}>
                      {bookings.pending || 0} <span style={{ fontSize: 14, fontWeight: 400 }}>ca</span>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>Chờ lễ tân xử lý và sắp xếp KTV</Text>
                  </div>
                  <FieldTimeOutlined style={{ fontSize: 32, color: '#d97706' }} />
                </div>
              </Card>
            </Col>
          </Row>

          {/* Cơ Cấu Trạng Thái Toàn Bộ Lịch Hẹn */}
          <Card
            title={
              <Space align="center">
                <PieChartOutlined style={{ color: '#0f8b8d', fontSize: 18 }} />
                <span style={{ fontWeight: 700 }}>Phân Bổ Toàn Bộ Trạng Thái Lịch Hẹn</span>
              </Space>
            }
            bordered={false}
            style={{ borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.03)', marginBottom: 20 }}
            styles={{ body: { padding: 20 } }}
          >
            {bookings.total > 0 ? (
              <div>
                {/* Thanh trạng thái đa màu */}
                <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', backgroundColor: '#f1f5f9', marginBottom: 16 }}>
                  <div
                    style={{ width: `${Math.round(((bookings.completed || 0) / bookings.total) * 100)}%`, backgroundColor: '#16a34a' }}
                    title={`Hoàn tất: ${bookings.completed} ca`}
                  />
                  <div
                    style={{ width: `${Math.round(((bookings.in_progress || 0) / bookings.total) * 100)}%`, backgroundColor: '#0284c7' }}
                    title={`Đang phục vụ: ${bookings.in_progress} ca`}
                  />
                  <div
                    style={{ width: `${Math.round(((bookings.pending || 0) / bookings.total) * 100)}%`, backgroundColor: '#f59e0b' }}
                    title={`Chờ duyệt/xác nhận: ${bookings.pending} ca`}
                  />
                  <div
                    style={{ width: `${Math.round(((bookings.cancelled || 0) / bookings.total) * 100)}%`, backgroundColor: '#ef4444' }}
                    title={`Đã hủy: ${bookings.cancelled} ca`}
                  />
                </div>

                <Row gutter={[16, 12]}>
                  <Col xs={12} sm={6}>
                    <div style={{ borderLeft: '4px solid #16a34a', paddingLeft: 10 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>Hoàn tất ({Math.round(((bookings.completed || 0) / bookings.total) * 100)}%)</Text>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a' }}>{bookings.completed || 0} ca</div>
                    </div>
                  </Col>
                  <Col xs={12} sm={6}>
                    <div style={{ borderLeft: '4px solid #0284c7', paddingLeft: 10 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>Đang phục vụ ({Math.round(((bookings.in_progress || 0) / bookings.total) * 100)}%)</Text>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#0284c7' }}>{bookings.in_progress || 0} ca</div>
                    </div>
                  </Col>
                  <Col xs={12} sm={6}>
                    <div style={{ borderLeft: '4px solid #f59e0b', paddingLeft: 10 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>Chờ xử lý ({Math.round(((bookings.pending || 0) / bookings.total) * 100)}%)</Text>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>{bookings.pending || 0} ca</div>
                    </div>
                  </Col>
                  <Col xs={12} sm={6}>
                    <div style={{ borderLeft: '4px solid #ef4444', paddingLeft: 10 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>Đã hủy ({Math.round(((bookings.cancelled || 0) / bookings.total) * 100)}%)</Text>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444' }}>{bookings.cancelled || 0} ca</div>
                    </div>
                  </Col>
                </Row>
              </div>
            ) : (
              <Empty description="Không có lịch hẹn trong kỳ báo cáo" />
            )}
          </Card>

          {/* Phân phối theo Thứ trong tuần & Lý do hủy */}
          <Row gutter={[16, 16]}>
            {/* Phân phối theo thứ trong tuần */}
            <Col xs={24} lg={14}>
              <Card
                title={
                  <Space align="center">
                    <CalendarOutlined style={{ color: '#0f8b8d', fontSize: 18 }} />
                    <span style={{ fontWeight: 700 }}>Phân Phối Lịch Theo Thứ Trong Tuần</span>
                  </Space>
                }
                bordered={false}
                style={{ borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.03)', height: '100%' }}
                styles={{ body: { padding: '20px 24px' } }}
              >
                <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 16 }}>
                  Giúp nhận biết những ngày đông khách nhất trong tuần để bố trí nhân sự và phòng sấy phù hợp.
                </Paragraph>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {weekdayStats.days.map((d) => {
                    const pct = Math.round((d.bookings / weekdayStats.maxBookings) * 100)
                    const isWeekend = d.key === 5 || d.key === 6
                    return (
                      <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 65, fontWeight: isWeekend ? 700 : 500, color: isWeekend ? '#d97706' : '#334155', fontSize: 13 }}>
                          {d.label}
                        </div>
                        <div style={{ flex: 1 }}>
                          <Progress
                            percent={pct}
                            strokeColor={isWeekend ? '#f59e0b' : '#0f8b8d'}
                            size="small"
                            showInfo={false}
                          />
                        </div>
                        <div style={{ width: 80, textAlign: 'right', fontSize: 12 }}>
                          <Text strong>{d.bookings} ca</Text>
                          <span style={{ color: '#64748b', fontSize: 11 }}> ({d.completed} xong)</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            </Col>

            {/* Phân tích lý do hủy hẹn & Chuyển sang quản lý lịch */}
            <Col xs={24} lg={10}>
              <Card
                title={
                  <Space align="center">
                    <CloseCircleOutlined style={{ color: '#dc2626', fontSize: 18 }} />
                    <span style={{ fontWeight: 700 }}>Phân Tích Lý Do Hủy Hẹn</span>
                  </Space>
                }
                bordered={false}
                style={{ borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.03)', height: '100%' }}
                styles={{ body: { padding: '20px 24px' } }}
              >
                {bookings.cancelled > 0 ? (
                  <div>
                    <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 14 }}>
                      Tổng cộng <Text strong type="danger">{bookings.cancelled} lượt hủy</Text> được ghi nhận với các nguyên nhân:
                    </Paragraph>

                    {bookings.cancel_reasons?.map((item, idx) => {
                      const pct = Math.round((item.count / bookings.cancelled) * 100)
                      return (
                        <div key={idx} style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                            <Text>{item.reason || 'Khác'}</Text>
                            <Text strong type="danger">{item.count} ca ({pct}%)</Text>
                          </div>
                          <Progress percent={pct} strokeColor="#ef4444" size="small" showInfo={false} />
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                    <CheckCircleFilled style={{ fontSize: 42, color: '#16a34a', marginBottom: 12 }} />
                    <Title level={5} style={{ margin: 0, color: '#16a34a' }}>Không có lịch hủy!</Title>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      Toàn bộ khách hàng đều giữ lịch hoặc hoàn thành xuất sắc trong kỳ báo cáo này.
                    </Text>
                  </div>
                )}

                <Divider style={{ margin: '16px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: 12, borderRadius: 8 }}>
                  <div>
                    <Text strong style={{ fontSize: 13 }}>Xem danh sách lịch hẹn</Text>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Chi tiết từng khung giờ và dịch vụ</div>
                  </div>
                  <Button
                    type="primary"
                    size="small"
                    icon={<RightOutlined />}
                    onClick={() => nav('/app/lich-hen')}
                    style={{ background: '#0f8b8d', borderRadius: 6 }}
                  >
                    Xem lịch hẹn
                  </Button>
                </div>
              </Card>
            </Col>
          </Row>
        </div>
      )}

      {/* ========================================================
          TAB 3: THỐNG KÊ NĂNG SUẤT NHÂN VIÊN (STAFF)
         ======================================================== */}
      {activeTab === 'staff' && (
        <div>
          {/* Hàng nổi bật KTV hàng đầu */}
          <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            {staffPerf.length > 0 && (
              <>
                <Col xs={24} md={8}>
                  <Card
                    bordered={false}
                    style={{ borderRadius: 14, background: 'linear-gradient(135deg, #fef9c3 0%, #ffffff 100%)', border: '1px solid #fef08a' }}
                    styles={{ body: { padding: 18 } }}
                  >
                    <Space align="center" size={12}>
                      <Avatar size={44} style={{ backgroundColor: '#d97706', fontSize: 20, fontWeight: 700 }}>
                        🥇
                      </Avatar>
                      <div>
                        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
                          KTV Doanh Số Cao Nhất
                        </Text>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#854d0e' }}>
                          {staffPerf[0].name}
                        </div>
                        <Text strong style={{ color: '#0f8b8d', fontSize: 13 }}>
                          {money(staffPerf[0].revenue)}
                        </Text>
                      </div>
                    </Space>
                  </Card>
                </Col>

                <Col xs={24} md={8}>
                  <Card
                    bordered={false}
                    style={{ borderRadius: 14, background: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)', border: '1px solid #bbf7d0' }}
                    styles={{ body: { padding: 18 } }}
                  >
                    <Space align="center" size={12}>
                      <Avatar size={44} style={{ backgroundColor: '#16a34a', fontSize: 20, fontWeight: 700 }}>
                        ✂️
                      </Avatar>
                      <div>
                        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
                          KTV Chăm Chỉ Nhất
                        </Text>
                        {(() => {
                          const mostCompleted = [...staffPerf].sort((a, b) => b.completed_count - a.completed_count)[0]
                          return (
                            <div>
                              <div style={{ fontSize: 18, fontWeight: 700, color: '#166534' }}>
                                {mostCompleted?.name || '—'}
                              </div>
                              <Text strong style={{ color: '#16a34a', fontSize: 13 }}>
                                {mostCompleted?.completed_count || 0} ca hoàn tất
                              </Text>
                            </div>
                          )
                        })()}
                      </div>
                    </Space>
                  </Card>
                </Col>

                <Col xs={24} md={8}>
                  <Card
                    bordered={false}
                    style={{ borderRadius: 14, background: 'linear-gradient(135deg, #f0fdfa 0%, #ffffff 100%)', border: '1px solid #ccfbf1' }}
                    styles={{ body: { padding: 18 } }}
                  >
                    <Space align="center" size={12}>
                      <Avatar size={44} style={{ backgroundColor: '#0f8b8d', fontSize: 20, fontWeight: 700 }}>
                        👥
                      </Avatar>
                      <div>
                        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
                          Quy Mô Đội Ngũ KTV
                        </Text>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#134e4a' }}>
                          {staffPerf.length} kỹ thuật viên
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Đang hoạt động trong hệ thống
                        </Text>
                      </div>
                    </Space>
                  </Card>
                </Col>
              </>
            )}
          </Row>

          {/* Bảng Năng Suất Kỹ Thuật Viên */}
          <Card
            bordered={false}
            style={{ borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.03)' }}
            styles={{ body: { padding: 20 } }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <Text strong style={{ fontSize: 16, color: '#134e4a' }}>
                  Bảng Chi Tiết Năng Suất Đội Ngũ Kỹ Thuật Viên
                </Text>
                <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                  Theo dõi số ca được giao, tỷ lệ hoàn tất thành công và tổng doanh số đóng góp
                </Text>
              </div>
              <RowPerPageSelect
                value={staffPageSize}
                onChange={(v) => {
                  setStaffPageSize(v)
                  setStaffPage(1)
                }}
              />
            </div>

            <Table
              columns={staffColumns}
              dataSource={staffPerf}
              rowKey="id"
              size="middle"
              scroll={{ x: 'max-content' }}
              pagination={{
                current: staffPage,
                pageSize: staffPageSize,
                total: staffPerf.length,
                showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} nhân viên`,
                onChange: (p, ps) => {
                  setStaffPage(p)
                  setStaffPageSize(ps)
                },
              }}
            />
          </Card>
        </div>
      )}

      {/* ========================================================
          TAB 4: THỐNG KÊ DỊCH VỤ, GÓI & THÚ CƯNG (SERVICES)
         ======================================================== */}
      {activeTab === 'services' && (
        <div>
          {/* Top Dịch Vụ & Combo */}
          <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            {/* Top Dịch Vụ */}
            <Col xs={24} xl={14}>
              <Card
                bordered={false}
                style={{ borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.03)', height: '100%' }}
                styles={{ body: { padding: 20 } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <Text strong style={{ fontSize: 16, color: '#134e4a' }}>
                      Top Dịch Vụ Doanh Thu Cao Nhất
                    </Text>
                    <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                      Xếp hạng theo tổng doanh thu tạo ra trong kỳ
                    </Text>
                  </div>
                  <RowPerPageSelect
                    value={servicePageSize}
                    onChange={(v) => {
                      setServicePageSize(v)
                      setServicePage(1)
                    }}
                  />
                </div>

                <Table
                  columns={serviceColumns}
                  dataSource={topServices}
                  rowKey="id"
                  size="middle"
                  scroll={{ x: 'max-content' }}
                  onRow={(record) => ({
                    onClick: () => setSelectedService(record),
                    style: { cursor: 'pointer' },
                  })}
                  pagination={{
                    current: servicePage,
                    pageSize: servicePageSize,
                    total: topServices.length,
                    showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} dịch vụ`,
                    onChange: (p, ps) => {
                      setServicePage(p)
                      setServicePageSize(ps)
                    },
                  }}
                />
              </Card>
            </Col>

            {/* Top Gói Combo */}
            <Col xs={24} xl={10}>
              <Card
                bordered={false}
                style={{ borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.03)', height: '100%' }}
                styles={{ body: { padding: 20 } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <Text strong style={{ fontSize: 16, color: '#134e4a' }}>
                      Gói Combo Được Chuộng Nhất
                    </Text>
                    <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                      Các gói combo dịch vụ bán chạy
                    </Text>
                  </div>
                  <RowPerPageSelect
                    value={packagePageSize}
                    onChange={(v) => {
                      setPackagePageSize(v)
                      setPackagePage(1)
                    }}
                  />
                </div>

                <Table
                  columns={packageColumns}
                  dataSource={topPackages}
                  rowKey="id"
                  size="middle"
                  scroll={{ x: 'max-content' }}
                  pagination={{
                    current: packagePage,
                    pageSize: packagePageSize,
                    total: topPackages.length,
                    showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} gói`,
                    onChange: (p, ps) => {
                      setPackagePage(p)
                      setPackagePageSize(ps)
                    },
                  }}
                />
              </Card>
            </Col>
          </Row>

          {/* Cơ cấu Thú Cưng & Hiệu quả AI nhắc tái hẹn */}
          <Row gutter={[16, 16]}>
            {/* Cơ cấu Thú Cưng */}
            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space align="center">
                    <ShopOutlined style={{ color: '#0f8b8d', fontSize: 18 }} />
                    <span style={{ fontWeight: 700 }}>Cơ Cấu Thú Cưng & Kích Cỡ Đã Chăm Sóc</span>
                  </Space>
                }
                bordered={false}
                style={{ borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.03)', height: '100%' }}
                styles={{ body: { padding: 20 } }}
              >
                {/* Loài: Chó vs Mèo */}
                <div style={{ marginBottom: 20 }}>
                  {(() => {
                    const dogCount = insights.pets_by_species?.find((s) => s.species === 'dog')?.count || 0
                    const catCount = insights.pets_by_species?.find((s) => s.species === 'cat')?.count || 0
                    const totalPets = Math.max(dogCount + catCount, 1)
                    const dogPct = Math.round((dogCount / totalPets) * 100)
                    const catPct = 100 - dogPct

                    return (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text strong style={{ fontSize: 13 }}>Tỷ lệ Loài (Chó vs Mèo):</Text>
                          <Space size={12}>
                            <Tag color="cyan">🐶 Chó: {dogCount} ({dogPct}%)</Tag>
                            <Tag color="orange">🐱 Mèo: {catCount} ({catPct}%)</Tag>
                          </Space>
                        </div>
                        <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: '#f1f5f9' }}>
                          <div style={{ width: `${dogPct}%`, backgroundColor: '#0f8b8d', transition: 'width 0.3s' }} />
                          <div style={{ width: `${catPct}%`, backgroundColor: '#f59e0b', transition: 'width 0.3s' }} />
                        </div>
                      </div>
                    )
                  })()}
                </div>

                <Divider style={{ margin: '16px 0' }} />

                {/* Phân bổ Kích Cỡ (Size) */}
                <div>
                  <Text strong style={{ display: 'block', fontSize: 13, marginBottom: 12 }}>
                    Phân Bổ Kích Cỡ (Size Class):
                  </Text>
                  <Row gutter={[8, 8]}>
                    {insights.pets_by_size?.map((sz) => {
                      const totalSize = insights.pets_by_size.reduce((acc, curr) => acc + (curr.count || 0), 0) || 1
                      const pct = Math.round((sz.count / totalSize) * 100)
                      return (
                        <Col span={4} key={sz.size} style={{ textAlign: 'center' }} xs={8} sm={4}>
                          <div
                            style={{
                              background: '#f8fafc',
                              padding: '10px 4px',
                              borderRadius: 8,
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <Text strong style={{ color: '#0f8b8d', fontSize: 14 }}>{sz.size}</Text>
                            <div style={{ fontSize: 15, fontWeight: 700, margin: '2px 0' }}>{sz.count}</div>
                            <div style={{ fontSize: 10, color: '#64748b' }}>{pct}%</div>
                          </div>
                        </Col>
                      )
                    })}
                  </Row>
                </div>
              </Card>
            </Col>

            {/* Hiệu Quả AI Nhắc Tái Hẹn */}
            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space align="center">
                    <RobotOutlined style={{ color: '#7c3aed', fontSize: 18 }} />
                    <span style={{ fontWeight: 700 }}>Hiệu Quả AI Nhắc Tái Hẹn Spa</span>
                  </Space>
                }
                bordered={false}
                style={{ borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.03)', height: '100%', background: '#faf5ff' }}
                styles={{ body: { padding: 20 } }}
              >
                <Row gutter={[16, 16]} align="middle">
                  <Col xs={24} sm={14}>
                    <Title level={5} style={{ color: '#6b21a8', margin: 0 }}>
                      Phễu Tương Tác & Giữ Chân Khách Hàng
                    </Title>
                    <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
                      AI tự động phân tích chu kỳ tắm sấy, cắt tỉa của từng giống thú cưng và nhắc hẹn đúng thời điểm.
                    </Paragraph>

                    <Space direction="vertical" size={10} style={{ width: '100%', marginTop: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <Text>1. Lời nhắc AI tạo tự động:</Text>
                        <Text strong>{aiRebook.total_suggested || 0} lượt</Text>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <Text>2. Lễ tân đã duyệt & gửi:</Text>
                        <Text strong>{aiRebook.total_sent || 0} tin nhắn</Text>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <Text>3. Khách quay lại đặt lịch:</Text>
                        <Text strong style={{ color: '#7c3aed' }}>{aiRebook.total_booked || 0} khách</Text>
                      </div>
                    </Space>
                  </Col>

                  <Col xs={24} sm={10} style={{ textAlign: 'center' }}>
                    <div
                      style={{
                        background: '#ffffff',
                        padding: 16,
                        borderRadius: 12,
                        display: 'inline-block',
                        boxShadow: '0 2px 8px rgba(124,58,237,0.08)',
                      }}
                    >
                      <Progress
                        type="dashboard"
                        percent={aiRebook.conversion_rate || 0}
                        strokeColor={{ '0%': '#7c3aed', '100%': '#a855f7' }}
                        width={90}
                        format={(percent) => (
                          <div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#7c3aed' }}>{percent}%</div>
                            <div style={{ fontSize: 10, color: '#64748b' }}>Chuyển đổi</div>
                          </div>
                        )}
                      />
                      <div style={{ marginTop: 4 }}>
                        <Text strong style={{ color: '#7c3aed', fontSize: 12 }}>Tỷ lệ tái hẹn</Text>
                      </div>
                    </div>
                  </Col>
                </Row>
              </Card>
            </Col>
          </Row>
        </div>
      )}

      {/* Drawer Xem Chi Tiết Dịch Vụ */}
      <Drawer
        title="Chi Tiết Thống Kê Dịch Vụ"
        open={Boolean(selectedService)}
        onClose={() => setSelectedService(null)}
        width={420}
      >
        {selectedService && (
          <div>
            <Title level={4} style={{ color: '#0f8b8d', marginTop: 0 }}>
              {selectedService.name}
            </Title>
            <Descriptions column={1} bordered size="small" style={{ marginBottom: 20 }}>
              <Descriptions.Item label="Danh mục">
                <Tag color="cyan">{selectedService.category}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Số lượt đặt">
                <Text strong>{selectedService.count} lượt</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Tổng doanh thu tạo ra">
                <Text strong style={{ color: '#0f8b8d', fontSize: 15 }}>
                  {money(selectedService.revenue)}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Đóng góp doanh thu">
                <Text strong>
                  {financial.total_revenue > 0 ? Math.round((selectedService.revenue / financial.total_revenue) * 100) : 0}%
                </Text>
              </Descriptions.Item>
            </Descriptions>

            <Button
              type="primary"
              block
              icon={<ShopOutlined />}
              onClick={() => nav('/app/dich-vu')}
              style={{ background: '#0f8b8d', borderRadius: 8 }}
            >
              Xem trong Danh mục Dịch vụ & Giá
            </Button>
          </div>
        )}
      </Drawer>

      {/* Drawer Xem Chi Tiết Kỹ Thuật Viên */}
      <Drawer
        title="Chi Tiết Năng Suất Kỹ Thuật Viên"
        open={Boolean(selectedStaff)}
        onClose={() => setSelectedStaff(null)}
        width={420}
      >
        {selectedStaff && (
          <div>
            <Space align="center" size={14} style={{ marginBottom: 16 }}>
              <Avatar size={48} style={{ backgroundColor: '#0f8b8d', fontSize: 20 }}>
                {selectedStaff.name ? selectedStaff.name[0] : 'S'}
              </Avatar>
              <div>
                <Title level={4} style={{ margin: 0, color: '#0f8b8d' }}>{selectedStaff.name}</Title>
                <Text type="secondary">{selectedStaff.phone || 'Chưa cập nhật SĐT'}</Text>
              </div>
            </Space>

            <Descriptions column={1} bordered size="small" style={{ marginBottom: 20 }}>
              <Descriptions.Item label="Chuyên môn">
                <Space wrap size={[0, 4]}>
                  {selectedStaff.specialties?.length ? (
                    selectedStaff.specialties.map((s) => <Tag key={s} color="cyan">{s}</Tag>)
                  ) : (
                    'Chưa cập nhật'
                  )}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Tổng số ca được giao">
                <Text strong>{selectedStaff.total_assigned} ca</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Ca hoàn tất thành công">
                <Text strong style={{ color: '#16a34a' }}>{selectedStaff.completed_count} ca</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Ca bị hủy">
                <Text strong style={{ color: '#dc2626' }}>{selectedStaff.cancelled_count} ca</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Tỷ lệ hoàn thành">
                <Text strong>{selectedStaff.completion_rate}%</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Doanh số đóng góp">
                <Text strong style={{ color: '#0f8b8d', fontSize: 16 }}>
                  {money(selectedStaff.revenue)}
                </Text>
              </Descriptions.Item>
            </Descriptions>

            <Button
              type="primary"
              block
              icon={<UserOutlined />}
              onClick={() => nav(`/app/nhan-su?staff_id=${selectedStaff.id}`)}
              style={{ background: '#0f8b8d', borderRadius: 8 }}
            >
              Mở hồ sơ tại Quản lý Nhân sự
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  )
}
