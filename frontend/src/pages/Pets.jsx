import { useCallback, useEffect, useState } from 'react'
import {
  Alert, App, Button, Card, Descriptions, Drawer, Dropdown, Input, Modal,
  Select, Space, Table, Tag, Tooltip, Typography,
} from 'antd'
import {
  CalendarOutlined, DeleteOutlined, EditOutlined, ExclamationCircleOutlined,
  EyeOutlined, MedicineBoxOutlined, MoreOutlined, PlusOutlined,
  ReloadOutlined, RobotOutlined, UserOutlined,
} from '@ant-design/icons'
import { Navigate, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { api, unwrap } from '../api.js'
import { useAuth } from '../auth.jsx'
import AiPackageModal from '../components/AiPackageModal.jsx'
import RowPerPageSelect from '../components/RowPerPageSelect.jsx'
import PetFormModal, { COAT, SEX, SPECIES } from '../components/PetFormModal.jsx'
import VaccinationModal from '../components/VaccinationModal.jsx'
import PetAvatar from '../components/PetAvatar.jsx'

const { Title, Text, Paragraph } = Typography

function age(months) {
  if (months == null) return '—'
  return months >= 12 ? `${Math.floor(months / 12)} tuổi ${months % 12} tháng` : `${months} tháng`
}

// Trang thú cưng dành riêng cho khách hàng. Nhân viên quản lý thú cưng ngay trong trang Khách hàng.
export default function Pets() {
  const { message } = App.useApp()
  const nav = useNavigate()
  const { user } = useAuth()
  const isCustomer = user?.role === 'customer'

  const [data, setData] = useState({ results: [], count: 0 })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [speciesFilter, setSpeciesFilter] = useState('all')
  const [sizeFilter, setSizeFilter] = useState('all')
  const [ordering, setOrdering] = useState('-created_at')
  const [loading, setLoading] = useState(true)

  const [tags, setTags] = useState([])
  const [editing, setEditing] = useState(null)
  const [detailPet, setDetailPet] = useState(null)
  const [vaccPet, setVaccPet] = useState(null)
  const [aiPet, setAiPet] = useState(null)

  const hasFilter = Boolean(
    q ||
    (speciesFilter && speciesFilter !== 'all') ||
    (sizeFilter && sizeFilter !== 'all') ||
    ordering !== '-created_at'
  )

  const resetFilters = () => {
    setSearchInput('')
    setQ('')
    setSpeciesFilter('all')
    setSizeFilter('all')
    setOrdering('-created_at')
    setPage(1)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        page,
        page_size: pageSize,
      }
      if (q) params.q = q
      if (speciesFilter && speciesFilter !== 'all') params.species = speciesFilter
      if (sizeFilter && sizeFilter !== 'all') params.size_class = sizeFilter
      if (ordering) params.ordering = ordering

      const res = await api('/pets', { params })
      setData(res)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, q, speciesFilter, sizeFilter, ordering])

  useEffect(() => {
    if (isCustomer) load()
  }, [load, isCustomer])

  useEffect(() => {
    api('/health-tags').then((t) => setTags(unwrap(t))).catch(() => {})
  }, [])

  if (!isCustomer) {
    const params = new URLSearchParams(window.location.search)
    return <Navigate to={`/app/khach-hang${params.get('q') ? `?q=${encodeURIComponent(params.get('q'))}` : ''}`} replace />
  }

  const hide = async (id) => {
    try {
      await api(`/pets/${id}`, { method: 'DELETE' })
      message.success('Đã ẩn hồ sơ bé cưng thành công!')
      load()
    } catch (e) {
      message.error(e.message || 'Lỗi khi ẩn hồ sơ')
    }
  }

  const confirmHidePet = (pet) => {
    Modal.confirm({
      title: 'Ẩn hồ sơ thú cưng?',
      icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
      content: (
        <div>
          <Paragraph style={{ marginBottom: 8 }}>
            Bạn có chắc chắn muốn ẩn hồ sơ bé <b>"{pet.name}"</b> ({SPECIES[pet.species] || pet.species}) không?
          </Paragraph>
          <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 0 }}>
            Hồ sơ thú cưng sẽ được ẩn khỏi danh sách của bạn nhưng dữ liệu lịch sử các hóa đơn và cuộc hẹn trước đây vẫn được lưu trữ an toàn.
          </Paragraph>
        </div>
      ),
      okText: 'Ẩn hồ sơ',
      okType: 'danger',
      cancelText: 'Hủy',
      centered: true,
      onOk: () => hide(pet.id),
    })
  }

  const tagMap = Object.fromEntries(tags.map((t) => [t.id, t]))

  const columns = [
    {
      title: 'Tên thú cưng',
      key: 'name',
      render: (_, r) => (
        <Space align="center" size={12}>
          <PetAvatar species={r.species} size={40} style={{ border: '2px solid #e2e8f0' }} />
          <div>
            <div style={{ color: '#0b3d3f', fontSize: 14, fontWeight: 700 }}>{r.name}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {SEX[r.sex] || r.sex} · {COAT[r.coat_type] || r.coat_type}
            </div>
          </div>
        </Space>
      ),
    },
    ...(isCustomer
      ? []
      : [
          {
            title: 'Chủ nuôi',
            dataIndex: 'client_name',
            render: (v) => (
              <a
                style={{ color: '#0f8b8d', fontWeight: 600, cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation()
                  nav(`/app/khach-hang?q=${v}`)
                }}
                title="Bấm để xem hồ sơ chủ nuôi"
              >
                👤 {v || '—'}
              </a>
            ),
          },
        ]),
    {
      title: 'Loài & Giống',
      key: 'species_breed',
      render: (_, r) => {
        const isDog = r.species === 'dog'
        return (
          <Space direction="vertical" size={2}>
            <Tag color={isDog ? 'blue' : 'orange'} style={{ borderRadius: 6, fontWeight: 600, fontSize: 12 }}>
              {isDog ? '🐶 Chó' : '🐱 Mèo'}
            </Tag>
            <span style={{ fontSize: 13, color: '#334155', fontWeight: 500 }}>
              {r.breed || 'Chưa rõ giống'}
            </span>
          </Space>
        )
      },
    },
    {
      title: 'Tuổi',
      key: 'age',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>{age(r.age_months)}</div>
          {r.birth_date && (
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              Sinh: {dayjs(r.birth_date).format('DD/MM/YYYY')}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Thể trạng',
      key: 'weight_size',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0f8b8d', fontSize: 14 }}>
            {r.weight_kg} kg
          </div>
          <Tag color="cyan" style={{ fontSize: 11, borderRadius: 4, fontWeight: 700, marginTop: 2 }}>
            Size {r.size_class || '—'}
          </Tag>
        </div>
      ),
    },
    {
      title: 'Sức khỏe & Tiêm phòng',
      key: 'health',
      render: (_, r) => {
        const hasVaccine = (r.vaccinations || []).length > 0
        const hasAllergy = r.allergy_note && r.allergy_note !== 'Không'

        return (
          <Space direction="vertical" size={4}>
            <Space size={[4, 4]} wrap>
              {hasVaccine ? (
                <Tag color="green" style={{ borderRadius: 4 }}>
                  💉 Đã tiêm ({r.vaccinations.length} mũi)
                </Tag>
              ) : (
                <Tag color="red" style={{ borderRadius: 4 }}>
                  Chưa có tiêm phòng
                </Tag>
              )}
              {hasAllergy && (
                <Tooltip title={`Dị ứng: ${r.allergy_note}`}>
                  <Tag color="error" style={{ borderRadius: 4 }}>
                    ⚠️ Dị ứng
                  </Tag>
                </Tooltip>
              )}
            </Space>
            {r.health_tags && r.health_tags.length > 0 && (
              <Space size={[4, 4]} wrap>
                {r.health_tags.map((id) => (
                  <Tag color="orange" key={id} style={{ fontSize: 11, borderRadius: 4 }}>
                    {tagMap[id]?.name_vi || id}
                  </Tag>
                ))}
              </Space>
            )}
          </Space>
        )
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 175,
      render: (_, r) => {
        const moreItems = [
          {
            key: 'detail',
            label: 'Xem chi tiết bé cưng',
            icon: <EyeOutlined style={{ color: '#0f8b8d' }} />,
            onClick: () => setDetailPet(r),
          },
          {
            key: 'ai-package',
            label: 'AI gợi ý gói phù hợp',
            icon: <RobotOutlined style={{ color: '#0f8b8d' }} />,
            onClick: () => setAiPet(r),
          },
          {
            key: 'vaccination',
            label: 'Sổ tiêm phòng',
            icon: <MedicineBoxOutlined style={{ color: '#0f8b8d' }} />,
            onClick: () => setVaccPet(r),
          },
          {
            type: 'divider',
          },
          {
            key: 'delete',
            label: 'Ẩn hồ sơ thú cưng',
            icon: <DeleteOutlined />,
            danger: true,
            onClick: () => confirmHidePet(r),
          },
        ]

        return (
          <Space size={6} onClick={(e) => e.stopPropagation()}>
            <Button
              size="small"
              type="primary"
              icon={<CalendarOutlined />}
              onClick={(e) => {
                e.stopPropagation()
                nav(`/app/lich-hen?pet=${r.id}`)
              }}
              style={{ background: '#0f8b8d', borderColor: '#0f8b8d', borderRadius: 6, fontWeight: 600 }}
            >
              Đặt lịch
            </Button>
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
      {/* Tiêu đề trang & Nút Thêm thú cưng */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0, color: '#0b3d3f' }}>
            {isCustomer ? 'Thú Cưng Của Tôi' : 'Hồ Sơ Thú Cưng'}
          </Title>
          <Text type="secondary">
            {isCustomer
              ? 'Quản lý thông tin các bé cưng, theo dõi thể trạng, lịch tiêm phòng và đặt lịch làm đẹp nhanh chóng'
              : 'Quản lý danh sách thú cưng và tình trạng sức khỏe trên toàn hệ thống spa'}
          </Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setEditing({})}
          style={{ background: '#0f8b8d', borderColor: '#0f8b8d', fontWeight: 600, height: 38, borderRadius: 8 }}
        >
          Thêm thú cưng
        </Button>
      </div>

      {/* Toolbar: Tìm kiếm, Bộ lọc Loài, Size, Sắp xếp, Phân trang */}
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
            placeholder={isCustomer ? 'Tìm theo tên thú cưng, giống loài...' : 'Tìm theo tên thú, giống, chủ nuôi...'}
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
            placeholder="Loài thú cưng"
            value={speciesFilter}
            onChange={(val) => {
              setSpeciesFilter(val)
              setPage(1)
            }}
            style={{ width: 140 }}
            options={[
              { value: 'all', label: 'Tất cả loài' },
              { value: 'dog', label: '🐶 Chó' },
              { value: 'cat', label: '🐱 Mèo' },
            ]}
          />

          <Select
            placeholder="Kích cỡ size"
            value={sizeFilter}
            onChange={(val) => {
              setSizeFilter(val)
              setPage(1)
            }}
            style={{ width: 140 }}
            options={[
              { value: 'all', label: 'Tất cả size' },
              { value: 'S', label: 'Size S (<5kg)' },
              { value: 'M', label: 'Size M (5-10kg)' },
              { value: 'L', label: 'Size L (10-20kg)' },
              { value: 'XL', label: 'Size XL (>20kg)' },
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
              { value: 'name', label: '🔤 Tên thú cưng (A-Z)' },
              { value: '-weight_kg', label: '⚖️ Cân nặng giảm dần' },
              { value: 'weight_kg', label: '⚖️ Cân nặng tăng dần' },
            ]}
          />

          {hasFilter && (
            <Button
              icon={<ReloadOutlined />}
              onClick={resetFilters}
            >
              Đặt lại
            </Button>
          )}
        </Space>

        <Space size={12}>
          <RowPerPageSelect value={pageSize} onChange={(ps) => { setPageSize(ps); setPage(1) }} />
        </Space>
      </div>

      {/* Bảng danh sách thú cưng trong thẻ Card bo tròn cao cấp */}
      <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 16, overflow: 'hidden' }}>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={data.results}
          columns={columns}
          scroll={{ x: 'max-content' }}
          rowClassName={() => 'clickable-row'}
          onRow={(record) => ({
            onClick: () => setDetailPet(record),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            position: ['bottomRight'],
            current: page,
            total: data.count,
            pageSize: pageSize,
            showSizeChanger: false,
            showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} thú cưng`,
            onChange: (p) => setPage(p),
          }}
        />
      </Card>

      {/* Drawer xem chi tiết hồ sơ thú cưng */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <PetAvatar species={detailPet?.species} size={44} />
            <div>
              <Typography.Text strong style={{ fontSize: 16 }}>Hồ sơ bé cưng: {detailPet?.name}</Typography.Text>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {SPECIES[detailPet?.species]} · {detailPet?.breed || 'Chưa rõ giống'}
                </Typography.Text>
              </div>
            </div>
          </div>
        }
        open={!!detailPet}
        onClose={() => setDetailPet(null)}
        width={560}
        extra={
          <Space>
            <Button
              type="primary"
              icon={<CalendarOutlined />}
              onClick={() => {
                const id = detailPet?.id
                setDetailPet(null)
                nav(`/app/lich-hen?pet=${id}`)
              }}
              style={{ background: '#0f8b8d', borderColor: '#0f8b8d', borderRadius: 6, fontWeight: 600 }}
            >
              Đặt lịch ngay
            </Button>
            <Button
              type="primary"
              ghost
              icon={<RobotOutlined />}
              onClick={() => {
                const p = detailPet
                setDetailPet(null)
                setAiPet(p)
              }}
              style={{ borderColor: '#0f8b8d', color: '#0f8b8d', borderRadius: 6 }}
            >
              AI Gợi ý
            </Button>
          </Space>
        }
      >
        {detailPet && (
          <div>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 20 }}>
              <Descriptions.Item label="Tên thú cưng" span={2}>
                <Space align="center" size={10}>
                  <PetAvatar species={detailPet.species} size={36} />
                  <strong style={{ fontSize: 16, color: '#0f8b8d' }}>{detailPet.name}</strong>
                </Space>
              </Descriptions.Item>
              {!isCustomer && (
                <Descriptions.Item label="Chủ nuôi" span={2}>
                  <Typography.Link onClick={() => { setDetailPet(null); nav(`/app/khach-hang?q=${detailPet.client_name}`) }}>
                    <UserOutlined style={{ marginRight: 4 }} />{detailPet.client_name || 'Khách vãng lai'}
                  </Typography.Link>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Loài">{SPECIES[detailPet.species] || detailPet.species}</Descriptions.Item>
              <Descriptions.Item label="Giống loài">{detailPet.breed || 'Chưa rõ'}</Descriptions.Item>
              <Descriptions.Item label="Loại lông">{COAT[detailPet.coat_type] || detailPet.coat_type}</Descriptions.Item>
              <Descriptions.Item label="Giới tính">{SEX[detailPet.sex] || detailPet.sex}</Descriptions.Item>
              <Descriptions.Item label="Cân nặng">
                <Tag color="cyan" style={{ fontWeight: 700 }}>{detailPet.weight_kg} kg</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Kích thước size">
                <Tag color="blue" style={{ fontWeight: 700 }}>Size {detailPet.size_class || '—'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Ngày sinh">
                {detailPet.birth_date ? dayjs(detailPet.birth_date).format('DD/MM/YYYY') : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Độ tuổi">{age(detailPet.age_months)}</Descriptions.Item>
              <Descriptions.Item label="Dị ứng" span={2}>
                {detailPet.allergy_note && detailPet.allergy_note !== 'Không' ? (
                  <Tag color="error">{detailPet.allergy_note}</Tag>
                ) : (
                  <Tag color="green">Không dị ứng</Tag>
                )}
              </Descriptions.Item>
              {detailPet.safety_note && (
                <Descriptions.Item label="Lưu ý an toàn" span={2}>
                  <Alert type="warning" message={detailPet.safety_note} style={{ padding: '4px 10px' }} />
                </Descriptions.Item>
              )}
            </Descriptions>

            <div style={{ marginBottom: 16 }}>
              <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>Thẻ sức khỏe & Đặc điểm:</Typography.Text>
              {detailPet.health_tags && detailPet.health_tags.length > 0 ? (
                <Space wrap>
                  {detailPet.health_tags.map((id) => (
                    <Tag color="orange" key={id}>{tagMap[id]?.name_vi || id}</Tag>
                  ))}
                </Space>
              ) : (
                <Typography.Text type="secondary">Chưa gắn thẻ sức khỏe nào</Typography.Text>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Typography.Text strong>Lịch sử tiêm phòng ({detailPet.vaccinations?.length || 0}):</Typography.Text>
                <Button size="small" icon={<MedicineBoxOutlined />} onClick={() => setVaccPet(detailPet)}>
                  Quản lý tiêm phòng
                </Button>
              </div>
              {detailPet.vaccinations && detailPet.vaccinations.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {detailPet.vaccinations.map((vc) => (
                    <div key={vc.id} style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                      <span>💉 <strong>{vc.vaccine_name}</strong></span>
                      <span style={{ fontSize: 12, color: '#64748b' }}>Ngày tiêm: {dayjs(vc.date_given).format('DD/MM/YYYY')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <Alert type="error" showIcon message="Bé chưa cập nhật mũi tiêm phòng nào!" />
              )}
            </div>
          </div>
        )}
      </Drawer>

      <PetFormModal pet={editing} isCustomer onClose={() => setEditing(null)} onSaved={load} />

      <VaccinationModal pet={vaccPet} canEdit onClose={() => setVaccPet(null)} onChanged={load} />

      <AiPackageModal
        open={!!aiPet}
        pet={aiPet}
        onClose={() => setAiPet(null)}
        onSelectPackage={(pkg, pet) => {
          nav(`/app/lich-hen?pet=${pet.id}&package=${pkg.id}`)
        }}
      />
    </>
  )
}
