import { useCallback, useEffect, useState } from 'react'
import {
  Alert, App, Button, Card, Col, Descriptions, Divider, Drawer, Form, Input,
  InputNumber, Modal, Popconfirm, Radio, Row, Segmented, Select, Space,
  Switch, Table, Tabs, Tag, Tooltip, Typography,
} from 'antd'
import {
  DeleteOutlined, EditOutlined, ExclamationCircleOutlined, EyeInvisibleOutlined, EyeOutlined, PlusOutlined,
  ReloadOutlined, ShopOutlined,
} from '@ant-design/icons'
import { api, money, toFormErrors, unwrap } from '../api.js'
import { useAuth } from '../auth.jsx'
import RowPerPageSelect from '../components/RowPerPageSelect.jsx'

const { Title, Text, Paragraph } = Typography

const SIZES = ['XS', 'S', 'M', 'L', 'XL']
const SPECIES = { dog: 'Chó', cat: 'Mèo', both: 'Chó, mèo' }
const SIZE_WEIGHT_RANGES = {
  dog: { XS: '<3kg', S: '3-<7kg', M: '7-<15kg', L: '15-<30kg', XL: '>=30kg' },
  cat: { XS: '<3kg', S: '3-<4.5kg', M: '4.5-<6kg', L: '6-<8kg', XL: '>=8kg' },
}
const CATEGORY = { bath: 'Tắm', grooming: 'Cắt tỉa', ear: 'Vệ sinh tai', spa: 'Spa dưỡng', other: 'Khác' }
const RESOURCE_TYPES = {
  bath_tub: 'Bồn tắm',
  grooming_table: 'Bàn cắt tỉa',
  drying_cage: 'Chuồng sấy',
  spa_room: 'Phòng spa',
}

