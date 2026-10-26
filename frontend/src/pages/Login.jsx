import { useEffect, useState } from 'react'
import {
  Alert, Button, Checkbox, Col, Form, Input, Modal,
  Result, Row, Space, Steps, Tabs, Tag, Tooltip, Typography, message,
} from 'antd'
import {
  ArrowLeftOutlined, CheckCircleOutlined, IdcardOutlined,
  InfoCircleOutlined, KeyOutlined, LockOutlined, PhoneOutlined,
  SafetyCertificateOutlined, SendOutlined, ThunderboltOutlined, UserOutlined,
} from '@ant-design/icons'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import { api, toFormErrors } from '../api.js'
import Logo from '../components/Logo.jsx'

const { Title, Text, Paragraph } = Typography


const DEMO_ACCOUNTS = [
  {
    role: 'Quản lý (Manager)',
    badge: 'Toàn quyền hệ thống',
    badgeColor: 'gold',
    username: 'quanly',
    phone: '0909111222',
    name: 'Chủ spa Lông Mượt',
    desc: 'Cấu hình bảng giá, tài nguyên, nhân sự, tri thức SOP AI',
  },
  {
    role: 'Lễ tân (Receptionist)',
    badge: 'Vận hành tại quầy',
    badgeColor: 'blue',
    username: 'letan',
    phone: '0908222333',
    name: 'Nguyễn Lễ Tân',
    desc: 'Tiếp nhận khách, xếp thợ, check-in/out, hóa đơn & thu ngân',
  },
  {
    role: 'Kỹ thuật viên (Technician)',
    badge: 'Chuyên môn dịch vụ',
    badgeColor: 'orange',
    username: 'ktv1',
    phone: '0907333444',
    name: 'KTV Tắm & Vệ sinh',
    desc: 'Xem danh sách ca hẹn được giao, cảnh báo an toàn thú cưng',
  },
  {
    role: 'Khách hàng (Customer)',
    badge: 'Chủ thú cưng',
    badgeColor: 'green',
    username: '0901234567',
    phone: '0901234567',
    name: 'Nguyễn Thu Hà (Bé Bông, Mimi)',
    desc: 'Đặt lịch online, kiểm tra tính năng AI cảnh báo dị ứng',
  },
]

