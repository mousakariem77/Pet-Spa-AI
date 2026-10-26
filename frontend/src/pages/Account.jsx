import { useEffect, useState } from 'react'
import {
  App, Button, Card, Col, Form, Input, Row, Space, Switch, Tag, Typography,
} from 'antd'
import { KeyOutlined, LockOutlined, UserOutlined } from '@ant-design/icons'
import { api, setToken, toFormErrors } from '../api.js'
import { useAuth, ROLE_LABEL } from '../auth.jsx'

const { Title, Text } = Typography

export default function Account() {
  const { message } = App.useApp()
  const { user, refresh } = useAuth()
  const [infoForm] = Form.useForm()
  const [pwForm] = Form.useForm()
  const [busy, setBusy] = useState(false)
  const [pwBusy, setPwBusy] = useState(false)

  // Đồng bộ dữ liệu người dùng vào form khi user được tải hoặc cập nhật
  useEffect(() => {
    if (user) {
      infoForm.setFieldsValue({
        full_name: user.full_name || '',
        phone: user.phone || '',
        email: user.email || '',
        allow_reminders: user.allow_reminders ?? true,
      })
    }
  }, [user, infoForm])

  const saveInfo = async (v) => {
    setBusy(true)
    try {
      const payload = {
        full_name: v.full_name?.trim(),
        phone: v.phone?.trim(),
        email: v.email?.trim() || '',
      }
      if (user?.role === 'customer') {
        payload.allow_reminders = !!v.allow_reminders
      }

      await api('/auth/me', { method: 'PATCH', body: payload })
      await refresh()
      message.success('Đã cập nhật thông tin cá nhân.')
    } catch (e) {
      if (e.fields && Object.keys(e.fields).length > 0) {
        infoForm.setFields(toFormErrors(e))
      }
      message.error(e.message || 'Có lỗi xảy ra.')
    } finally {
      setBusy(false)
    }
  }

  const changePassword = async (v) => {
    setPwBusy(true)
    try {
      const data = await api('/auth/change-password', { method: 'POST', body: v })
      if (data?.token) {
        setToken(data.token) // Cập nhật token mới khi token cũ bị hủy
      }
      await refresh()
      pwForm.resetFields()
      message.success('Đã đổi mật khẩu thành công.')
    } catch (e) {
      if (e.fields && Object.keys(e.fields).length > 0) {
        pwForm.setFields(toFormErrors(e))
      }
      message.error(e.message || 'Có lỗi xảy ra.')
    } finally {
      setPwBusy(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0, color: '#0b3d3f' }}>
          <UserOutlined style={{ marginRight: 8, color: '#0f8b8d' }} />
          Tài Khoản Cá Nhân
        </Title>
        <Text type="secondary">Quản lý thông tin hồ sơ và thiết lập mật khẩu bảo mật</Text>
      </div>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <UserOutlined style={{ color: '#0f8b8d' }} />
                <span>Thông tin liên hệ</span>
              </Space>
            }
            extra={<Tag color="cyan">{ROLE_LABEL[user?.role] || user?.role}</Tag>}
            style={{ width: '100%', borderRadius: 12, height: '100%' }}
          >
            <Form
              form={infoForm}
              layout="vertical"
              onFinish={saveInfo}
            >
              <Form.Item name="full_name" label="Họ và tên" rules={[{ required: true, message: 'Nhập họ và tên' }]}>
                <Input placeholder="ví dụ: Nguyễn Văn A" />
              </Form.Item>
              <Form.Item name="phone" label="Số điện thoại liên hệ">
                <Input placeholder="ví dụ: 0901234567" />
              </Form.Item>
              <Form.Item name="email" label="Địa chỉ Email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
                <Input placeholder="ví dụ: nguoidung@example.com" />
              </Form.Item>
              {user?.role === 'customer' && (
                <Form.Item name="allow_reminders" label="Nhận thông báo nhắc tái spa định kỳ" valuePropName="checked">
                  <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
                </Form.Item>
              )}
              <div style={{ marginTop: 24 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={busy}
                  style={{ minWidth: 120, background: '#0f8b8d', borderColor: '#0f8b8d' }}
                >
                  Lưu thay đổi
                </Button>
              </div>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <LockOutlined style={{ color: '#0f8b8d' }} />
                <span>Bảo mật & Đổi mật khẩu</span>
              </Space>
            }
            style={{ width: '100%', borderRadius: 12, height: '100%' }}
          >
            <Form form={pwForm} layout="vertical" onFinish={changePassword}>
              <Form.Item name="old_password" label="Mật khẩu hiện tại" rules={[{ required: true, message: 'Nhập mật khẩu hiện tại' }]}>
                <Input.Password placeholder="Nhập mật khẩu đang sử dụng..." />
              </Form.Item>
              <Form.Item name="new_password" label="Mật khẩu mới" rules={[{ required: true, min: 8, message: 'Tối thiểu 8 ký tự' }]}>
                <Input.Password placeholder="Nhập mật khẩu mới (tối thiểu 8 ký tự)..." />
              </Form.Item>
              <div style={{ marginTop: 24 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={pwBusy}
                  icon={<KeyOutlined />}
                  style={{ minWidth: 140, background: '#0f8b8d', borderColor: '#0f8b8d' }}
                >
                  Cập nhật mật khẩu
                </Button>
              </div>
            </Form>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