const formatPriceInput = (value) => (value == null ? '' : `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.'))
const parsePriceInput = (value) => value?.replace(/\./g, '')

function generateServiceCode(name, services) {
  const normalizedName = (name || 'DICH_VU')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const base = `DV_${normalizedName || 'DICH_VU'}`.slice(0, 50).replace(/_+$/g, '')
  let code = base
  let suffix = 2
  while (services.some((service) => service.code === code)) {
    const ending = `_${suffix}`
    code = `${base.slice(0, 50 - ending.length).replace(/_+$/g, '')}${ending}`
    suffix += 1
  }
  return code
}

function generatePackageCode(name, packages) {
  const normalizedName = (name || 'GOI_DICH_VU')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const base = `GOI_${normalizedName || 'DICH_VU'}`.slice(0, 50).replace(/_+$/g, '')
  let code = base
  let suffix = 2
  while (packages.some((pkg) => pkg.code === code)) {
    const ending = `_${suffix}`
    code = `${base.slice(0, 50 - ending.length).replace(/_+$/g, '')}${ending}`
    suffix += 1
  }
  return code
}

// Modal sửa giá nhanh
function PriceModal({ target, kind, onClose, onSaved }) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (target) form.setFieldsValue(Object.fromEntries(SIZES.map((s) => [s, target.prices?.[s]])))
  }, [target, form])

  const save = async () => {
    const values = await form.validateFields()
    const prices = Object.fromEntries(Object.entries(values).filter(([, v]) => v != null))
    setBusy(true)
    try {
      await api(`/${kind}/${target.id}/prices`, { method: 'PUT', body: { prices } })
      message.success('Đã cập nhật bảng giá thành công.')
      onSaved()
      onClose()
    } catch (e) {
      form.setFields(toFormErrors(e))
      message.error(e.message || 'Lỗi khi cập nhật giá')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      centered
      open={!!target}
      title={target ? `Bảng giá theo size: ${target.name}` : ''}
      onCancel={onClose}
      onOk={save}
      okText="Lưu giá"
      cancelText="Hủy"
      confirmLoading={busy}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        {SIZES.map((s) => (
          <Form.Item key={s} name={s} label={`Size ${s} (₫)`} rules={[{ type: 'number', min: 0 }]}>
            <InputNumber
              style={{ width: '100%' }}
              step={5000}
              min={0}
              placeholder="Nhập giá theo VNĐ..."
              formatter={formatPriceInput}
              parser={parsePriceInput}
            />
          </Form.Item>
        ))}
      </Form>
    </Modal>
  )
}

export default function Catalog() {
  const { message } = App.useApp()
  const { user } = useAuth()
  const isManager = user?.role === 'manager'

  const [activeTab, setActiveTab] = useState('s')
  const [services, setServices] = useState([])
  const [packages, setPackages] = useState([])
  const [loading, setLoading] = useState(true)
  const [servicePage, setServicePage] = useState(1)
  const [servicePageSize, setServicePageSize] = useState(10)
  const [serviceSearch, setServiceSearch] = useState('')
  const [serviceCategoryFilter, setServiceCategoryFilter] = useState('')
  const [serviceSpeciesFilter, setServiceSpeciesFilter] = useState('')
  const [serviceStatusFilter, setServiceStatusFilter] = useState('all') // 'all' | 'active' | 'hidden'
  const [packagePage, setPackagePage] = useState(1)
  const [packagePageSize, setPackagePageSize] = useState(10)
  const [packageSearch, setPackageSearch] = useState('')
  const [packageSpeciesFilter, setPackageSpeciesFilter] = useState('')
  const [packageStatusFilter, setPackageStatusFilter] = useState('all') // 'all' | 'active' | 'hidden'
  const [deleteTarget, setDeleteTarget] = useState(null) // { target, type: 'service' | 'package' }
  const [deleteBusy, setDeleteBusy] = useState(false)

  // Sửa giá
  const [editingPrice, setEditingPrice] = useState(null)
  const [detailItem, setDetailItem] = useState(null)

  // Modal thêm/sửa dịch vụ
  const [serviceModalOpen, setServiceModalOpen] = useState(false)
  const [editingService, setEditingService] = useState(null)
  const [serviceBusy, setServiceBusy] = useState(false)
  const [serviceForm] = Form.useForm()
  const serviceName = Form.useWatch('name', serviceForm)
  const serviceSpeciesScope = Form.useWatch('species_scope', serviceForm) || 'both'
  const generatedServiceCode = generateServiceCode(serviceName, services)

  // Modal thêm/sửa gói combo
  const [packageModalOpen, setPackageModalOpen] = useState(false)
  const [editingPackage, setEditingPackage] = useState(null)
  const [packageBusy, setPackageBusy] = useState(false)
  const [packageForm] = Form.useForm()
  const packageName = Form.useWatch('name', packageForm)
  const packageSpeciesScope = Form.useWatch('species_scope', packageForm) || 'both'
  const generatedPackageCode = generatePackageCode(packageName, packages)

  const serviceCounts = {
    all: services.length,
    active: services.filter((s) => s.is_active).length,
    hidden: services.filter((s) => !s.is_active).length,
  }

  const packageCounts = {
    all: packages.length,
    active: packages.filter((p) => p.is_active).length,
    hidden: packages.filter((p) => !p.is_active).length,
  }

  const normalizedServiceSearch = serviceSearch.trim().toLocaleLowerCase('vi')
  const filteredServices = services.filter((service) => {
    const matchesSearch = !normalizedServiceSearch
      || `${service.name} ${service.description || ''}`.toLocaleLowerCase('vi').includes(normalizedServiceSearch)
    return matchesSearch
      && (!serviceCategoryFilter || service.category === serviceCategoryFilter)
      && (!serviceSpeciesFilter || service.species_scope === serviceSpeciesFilter || service.species_scope === 'both')
      && (serviceStatusFilter === 'all' || (serviceStatusFilter === 'active' && service.is_active) || (serviceStatusFilter === 'hidden' && !service.is_active))
  })

  const normalizedPackageSearch = packageSearch.trim().toLocaleLowerCase('vi')
  const filteredPackages = packages.filter((pkg) => {
    const matchesSearch = !normalizedPackageSearch
      || `${pkg.name} ${pkg.description || ''}`.toLocaleLowerCase('vi').includes(normalizedPackageSearch)
    return matchesSearch
      && (!packageSpeciesFilter || pkg.species_scope === packageSpeciesFilter || pkg.species_scope === 'both')
      && (packageStatusFilter === 'all' || (packageStatusFilter === 'active' && pkg.is_active) || (packageStatusFilter === 'hidden' && !pkg.is_active))
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, p] = await Promise.all([api('/services'), api('/packages')])
      setServices(unwrap(s))
      setPackages(unwrap(p))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // --- XỬ LÝ THÊM/SỬA DỊCH VỤ ---
  const openCreateService = () => {
    setEditingService(null)
    serviceForm.resetFields()
    serviceForm.setFieldsValue({
      category: 'bath',
      species_scope: 'both',
      resource_type: 'bath_tub',
      duration_minutes: 30,
      XS: 100000,
      S: 120000,
      M: 150000,
      L: 200000,
      XL: 250000,
    })
    setServiceModalOpen(true)
  }

  const openEditService = (service) => {
    setEditingService(service)
    serviceForm.resetFields()
    serviceForm.setFieldsValue({
      name: service.name,
      category: service.category,
      species_scope: service.species_scope,
      resource_type: service.resource_type,
      duration_minutes: service.duration_minutes,
      description: service.description,
      ...service.prices,
    })
    setDetailItem(null)
    setServiceModalOpen(true)
  }

  const handleSaveService = async () => {
    try {
      const values = await serviceForm.validateFields()
      setServiceBusy(true)

      const payload = {
        code: editingService?.code || generatedServiceCode,
        name: values.name,
        description: values.description || '',
        category: values.category,
        species_scope: values.species_scope,
        resource_type: values.resource_type,
        duration_minutes: values.duration_minutes,
      }

      let res
      if (editingService?.id) {
        res = await api(`/services/${editingService.id}`, { method: 'PATCH', body: payload })
      } else {
        res = await api('/services', { method: 'POST', body: payload })
      }

      // Cập nhật giá theo size
      const prices = {}
      SIZES.forEach((s) => {
        if (values[s] != null) prices[s] = values[s]
      })
      if (Object.keys(prices).length > 0 && res?.id) {
        await api(`/services/${res.id}/prices`, { method: 'PUT', body: { prices } })
      }

      message.success(editingService?.id ? 'Đã cập nhật dịch vụ!' : 'Đã tạo dịch vụ mới thành công!')
      setServiceModalOpen(false)
      load()
    } catch (e) {
      serviceForm.setFields(toFormErrors(e))
      message.error(e.message || 'Lỗi khi lưu dịch vụ')
    } finally {
      setServiceBusy(false)
    }
  }

  const setServiceActive = async (service, isActive) => {
    try {
      await api(`/services/${service.id}`, { method: 'PATCH', body: { is_active: isActive } })
      message.success(isActive ? 'Đã hiển thị lại dịch vụ thành công.' : 'Đã ẩn dịch vụ khỏi danh mục.')
      if (detailItem?.type === 'service' && detailItem.data.id === service.id) {
        setDetailItem({ type: 'service', data: { ...detailItem.data, is_active: isActive } })
      }
      load()
    } catch (e) {
      message.error(e.message || (isActive ? 'Không thể hiển thị lại dịch vụ.' : 'Không thể ẩn dịch vụ.'))
    }
  }

  const setPackageActive = async (pkg, isActive) => {
    try {
      await api(`/packages/${pkg.id}`, { method: 'PATCH', body: { is_active: isActive } })
      message.success(isActive ? 'Đã hiển thị lại gói combo thành công.' : 'Đã ẩn gói combo khỏi danh mục.')
      if (detailItem?.type === 'package' && detailItem.data.id === pkg.id) {
        setDetailItem({ type: 'package', data: { ...detailItem.data, is_active: isActive } })
      }
      load()
    } catch (e) {
      message.error(e.message || (isActive ? 'Không thể hiển thị lại gói combo.' : 'Không thể ẩn gói combo.'))
    }
  }

  const openDeleteConfirm = (target, type = 'service') => {
    if (target.is_active) {
      message.warning(`Cần ẩn ${type === 'service' ? 'dịch vụ' : 'gói combo'} này trước khi có thể xóa vĩnh viễn!`)
      return
    }
    setDeleteTarget({ target, type })
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    const { target, type } = deleteTarget
    setDeleteBusy(true)
    try {
      const endpoint = type === 'service' ? `/services/${target.id}` : `/packages/${target.id}`
      await api(endpoint, { method: 'DELETE' })
      message.success(`Đã xóa vĩnh viễn ${type === 'service' ? 'dịch vụ' : 'gói combo'} thành công!`)
      if (detailItem?.data?.id === target.id) {
        setDetailItem(null)
      }
      setDeleteTarget(null)
      load()
    } catch (e) {
      message.error(e.message || `Không thể xóa ${type === 'service' ? 'dịch vụ' : 'gói combo'}.`)
    } finally {
      setDeleteBusy(false)
    }
  }

  // --- XỬ LÝ THÊM/SỬA GÓI COMBO ---
  const openCreatePackage = () => {
    setEditingPackage(null)
    packageForm.resetFields()
    packageForm.setFieldsValue({
      species_scope: 'both',
      XS: 200000,
      S: 250000,
      M: 320000,
      L: 400000,
      XL: 500000,
    })
    setPackageModalOpen(true)
  }

  const openEditPackage = (pkg) => {
    setEditingPackage(pkg)
    packageForm.resetFields()
    packageForm.setFieldsValue({
      code: pkg.code,
      name: pkg.name,
      description: pkg.description,
      species_scope: pkg.species_scope,
      services: pkg.items?.map((item) => item.service) || [],
      ...pkg.prices,
    })
    setDetailItem(null)
    setPackageModalOpen(true)
  }

  const handleSavePackage = async () => {
    try {
      const values = await packageForm.validateFields()
      setPackageBusy(true)

      const payload = {
        code: editingPackage?.code || generatedPackageCode,
        name: values.name,
        description: values.description || '',
        species_scope: values.species_scope,
      }

      let res
      if (editingPackage?.id) {
        res = await api(`/packages/${editingPackage.id}`, { method: 'PATCH', body: payload })
      } else {
        res = await api('/packages', { method: 'POST', body: payload })
      }

      const pkgId = res?.id || editingPackage?.id

      // Gán các dịch vụ thành phần
      if (values.services && values.services.length > 0 && pkgId) {
        await api(`/packages/${pkgId}/items`, {
          method: 'PUT',
          body: { services: values.services },
        })
      }

      // Cập nhật giá theo size
      const prices = {}
      SIZES.forEach((s) => {
        if (values[s] != null) prices[s] = values[s]
      })
      if (Object.keys(prices).length > 0 && pkgId) {
        await api(`/packages/${pkgId}/prices`, { method: 'PUT', body: { prices } })
      }

      message.success(editingPackage?.id ? 'Đã cập nhật gói combo!' : 'Đã tạo gói combo mới thành công!')
      setPackageModalOpen(false)
      load()
    } catch (e) {
      packageForm.setFields(toFormErrors(e))
      message.error(e.message || 'Lỗi khi lưu gói combo')
    } finally {
      setPackageBusy(false)
    }
  }

  const serviceCols = [
    {
      title: 'Dịch vụ',
      dataIndex: 'name',
      render: (v, r) => (
        <div style={{ maxWidth: 360 }}>
          <Text strong style={{ fontSize: 15, color: '#0b3d3f' }}>{v}</Text>
          <div
            style={{
              fontSize: 12,
              color: '#64748b',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 320,
            }}
            title={r.description || ''}
          >
            {r.description || 'Chưa có mô tả'}
          </div>
        </div>
      ),
    },
    { title: 'Nhóm', dataIndex: 'category', render: (v) => <Tag color="blue">{CATEGORY[v] || v}</Tag> },
    { title: 'Loài', dataIndex: 'species_scope', render: (v) => <Tag color="purple">{SPECIES[v] || v}</Tag> },
    { title: 'Thời lượng', dataIndex: 'duration_minutes', align: 'right', render: (m) => `${m} phút` },
    {
      title: 'Trạng thái',
      dataIndex: 'is_active',
      width: 130,
      align: 'center',
      render: (active) => (
        active ? (
          <Tag color="success">Đang cung cấp</Tag>
        ) : (
          <Tag color="default">Đã ẩn</Tag>
        )
      ),
    },
    {
      title: 'Thao tác',
      key: 'act',
      width: isManager ? 140 : 90,
      align: 'center',
      render: (_, r) => (
        <Space size={6} onClick={(e) => e.stopPropagation()}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setDetailItem({ type: 'service', data: r })}
          >
            Chi tiết
          </Button>
          {isManager && (
            r.is_active ? (
              <Tooltip title="Cần ẩn dịch vụ trước khi có thể xóa">
                <span>
                  <Button size="small" danger disabled icon={<DeleteOutlined />} />
                </span>
              </Tooltip>
            ) : (
              <Tooltip title="Xóa vĩnh viễn dịch vụ này">
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => openDeleteConfirm(r, 'service')}
                />
              </Tooltip>
            )
          )}
        </Space>
      ),
    },
  ]

  const packageCols = [
    {
      title: 'Gói combo',
      dataIndex: 'name',
      render: (v, r) => (
        <div style={{ maxWidth: 360 }}>
          <Text strong style={{ fontSize: 15, color: '#0b3d3f' }}>{v}</Text>
          <div style={{ fontSize: 12, color: '#0f8b8d', marginTop: 2 }}>
            💡 Gồm: {r.items?.map((i) => i.service_name).join(' + ') || 'Chưa gắn dịch vụ'}
          </div>
          {r.description && (
            <div
              style={{
                fontSize: 12,
                color: '#64748b',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 320,
              }}
              title={r.description}
            >
              {r.description}
            </div>
          )}
        </div>
      ),
    },
    { title: 'Loài', dataIndex: 'species_scope', render: (v) => <Tag color="purple">{SPECIES[v] || v}</Tag> },
    {
      title: 'Thời lượng',
      key: 'dur',
      align: 'right',
      render: (_, r) => `${r.items?.reduce((a, i) => a + (i.duration_minutes || 0), 0) || 0} phút`,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'is_active',
      width: 130,
      align: 'center',
      render: (active) => (
        active ? (
          <Tag color="success">Đang cung cấp</Tag>
        ) : (
          <Tag color="default">Đã ẩn</Tag>
        )
      ),
    },
    {
      title: 'Thao tác',
      key: 'act',
      width: isManager ? 140 : 90,
      align: 'center',
      render: (_, r) => (
        <Space size={6} onClick={(e) => e.stopPropagation()}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setDetailItem({ type: 'package', data: r })}
          >
            Chi tiết
          </Button>
          {isManager && (
            r.is_active ? (
              <Tooltip title="Cần ẩn gói combo trước khi có thể xóa">
                <span>
                  <Button size="small" danger disabled icon={<DeleteOutlined />} />
                </span>
              </Tooltip>
            ) : (
              <Tooltip title="Xóa vĩnh viễn gói combo này">
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => openDeleteConfirm(r, 'package')}
                />
              </Tooltip>
            )
          )}
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0, color: '#0b3d3f' }}>
            <ShopOutlined style={{ marginRight: 8, color: '#0f8b8d' }} />
            Danh Mục Dịch Vụ & Bảng Giá Theo Size
          </Title>
          <Text type="secondary">
            Bảng giá phân theo cân nặng (Chó: XS &lt; 3kg, S 3-&lt;7kg, M 7-&lt;15kg, L 15-&lt;30kg, XL &gt;= 30kg; Mèo: XS &lt; 3kg, S 3-&lt;4.5kg, M 4.5-&lt;6kg, L 6-&lt;8kg, XL &gt;= 8kg)
          </Text>
        </div>

        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>Làm mới</Button>
          {isManager && (
            <>
              {activeTab === 's' ? (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={openCreateService}
                  style={{ background: '#0f8b8d', borderColor: '#0f8b8d', fontWeight: 600 }}
                >
                  Thêm dịch vụ mới
                </Button>
              ) : (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={openCreatePackage}
                  style={{ background: '#0f8b8d', borderColor: '#0f8b8d', fontWeight: 600 }}
                >
                  Thêm gói combo mới
                </Button>
              )}
            </>
          )}
        </Space>
      </div>

      <Card style={{ borderRadius: 8 }}>
        <Tabs
          activeKey={activeTab}
          onChange={(tab) => {
            setActiveTab(tab)
            setDetailItem(null)
          }}
          items={[
            {
              key: 's',
              label: `Dịch vụ lẻ (${services.length})`,
              children: (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                    <Space wrap size={8}>
                      <Input.Search
                        allowClear
                        value={serviceSearch}
                        onChange={(event) => { setServiceSearch(event.target.value); setServicePage(1) }}
                        placeholder="Tìm tên hoặc mô tả dịch vụ"
                        style={{ width: 260 }}
                      />
                      <Select
                        value={serviceCategoryFilter}
                        onChange={(value) => { setServiceCategoryFilter(value); setServicePage(1) }}
                        options={[
                          { value: '', label: 'Tất cả nhóm' },
                          ...Object.entries(CATEGORY).map(([value, label]) => ({ value, label })),
                        ]}
                        style={{ width: 145 }}
                      />
                      <Select
                        value={serviceSpeciesFilter}
                        onChange={(value) => { setServiceSpeciesFilter(value); setServicePage(1) }}
                        options={[
                          { value: '', label: 'Tất cả loài' },
                          ...Object.entries(SPECIES).map(([value, label]) => ({ value, label })),
                        ]}
                        style={{ width: 145 }}
                      />
                      <Segmented
                        value={serviceStatusFilter}
                        onChange={(value) => {
                          setServiceStatusFilter(value)
                          setServicePage(1)
                          setDetailItem(null)
                        }}
                        options={[
                          { label: `Tất cả (${serviceCounts.all})`, value: 'all' },
                          { label: `Đang cung cấp (${serviceCounts.active})`, value: 'active' },
                          { label: `Đã ẩn (${serviceCounts.hidden})`, value: 'hidden' },
                        ]}
                      />
                    </Space>
                    <Space wrap size={8}>
                      <Text type="secondary" style={{ fontSize: 12 }}>Bấm vào dòng để xem bảng giá size</Text>
                      <RowPerPageSelect value={servicePageSize} onChange={(ps) => { setServicePageSize(ps); setServicePage(1); }} />
                    </Space>
                  </div>
                  <Table
                    rowKey="id"
                    loading={loading}
                    dataSource={filteredServices}
                    columns={serviceCols}
                    scroll={{ x: 'max-content' }}
                    rowClassName={() => 'clickable-row'}
                    onRow={(record) => ({
                      onClick: () => setDetailItem({ type: 'service', data: record }),
                      style: { cursor: 'pointer' },
                    })}
                    pagination={{
                      position: ['bottomRight'],
                      current: servicePage,
                      pageSize: servicePageSize,
                      showSizeChanger: false,
                      showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} dịch vụ`,
                      onChange: (p) => setServicePage(p),
                    }}
                  />
                </div>
              ),
            },
            {
              key: 'p',
              label: `Gói combo trọn gói (${packages.length})`,
              children: (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                    <Space wrap size={8}>
                      <Input.Search
                        allowClear
                        value={packageSearch}
                        onChange={(event) => { setPackageSearch(event.target.value); setPackagePage(1) }}
                        placeholder="Tìm tên hoặc mô tả gói"
                        style={{ width: 260 }}
                      />
                      <Select
                        value={packageSpeciesFilter}
                        onChange={(value) => { setPackageSpeciesFilter(value); setPackagePage(1) }}
                        options={[
                          { value: '', label: 'Tất cả loài' },
                          ...Object.entries(SPECIES).map(([value, label]) => ({ value, label })),
                        ]}
                        style={{ width: 145 }}
                      />
                      <Segmented
                        value={packageStatusFilter}
                        onChange={(value) => {
                          setPackageStatusFilter(value)
                          setPackagePage(1)
                          setDetailItem(null)
                        }}
                        options={[
                          { label: `Tất cả (${packageCounts.all})`, value: 'all' },
                          { label: `Đang cung cấp (${packageCounts.active})`, value: 'active' },
                          { label: `Đã ẩn (${packageCounts.hidden})`, value: 'hidden' },
                        ]}
                      />
                    </Space>
                    <Space wrap size={8}>
                      <Text type="secondary" style={{ fontSize: 12 }}>Bấm vào dòng để xem chi tiết gói</Text>
                      <RowPerPageSelect value={packagePageSize} onChange={(ps) => { setPackagePageSize(ps); setPackagePage(1); }} />
                    </Space>
                  </div>
                  {packageStatusFilter === 'hidden' && (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginBottom: 12 }}
                      message="Danh sách các gói combo đang bị ẩn"
                      description="Các gói combo này đã bị ẩn khỏi danh mục đặt lịch mới. Bạn có thể bấm 'Chi tiết' để hiển thị lại hoặc xóa vĩnh viễn khi không còn nhu cầu sử dụng."
                    />
                  )}
                  <Table
                    rowKey="id"
                    loading={loading}
                    dataSource={filteredPackages}
                    columns={packageCols}
                    scroll={{ x: 'max-content' }}
                    rowClassName={() => 'clickable-row'}
                    onRow={(record) => ({
                      onClick: () => setDetailItem({ type: 'package', data: record }),
                      style: { cursor: 'pointer' },
                    })}
                    pagination={{
                      position: ['bottomRight'],
                      current: packagePage,
                      pageSize: packagePageSize,
                      showSizeChanger: false,
                      showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} gói combo`,
                      onChange: (p) => setPackagePage(p),
                    }}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* Modal Sửa Giá Nhanh */}
      <PriceModal
        target={editingPrice?.row}
        kind={editingPrice?.kind}
        onClose={() => setEditingPrice(null)}
        onSaved={load}
      />

      {/* ===== MODAL THÊM DỊCH VỤ MỚI ===== */}
      <Modal
        centered
        open={serviceModalOpen}
        title={editingService?.id ? 'Sửa dịch vụ' : 'Thêm dịch vụ mới'}
        onCancel={() => setServiceModalOpen(false)}
        onOk={handleSaveService}
        confirmLoading={serviceBusy}
        okText="Lưu dịch vụ"
        cancelText="Hủy"
        width={680}
        destroyOnHidden
      >
        <Form form={serviceForm} layout="vertical">
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="name" label="Tên dịch vụ" rules={[{ required: true, message: 'Nhập tên dịch vụ' }]}>
                <Input placeholder="ví dụ: Tắm trị liệu da mẫn cảm, Cắt tỉa tạo kiểu..." />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="category" label="Nhóm phân loại" rules={[{ required: true }]}>
                <Select options={Object.entries(CATEGORY).map(([value, label]) => ({ value, label }))} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="species_scope" label="Loài áp dụng" rules={[{ required: true }]}>
                <Select options={Object.entries(SPECIES).map(([value, label]) => ({ value, label }))} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="duration_minutes" label="Thời lượng (phút)" rules={[{ required: true }]}>
                <InputNumber min={5} step={5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="resource_type" label="Cơ sở vật chất" rules={[{ required: true, message: 'Chọn tài nguyên cần' }]}>
                <Select options={Object.entries(RESOURCE_TYPES).map(([value, label]) => ({ value, label }))} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="Mô tả công việc thực hiện">
            <Input.TextArea rows={2} placeholder="Mô tả chi tiết các bước thực hiện của dịch vụ..." />
          </Form.Item>

          <Divider orientation="left" style={{ margin: '12px 0' }}>Bảng giá theo từng kích thước (VNĐ)</Divider>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
            {serviceSpeciesScope === 'both' ? (
              <>
                Chó: {SIZES.map((size) => `${size} ${SIZE_WEIGHT_RANGES.dog[size]}`).join(' · ')}
                <br />
                Mèo: {SIZES.map((size) => `${size} ${SIZE_WEIGHT_RANGES.cat[size]}`).join(' · ')}
              </>
            ) : (
              <>
                {SPECIES[serviceSpeciesScope]}: {SIZES.map((size) => `${size} ${SIZE_WEIGHT_RANGES[serviceSpeciesScope][size]}`).join(' · ')}
              </>
            )}
          </Text>
          <Row gutter={12}>
            {SIZES.map((s) => (
              <Col span={4.8} key={s} style={{ flex: 1 }}>
                <Form.Item name={s} label={`Size ${s}`}>
                  <InputNumber
                    style={{ width: '100%' }}
                    step={5000}
                    min={0}
                    formatter={formatPriceInput}
                    parser={parsePriceInput}
                  />
                </Form.Item>
              </Col>
            ))}
          </Row>
        </Form>
      </Modal>

      {/* ===== MODAL THÊM GÓI COMBO MỚI ===== */}
      <Modal
        centered
        open={packageModalOpen}
        title={editingPackage?.id ? 'Sửa gói combo' : 'Thêm gói combo trọn gói mới'}
        onCancel={() => setPackageModalOpen(false)}
        onOk={handleSavePackage}
        confirmLoading={packageBusy}
        okText="Lưu gói combo"
        cancelText="Hủy"
        width={720}
        destroyOnHidden
      >
        <Form form={packageForm} layout="vertical">
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="name" label="Tên gói combo" rules={[{ required: true, message: 'Nhập tên gói' }]}>
                <Input placeholder="ví dụ: Gói Tắm & Cắt Tỉa Toàn Diện, Gói Spa Dưỡng Phục Hồi..." />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={16}>
              <Form.Item
                name="services"
                label="Chọn các dịch vụ thành phần trong gói"
                rules={[{ required: true, message: 'Chọn ít nhất 1 dịch vụ' }]}
              >
                <Select
                  mode="multiple"
                  placeholder="Chọn các dịch vụ cấu thành combo..."
                  options={services.map((s) => ({
                    value: s.id,
                    label: `${s.name} (${CATEGORY[s.category] || s.category} - ${s.duration_minutes}p)`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="species_scope" label="Loài áp dụng" rules={[{ required: true }]}>
                <Select options={Object.entries(SPECIES).map(([value, label]) => ({ value, label }))} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="Mô tả & Lợi ích gói combo">
            <Input.TextArea rows={2} placeholder="Mô tả ưu đãi và lợi ích khi chọn gói..." />
          </Form.Item>

          <Divider orientation="left" style={{ margin: '12px 0' }}>Bảng giá trọn gói combo theo size (VNĐ)</Divider>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
            {packageSpeciesScope === 'both' ? (
              <>
                Chó: {SIZES.map((size) => `${size} ${SIZE_WEIGHT_RANGES.dog[size]}`).join(' · ')}
                <br />
                Mèo: {SIZES.map((size) => `${size} ${SIZE_WEIGHT_RANGES.cat[size]}`).join(' · ')}
              </>
            ) : (
              <>{SPECIES[packageSpeciesScope]}: {SIZES.map((size) => `${size} ${SIZE_WEIGHT_RANGES[packageSpeciesScope][size]}`).join(' · ')}</>
            )}
          </Text>
          <Row gutter={12}>
            {SIZES.map((s) => (
              <Col span={4.8} key={s} style={{ flex: 1 }}>
                <Form.Item name={s} label={`Size ${s}`}>
                  <InputNumber
                    style={{ width: '100%' }}
                    step={10000}
                    min={0}
                    formatter={formatPriceInput}
                    parser={parsePriceInput}
                  />
                </Form.Item>
              </Col>
            ))}
          </Row>
        </Form>
      </Modal>

      {/* ===== DRAWER XEM CHI TIẾT DỊCH VỤ / GÓI COMBO ===== */}
      <Drawer
        title={
          detailItem ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ShopOutlined style={{ color: '#0f8b8d', fontSize: 22, flexShrink: 0 }} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Typography.Text strong style={{ fontSize: 17, color: '#0b3d3f' }}>
                    {detailItem.data?.name}
                  </Typography.Text>
                  {detailItem.data?.is_active ? (
                    <Tag color="success">Đang cung cấp</Tag>
                  ) : (
                    <Tag color="default">Đang tạm ẩn</Tag>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {detailItem.type === 'package'
                    ? `Gói combo trọn gói · Mã: ${detailItem.data?.code}`
                    : `Dịch vụ spa · Phân nhóm: ${CATEGORY[detailItem.data?.category] || detailItem.data?.category || ''}`}
                </div>
              </div>
            </div>
          ) : null
        }
        open={!!detailItem}
        onClose={() => setDetailItem(null)}
        width={620}
        footer={
          detailItem && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
              <Button onClick={() => setDetailItem(null)}>Đóng</Button>
            </div>
          )
        }
      >
        {detailItem && (
          <div>
            {/* ===== THANH THAO TÁC QUẢN LÝ (ĐẶT TRÊN HÀNG RIÊNG BIỆT, KHÔNG BỊ CHÈN ÉP UI) ===== */}
            {isManager && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '10px 14px',
                  marginBottom: 18,
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
                    Thao tác quản lý:
                  </Typography.Text>
                </div>
                <Space wrap size={8}>
                  {/* Nút Ẩn / Hiện Dịch vụ */}
                  {detailItem.type === 'service' && detailItem.data.is_active && (
                    <Popconfirm
                      title="Ẩn dịch vụ này khỏi danh mục?"
                      description="Dịch vụ sẽ không còn dùng để đặt lịch mới; lịch sử cũ vẫn được giữ."
                      okText="Ẩn dịch vụ"
                      cancelText="Hủy"
                      onConfirm={() => setServiceActive(detailItem.data, false)}
                    >
                      <Button icon={<EyeInvisibleOutlined />} style={{ color: '#d97706', borderColor: '#fcd34d' }}>
                        Ẩn dịch vụ
                      </Button>
                    </Popconfirm>
                  )}
                  {detailItem.type === 'service' && !detailItem.data.is_active && (
                    <Button
                      type="primary"
                      icon={<EyeOutlined />}
                      style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
                      onClick={() => setServiceActive(detailItem.data, true)}
                    >
                      Hiện lại dịch vụ
                    </Button>
                  )}

                  {/* Nút Ẩn / Hiện Gói combo */}
                  {detailItem.type === 'package' && detailItem.data.is_active && (
                    <Popconfirm
                      title="Ẩn gói combo này khỏi danh mục?"
                      description="Gói sẽ không còn được chọn cho đặt lịch mới; lịch sử cũ vẫn được giữ."
                      okText="Ẩn gói combo"
                      cancelText="Hủy"
                      onConfirm={() => setPackageActive(detailItem.data, false)}
                    >
                      <Button icon={<EyeInvisibleOutlined />} style={{ color: '#d97706', borderColor: '#fcd34d' }}>
                        Ẩn gói combo
                      </Button>
                    </Popconfirm>
                  )}
                  {detailItem.type === 'package' && !detailItem.data.is_active && (
                    <Button
                      type="primary"
                      icon={<EyeOutlined />}
                      style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
                      onClick={() => setPackageActive(detailItem.data, true)}
                    >
                      Hiện lại gói combo
                    </Button>
                  )}

                  {/* Nút Xóa (bắt buộc phải ẩn mới xóa được) */}
                  {detailItem.data.is_active ? (
                    <Tooltip title={`Cần ẩn ${detailItem.type === 'service' ? 'dịch vụ' : 'gói combo'} trước khi có thể xóa`}>
                      <span>
                        <Button danger disabled icon={<DeleteOutlined />}>
                          Xóa {detailItem.type === 'service' ? 'dịch vụ' : 'gói'}
                        </Button>
                      </span>
                    </Tooltip>
                  ) : (
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => openDeleteConfirm(detailItem.data, detailItem.type)}
                    >
                      Xóa {detailItem.type === 'service' ? 'dịch vụ' : 'gói'}
                    </Button>
                  )}

                  {/* Nút Sửa */}
                  <Button
                    icon={<EditOutlined />}
                    onClick={() => {
                      if (detailItem.type === 'package') openEditPackage(detailItem.data)
                      else openEditService(detailItem.data)
                    }}
                  >
                    {detailItem.type === 'package' ? 'Sửa thành phần' : 'Sửa dịch vụ'}
                  </Button>
                </Space>
              </div>
            )}
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 20 }}>
              <Descriptions.Item label="Tên dịch vụ/gói" span={2}>
                <strong style={{ fontSize: 16, color: '#0f8b8d' }}>{detailItem.data.name}</strong>
              </Descriptions.Item>
              {detailItem.type === 'package' && (
                <Descriptions.Item label="Mã gói">{detailItem.data.code}</Descriptions.Item>
              )}
              <Descriptions.Item label="Loài áp dụng">
                <Tag color="purple">{SPECIES[detailItem.data.species_scope] || detailItem.data.species_scope}</Tag>
              </Descriptions.Item>
              {detailItem.type === 'service' ? (
                <>
                  <Descriptions.Item label="Phân nhóm">
                    <Tag color="blue">{CATEGORY[detailItem.data.category] || detailItem.data.category}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Thời lượng thực hiện">
                    <strong>{detailItem.data.duration_minutes} phút</strong>
                  </Descriptions.Item>
                </>
              ) : (
                <Descriptions.Item label="Thời lượng dự kiến" span={2}>
                  <strong>
                    {detailItem.data.items?.reduce((a, i) => a + (i.duration_minutes || 0), 0) || 0} phút
                  </strong>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Trạng thái" span={2}>
                {detailItem.data.is_active ? (
                  <Tag color="green">Đang cung cấp</Tag>
                ) : (
                  <Tag color="default">Đang tạm ẩn</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Mô tả & Công dụng" span={2}>
                {detailItem.data.description || 'Chưa có mô tả chi tiết'}
              </Descriptions.Item>
            </Descriptions>

            {detailItem.type === 'package' && (
              <div style={{ marginBottom: 20 }}>
                <Typography.Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
                  Các dịch vụ thành phần trong gói:
                </Typography.Text>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {detailItem.data.items?.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      style={{
                        padding: '10px 14px',
                        background: '#f8fafc',
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <strong>{idx + 1}. {item.service_name}</strong>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Thứ tự thực hiện: #{item.position}</div>
                      </div>
                      <Tag color="blue">{item.duration_minutes} phút</Tag>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Typography.Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
                Bảng giá niêm yết theo kích cỡ thú cưng (VNĐ):
              </Typography.Text>
              <Table
                size="small"
                pagination={false}
                dataSource={SIZES.map((sz) => ({
                  size: sz,
                  price: detailItem.data.prices?.[sz],
                }))}
                columns={[
                  {
                    title: 'Kích cỡ (Size)',
                    dataIndex: 'size',
                    key: 'size',
                    render: (s) => <Tag color="blue" style={{ fontWeight: 700 }}>Size {s}</Tag>,
                  },
                  {
                    title: 'Đơn giá',
                    dataIndex: 'price',
                    key: 'price',
                    align: 'right',
                    render: (p) => (
                      <span style={{ fontWeight: 700, color: p != null ? '#0f8b8d' : '#94a3b8' }}>
                        {p != null ? money(p) : 'Chưa thiết lập'}
                      </span>
                    ),
                  },
                ]}
              />
            </div>
          </div>
        )}
      </Drawer>

      {/* ===== MODAL XÁC NHẬN XÓA DỊCH VỤ / GÓI COMBO ===== */}
      <Modal
        open={!!deleteTarget}
        onCancel={() => !deleteBusy && setDeleteTarget(null)}
        onOk={handleConfirmDelete}
        confirmLoading={deleteBusy}
        okText="Xác nhận xóa vĩnh viễn"
        cancelText="Hủy bỏ"
        okButtonProps={{ danger: true }}
        centered
        title={
          <Space style={{ color: '#ff4d4f' }}>
            <ExclamationCircleOutlined style={{ fontSize: 20 }} />
            <span style={{ fontWeight: 600 }}>
              Xác nhận xóa vĩnh viễn {deleteTarget?.type === 'service' ? 'dịch vụ' : 'gói combo'}
            </span>
          </Space>
        }
      >
        {deleteTarget && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 14 }}>
              Bạn có chắc chắn muốn xóa vĩnh viễn{' '}
              {deleteTarget.type === 'service' ? 'dịch vụ' : 'gói combo'}{' '}
              <Text strong style={{ color: '#0f8b8d', fontSize: 15 }}>
                "{deleteTarget.target.name}"
              </Text>
              {deleteTarget.target.code ? ` (Mã: ${deleteTarget.target.code})` : ''}?
            </p>
            <Alert
              type="error"
              showIcon
              style={{ marginTop: 12 }}
              message="Lưu ý thao tác không thể hoàn tác"
              description={
                deleteTarget.type === 'service'
                  ? "Hành động này sẽ xóa dữ liệu dịch vụ khỏi hệ thống. Nếu dịch vụ này đã từng có lịch hẹn phát sinh trong quá khứ hoặc nằm trong gói combo, hệ thống sẽ bảo vệ dữ liệu và không thể xóa vĩnh viễn. Trong trường hợp đó, hãy giữ dịch vụ ở trạng thái 'Đã ẩn'."
                  : "Hành động này sẽ xóa hoàn toàn gói combo này khỏi hệ thống."
              }
            />
          </div>
        )}
      </Modal>

    </>
  )
}
