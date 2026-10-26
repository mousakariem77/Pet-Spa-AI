import { useEffect, useState } from 'react'
import {
  App, Button, Card, Checkbox, Col, Divider, Form, Input,
  InputNumber, Row, Skeleton, TimePicker, Typography,
} from 'antd'
import { BankOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, toFormErrors } from '../api.js'

const { Title, Text } = Typography
const DAYS = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật']
const T = 'HH:mm:ss'

export default function SpaProfile() {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api('/spa')
      .then((s) => {
        if (s) {
          form.setFieldsValue({
            ...s,
            open_time: s.open_time ? dayjs(s.open_time, T) : undefined,
            close_time: s.close_time ? dayjs(s.close_time, T) : undefined,
            open_weekdays: Array.isArray(s.open_weekdays) ? s.open_weekdays : [0, 1, 2, 3, 4, 5, 6],
          })
        }
      })
      .catch((e) => {
        message.error(e.message || 'Không thể tải thông tin hồ sơ spa.')
      })
      .finally(() => setLoading(false))
  }, [form, message])

  const save = async (v) => {
    setBusy(true)
    try {
      const body = {
        name: v.name?.trim(),
        phone: v.phone?.trim() || '',
        email: v.email?.trim() || '',
        address: v.address?.trim() || '',
        open_time: v.open_time ? dayjs(v.open_time).format(T) : undefined,
        close_time: v.close_time ? dayjs(v.close_time).format(T) : undefined,
        open_weekdays: v.open_weekdays,
        slot_minutes: v.slot_minutes,
        cancel_cutoff_hours: v.cancel_cutoff_hours,
      }

      const res = await api('/spa', {
        method: 'PATCH',
        body,
      })
      if (res) {
        form.setFieldsValue({
          ...res,
          open_time: res.open_time ? dayjs(res.open_time, T) : undefined,
          close_time: res.close_time ? dayjs(res.close_time, T) : undefined,
          open_weekdays: Array.isArray(res.open_weekdays) ? res.open_weekdays : [],
        })
      }
      message.success('Đã lưu hồ sơ spa.')
    } catch (e) {
      if (e.fields && Object.keys(e.fields).length > 0) {
        form.setFields(toFormErrors(e))
      }
      message.error(e.message || 'Có lỗi xảy ra khi lưu hồ sơ.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Skeleton active />

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0, color: '#0b3d3f' }}>
          <BankOutlined style={{ marginRight: 8, color: '#0f8b8d' }} />
          Hồ Sơ Spa
        </Title>
        <Text type="secondary">Cấu hình thông tin cơ sở, thời gian hoạt động và chính sách đặt lịch</Text>
      </div>

      <Card style={{ width: '100%', borderRadius: 12 }}>
        <Form form={form} layout="vertical" onFinish={save}>
          <Row gutter={24}>
            <Col xs={24} md={12}>
              <Form.Item name="name" label="Tên spa" rules={[{ required: true, message: 'Nhập tên spa' }]}>
                <Input placeholder="ví dụ: Spa Thú Y Lông Mượt" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="phone" label="Số điện thoại liên hệ" rules={[{ required: true, message: 'Nhập số điện thoại' }]}>
                <Input placeholder="ví dụ: 0283000000" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={24}>
            <Col xs={24} md={12}>
              <Form.Item name="email" label="Email thông báo" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
                <Input placeholder="ví dụ: lienhe@longmuot.example" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="address" label="Địa chỉ spa">
                <Input placeholder="ví dụ: 25 Lê Văn Thịnh, TP. Thủ Đức, TP.HCM" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" style={{ margin: '16px 0 20px 0' }}>Khung Giờ Hoạt Động & Lịch Mở Cửa</Divider>

          <Row gutter={24}>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="open_time" label="Giờ mở cửa" rules={[{ required: true, message: 'Chọn giờ mở cửa' }]}>
                <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item
                name="close_time"
                label="Giờ đóng cửa"
                rules={[
                  { required: true, message: 'Chọn giờ đóng cửa' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      const openTime = getFieldValue('open_time')
                      if (!value || !openTime) {
                        return Promise.resolve()
                      }
                      if (value.isAfter(openTime)) {
                        return Promise.resolve()
                      }
                      return Promise.reject(new Error('Giờ đóng cửa phải sau giờ mở cửa'))
                    },
                  }),
                ]}
              >
                <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item
                name="slot_minutes"
                label="Bước slot đặt lịch (phút)"
                rules={[{ required: true, message: 'Nhập bước slot' }]}
              >
                <InputNumber min={5} max={120} step={5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item
                name="cancel_cutoff_hours"
                label="Hủy trước giờ hẹn (giờ)"
                rules={[{ required: true, message: 'Nhập số giờ hủy trước' }]}
              >
                <InputNumber min={0} max={72} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="open_weekdays"
            label="Các ngày mở cửa trong tuần"
            rules={[{ required: true, message: 'Vui lòng chọn ít nhất 1 ngày mở cửa' }]}
          >
            <Checkbox.Group options={DAYS.map((label, value) => ({ label, value }))} />
          </Form.Item>

          <div style={{ marginTop: 24 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={busy}
              size="middle"
              style={{ minWidth: 140, background: '#0f8b8d', borderColor: '#0f8b8d' }}
            >
              Lưu hồ sơ spa
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  )
}
