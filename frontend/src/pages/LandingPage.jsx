import { useEffect, useState } from 'react'
import {
  Button, Card, Col, Divider, Empty, Row, Space, Tag, Typography, Spin,
} from 'antd'
import {
  CalendarOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  EnvironmentOutlined,
  LoginOutlined,
  PhoneOutlined,
  RightOutlined,
  RobotOutlined,
  SafetyCertificateFilled,
  SmileOutlined,
  StarFilled,
  ThunderboltFilled,
  UserOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { api, money, unwrap } from '../api.js'
import { useAuth, ROLE_LABEL } from '../auth.jsx'
import AiChatDrawer from '../components/AiChatDrawer.jsx'
import Logo from '../components/Logo.jsx'

const { Title, Paragraph, Text } = Typography

const DAYS_VN = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật']

export default function LandingPage() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [spa, setSpa] = useState(null)
  const [packages, setPackages] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = 'Pet Spa AI - Dịch Vụ Spa Thú Cưng Đẳng Cấp & Đặt Lịch Thông Minh'
    Promise.all([
      api('/spa').catch(() => null),
      api('/packages').catch(() => []),
      api('/services').catch(() => []),
    ])
      .then(([s, p, sv]) => {
        setSpa(s)
        setPackages(unwrap(p))
        setServices(unwrap(sv))
      })
      .finally(() => setLoading(false))
  }, [])

  const handleActionClick = () => {
    if (user) {
      nav('/app/tong-quan')
    } else {
      nav('/dang-nhap')
    }
  }

  const openDays = (spa?.open_weekdays || []).map((d) => DAYS_VN[d]).join(', ')

  return (
    <div className="landing-page">
      {/* ===== HEADER NAVIGATION ===== */}
      <header className="landing-header">
        <div className="landing-container header-inner">
          <div className="landing-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <Logo size={40} theme="light" subtitle="Smart Veterinary Grooming" />
          </div>

          <nav className="landing-nav-links">
            <a href="#about">Về chúng tôi</a>
            <a href="#ai-features">Công nghệ AI</a>
            <a href="#packages">Gói chăm sóc</a>
            <a href="#process">Quy trình</a>
            <a href="#contact">Liên hệ</a>
          </nav>

          <div className="landing-nav-actions">
            {user ? (
              <Space>
                <Tag color="cyan" style={{ padding: '4px 10px', fontSize: 13, borderRadius: 20 }}>
                  <UserOutlined /> {user.full_name || user.username} ({ROLE_LABEL[user.role]})
                </Tag>
                <Button type="primary" shape="round" icon={<RightOutlined />} onClick={() => nav('/app/tong-quan')}>
                  Vào hệ thống
                </Button>
              </Space>
            ) : (
              <Space>
                <Button type="text" icon={<LoginOutlined />} onClick={() => nav('/dang-nhap')}>
                  Đăng nhập
                </Button>
                <Button type="primary" shape="round" icon={<CalendarOutlined />} onClick={() => nav('/dang-nhap')}>
                  Đặt lịch ngay
                </Button>
              </Space>
            )}
          </div>
        </div>
      </header>

      {/* ===== HERO SECTION ===== */}
      <section className="hero-section" id="hero">
        <div className="landing-container">
          <Row gutter={[48, 36]} align="middle">
            <Col xs={24} lg={13}>
              <div className="hero-badge">
                <RobotOutlined style={{ color: '#0f8b8d' }} />
                <span>Tiên phong ứng dụng Trí Tuệ Nhân Tạo vào Spa Thú Cưng</span>
              </div>
              <Title level={1} className="hero-title">
                Chăm sóc bé cưng với chuẩn y khoa & <span className="gradient-text">trợ lý AI thông minh</span>
              </Title>
              <Paragraph className="hero-desc">
                {spa?.name || 'Pet Spa AI'} mang đến trải nghiệm làm đẹp, tắm dưỡng và phục hồi thư giãn cao cấp.
                Hệ thống AI tự động phân tích tình trạng lông da, kiểm tra chống chỉ định hóa chất độc hại và gợi ý
                liệu trình tối ưu riêng cho từng bé cún và mèo.
              </Paragraph>

              <Space size="middle" wrap className="hero-cta-group">
                <Button
                  type="primary"
                  size="large"
                  shape="round"
                  icon={<CalendarOutlined />}
                  onClick={handleActionClick}
                  style={{ height: 50, padding: '0 32px', fontSize: 16 }}
                >
                  {user ? 'Vào bảng điều khiển' : 'Đặt lịch hẹn ngay'}
                </Button>
                <Button
                  size="large"
                  shape="round"
                  href="#packages"
                  style={{ height: 50, padding: '0 28px', fontSize: 16 }}
                >
                  Xem bảng giá dịch vụ
                </Button>
              </Space>

              <div className="hero-stats">
                <div className="stat-item">
                  <div className="stat-num">100%</div>
                  <div className="stat-label">An toàn, không dị ứng</div>
                </div>
                <div className="stat-divider" />
                <div className="stat-item">
                  <div className="stat-num">5 Sao</div>
                  <div className="stat-label">Đội ngũ kỹ thuật viên</div>
                </div>
                <div className="stat-divider" />
                <div className="stat-item">
                  <div className="stat-num">AI</div>
                  <div className="stat-label">Đề xuất gói chuẩn xác</div>
                </div>
              </div>
            </Col>

            <Col xs={24} lg={11}>
              <div className="hero-image-wrap">
                <img
                  src="/images/hero_banner.jpg"
                  alt="Pet Spa AI Salon"
                  className="hero-main-img"
                  onError={(e) => {
                    e.target.style.display = 'none'
                  }}
                />
                <div className="hero-floating-card top-card">
                  <SafetyCertificateFilled style={{ color: '#10b981', fontSize: 24 }} />
                  <div>
                    <Text strong>AI Safety Guard</Text>
                    <div><Text type="secondary" style={{ fontSize: 12 }}>Tự động chặn dầu thơm dị ứng</Text></div>
                  </div>
                </div>

                <div className="hero-floating-card bottom-card">
                  <StarFilled style={{ color: '#f59e0b', fontSize: 24 }} />
                  <div>
                    <Text strong>Spa Thú Y Lông Mượt</Text>
                    <div><Text type="secondary" style={{ fontSize: 12 }}>Chuẩn tiện nghi bồn sục & bàn cắt</Text></div>
                  </div>
                </div>
              </div>
            </Col>
          </Row>
        </div>
      </section>

      {/* ===== AI CORE FEATURES ===== */}
      <section className="section-wrap ai-section" id="ai-features">
        <div className="landing-container">
          <div className="section-head text-center">
            <Tag color="cyan" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 20 }}>
              Sức mạnh công nghệ
            </Tag>
            <Title level={2} style={{ marginTop: 12 }}>
              Trợ lý AI đồng hành xuyên suốt hành trình chăm sóc
            </Title>
            <Paragraph type="secondary" style={{ maxWidth: 640, margin: '0 auto', fontSize: 16 }}>
              Không còn nỗi lo chọn nhầm dịch vụ hoặc hóa chất không phù hợp với thể trạng bé. AI hỗ trợ thấu đáo từ bước
              tư vấn đến khi hoàn tất dịch vụ.
            </Paragraph>
          </div>

          <Row gutter={[36, 36]} align="middle" style={{ marginTop: 40 }}>
            <Col xs={24} lg={11}>
              <div className="ai-illustration-box">
                <img
                  src="/images/ai_feature.jpg"
                  alt="AI Pet Care Assistant"
                  className="ai-img"
                  onError={(e) => {
                    e.target.style.display = 'none'
                  }}
                />
                <div className="ai-glow-badge">
                  <RobotOutlined style={{ fontSize: 20, color: '#0f8b8d' }} />
                  <span>Pet AI Engine v1.0</span>
                </div>
              </div>
            </Col>

            <Col xs={24} lg={13}>
              <div className="ai-features-list">
                <div className="ai-feature-card">
                  <div className="feature-icon" style={{ background: '#e6fffa', color: '#0f8b8d' }}>
                    <ThunderboltFilled />
                  </div>
                  <div className="feature-content">
                    <Title level={4}>Gợi ý gói chăm sóc cá nhân hóa</Title>
                    <Paragraph type="secondary">
                      Tự động phân tích giống thú (Poodle, Corgi, Mèo Anh...), loại lông (ngắn, xoăn, dài), độ tuổi và cân nặng
                      để đề xuất gói dịch vụ chính xác, rõ ràng từng tiêu chí điểm số.
                    </Paragraph>
                  </div>
                </div>

                <div className="ai-feature-card">
                  <div className="feature-icon" style={{ background: '#fee2e2', color: '#ef4444' }}>
                    <SafetyCertificateFilled />
                  </div>
                  <div className="feature-content">
                    <Title level={4}>Chốt chặn cảnh báo chống chỉ định</Title>
                    <Paragraph type="secondary">
                      Hệ thống tự động đối chiếu hồ sơ dị ứng và thẻ da nhạy cảm của thú với thành phần sữa tắm, tinh dầu.
                      Cảnh báo vàng khi cần lưu ý và chặn đỏ với hóa chất nguy hiểm cho bé.
                    </Paragraph>
                  </div>
                </div>

                <div className="ai-feature-card">
                  <div className="feature-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
                    <ClockCircleOutlined />
                  </div>
                  <div className="feature-content">
                    <Title level={4}>Dự báo chu kỳ & Nhắc tái spa thông minh</Title>
                    <Paragraph type="secondary">
                      Hệ thống tính toán tốc độ mọc lông và chu kỳ vệ sinh tai móng, tự động xếp lịch nhắc nhở chu đáo
                      để các bé luôn duy trì vẻ ngoài đáng yêu và sức khỏe tốt nhất.
                    </Paragraph>
                  </div>
                </div>
              </div>
            </Col>
          </Row>
        </div>
      </section>

      {/* ===== PACKAGES & SERVICES ===== */}
      <section className="section-wrap packages-section" id="packages">
        <div className="landing-container">
          <div className="section-head text-center">
            <Tag color="gold" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 20 }}>
              Dịch vụ & Gói nổi bật
            </Tag>
            <Title level={2} style={{ marginTop: 12 }}>
              Bảng giá niêm yết rõ ràng theo kích cỡ thú cưng
            </Title>
            <Paragraph type="secondary" style={{ maxWidth: 640, margin: '0 auto', fontSize: 16 }}>
              Giá dịch vụ được chuẩn hóa minh bạch theo cân nặng (XS, S, M, L, XL), cam kết không phụ thu ngoài thỏa thuận.
            </Paragraph>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}><Spin size="large" /></div>
          ) : packages.length === 0 ? (
            <Empty description="Chưa có gói dịch vụ nào." />
          ) : (
            <Row gutter={[24, 24]} style={{ marginTop: 40 }}>
              {packages.map((pkg, idx) => {
                const minPrice = pkg.prices ? Math.min(...Object.values(pkg.prices)) : 0
                const isHighlight = idx === 0 || pkg.code === 'vip'
                return (
                  <Col xs={24} md={12} lg={8} key={pkg.id}>
                    <Card
                      className={`package-card ${isHighlight ? 'highlight-package' : ''}`}
                      bordered={false}
                    >
                      {isHighlight && <div className="package-ribbon">Phổ biến nhất</div>}
                      <Title level={3} style={{ marginBottom: 4 }}>{pkg.name}</Title>
                      <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ minHeight: 44 }}>
                        {pkg.description || 'Gói chăm sóc toàn diện chuẩn spa cao cấp cho thú cưng.'}
                      </Paragraph>

                      <div className="price-tag-box">
                        <Text type="secondary" style={{ fontSize: 13 }}>Giá chỉ từ</Text>
                        <div className="price-val">{money(minPrice)}</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>Tùy size XS - XL</Text>
                      </div>

                      <Divider style={{ margin: '16px 0' }} />

                      <div className="package-items-list">
                        <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                          Dịch vụ bao gồm trong gói:
                        </Text>
                        {pkg.items && pkg.items.map((it) => (
                          <div key={it.id || it.service} className="pkg-item-row">
                            <CheckCircleFilled style={{ color: '#0f8b8d', marginRight: 8 }} />
                            <span>{it.service_name}</span>
                          </div>
                        ))}
                      </div>

                      <Button
                        type={isHighlight ? 'primary' : 'default'}
                        shape="round"
                        block
                        size="large"
                        style={{ marginTop: 24 }}
                        onClick={handleActionClick}
                      >
                        {user ? 'Chọn đặt gói này' : 'Đăng nhập để đặt lịch'}
                      </Button>
                    </Card>
                  </Col>
                )
              })}
            </Row>
          )}

          {/* Dịch vụ đơn lẻ */}
          {services.length > 0 && (
            <div style={{ marginTop: 48 }}>
              <Title level={4} style={{ textAlign: 'center', marginBottom: 20 }}>
                Các dịch vụ lẻ chuyên biệt
              </Title>
              <Row gutter={[16, 16]}>
                {services.slice(0, 6).map((svc) => (
                  <Col xs={24} sm={12} md={8} key={svc.id}>
                    <Card size="small" hoverable className="service-mini-card">
                      <Space align="start">
                        <div className="service-dot" />
                        <div>
                          <Text strong>{svc.name}</Text>
                          <div><Text type="secondary" style={{ fontSize: 12 }}>Thời lượng: ~{svc.duration_minutes} phút</Text></div>
                        </div>
                      </Space>
                    </Card>
                  </Col>
                ))}
              </Row>
            </div>
          )}
        </div>
      </section>

      {/* ===== 5-STEP PROCESS ===== */}
      <section className="section-wrap process-section" id="process">
        <div className="landing-container">
          <div className="section-head text-center">
            <Tag color="cyan" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 20 }}>
              Tiêu chuẩn chất lượng
            </Tag>
            <Title level={2} style={{ marginTop: 12 }}>
              Quy trình 5 bước chăm sóc chu đáo & an toàn
            </Title>
          </div>

          <Row gutter={[24, 24]} style={{ marginTop: 40 }}>
            {[
              { step: '01', title: 'Tiếp nhận & AI Scan', desc: 'Kiểm tra tiền sử da lông, kiểm tra dị ứng với hệ thống AI và đo cân nặng chuẩn xác.' },
              { step: '02', title: 'Tắm dưỡng dịu nhẹ', desc: 'Sử dụng sữa tắm chuyên dụng theo chất lông và thể trạng da, massage thư giãn cơ bắp.' },
              { step: '03', title: 'Vệ sinh tai & Móng', desc: 'Làm sạch sâu ống tai với dung dịch an toàn, cắt mài móng bo tròn góc tránh cào xước.' },
              { step: '04', title: 'Sấy khô & Tạo kiểu', desc: 'Sấy lông trong chuồng sấy êm ái hoặc sấy tay nhiệt độ ấm, cắt tỉa form dáng tỉ mỉ.' },
              { step: '05', title: 'Kiểm tra & Bàn giao', desc: 'Kỹ thuật viên đối chiếu cẩn thận, xịt dưỡng lông và gửi báo cáo kết quả kèm hóa đơn minh bạch.' },
            ].map((p) => (
              <Col xs={24} sm={12} lg={false} key={p.step} style={{ flex: '1 1 200px' }}>
                <div className="process-box">
                  <div className="step-num">{p.step}</div>
                  <Title level={4} style={{ marginTop: 12, marginBottom: 8 }}>{p.title}</Title>
                  <Paragraph type="secondary" style={{ fontSize: 13 }}>{p.desc}</Paragraph>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      {/* ===== ABOUT & CONTACT ===== */}
      <section className="section-wrap contact-section" id="contact">
        <div className="landing-container">
          <Row gutter={[36, 36]} align="middle">
            <Col xs={24} md={12}>
              <Tag color="purple" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 20 }}>
                Thông tin cơ sở
              </Tag>
              <Title level={2} style={{ marginTop: 12 }}>
                {spa?.name || 'Spa Thú Y Lông Mượt'}
              </Title>
              <Paragraph style={{ fontSize: 16 }}>
                Không gian thiết kế chuyên biệt cho thú cưng với hệ thống lọc không khí khử khuẩn, bồn tắm sục,
                bàn cắt tỉa thủy lực và khu vực sấy tĩnh âm, giúp các bé luôn cảm thấy thư thái như ở nhà.
              </Paragraph>

              <div className="contact-details">
                <div className="contact-row">
                  <EnvironmentOutlined className="contact-icon" />
                  <div>
                    <Text strong>Địa chỉ:</Text>
                    <div>{spa?.address || '25 Lê Văn Thịnh, P. Bình Trưng Tây, TP. Thủ Đức, TP.HCM'}</div>
                  </div>
                </div>

                <div className="contact-row">
                  <PhoneOutlined className="contact-icon" />
                  <div>
                    <Text strong>Hotline đặt hẹn:</Text>
                    <div>{spa?.phone || '0283000000'}</div>
                  </div>
                </div>

                <div className="contact-row">
                  <ClockCircleOutlined className="contact-icon" />
                  <div>
                    <Text strong>Khung giờ phục vụ:</Text>
                    <div>
                      {spa?.open_time?.slice(0, 5)} – {spa?.close_time?.slice(0, 5)} (Mở cửa: {openDays})
                    </div>
                  </div>
                </div>
              </div>
            </Col>

            <Col xs={24} md={12}>
              <Card className="cta-banner-card">
                <SmileOutlined style={{ fontSize: 40, color: '#0f8b8d', marginBottom: 12 }} />
                <Title level={3}>Trải nghiệm dịch vụ ngay hôm nay</Title>
                <Paragraph type="secondary">
                  Tạo tài khoản chỉ trong 30 giây để lưu giữ hồ sơ sức khỏe thú cưng, nhận tư vấn AI và theo dõi
                  tiến trình spa theo thời gian thực.
                </Paragraph>
                <Button
                  type="primary"
                  size="large"
                  shape="round"
                  block
                  icon={<CalendarOutlined />}
                  onClick={handleActionClick}
                  style={{ height: 48, marginTop: 12 }}
                >
                  {user ? 'Vào bảng điều khiển hệ thống' : 'Đăng ký & Đặt lịch hẹn'}
                </Button>
              </Card>
            </Col>
          </Row>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="landing-footer">
        <div className="landing-container">
          <Row gutter={[24, 24]} justify="space-between" align="middle">
            <Col xs={24} md={12}>
              <div className="landing-brand" style={{ marginBottom: 12 }}>
                <Logo size={36} theme="dark" />
              </div>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, display: 'block' }}>
                Đồ án môn Phân tích Thiết kế Hệ thống Thông tin Nâng cao — TS. Cao Thị Nhạn
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                Khoa Hệ thống Thông tin — Trường Đại học Công nghệ Thông tin, ĐHQG TP.HCM (UIT)
              </Text>
            </Col>

            <Col xs={24} md={12} style={{ textAlign: 'right' }}>
              <Space split={<Divider type="vertical" style={{ borderColor: 'rgba(255,255,255,0.2)' }} />}>
                <a href="#about" style={{ color: 'rgba(255,255,255,0.8)' }}>Giới thiệu</a>
                <a href="#packages" style={{ color: 'rgba(255,255,255,0.8)' }}>Bảng giá</a>
                <span onClick={() => nav('/dang-nhap')} style={{ color: '#14b8a6', cursor: 'pointer', fontWeight: 600 }}>
                  Đăng nhập
                </span>
              </Space>
              <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                © 2026 Pet Spa AI. Tất cả quyền được bảo lưu.
              </div>
            </Col>
          </Row>
        </div>
      </footer>
      <AiChatDrawer />
    </div>
  )
}
