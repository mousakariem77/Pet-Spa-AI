import { useState, useRef, useEffect } from 'react'
import {
  Alert, Avatar, Button, Card, Drawer, FloatButton, Input, List, Space,
  Spin, Tag, Typography, message,
} from 'antd'
import {
  BookOutlined, ClearOutlined, CustomerServiceOutlined, RobotOutlined,
  SendOutlined, UserOutlined, WarningOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'

const { Text, Paragraph } = Typography

export default function AiChatDrawer() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    {
      sender: 'ai',
      text: 'Xin chào! Em là Trợ lý AI của Pet Spa. Em có thể giải đáp các thắc mắc về quy trình spa chuẩn SOP, chính sách đặt lịch, bảng giá dịch vụ theo size hoặc lưu ý chăm sóc thú cưng nhạy cảm. Bạn muốn tìm hiểu gì ạ?',
      sources: [],
      time: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  // Drag state: Không lưu vào localStorage để mỗi lần reload trang luôn trở về vị trí mặc định
  const [position, setPosition] = useState(null) // null = vị trí mặc định theo CSS (bottom: 24px, right: 24px)
  const [isDragging, setIsDragging] = useState(false)
  const bubbleRef = useRef(null)
  const dragInfoRef = useRef({
    startX: 0,
    startY: 0,
    elemStartX: 0,
    elemStartY: 0,
    width: 0,
    height: 0,
    hasMoved: false,
  })

  // Đảm bảo bong bóng không bị lọt ra ngoài màn hình khi co giãn cửa sổ
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        if (!prev || !bubbleRef.current) return prev
        const rect = bubbleRef.current.getBoundingClientRect()
        const padding = 12
        const maxX = Math.max(padding, window.innerWidth - rect.width - padding)
        const maxY = Math.max(padding, window.innerHeight - rect.height - padding)
        const clampedX = Math.max(padding, Math.min(prev.x, maxX))
        const clampedY = Math.max(padding, Math.min(prev.y, maxY))
        if (clampedX === prev.x && clampedY === prev.y) return prev
        return { x: clampedX, y: clampedY }
      })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const startDrag = (clientX, clientY) => {
    if (!bubbleRef.current) return
    const rect = bubbleRef.current.getBoundingClientRect()

    dragInfoRef.current = {
      startX: clientX,
      startY: clientY,
      elemStartX: rect.left,
      elemStartY: rect.top,
      width: rect.width,
      height: rect.height,
      hasMoved: false,
    }

    const onMouseMove = (e) => {
      moveDrag(e.clientX, e.clientY)
    }

    const onTouchMove = (e) => {
      if (e.touches && e.touches.length > 0) {
        moveDrag(e.touches[0].clientX, e.touches[0].clientY)
      }
    }

    const endDrag = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', endDrag)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', endDrag)
      setIsDragging(false)
      // Giữ cờ hasMoved thêm 50ms để chặn sự kiện onClick mở modal nhầm
      setTimeout(() => {
        dragInfoRef.current.hasMoved = false
      }, 50)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', endDrag)
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', endDrag)
  }

  const moveDrag = (clientX, clientY) => {
    const { startX, startY, elemStartX, elemStartY, width, height, hasMoved } = dragInfoRef.current
    const dx = clientX - startX
    const dy = clientY - startY

    // Ngưỡng di chuyển tối thiểu để phân biệt click thường và kéo chuột
    if (!hasMoved && Math.hypot(dx, dy) < 5) {
      return
    }

    dragInfoRef.current.hasMoved = true
    setIsDragging(true)

    const padding = 12
    const bubbleW = width || 64
    const bubbleH = height || 64
    const maxX = Math.max(padding, window.innerWidth - bubbleW - padding)
    const maxY = Math.max(padding, window.innerHeight - bubbleH - padding)

    const rawX = elemStartX + dx
    const rawY = elemStartY + dy

    const clampedX = Math.max(padding, Math.min(rawX, maxX))
    const clampedY = Math.max(padding, Math.min(rawY, maxY))

    setPosition({ x: clampedX, y: clampedY })
  }

  const handleBubbleClick = (e) => {
    if (dragInfoRef.current.hasMoved) {
      e.stopPropagation()
      return
    }
    setOpen(true)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (open) scrollToBottom()
  }, [messages, open])

  const handleSend = async () => {
    const q = input.trim()
    if (!q || loading) return

    const userMsg = {
      sender: 'user',
      text: q,
      time: new Date(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await api('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ question: q }),
      })
      const aiMsg = {
        sender: 'ai',
        text: res.answer,
        sources: res.sources || [],
        warning: res.warning,
        time: new Date(),
      }
      setMessages((prev) => [...prev, aiMsg])
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: 'Xin lỗi bạn, kết nối trợ lý AI bị gián đoạn. Vui lòng thử lại sau ít phút.',
          time: new Date(),
          isError: true,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleQuickQuestion = (q) => {
    setInput(q)
  }

  const isLeft = position ? position.x < 160 : false
  const bubbleStyle = {
    ...(position
      ? {
          left: `${position.x}px`,
          top: `${position.y}px`,
          right: 'auto',
          bottom: 'auto',
        }
      : {}),
    flexDirection: isLeft ? 'row-reverse' : 'row',
    touchAction: 'none',
  }

  return (
    <>
      {/* Bong bóng Chat AI nổi bật với Avatar AI sắc nét - Có thể kéo di chuyển linh hoạt */}
      <div
        id="ai-chat-bubble"
        ref={bubbleRef}
        className={`ai-chat-bubble-wrap ${isDragging ? 'is-dragging' : ''}`}
        style={bubbleStyle}
        onClick={handleBubbleClick}
        onMouseDown={(e) => {
          if (e.button !== 0) return // chỉ nhận chuột trái
          startDrag(e.clientX, e.clientY)
        }}
        onTouchStart={(e) => {
          if (e.touches && e.touches.length > 0) {
            startDrag(e.touches[0].clientX, e.touches[0].clientY)
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Mở Trợ lý AI Pet Spa"
        title="Kéo để di chuyển vị trí bong bóng AI"
      >
        <span className="ai-chat-bubble-label">Hỏi Trợ lý AI</span>
        <div className="ai-chat-bubble-btn">
          <img
            src="/images/ai_avatar.jpg"
            alt="Trợ lý AI Pet Spa"
            className="ai-chat-bubble-avatar"
            draggable={false}
          />
          <span className="ai-chat-bubble-status" title="Sẵn sàng hỗ trợ" />
          <span className="ai-chat-bubble-badge">AI</span>
        </div>
      </div>

      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <Avatar
                src="/images/ai_avatar.jpg"
                size={44}
                style={{
                  border: '2px solid #0d9488',
                  boxShadow: '0 2px 10px rgba(13, 148, 136, 0.25)',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  background: '#10b981',
                  border: '2px solid #fff',
                }}
              />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Text strong style={{ fontSize: 16 }}>Trợ lý AI Pet Spa</Text>
                <Tag color="cyan" style={{ fontSize: 10, padding: '0 6px', borderRadius: 8, fontWeight: 700 }}>
                  24/7
                </Tag>
              </div>
              <div><Text type="secondary" style={{ fontSize: 11 }}>Trích xuất tri thức từ tài liệu SOP & Bảng giá</Text></div>
            </div>
          </div>
        }
        placement="right"
        width={480}
        onClose={() => setOpen(false)}
        open={open}
        extra={
          <Button
            type="text"
            size="small"
            icon={<ClearOutlined />}
            onClick={() => setMessages(messages.slice(0, 1))}
          >
            Làm sạch hội thoại
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Cảnh báo cố định theo đặc tả thiết kế */}
          <Alert
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            message="Lưu ý phạm vi hỗ trợ"
            description="Gợi ý của AI chỉ mang tính tham khảo dịch vụ thẩm mỹ và quy trình spa, không thay thế chẩn đoán bệnh lý y khoa thú y."
            style={{ marginBottom: 12, borderRadius: 10, fontSize: 12 }}
          />

          {/* Khung chat tin nhắn */}
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: 6, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {messages.map((m, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  flexDirection: m.sender === 'user' ? 'row-reverse' : 'row',
                }}
              >
                {/* Avatar bên cạnh từng tin nhắn */}
                {m.sender === 'user' ? (
                  <Avatar
                    style={{
                      background: 'linear-gradient(135deg, #0d9488, #0f8b8d)',
                      flexShrink: 0,
                      marginTop: 2,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                    }}
                    icon={<UserOutlined />}
                    size={32}
                  />
                ) : (
                  <Avatar
                    src="/images/ai_avatar.jpg"
                    size={32}
                    style={{
                      flexShrink: 0,
                      marginTop: 2,
                      border: '1.5px solid #14b8a6',
                      boxShadow: '0 2px 6px rgba(20, 184, 166, 0.25)',
                    }}
                  />
                )}

                <div
                  style={{
                    maxWidth: '80%',
                    padding: '12px 16px',
                    borderRadius: m.sender === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    background: m.sender === 'user' ? 'linear-gradient(135deg, #0f8b8d, #0d9488)' : '#f1f5f9',
                    color: m.sender === 'user' ? '#fff' : '#1f2937',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  }}
                >
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, fontSize: 13.5 }}>
                    {m.text}
                  </div>

                  {/* Nguồn trích dẫn tài liệu */}
                  {m.sources && m.sources.length > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px dashed #cbd5e1' }}>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4, color: m.sender === 'user' ? '#e2e8f0' : undefined }}>
                        <BookOutlined style={{ marginRight: 4 }} /> Nguồn tài liệu đối chiếu:
                      </Text>
                      {m.sources.map((s, i) => (
                        <Tag key={i} color="cyan" style={{ fontSize: 11, margin: '2px 4px 2px 0' }}>
                          {s.doc_title} ({s.heading})
                        </Tag>
                      ))}
                    </div>
                  )}

                  <div
                    style={{
                      textAlign: 'right',
                      marginTop: 4,
                      fontSize: 10,
                      color: m.sender === 'user' ? 'rgba(255,255,255,0.7)' : '#94a3b8',
                    }}
                  >
                    {dayjs(m.time).format('HH:mm')}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748b', fontSize: 12 }}>
                <Avatar
                  src="/images/ai_avatar.jpg"
                  size={26}
                  style={{ border: '1px solid #14b8a6' }}
                />
                <Spin size="small" /> Trợ lý AI đang tra cứu quy trình và chuẩn bị câu trả lời...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Câu hỏi gợi ý nhanh */}
          <div style={{ padding: '8px 0', borderTop: '1px solid #e2e8f0', marginTop: 10 }}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
              Gợi ý câu hỏi phổ biến:
            </Text>
            <Space wrap size={[4, 6]}>
              <Tag
                style={{ cursor: 'pointer', borderRadius: 12 }}
                onClick={() => handleQuickQuestion('Quy định an toàn bàn cắt tỉa và chuồng sấy?')}
              >
                An toàn bàn cắt?
              </Tag>
              <Tag
                style={{ cursor: 'pointer', borderRadius: 12 }}
                onClick={() => handleQuickQuestion('Thú cưng bị da nhạy cảm thì tắm loại nào?')}
              >
                Da nhạy cảm tắm gì?
              </Tag>
              <Tag
                style={{ cursor: 'pointer', borderRadius: 12 }}
                onClick={() => handleQuickQuestion('Chính sách hủy lịch hẹn như thế nào?')}
              >
                Chính sách hủy lịch?
              </Tag>
            </Space>
          </div>

          {/* Input nhập câu hỏi */}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Input.TextArea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Nhập câu hỏi cần hỗ trợ (Enter để gửi)..."
              autoSize={{ minRows: 1, maxRows: 3 }}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={loading}
              style={{ height: 'auto' }}
            />
          </div>
        </div>
      </Drawer>
    </>
  )
}
