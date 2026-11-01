import { useEffect, useState } from 'react'
import {
  Alert, Badge, Button, Card, Col, Divider, Empty, Modal,
  Progress, Rate, Row, Space, Spin, Tag, Typography, message,
} from 'antd'
import {
  AlertOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ExperimentOutlined, FireOutlined, MedicineBoxOutlined,
  RobotOutlined, SafetyCertificateOutlined, StarOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { api, money } from '../api.js'
import PetAvatar from './PetAvatar.jsx'

const { Title, Text, Paragraph } = Typography

export default function AiPackageModal({ open, onClose, pet, onSelectPackage }) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open && pet) {
      loadSuggestions()
    } else {
      setData(null)
    }
  }, [open, pet])

  const loadSuggestions = async () => {
    setLoading(true)
    try {
      const res = await api('/ai/suggest-packages', {
        method: 'POST',
        body: { pet_id: pet.id },
      })
      const rawList = Array.isArray(res) ? res : res.suggestions || []
      const suggestions = rawList.map((s) => {
        let reasonsList = []
        if (Array.isArray(s.evidence) && s.evidence.length > 0) {
          reasonsList = s.evidence
            .map((e) => (typeof e === 'object' ? e.fact || e.reason || e.text : String(e)))
            .filter(Boolean)
        }
        if (reasonsList.length === 0 && Array.isArray(s.reasons) && s.reasons.length > 0) {
          reasonsList = s.reasons.filter(Boolean)
        }
        if (reasonsList.length === 0 && s.reason_text) {
          reasonsList = [s.reason_text]
        }
        if (reasonsList.length === 0) {
          const petName = pet?.name || 'bé'
          const breedStr = pet?.breed ? `, giống ${pet.breed}` : ''
          const sizeStr = pet?.size_class ? `, size ${pet.size_class}` : ''
          reasonsList = [
            `Phù hợp với thể trạng của bé ${petName} (${pet?.species === 'cat' ? 'mèo' : 'chó'}${breedStr}${sizeStr}) và đã qua kiểm tra an toàn y khoa.`
          ]
        }

        return {
          id: s.id,
          score: Math.round(Number(s.score || 0)),
          confidence: Number(s.confidence || 0.8),
          reason_text: s.reason_text || reasonsList.join('. '),
          package: s.package_info || (typeof s.package === 'object' ? s.package : { id: s.package, name: s.package_name }),
          reasons: reasonsList,
          contraindications: s.warnings || [],
        }
      })

      setData({
        pet: pet,
        suggestions: suggestions,
        blocked_packages: res.blocked_packages || [],
      })
    } catch (e) {
      message.error(e.message || 'Không thể lấy gợi ý AI cho thú cưng này')
    } finally {
      setLoading(false)
    }
  }

  const getPkgPrice = (pkg) => {
    if (!pkg) return 0
    if (pkg.prices && Array.isArray(pkg.prices)) {
      const match = pkg.prices.find((p) => p.size_class === pet?.size_class)
      if (match) return match.price
    }
    return pkg.price || pkg.base_price || 0
  }

  const handleChoose = async (pkg, suggestion) => {
    if (suggestion?.id) {
      try {
        setSubmitting(true)
        await api(`/ai/suggestions/${suggestion.id}/decide`, {
          method: 'POST',
          body: {
            action: 'accept',
            feedback_note: 'Người dùng chọn theo đề xuất AI',
          },
        })
      } catch {
        // bỏ qua nếu lỗi ghi log
      } finally {
        setSubmitting(false)
      }
    }

    message.success(`Đã chọn "${pkg.name}" cho bé ${pet.name}!`)
    if (onSelectPackage) {
      onSelectPackage(pkg, pet)
    }
    onClose()
  }

  const handleDismiss = async () => {
    const firstSug = data?.suggestions?.[0]
    if (firstSug?.id) {
      try {
        await api(`/ai/suggestions/${firstSug.id}/decide`, {
          method: 'POST',
          body: {
            action: 'reject',
            feedback_note: 'Người dùng tự chọn gói khác hoặc bỏ qua gợi ý',
          },
        })
      } catch {
        // ignore
      }
    }
    onClose()
  }

  return (
    <Modal
      centered
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={handleDismiss}>
          Đóng / Bỏ qua
        </Button>,
      ]}
      width={780}
      title={
        <Space align="center">
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #0f8b8d 0%, #20b2aa 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 20,
            }}
          >
            <RobotOutlined />
          </div>
          <div>
            <Title level={4} style={{ margin: 0, color: '#0b3d3f' }}>
              Trợ lý AI Đề Xuất Gói Chăm Sóc Phù Hợp
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Phân tích tự động dựa trên loài, loại lông, dị ứng, kích thước và lịch sử
            </Text>
          </div>
        </Space>
      }
      destroyOnHidden
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Spin size="large" tip="AI đang phân tích hồ sơ sức khỏe và ma trận chống chỉ định..." />
        </div>
      ) : data ? (
        <div style={{ marginTop: 12 }}>
          {/* Thông tin hồ sơ thú cưng */}
          <Card
            size="small"
            style={{
              background: '#f0fdfa',
              borderColor: '#99f6e4',
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <Row gutter={[16, 8]} align="middle">
              <Col span={24}>
                <Space align="center" size={12} style={{ flexWrap: 'wrap' }}>
                  <PetAvatar species={data.pet?.species} size={36} />
                  <div>
                    <Space wrap align="center">
                      <Text strong style={{ fontSize: 16, color: '#0f766e' }}>
                        {data.pet?.name}
                      </Text>
                      <Tag color="cyan">
                        {data.pet?.species === 'dog' ? 'Chó' : 'Mèo'} · {data.pet?.breed || 'Chưa rõ giống'}
                      </Tag>
                      <Tag color="blue">
                        {data.pet?.weight_kg} kg (Size {data.pet?.size_class || '—'})
                      </Tag>
                      {data.pet?.coat_type && (
                        <Tag color="geekblue">Lông: {data.pet?.coat_type}</Tag>
                      )}
                    </Space>
                    {data.pet?.allergy_note && (
                      <div style={{ marginTop: 4 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          ⚠️ Dị ứng ghi nhận:{' '}
                        </Text>
                        <Text type="danger" strong style={{ fontSize: 12 }}>
                          {data.pet?.allergy_note}
                        </Text>
                      </div>
                    )}
                  </div>
                </Space>
              </Col>
            </Row>
          </Card>

          {/* Cảnh báo gói bị chặn do chống chỉ định (BLOCK) */}
          {data.blocked_packages && data.blocked_packages.length > 0 && (
            <Alert
              type="error"
              showIcon
              icon={<SafetyCertificateOutlined />}
              style={{ marginBottom: 16, borderRadius: 8 }}
              message={
                <Text strong style={{ color: '#991b1b' }}>
                  Phát hiện chống chỉ định hóa chất / an toàn ({data.blocked_packages.length} gói bị loại bỏ)
                </Text>
              }
              description={
                <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                  {data.blocked_packages.map((bp, i) => (
                    <li key={i} style={{ color: '#b91c1c', fontSize: 13 }}>
                      <strong>{bp.package_name}:</strong> {bp.reason}
                    </li>
                  ))}
                </ul>
              }
            />
          )}

          {/* Danh sách gói đề xuất */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Title level={5} style={{ margin: 0, color: '#1e293b' }}>
                ⭐ Gói dịch vụ đề xuất tốt nhất:
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Đã tính điểm & kiểm tra ma trận dị ứng
              </Text>
            </div>

            {data.suggestions?.length === 0 ? (
              <Empty description="Không có gói dịch vụ nào phù hợp với điều kiện thú cưng này" />
            ) : (
              <Space orientation="vertical" style={{ width: '100%' }} size="middle">
                {data.suggestions?.map((item, idx) => {
                  const isTop = idx === 0
                  return (
                    <Card
                      key={item.package?.id || idx}
                      size="small"
                      style={{
                        borderRadius: 10,
                        border: isTop ? '2px solid #0f8b8d' : '1px solid #e2e8f0',
                        boxShadow: isTop ? '0 4px 12px rgba(15, 139, 141, 0.12)' : 'none',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      {isTop && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            background: '#0f8b8d',
                            color: '#fff',
                            padding: '3px 14px',
                            fontSize: 11,
                            fontWeight: 700,
                            borderBottomLeftRadius: 8,
                            letterSpacing: 0.5,
                            zIndex: 2,
                          }}
                        >
                          KHUYÊN DÙNG NHẤT
                        </div>
                      )}

                      <Row gutter={[16, 12]} align="middle">
                        <Col span={24} md={16}>
                          <Space align="center" style={{ marginBottom: 4 }}>
                            <Text strong style={{ fontSize: 16, color: '#0b3d3f' }}>
                              {item.package?.name}
                            </Text>
                            <Tag color={isTop ? 'green' : 'blue'}>
                              Điểm phù hợp: {item.score}
                            </Tag>
                            <Tag color="cyan">
                              Tin cậy: {Math.round((item.confidence || 0.8) * 100)}%
                            </Tag>
                          </Space>

                          <div style={{ color: '#475569', fontSize: 13, marginBottom: 8 }}>
                            {item.package?.description}
                          </div>

                          {/* Danh sách lý do AI gợi ý */}
                          <div
                            style={{
                              background: '#f8fafc',
                              padding: '8px 12px',
                              borderRadius: 6,
                              fontSize: 12,
                              color: '#334155',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <Text strong style={{ color: '#0f8b8d', display: 'block', marginBottom: 2 }}>
                              💡 Lý do đề xuất:
                            </Text>
                            {item.reasons && item.reasons.length > 0 ? (
                              item.reasons.length === 1 ? (
                                <div style={{ color: '#334155', lineHeight: 1.5 }}>
                                  {item.reasons[0]}
                                </div>
                              ) : (
                                <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: '#334155', lineHeight: 1.5 }}>
                                  {item.reasons.map((r, ri) => (
                                    <li key={ri}>{r}</li>
                                  ))}
                                </ul>
                              )
                            ) : (
                              <div style={{ color: '#334155' }}>
                                {item.reason_text || `Phù hợp với thể trạng của bé ${data.pet?.name || ''}.`}
                              </div>
                            )}
                          </div>

                          {/* Cảnh báo WARN nếu có */}
                          {item.contraindications?.length > 0 && (
                            <div style={{ marginTop: 6 }}>
                              {item.contraindications.map((c, ci) => (
                                <Tag icon={<AlertOutlined />} color="warning" key={ci}>
                                  {typeof c === 'object' ? c.reason : c}
                                </Tag>
                              ))}
                            </div>
                          )}
                        </Col>

                        <Col span={24} md={8} style={{ textAlign: 'right', paddingTop: isTop ? 26 : 0 }}>
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                              Thời lượng: ~{item.package?.duration_minutes || 60} phút
                            </div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#d97706' }}>
                              {money(getPkgPrice(item.package))}
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                              (Áp dụng theo size {data.pet?.size_class})
                            </div>
                          </div>

                          <Button
                            type="primary"
                            icon={<CheckCircleOutlined />}
                            loading={submitting}
                            style={{
                              background: isTop ? '#0f8b8d' : undefined,
                              borderColor: isTop ? '#0f8b8d' : undefined,
                              fontWeight: 600,
                            }}
                            onClick={() => handleChoose(item.package, item)}
                          >
                            Chọn gói này
                          </Button>
                        </Col>
                      </Row>
                    </Card>
                  )
                })}
              </Space>
            )}
          </div>

          {/* Banner lưu ý an toàn */}
          <Alert
            type="info"
            showIcon
            style={{ borderRadius: 8, fontSize: 12, marginTop: 12 }}
            message="Cam kết Trách nhiệm & An toàn y khoa"
            description="Đề xuất của AI hoàn toàn mang tính chất tham khảo dựa trên bộ luật chăm sóc SOP và tiền sử dị ứng đã nhập. Quý khách và nhân viên spa vui lòng kiểm tra thực tế thể trạng của bé trước khi bắt đầu dịch vụ."
          />
        </div>
      ) : null}
    </Modal>
  )
}