export default function Login() {
  const { user, login, register } = useAuth()
  const nav = useNavigate()
  const [activeTab, setActiveTab] = useState('login')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [demoModalOpen, setDemoModalOpen] = useState(false)
  const [loginForm] = Form.useForm()
  const [regForm] = Form.useForm()

  // Forgot Password OTP states
  const [forgotModalOpen, setForgotModalOpen] = useState(false)
  const [forgotStep, setForgotStep] = useState(0) // 0: SĐT, 1: OTP, 2: MK mới, 3: Thành công
  const [forgotPhone, setForgotPhone] = useState('')
  const [devOtp, setDevOtp] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [forgotBusy, setForgotBusy] = useState(false)
  const [forgotError, setForgotError] = useState('')

  useEffect(() => {
    document.title = 'Đăng Nhập / Đăng Ký | Pet Spa AI'
  }, [])

  const [forgotPhoneForm] = Form.useForm()
  const [forgotOtpForm] = Form.useForm()
  const [forgotPassForm] = Form.useForm()

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000)
    return () => clearInterval(timer)
  }, [countdown])

  const handleRequestOtp = async (values) => {
    setForgotBusy(true)
    setForgotError('')
    try {
      const res = await api('/auth/forgot-password/request-otp', {
        method: 'POST',
        body: { phone: values.phone },
      })
      setForgotPhone(res.phone)
      setDevOtp(res.dev_otp || '')
      setCountdown(60)
      setForgotStep(1)
      forgotOtpForm.resetFields()
      message.success(res.message || 'Mã xác thực OTP đã được tạo.')
    } catch (err) {
      const formErrors = toFormErrors(err)
      if (formErrors.length) {
        forgotPhoneForm.setFields(formErrors)
        setForgotError('')
      } else {
        setForgotError(err.message || 'Không thể gửi mã OTP. Vui lòng kiểm tra lại số điện thoại.')
      }
    } finally {
      setForgotBusy(false)
    }
  }

  const handleResendOtp = async () => {
    if (countdown > 0 || !forgotPhone) return
    setForgotBusy(true)
    setForgotError('')
    try {
      const res = await api('/auth/forgot-password/request-otp', {
        method: 'POST',
        body: { phone: forgotPhone },
      })
      setDevOtp(res.dev_otp || '')
      setCountdown(60)
      message.success('Đã cấp lại mã OTP mới!')
    } catch (err) {
      const formErrors = toFormErrors(err)
      if (formErrors.length) {
        forgotPhoneForm.setFields(formErrors)
        setForgotError('')
      } else {
        setForgotError(err.message || 'Lỗi gửi lại mã OTP.')
      }
    } finally {
      setForgotBusy(false)
    }
  }

  const handleVerifyOtp = async (values) => {
    setForgotBusy(true)
    setForgotError('')
    try {
      const res = await api('/auth/forgot-password/verify-otp', {
        method: 'POST',
        body: { phone: forgotPhone, otp_code: values.otp_code },
      })
      setForgotStep(2)
      setForgotError('')
      forgotPassForm.resetFields()
      message.success(res.message || 'Mã OTP chính xác!')
    } catch (err) {
      const formErrors = toFormErrors(err)
      if (formErrors.length) {
        forgotOtpForm.setFields(formErrors)
        setForgotError('')
      } else {
        setForgotError(err.message || 'Mã OTP không hợp lệ hoặc đã hết hạn.')
      }
    } finally {
      setForgotBusy(false)
    }
  }

  const generateRandomPasswordForForgot = () => {
    const prefixes = ['PetSpa', 'SpaAI', 'HappyPet', 'PawsCare', 'ProGroom', 'SpaVet']
    const symbols = ['@', '#', '$', '!']
    const randPrefix = prefixes[Math.floor(Math.random() * prefixes.length)]
    const randSym = symbols[Math.floor(Math.random() * symbols.length)]
    const randNum = Math.floor(1000 + Math.random() * 9000)
    const genPass = `${randPrefix}${randSym}${randNum}`
    forgotPassForm.setFieldsValue({
      new_password: genPass,
      confirm_password: genPass,
    })
    navigator.clipboard?.writeText(genPass)
    message.success(`Đã tạo mật khẩu an toàn: ${genPass} (Đã sao chép vào bộ nhớ tạm)`)
  }

  const handleResetPassword = async (values) => {
    setForgotBusy(true)
    setForgotError('')
    try {
      const otpCode = forgotOtpForm.getFieldValue('otp_code')
      const res = await api('/auth/forgot-password/reset', {
        method: 'POST',
        body: {
          phone: forgotPhone,
          otp_code: otpCode,
          new_password: values.new_password,
          confirm_password: values.confirm_password,
        },
      })
      setForgotStep(3)
      setForgotError('')
      loginForm.setFieldValue('username', forgotPhone)
      message.success(res.message || 'Đặt lại mật khẩu thành công!')
    } catch (err) {
      const formErrors = toFormErrors(err)
      if (formErrors.length) {
        forgotPassForm.setFields(formErrors)
        setForgotError('')
      } else {
        setForgotError(err.message || 'Lỗi đặt lại mật khẩu.')
      }
    } finally {
      setForgotBusy(false)
    }
  }

  if (user) return <Navigate to="/app/tong-quan" replace />

  const run = (fn, form) => async (values) => {
    setBusy(true)
    setError('')
    try {
      await fn(values)
      nav('/app/tong-quan')
    } catch (e) {
      const allFields = toFormErrors(e)
      const nonFieldErrors = e.fields?.non_field_errors || e.fields?.detail || []
      const nonFieldMsg = Array.isArray(nonFieldErrors) ? nonFieldErrors.join(' ') : String(nonFieldErrors || '')

      const formFieldErrors = allFields.filter(
        (f) => f.name !== 'non_field_errors' && f.name !== 'detail'
      )

      if (form && formFieldErrors.length) {
        form.setFields(formFieldErrors)
      }

      // Xác định thông báo lỗi chính để hiển thị rõ ràng trên Banner Alert
      const mainError = nonFieldMsg || e.message || (formFieldErrors[0]?.errors?.[0]) || 'Đăng nhập không thành công.'
      setError(mainError)
    } finally {
      setBusy(false)
    }
  }

  const handleRegister = async (values) => {
    const { confirm_password, ...payload } = values
    const res = await register(payload)
    if (res?.linked_existing_client) {
      message.success('Đăng ký thành công! Hệ thống đã tự động liên kết hồ sơ và thú cưng của bạn tại spa.')
    } else {
      message.success('Đăng ký tài khoản thành công!')
    }
  }

  const handleFillDemo = (acc) => {
    setActiveTab('login')
    setError('')
    loginForm.setFieldsValue({
      username: acc.username,
      password: 'Demo@12345',
      remember: true,
    })
    setDemoModalOpen(false)
    message.info(`Đã điền thông tin tài khoản ${acc.role}`)
  }

  const loginTab = (
    <Form
      form={loginForm}
      layout="vertical"
      initialValues={{ remember: true }}
      onFinish={run((v) => login(v.username, v.password), loginForm)}
    >
      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ marginBottom: 16, borderRadius: 8, fontSize: 13 }}
        />
      )}
      <Form.Item
        name="username"
        label="Tên đăng nhập hoặc Số điện thoại"
        rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập hoặc số điện thoại' }]}
      >
        <Input
          prefix={<UserOutlined style={{ color: '#0f8b8d' }} />}
          autoFocus
          placeholder="Nhập tên đăng nhập hoặc số điện thoại"
        />
      </Form.Item>

      <Form.Item
        name="password"
        label="Mật khẩu"
        rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}
      >
        <Input.Password
          prefix={<LockOutlined style={{ color: '#0f8b8d' }} />}
          placeholder="Nhập mật khẩu truy cập"
        />
      </Form.Item>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Form.Item name="remember" valuePropName="checked" noStyle>
          <Checkbox>Ghi nhớ đăng nhập</Checkbox>
        </Form.Item>
        <a
          href="#forgot-password"
          onClick={(e) => {
            e.preventDefault()
            setForgotModalOpen(true)
            setForgotStep(0)
            setForgotError('')
            const currentU = loginForm.getFieldValue('username')
            if (currentU && /^[0-9+]{4,15}$/.test(currentU.replace(/[\s.-]/g, ''))) {
              forgotPhoneForm.setFieldsValue({ phone: currentU })
            }
          }}
          style={{ fontSize: 13, color: '#0f8b8d', fontWeight: 600, cursor: 'pointer' }}
        >
          Quên mật khẩu?
        </a>
      </div>

      <Button
        type="primary"
        htmlType="submit"
        block
        loading={busy}
        size="large"
        className="auth-submit-btn"
      >
        Đăng nhập vào hệ thống
      </Button>

      <div style={{ textAlign: 'center', marginTop: 14 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Chưa có tài khoản thành viên?{' '}
        </Text>
        <a
          onClick={() => setActiveTab('register')}
          style={{ fontSize: 13, color: '#0f8b8d', fontWeight: 600, cursor: 'pointer' }}
        >
          Đăng ký ngay
        </a>
      </div>
    </Form>
  )

  const registerTab = (
    <Form
      form={regForm}
      layout="vertical"
      onFinish={run(handleRegister, regForm)}
    >
      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ marginBottom: 16, borderRadius: 8, fontSize: 13 }}
        />
      )}
      <Form.Item
        name="full_name"
        label="Họ và tên chủ nuôi"
        rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }]}
      >
        <Input
          prefix={<UserOutlined style={{ color: '#0f8b8d' }} />}
          placeholder="Ví dụ: Nguyễn Văn An"
        />
      </Form.Item>

      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item
            name="username"
            label="Tên đăng nhập mong muốn"
            rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập' }]}
          >
            <Input
              prefix={<IdcardOutlined style={{ color: '#0f8b8d' }} />}
              placeholder="Tên tài khoản viết liền không dấu"
            />
          </Form.Item>
        </Col>

        <Col xs={24} sm={12}>
          <Form.Item
            name="phone"
            label="Số điện thoại liên hệ"
            rules={[
              { required: true, message: 'Vui lòng nhập số điện thoại' },
              { pattern: /^(0|\+84)[0-9]{9,10}$/, message: 'Số điện thoại không đúng định dạng (10 chữ số)' },
            ]}
          >
            <Input
              prefix={<PhoneOutlined style={{ color: '#0f8b8d' }} />}
              placeholder="Ví dụ: 0912345678"
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item
            name="password"
            label="Mật khẩu khởi tạo"
            rules={[
              { required: true, message: 'Vui lòng nhập mật khẩu' },
              { min: 8, message: 'Mật khẩu phải có tối thiểu 8 ký tự' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#0f8b8d' }} />}
              placeholder="Tối thiểu 8 ký tự an toàn"
            />
          </Form.Item>
        </Col>

        <Col xs={24} sm={12}>
          <Form.Item
            name="confirm_password"
            label="Xác nhận lại mật khẩu"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Vui lòng xác nhận mật khẩu' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('Mật khẩu không khớp!'))
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#0f8b8d' }} />}
              placeholder="Nhập lại chính xác mật khẩu"
            />
          </Form.Item>
        </Col>
      </Row>

      <Button
        type="primary"
        htmlType="submit"
        block
        loading={busy}
        size="large"
        className="auth-submit-btn"
      >
        Hoàn tất đăng ký thành viên
      </Button>

      <div style={{ textAlign: 'center', marginTop: 14 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Đã có tài khoản?{' '}
        </Text>
        <a
          onClick={() => setActiveTab('login')}
          style={{ fontSize: 13, color: '#0f8b8d', fontWeight: 600, cursor: 'pointer' }}
        >
          Đăng nhập ngay
        </a>
      </div>
    </Form>
  )

  return (
    <div className="auth-wrap">
      <div className="auth-container">
        {/* ===== CỘT TRÁI: GIỚI THIỆU THƯƠNG HIỆU & GIÁ TRỊ ===== */}
        <div className="auth-brand-side">
          <div className="auth-brand-header">
            <div style={{ marginBottom: 20 }}>
              <Logo size={46} theme="light" subtitle="Smart Veterinary Grooming" />
            </div>

            <h1 className="auth-brand-title">
              Trải Nghiệm Spa Thú Y Chuyên Nghiệp Tận Tâm
            </h1>

            <p className="auth-brand-desc">
              Tối ưu lịch hẹn, cá nhân hóa liệu trình tắm cắt tỉa và bảo vệ sức khỏe thú cưng bằng công nghệ AI trợ lý tiên tiến.
            </p>

            <div className="auth-features-list">
              <div className="auth-feature-item">
                <div className="auth-feature-icon">🧠</div>
                <div className="auth-feature-text">
                  <h4>AI Cảnh Báo An Toàn & Dị Ứng</h4>
                  <p>Tự động phát hiện chống chỉ định hóa chất theo bệnh lý lông da của thú.</p>
                </div>
              </div>

              <div className="auth-feature-item">
                <div className="auth-feature-icon">⚡</div>
                <div className="auth-feature-text">
                  <h4>Điều Phối Lịch & Bồn Bàn Tối Ưu</h4>
                  <p>Khớp chính xác kích cỡ thú cưng, tay nghề kỹ thuật viên và cơ sở vật chất.</p>
                </div>
              </div>

              <div className="auth-feature-item">
                <div className="auth-feature-icon">📋</div>
                <div className="auth-feature-text">
                  <h4>Đồng Bộ Hồ Sơ Đa Kênh Tức Thì</h4>
                  <p>Kết nối liền mạch dữ liệu khách tại quầy và ứng dụng đặt lịch trực tuyến.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="auth-brand-footer">
            <span>⭐ Đánh giá 4.9/5 từ hơn 1,000+ khách hàng</span>
            <span>Phiên bản 2.0</span>
          </div>
        </div>

        {/* ===== CỘT PHẢI: FORM ĐĂNG NHẬP / ĐĂNG KÝ ===== */}
        <div className="auth-form-side">
          <div className="auth-heading">
            <h2>{activeTab === 'login' ? 'Chào mừng bạn trở lại' : 'Tạo tài khoản thành viên'}</h2>
            <p>
              {activeTab === 'login'
                ? 'Vui lòng nhập thông tin để truy cập hệ thống quản trị và đặt lịch.'
                : 'Đăng ký tài khoản để theo dõi lịch spa và quản lý hồ sơ thú cưng.'}
            </p>
          </div>

          <Tabs
            activeKey={activeTab}
            onChange={(key) => {
              setActiveTab(key)
              setError('')
            }}
            className="auth-custom-tabs"
            items={[
              { key: 'login', label: 'Đăng nhập', children: loginTab },
              { key: 'register', label: 'Đăng ký tài khoản', children: registerTab },
            ]}
          />

          <div className="auth-footer-terms">
            Bằng việc tiếp tục, bạn đồng ý với Điều khoản dịch vụ và Chính sách bảo mật của Pet Spa AI.
          </div>

          {/* Nút tiện ích kiểm thử kín đáo & thanh lịch */}
          <div className="auth-test-helper">
            <Text type="secondary" style={{ fontSize: 12 }}>
              Dành cho người thẩm định / kiểm thử:
            </Text>
            <Button
              type="dashed"
              size="small"
              icon={<ThunderboltOutlined style={{ color: '#0f8b8d' }} />}
              onClick={() => setDemoModalOpen(true)}
              style={{ fontSize: 12, borderRadius: 8, borderColor: '#cbd5e1' }}
            >
              Chọn nhanh tài khoản mẫu
            </Button>
          </div>
        </div>
      </div>

      {/* ===== MODAL CHỌN NHANH TÀI KHOẢN MẪU (TEST ACCOUNTS MODAL) ===== */}
      <Modal
        centered
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ThunderboltOutlined style={{ color: '#0f8b8d', fontSize: 18 }} />
            <span>Tài Khoản Kiểm Thử Hệ Thống (Demo Accounts)</span>
          </div>
        }
        open={demoModalOpen}
        onCancel={() => setDemoModalOpen(false)}
        footer={null}
        width={560}
      >
        <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
          Bấm vào nút <strong>"Điền tài khoản"</strong> bên dưới để hệ thống tự động nạp thông tin đăng nhập cho vai trò bạn muốn kiểm tra.
        </Paragraph>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {DEMO_ACCOUNTS.map((acc, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                gap: 12,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 14 }}>{acc.role}</Text>
                  <Tag color={acc.badgeColor} style={{ margin: 0, fontSize: 11 }}>{acc.badge}</Tag>
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginBottom: 2 }}>
                  Tên hiển thị: <strong>{acc.name}</strong> · Đăng nhập: <code style={{ color: '#0f8b8d' }}>{acc.username}</code>
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{acc.desc}</div>
              </div>

              <Button
                type="primary"
                ghost
                size="small"
                onClick={() => handleFillDemo(acc)}
                style={{ borderRadius: 8, flexShrink: 0 }}
              >
                Điền vào form
              </Button>
            </div>
          ))}
        </div>
      </Modal>

      {/* ===== MODAL KHÔI PHỤC MẬT KHẨU TỰ ĐỘNG BẰNG OTP (FORGOT PASSWORD MODAL) ===== */}
      <Modal
        centered
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyOutlined style={{ color: '#0f8b8d', fontSize: 18 }} />
            <span>Khôi Phục Mật Khẩu Qua Mã OTP</span>
          </div>
        }
        open={forgotModalOpen}
        onCancel={() => {
          if (!forgotBusy) {
            setForgotModalOpen(false)
            setForgotStep(0)
          }
        }}
        footer={null}
        width={520}
        destroyOnClose
      >
        <div style={{ margin: '16px 0 24px' }}>
          <Steps
            size="small"
            current={forgotStep}
            items={[
              { title: 'Nhập SĐT' },
              { title: 'Xác thực OTP' },
              { title: 'Mật khẩu mới' },
            ]}
          />
        </div>

        {forgotError && (
          <Alert
            type="error"
            message={forgotError}
            showIcon
            style={{ marginBottom: 16, borderRadius: 8 }}
          />
        )}

        {/* BƯỚC 0: NHẬP SỐ ĐIỆN THOẠI */}
        {forgotStep === 0 && (
          <Form
            form={forgotPhoneForm}
            layout="vertical"
            onFinish={handleRequestOtp}
          >
            <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
              Vui lòng nhập số điện thoại bạn đã sử dụng để đăng ký tài khoản hoặc gửi thú cưng tại quầy. Hệ thống sẽ cấp mã OTP để bạn tự thiết lập lại mật khẩu.
            </Paragraph>

            <Form.Item
              name="phone"
              label="Số điện thoại đã đăng ký"
              rules={[
                { required: true, message: 'Vui lòng nhập số điện thoại' },
                { pattern: /^(0|\+84)[0-9]{9,10}$/, message: 'Số điện thoại không đúng định dạng (10 chữ số)' },
              ]}
            >
              <Input
                prefix={<PhoneOutlined style={{ color: '#0f8b8d' }} />}
                placeholder="Ví dụ: 0912345678"
                autoFocus
                size="large"
              />
            </Form.Item>

            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={forgotBusy}
              icon={<SendOutlined />}
              style={{
                borderRadius: 8,
                background: 'linear-gradient(135deg, #0f8b8d, #14b8a6)',
                border: 'none',
                fontWeight: 600,
                marginTop: 8,
              }}
            >
              Gửi mã xác thực OTP
            </Button>
          </Form>
        )}

        {/* BƯỚC 1: NHẬP MÃ XÁC THỰC OTP */}
        {forgotStep === 1 && (
          <Form
            form={forgotOtpForm}
            layout="vertical"
            onFinish={handleVerifyOtp}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Đã gửi mã xác thực 6 số đến: <strong style={{ color: '#0f8b8d' }}>{forgotPhone}</strong>
              </Text>
              <Button
                type="link"
                size="small"
                onClick={() => setForgotStep(0)}
                style={{ padding: 0, fontSize: 12 }}
              >
                Đổi số khác
              </Button>
            </div>

            {/* Banner hỗ trợ người kiểm thử / thẩm định */}
            {devOtp && (
              <Alert
                type="info"
                showIcon
                message={
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>🧪 Mã OTP thử nghiệm: <strong>{devOtp}</strong></span>
                    <Button
                      size="small"
                      type="primary"
                      ghost
                      onClick={() => forgotOtpForm.setFieldsValue({ otp_code: devOtp })}
                      style={{ fontSize: 11, height: 24, borderRadius: 6 }}
                    >
                      Bấm để điền nhanh
                    </Button>
                  </div>
                }
                style={{ marginBottom: 16, borderRadius: 8, background: '#f0fdfa', borderColor: '#ccfbf1' }}
              />
            )}

            <Form.Item
              name="otp_code"
              label="Mã xác thực OTP (6 chữ số)"
              rules={[
                { required: true, message: 'Vui lòng nhập mã OTP 6 số' },
                { pattern: /^[0-9]{6}$/, message: 'Mã OTP phải gồm đúng 6 chữ số' },
              ]}
            >
              <Input
                placeholder="------"
                maxLength={6}
                autoFocus
                size="large"
                style={{
                  textAlign: 'center',
                  fontSize: 24,
                  letterSpacing: 8,
                  fontWeight: 700,
                  fontFamily: 'monospace',
                }}
              />
            </Form.Item>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Mã OTP có hiệu lực trong 5 phút
              </Text>
              {countdown > 0 ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Gửi lại mã sau <strong>{countdown}s</strong>
                </Text>
              ) : (
                <Button
                  type="link"
                  size="small"
                  onClick={handleResendOtp}
                  loading={forgotBusy}
                  style={{ padding: 0, fontSize: 12, color: '#0f8b8d', fontWeight: 600 }}
                >
                  Gửi lại mã OTP
                </Button>
              )}
            </div>

            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={forgotBusy}
              icon={<SafetyCertificateOutlined />}
              style={{
                borderRadius: 8,
                background: 'linear-gradient(135deg, #0f8b8d, #14b8a6)',
                border: 'none',
                fontWeight: 600,
              }}
            >
              Xác nhận mã OTP
            </Button>
          </Form>
        )}

        {/* BƯỚC 2: THIẾT LẬP MẬT KHẨU MỚI */}
        {forgotStep === 2 && (
          <Form
            form={forgotPassForm}
            layout="vertical"
            onFinish={handleResetPassword}
          >
            <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
              Mã xác thực chính xác! Vui lòng nhập mật khẩu mới cho tài khoản liên kết với số điện thoại <strong>{forgotPhone}</strong>.
            </Paragraph>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>
                <span style={{ color: '#ff4d4f' }}>* </span>Mật khẩu mới
              </span>
              <Button
                type="dashed"
                size="small"
                icon={<ThunderboltOutlined style={{ color: '#0f8b8d' }} />}
                onClick={generateRandomPasswordForForgot}
                style={{ fontSize: 12, borderRadius: 6, borderColor: '#cbd5e1' }}
              >
                Tạo mật khẩu nhanh
              </Button>
            </div>

            <Form.Item
              name="new_password"
              rules={[
                { required: true, message: 'Vui lòng nhập mật khẩu mới' },
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
              extra={<span style={{ fontSize: 12, color: '#64748b' }}>Gợi ý: Mật khẩu tối thiểu 8 ký tự, có thể bấm "Tạo mật khẩu nhanh" để tự sinh mật khẩu an toàn.</span>}
              style={{ marginBottom: 14 }}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#0f8b8d' }} />}
                placeholder="Ví dụ: Matkhau@123"
                autoFocus
                size="large"
              />
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
              <Input.Password
                prefix={<LockOutlined style={{ color: '#0f8b8d' }} />}
                placeholder="Nhập lại chính xác mật khẩu mới"
                size="large"
              />
            </Form.Item>

            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={forgotBusy}
              icon={<CheckCircleOutlined />}
              style={{
                borderRadius: 8,
                background: 'linear-gradient(135deg, #0f8b8d, #14b8a6)',
                border: 'none',
                fontWeight: 600,
                marginTop: 8,
              }}
            >
              Hoàn tất đặt lại mật khẩu
            </Button>
          </Form>
        )}

        {/* BƯỚC 3: THÀNH CÔNG */}
        {forgotStep === 3 && (
          <Result
            status="success"
            title="Đặt lại mật khẩu thành công!"
            subTitle={`Mật khẩu mới cho tài khoản (${forgotPhone}) đã được cập nhật. Bạn có thể đăng nhập ngay bây giờ.`}
            extra={[
              <Button
                type="primary"
                key="login-now"
                size="large"
                onClick={() => {
                  setForgotModalOpen(false)
                  setForgotStep(0)
                  setActiveTab('login')
                }}
                style={{
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #0f8b8d, #14b8a6)',
                  border: 'none',
                  fontWeight: 600,
                  minWidth: 160,
                }}
              >
                Đăng nhập ngay
              </Button>,
            ]}
          />
        )}
      </Modal>
    </div>
  )
}

