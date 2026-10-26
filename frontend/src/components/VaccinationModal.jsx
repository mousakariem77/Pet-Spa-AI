import { useCallback, useEffect, useState } from 'react'
import { App, Button, DatePicker, Form, Input, Modal, Popconfirm, Table } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, toFormErrors } from '../api.js'

const fmt = (d) => (d ? dayjs(d).format('YYYY-MM-DD') : null)

export default function VaccinationModal({ pet, canEdit, onClose, onChanged }) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [rows, setRows] = useState([])

  const load = useCallback(async () => {
    if (pet) setRows(await api(`/pets/${pet.id}/vaccinations`))
  }, [pet])
  useEffect(() => { load() }, [load])

  const add = async () => {
    const v = await form.validateFields()
    try {
      await api(`/pets/${pet.id}/vaccinations`, {
        method: 'POST',
        body: { vaccine_name: v.vaccine_name, date_given: fmt(v.date_given), valid_until: fmt(v.valid_until) },
      })
      form.resetFields()
      await load()
      onChanged()
    } catch (e) {
      form.setFields(toFormErrors(e))
      message.error(e.message)
    }
  }

  const remove = async (id) => {
    await api(`/pets/${pet.id}/vaccinations/${id}`, { method: 'DELETE' })
    await load()
    onChanged()
  }

  return (
    <Modal centered open={!!pet} title={pet ? `Tiêm phòng: ${pet.name}` : ''} onCancel={onClose} footer={null} destroyOnHidden width={640}>
      <Table
        size="small" rowKey="id" dataSource={rows} pagination={false}
        locale={{ emptyText: 'Chưa có mũi tiêm nào' }}
        columns={[
          { title: 'Vaccine', dataIndex: 'vaccine_name' },
          { title: 'Ngày tiêm', dataIndex: 'date_given', render: (v) => dayjs(v).format('DD/MM/YYYY') },
          { title: 'Hiệu lực đến', dataIndex: 'valid_until', render: (v) => (v ? dayjs(v).format('DD/MM/YYYY') : '—') },
          ...(canEdit ? [{ title: '', key: 'x', width: 50, render: (_, r) => (
            <Popconfirm title="Xóa mũi tiêm này?" okText="Xóa" cancelText="Hủy" onConfirm={() => remove(r.id)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>) }] : []),
        ]}
      />
      {canEdit && (
        <Form form={form} layout="inline" style={{ marginTop: 16, rowGap: 8 }}>
          <Form.Item name="vaccine_name" rules={[{ required: true, message: 'Nhập loại vaccine' }]}><Input placeholder="Loại vaccine" /></Form.Item>
          <Form.Item name="date_given" rules={[{ required: true, message: 'Chọn ngày tiêm' }]}>
            <DatePicker placeholder="Ngày tiêm" format="DD/MM/YYYY" disabledDate={(d) => d.isAfter(dayjs())} />
          </Form.Item>
          <Form.Item name="valid_until"><DatePicker placeholder="Hiệu lực đến" format="DD/MM/YYYY" /></Form.Item>
          <Button type="primary" icon={<PlusOutlined />} onClick={add}>Thêm</Button>
        </Form>
      )}
    </Modal>
  )
}
