import { useEffect, useState, useCallback } from 'react'
import {
  Alert, Button, Card, Col, DatePicker, Empty, Form, Input, Modal, Popconfirm, Row,
  Select, Space, Switch, Table, Tabs, Tag, Typography, message,
} from 'antd'
import {
  ClockCircleOutlined, DeleteOutlined, EditOutlined,
  PlusOutlined, ReloadOutlined, ToolOutlined, UserAddOutlined, UserOutlined,
} from '@ant-design/icons'
import { api, toFormErrors, unwrap } from '../api.js'
import { useAuth, ROLE_LABEL } from '../auth.jsx'
import RowPerPageSelect from '../components/RowPerPageSelect.jsx'

const { Title, Text, Paragraph } = Typography

const WEEKDAYS = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật']

const RESOURCE_TYPE_MAP = {
  bath_tub: { label: 'Bồn tắm', color: 'blue' },
  grooming_table: { label: 'Bàn cắt tỉa', color: 'orange' },
  drying_cage: { label: 'Chuồng sấy', color: 'cyan' },
  spa_room: { label: 'Phòng spa', color: 'purple' },
}

const specialtyCodeFromName = (name) => name
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'D')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')

export default function StaffManagement() {
  const { user } = useAuth()
  const isManager = user?.role === 'manager'

  // Nhân sự
  const [staffList, setStaffList] = useState([])
  const [specialties, setSpecialties] = useState([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [staffPage, setStaffPage] = useState(1)
  const [staffPageSize, setStaffPageSize] = useState(10)
  const [staffModalOpen, setStaffModalOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState(null)
  const [staffForm] = Form.useForm()
  const [specialtySearch, setSpecialtySearch] = useState('')
  const [creatingSpecialty, setCreatingSpecialty] = useState(false)

  // Ca làm việc & Ngày nghỉ trong màn quản lý nhân viên
  const [shiftModalOpen, setShiftModalOpen] = useState(false)
  const [shiftStaff, setShiftStaff] = useState(null)
  const [shifts, setShifts] = useState([])
  const [shiftForm] = Form.useForm()
  const [shiftSaving, setShiftSaving] = useState(false)
  const [timeOffList, setTimeOffList] = useState([])
  const [timeOffForm] = Form.useForm()

  // Tài nguyên
  const [resources, setResources] = useState([])
  const [resLoading, setResLoading] = useState(false)
  const [resPage, setResPage] = useState(1)
  const [resPageSize, setResPageSize] = useState(10)
  const [resModalOpen, setResModalOpen] = useState(false)
  const [resSaving, setResSaving] = useState(false)
  const [resForm] = Form.useForm()

  const openResourceModal = () => {
    resForm.resetFields()
    resForm.setFieldsValue({ resource_type: 'bath_tub' })
    setResModalOpen(true)
  }

  const loadStaff = useCallback(async () => {
    setStaffLoading(true)
    try {
      const [stf, specs] = await Promise.all([
        api('/staff?include_inactive=1'),
        api('/specialties'),
      ])
      setStaffList(unwrap(stf))
      setSpecialties(unwrap(specs))
    } catch (e) {
      message.error(e.message || 'Không thể tải danh sách nhân viên')
    } finally {
      setStaffLoading(false)
    }
  }, [])

  const loadResources = useCallback(async () => {
    setResLoading(true)
    try {
      const res = await api('/resources?include_inactive=1&page_size=100')
      const loadedResources = unwrap(res)
      setResources(loadedResources)
      return loadedResources
    } catch (e) {
      message.error(e.message || 'Không thể tải danh sách tài nguyên')
      return []
    } finally {
      setResLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStaff()
    loadResources()
  }, [loadStaff, loadResources])

  // Thêm / Sửa nhân viên
  const openStaffModal = (st = null) => {
    setEditingStaff(st)
    staffForm.resetFields()
    if (st) {
      staffForm.setFieldsValue({
        username: st.username,
        full_name: st.full_name,
        phone: st.phone,
        email: st.email,
        role: st.role,
        specialties: st.specialties,
        is_active: st.is_active,
      })
    } else {
      staffForm.setFieldsValue({ role: 'technician', is_active: true })
    }
    setStaffModalOpen(true)
  }

  const saveStaff = async () => {
    try {
      const values = await staffForm.validateFields()
      if (editingStaff) {
        await api(`/staff/${editingStaff.id}`, { method: 'PATCH', body: JSON.stringify(values) })
        message.success('Cập nhật nhân viên thành công!')
      } else {
        await api('/staff', { method: 'POST', body: JSON.stringify(values) })
        message.success('Thêm nhân viên mới thành công!')
      }
      setStaffModalOpen(false)
      loadStaff()
    } catch (e) {
      const fields = toFormErrors(e)
      if (fields.length) staffForm.setFields(fields)
      message.error(e.message || 'Lỗi khi lưu nhân sự')
    }
  }

  const createSpecialty = async (selectedIds) => {
    const name = specialtySearch.trim()
    if (!name || creatingSpecialty) return

    setCreatingSpecialty(true)
    try {
      const baseCode = specialtyCodeFromName(name).slice(0, 50) || 'CHUYEN_MON'
      let code = baseCode
      let suffix = 2
      while (specialties.some((specialty) => specialty.code === code)) {
        const ending = `_${suffix}`
        code = `${baseCode.slice(0, 50 - ending.length).replace(/_+$/g, '')}${ending}`
        suffix += 1
      }

      const created = await api('/specialties', {
        method: 'POST',
        body: { code, name_vi: name },
      })
      setSpecialties((current) => [...current, created])
      staffForm.setFieldValue('specialties', [...selectedIds, created.id])
      setSpecialtySearch('')
      message.success(`Đã thêm chuyên môn "${created.name_vi}"`)
    } catch (e) {
      message.error(e.message || 'Không thể thêm chuyên môn')
    } finally {
      setCreatingSpecialty(false)
    }
  }

  // Khóa nhân viên
  const toggleStaffActive = async (st) => {
    try {
      if (st.is_active) {
        await api(`/staff/${st.id}`, { method: 'DELETE' })
      } else {
        await api(`/staff/${st.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: true }) })
      }
      message.success('Đã cập nhật trạng thái nhân viên')
      loadStaff()
    } catch (e) {
      message.error(e.message || 'Thao tác không thành công')
    }
  }

  // Quản lý ca làm & ngày nghỉ
  const openShifts = async (st) => {
    setShiftStaff(st)
    shiftForm.resetFields()
    timeOffForm.resetFields()
    setShiftModalOpen(true)
    try {
      const [loadedShifts, tos] = await Promise.all([
        api(`/staff/${st.id}/shifts`),
        api(`/staff/${st.id}/time-off`),
      ])
      setShifts(loadedShifts)
      setTimeOffList(tos)
      shiftForm.setFieldsValue({
        shifts: loadedShifts.map((shift) => ({
          ...shift,
          start_time: shift.start_time?.slice(0, 5),
          end_time: shift.end_time?.slice(0, 5),
        })),
      })
    } catch {
      // ignore
    }
  }

  const saveShifts = async () => {
    try {
      const { shifts: values = [] } = await shiftForm.validateFields()
      setShiftSaving(true)
      const updated = await api(`/staff/${shiftStaff.id}/shifts`, {
        method: 'PUT',
        body: values.map(({ weekday, start_time, end_time }) => ({ weekday, start_time, end_time })),
      })
      setShifts(updated)
      message.success('Đã cập nhật lịch làm việc')
    } catch (e) {
      const fields = toFormErrors(e)
      if (fields.length) shiftForm.setFields(fields)
      else message.error(e.message || 'Không thể lưu lịch làm việc')
    } finally {
      setShiftSaving(false)
    }
  }

  const canEditShifts = isManager || shiftStaff?.user_id === user?.id

  const addTimeOff = async () => {
    try {
      const v = await timeOffForm.validateFields()
      await api(`/staff/${shiftStaff.id}/time-off`, {
        method: 'POST',
        body: JSON.stringify({
          date_from: v.range[0].format('YYYY-MM-DD'),
          date_to: v.range[1].format('YYYY-MM-DD'),
          reason: v.reason || '',
        }),
      })
      message.success('Đã đăng ký ngày nghỉ')
      timeOffForm.resetFields()
      const tos = await api(`/staff/${shiftStaff.id}/time-off`)
      setTimeOffList(tos)
    } catch (e) {
      message.error(e.message || 'Lỗi khi đăng ký ngày nghỉ')
    }
  }

  const deleteTimeOff = async (tid) => {
    try {
      await api(`/staff/${shiftStaff.id}/time-off/${tid}`, { method: 'DELETE' })
      message.success('Đã xóa ngày nghỉ')
      setTimeOffList((prev) => prev.filter((x) => x.id !== tid))
    } catch (e) {
      message.error(e.message || 'Lỗi khi xóa')
    }
  }

  // Thêm tài nguyên
  const saveResource = async () => {
    try {
      const v = await resForm.validateFields()
      setResSaving(true)
      const createdResource = await api('/resources', { method: 'POST', body: JSON.stringify(v) })
      message.success('Đã thêm tài nguyên mới')
      setResModalOpen(false)
      resForm.resetFields()
      const updatedResources = await loadResources()
      const createdIndex = updatedResources.findIndex((resource) => resource.id === createdResource.id)
      if (createdIndex >= 0) setResPage(Math.floor(createdIndex / resPageSize) + 1)
    } catch (e) {
      const fields = toFormErrors(e)
      if (fields.length) resForm.setFields(fields)
      message.error(e.message || 'Lỗi khi thêm tài nguyên')
    } finally {
      setResSaving(false)
    }
  }

  const toggleResourceActive = async (r) => {
    try {
      if (r.is_active) {
        await api(`/resources/${r.id}`, { method: 'DELETE' })
      } else {
        await api(`/resources/${r.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: true }) })
      }
      message.success('Đã cập nhật trạng thái tài nguyên')
      loadResources()
    } catch (e) {
      message.error(e.message || 'Lỗi thao tác')
    }
  }

  const staffColumns = [
    {
      title: 'Họ tên',
      key: 'name',
      render: (_, st) => (
        <div>
          <Text strong style={{ fontSize: 14 }}>{st.full_name || st.username}</Text>
          <div><Text type="secondary" style={{ fontSize: 12 }}>@{st.username}</Text></div>
        </div>
      ),
    },
    {
      title: 'Vai trò',
      dataIndex: 'role',
      render: (r) => <Tag color={r === 'technician' ? 'cyan' : 'blue'}>{ROLE_LABEL[r]}</Tag>,
    },
    {
      title: 'Liên hệ',
      key: 'contact',
      render: (_, st) => (
        <div>
          <div>{st.phone || '—'}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>{st.email || ''}</Text>
        </div>
      ),
    },
    {
      title: 'Chuyên môn',
      dataIndex: 'specialties',
      render: (specIds) => {
        const specNames = (specIds || []).map((id) => specialties.find((s) => s.id === id)?.name_vi).filter(Boolean)
        return specNames.length > 0 ? (
          <Space wrap size={[0, 4]}>
            {specNames.map((n, i) => <Tag key={i} color="geekblue">{n}</Tag>)}
          </Space>
        ) : <Text type="secondary">Chưa gán</Text>
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'is_active',
      render: (active, st) => (
        <Switch
          checked={active}
          disabled={!isManager}
          onChange={() => toggleStaffActive(st)}
          checkedChildren="Hoạt động"
          unCheckedChildren="Đã khóa"
        />
      ),
    },
    {
      title: 'Thao tác',
      key: 'act',
      render: (_, st) => (
        <Space onClick={(e) => e.stopPropagation()}>
          <Button size="small" icon={<ClockCircleOutlined />} onClick={(e) => { e.stopPropagation(); openShifts(st) }}>
            Ca & Nghỉ
          </Button>
          {isManager && (
            <Button size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openStaffModal(st) }}>
              Sửa
            </Button>
          )}
        </Space>
      ),
    },
  ]

  const resColumns = [
    { title: 'Tên tài nguyên', dataIndex: 'name', render: (n) => <Text strong>{n}</Text> },
    {
      title: 'Phân loại',
      dataIndex: 'resource_type',
      render: (t) => {
        const item = RESOURCE_TYPE_MAP[t] || { label: t, color: 'default' }
        return <Tag color={item.color}>{item.label}</Tag>
      },
    },
    {
      title: 'Trạng thái hoạt động',
      dataIndex: 'is_active',
      render: (active, r) => (
        <Switch
          checked={active}
          disabled={!isManager}
          onChange={() => toggleResourceActive(r)}
          checkedChildren="Sẵn sàng"
          unCheckedChildren="Tạm ngưng"
        />
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Nhân Sự & Cơ Sở Vật Chất</Title>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            Quản lý đội ngũ kỹ thuật viên, ca làm, ngày nghỉ và cơ sở vật chất
          </Paragraph>
        </div>

        <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => { loadStaff(); loadResources() }}>Làm mới</Button>
          {isManager && (
            <>
              <Button type="primary" icon={<UserAddOutlined />} onClick={() => openStaffModal(null)}>
                Thêm nhân viên
              </Button>
              <Button icon={<ToolOutlined />} onClick={openResourceModal}>
                Thêm tài nguyên
              </Button>
            </>
          )}
        </Space>
      </div>

          <Tabs
        type="card"
        items={[
          {
            key: 'staff',
            label: (<span><UserOutlined /> Đội ngũ nhân sự ({staffList.length})</span>),
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>💡 Bấm vào nhân viên để quản lý ca làm và ngày nghỉ</Text>
                  <RowPerPageSelect value={staffPageSize} onChange={(ps) => { setStaffPageSize(ps); setStaffPage(1); }} />
                </div>
                <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 16, overflow: 'hidden' }}>
                  <Table
                    dataSource={staffList}
                    columns={staffColumns}
                    rowKey="id"
                    loading={staffLoading}
                    scroll={{ x: 'max-content' }}
                    rowClassName={() => 'clickable-row'}
                    onRow={(record) => ({
                      onClick: () => openShifts(record),
                      style: { cursor: 'pointer' },
                    })}
                    pagination={{
                      position: ['bottomRight'],
                      current: staffPage,
                      pageSize: staffPageSize,
                      showSizeChanger: false,
                      showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} nhân sự`,
                      onChange: (p) => setStaffPage(p),
                    }}
                  />
                </Card>
              </div>
            ),
          },
          {
            key: 'resources',
            label: (<span><ToolOutlined /> Cơ sở vật chất ({resources.length})</span>),
            children: (
              <div>
                <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                  {Object.entries(RESOURCE_TYPE_MAP).map(([key, item]) => {
                    const count = resources.filter((r) => r.resource_type === key && r.is_active).length
                    return (
                      <Col xs={12} sm={6} key={key}>
                        <Card size="small" style={{ borderRadius: 12 }}>
                          <Text type="secondary">{item.label}</Text>
                          <div style={{ fontSize: 24, fontWeight: 800, color: '#0f8b8d' }}>
                            {count} <span style={{ fontSize: 13, fontWeight: 400, color: '#6b7280' }}>vị trí</span>
                          </div>
                        </Card>
                      </Col>
                    )
                  })}
                </Row>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>💡 Danh sách vị trí cơ sở vật chất spa</Text>
                  <RowPerPageSelect value={resPageSize} onChange={(ps) => { setResPageSize(ps); setResPage(1); }} />
                </div>

                <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 16, overflow: 'hidden' }}>
                  <Table
                    dataSource={resources}
                    columns={resColumns}
                    rowKey="id"
                    loading={resLoading}
                    scroll={{ x: 'max-content' }}
                    pagination={{
                      position: ['bottomRight'],
                      current: resPage,
                      pageSize: resPageSize,
                      showSizeChanger: false,
                      showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} tài nguyên`,
                      onChange: (p) => setResPage(p),
                    }}
                  />
                </Card>
              </div>
            ),
          },
        ]}
      />

      {/* ===== MODAL THÊM / SỬA NHÂN VIÊN ===== */}
      <Modal
        centered
        title={editingStaff ? `Chỉnh sửa nhân viên: ${editingStaff.full_name}` : 'Thêm nhân viên mới'}
        open={staffModalOpen}
        onCancel={() => setStaffModalOpen(false)}
        onOk={saveStaff}
        okText="Lưu thông tin"
      >
        <Form form={staffForm} layout="vertical">
          <Form.Item name="full_name" label="Họ và tên" rules={[{ required: true, message: 'Nhập họ tên' }]}>
            <Input placeholder="Ví dụ: Nguyễn Văn A" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true, message: 'Nhập tên đăng nhập' }]}>
                <Input disabled={!!editingStaff} placeholder="ktv_ten" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="role" label="Vai trò" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'technician', label: 'Kỹ thuật viên' },
                    { value: 'receptionist', label: 'Lễ tân' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          {!editingStaff && (
            <Form.Item name="password" label="Mật khẩu khởi tạo" rules={[{ required: true, min: 8, message: 'Tối thiểu 8 ký tự' }]}>
              <Input.Password placeholder="Nhập mật khẩu" />
            </Form.Item>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="Số điện thoại"><Input placeholder="0901xxxxxx" /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="Email"><Input placeholder="nhanvien@example.com" /></Form.Item>
            </Col>
          </Row>

          <Form.Item name="specialties" label="Chuyên môn tay nghề">
            <Select
              mode="multiple"
              placeholder="Tìm hoặc chọn chuyên môn"
              searchValue={specialtySearch}
              onSearch={setSpecialtySearch}
              filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
              options={specialties.map((s) => ({ value: s.id, label: s.name_vi }))}
              loading={creatingSpecialty}
              dropdownRender={(menu) => {
                const query = specialtySearch.trim()
                const hasMatch = specialties.some((specialty) =>
                  specialty.name_vi.toLowerCase().includes(query.toLowerCase()))

                return (
                  <>
                    {menu}
                    <div style={{ height: 1, margin: '4px 0', background: '#f0f0f0' }} />
                    <Button
                      type="link"
                      block
                      disabled={!query || hasMatch}
                      loading={creatingSpecialty}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => createSpecialty(staffForm.getFieldValue('specialties') || [])}
                    >
                      {query
                        ? hasMatch
                          ? 'Chuyên môn đã có trong danh sách'
                          : `+ Thêm chuyên môn "${query}"`
                        : '+ Nhập tên để thêm chuyên môn mới'}
                    </Button>
                  </>
                )
              }}
            />
          </Form.Item>

          <Form.Item name="is_active" valuePropName="checked" label="Trạng thái tài khoản">
            <Switch checkedChildren="Hoạt động" unCheckedChildren="Khóa" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ===== MODAL CA LÀM & NGÀY NGHỈ ===== */}
      <Modal
        centered
        title={`Lịch làm việc & Ngày nghỉ: ${shiftStaff?.full_name || shiftStaff?.username}`}
        open={shiftModalOpen}
        onCancel={() => setShiftModalOpen(false)}
        footer={null}
        width={600}
      >
        <Tabs
          items={[
            {
              key: 'shifts',
              label: 'Ca làm việc trong tuần',
              children: (
                <div>
                  <Alert
                    type="info"
                    showIcon
                    message="Đăng ký ca làm định kỳ"
                    description="Lịch này được dùng để xác định thời gian nhân viên có thể nhận lịch hẹn."
                    style={{ marginBottom: 16 }}
                  />
                  {canEditShifts ? (
                    <Form form={shiftForm} layout="vertical">
                      <Form.List name="shifts">
                        {(fields, { add, remove }) => (
                          <>
                            {fields.map((field) => (
                              <Row gutter={10} align="middle" key={field.key}>
                                <Col span={8}>
                                  <Form.Item
                                    name={[field.name, 'weekday']}
                                    label={field.name === 0 ? 'Ngày' : undefined}
                                    rules={[{ required: true, message: 'Chọn ngày' }]}
                                  >
                                    <Select options={WEEKDAYS.map((label, value) => ({ value, label }))} />
                                  </Form.Item>
                                </Col>
                                <Col span={6}>
                                  <Form.Item
                                    name={[field.name, 'start_time']}
                                    label={field.name === 0 ? 'Bắt đầu' : undefined}
                                    rules={[{ required: true, message: 'Chọn giờ bắt đầu' }]}
                                  >
                                    <Input type="time" />
                                  </Form.Item>
                                </Col>
                                <Col span={6}>
                                  <Form.Item
                                    name={[field.name, 'end_time']}
                                    label={field.name === 0 ? 'Kết thúc' : undefined}
                                    rules={[{ required: true, message: 'Chọn giờ kết thúc' }]}
                                  >
                                    <Input type="time" />
                                  </Form.Item>
                                </Col>
                                <Col span={4}>
                                  <Button
                                    danger
                                    type="text"
                                    aria-label="Xóa ca làm"
                                    icon={<DeleteOutlined />}
                                    onClick={() => remove(field.name)}
                                  />
                                </Col>
                              </Row>
                            ))}
                            <Space>
                              <Button icon={<PlusOutlined />} onClick={() => add({ weekday: 0 })}>
                                Thêm ca
                              </Button>
                              <Button type="primary" loading={shiftSaving} onClick={saveShifts}>
                                Lưu lịch làm việc
                              </Button>
                            </Space>
                          </>
                        )}
                      </Form.List>
                    </Form>
                  ) : shifts.length > 0 ? (
                    shifts.map((s) => (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                        <Text strong>{WEEKDAYS[s.weekday]}</Text>
                        <Tag color="cyan">{s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}</Tag>
                      </div>
                    ))
                  ) : <Empty description="Chưa có ca làm việc nào được cấu hình." />}
                </div>
              ),
            },
            {
              key: 'timeoff',
              label: 'Đăng ký ngày nghỉ',
              children: (
                <div>
                  <Form form={timeOffForm} layout="vertical" onFinish={addTimeOff} style={{ marginBottom: 16 }}>
                    <Row gutter={12}>
                      <Col span={14}>
                        <Form.Item name="range" label="Khoảng ngày nghỉ" rules={[{ required: true, message: 'Chọn ngày' }]}>
                          <DatePicker.RangePicker format="YYYY-MM-DD" style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={10}>
                        <Form.Item name="reason" label="Lý do nghỉ"><Input placeholder="Việc riêng / Khám bệnh..." /></Form.Item>
                      </Col>
                    </Row>
                    <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>Thêm ngày nghỉ</Button>
                  </Form>

                  <Table
                    dataSource={timeOffList}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    columns={[
                      { title: 'Từ ngày', dataIndex: 'date_from' },
                      { title: 'Đến ngày', dataIndex: 'date_to' },
                      { title: 'Lý do', dataIndex: 'reason', render: (r) => r || '—' },
                      {
                        title: '',
                        key: 'del',
                        width: 50,
                        render: (_, to) => (
                          <Popconfirm title="Xóa ngày nghỉ này?" onConfirm={() => deleteTimeOff(to.id)}>
                            <Button danger type="text" size="small" icon={<DeleteOutlined />} />
                          </Popconfirm>
                        ),
                      },
                    ]}
                  />
                </div>
              ),
            },
          ]}
        />
      </Modal>

      {/* ===== MODAL THÊM TÀI NGUYÊN ===== */}
      <Modal
        centered
        title="Thêm vị trí tài nguyên cơ sở vật chất"
        open={resModalOpen}
        onCancel={() => setResModalOpen(false)}
        onOk={saveResource}
        okText="Thêm mới"
        confirmLoading={resSaving}
      >
        <Form form={resForm} layout="vertical">
          <Form.Item name="name" label="Tên tài nguyên" rules={[{ required: true, message: 'Nhập tên' }]}>
            <Input placeholder="Ví dụ: Bàn cắt 4, Chuồng sấy 5..." />
          </Form.Item>
          <Form.Item name="resource_type" label="Loại tài nguyên" rules={[{ required: true, message: 'Chọn loại tài nguyên' }]}>
            <Select
              placeholder="Chọn loại tài nguyên"
              options={[
                { value: 'bath_tub', label: 'Bồn tắm' },
                { value: 'grooming_table', label: 'Bàn cắt tỉa' },
                { value: 'drying_cage', label: 'Chuồng sấy' },
                { value: 'spa_room', label: 'Phòng spa' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
