import { useEffect, useState, useCallback } from 'react'
import {
  Alert, Button, Card, Col, Descriptions, Divider, Empty, Form, Input,
  InputNumber, Modal, Popconfirm, Row, Segmented, Select, Space, Spin,
  Switch, Table, Tabs, Tag, Typography, message,
} from 'antd'
import {
  AlertOutlined, BookOutlined, CheckCircleOutlined,
  ClockCircleOutlined, CloseCircleOutlined, DeleteOutlined, EditOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined, HistoryOutlined, InfoCircleOutlined,
  PlusOutlined, ReloadOutlined, RobotOutlined, SafetyCertificateOutlined,
  SendOutlined, ShopOutlined, TagOutlined, ToolOutlined, UserOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, unwrap } from '../api.js'
import RowPerPageSelect from '../components/RowPerPageSelect.jsx'

const { Title, Text, Paragraph } = Typography

// ==========================================
// ĐỊNH NGHĨA PHÂN LOẠI TRI THỨC CHUẨN
// ==========================================
export const DOC_TYPES = {
  guide: { label: 'Cẩm nang giống & Chăm sóc', color: 'cyan', icon: '📖' },
  sop: { label: 'Quy trình SOP an toàn', color: 'blue', icon: '🧼' },
  policy: { label: 'Chính sách da liễu & y tế', color: 'purple', icon: '🩺' },
  faq: { label: 'Hỏi đáp thường gặp (FAQ)', color: 'orange', icon: '💬' },
}

// ==========================================
// TAB 1: KHO TRI THỨC & CẨM NANG SPA (KNOWLEDGE BASE)
// ==========================================
function parseTextIntoSections(text, defaultTitle = '') {
  if (!text || !text.trim()) return [{ heading: '', text: '' }]
  const rawParagraphs = text.trim().split(/\n\n+/)
  const sections = []
  rawParagraphs.forEach((p) => {
    const subParts = p.split(/\n(?=(?:[0-9]+[.)]|Phần\s+[0-9]+|Mục\s+[0-9]+|##+\s+|Q[0-9]+:))/i)
    subParts.forEach((sp) => {
      const trimmed = sp.trim()
      if (!trimmed) return
      const firstLine = trimmed.split('\n')[0].trim()
      let heading = firstLine.slice(0, 75).replace(/^[-*#•\s\d.)]+/, '').trim()
      sections.push({
        heading: heading || `Mục ${sections.length + 1}`,
        text: trimmed,
      })
    })
  })
  return sections.length > 0 ? sections : [{ heading: 'Mục 1', text }]
}

function KnowledgeBaseTab() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingDoc, setEditingDoc] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [detailDoc, setDetailDoc] = useState(null)
  const [filterType, setFilterType] = useState('all')
  const [inputMode, setInputMode] = useState('sections')
  const [form] = Form.useForm()

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await api('/ai/knowledge-docs')
      setData(unwrap(res))
    } catch (e) {
      message.error(e.message || 'Không thể tải kho tri thức')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleOpenAdd = () => {
    setEditingDoc(null)
    setInputMode('sections')
    form.resetFields()
    form.setFieldsValue({
      doc_type: 'guide',
      sections: [{ heading: '', text: '' }],
      rawContent: '',
    })
    setModalOpen(true)
  }

  const handleOpenEdit = (doc) => {
    setEditingDoc(doc)
    setInputMode('sections')
    form.resetFields()
    const chunks = doc.chunks || []
    const docTitle = doc.title || ''
    const initialSections = chunks.length > 0
      ? chunks.map((c) => {
          let h = c.heading || ''
          if (docTitle && h.startsWith(docTitle)) {
            h = h.slice(docTitle.length).replace(/^[\s\-–—:]+/, '')
          }
          return { heading: h, text: c.text }
        })
      : parseTextIntoSections(doc.text_content, docTitle)

    form.setFieldsValue({
      title: doc.title,
      doc_type: doc.doc_type,
      sections: initialSections,
      rawContent: doc.text_content || chunks.map((c) => c.text).join('\n\n'),
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      let payload = {
        title: values.title,
        doc_type: values.doc_type,
      }

      if (inputMode === 'sections') {
        const validSections = (values.sections || []).filter((s) => s && s.text && s.text.trim())
        if (validSections.length === 0) {
          message.warning('Vui lòng nhập ít nhất 1 đoạn trích có nội dung')
          setSubmitting(false)
          return
        }
        payload.sections = validSections
        payload.content = validSections.map((s) => s.text.trim()).join('\n\n')
      } else {
        const raw = (values.rawContent || '').trim()
        if (!raw) {
          message.warning('Vui lòng nhập nội dung văn bản')
          setSubmitting(false)
          return
        }
        payload.content = raw
      }

      if (editingDoc) {
        await api(`/ai/knowledge-docs/${editingDoc.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        message.success('Đã cập nhật tài liệu tri thức thành công')
      } else {
        await api('/ai/knowledge-docs', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        message.success('Đã nạp tài liệu mới và phân chia các đoạn trích thành công')
      }
      setModalOpen(false)
      form.resetFields()
      loadData()
    } catch (e) {
      message.error(e.message || 'Lỗi khi lưu tài liệu')
    } finally {
      setSubmitting(false)
    }
  }

  const applyTemplate = (title, doc_type, rawText) => {
    const parsedSections = parseTextIntoSections(rawText, title)
    form.setFieldsValue({
      title,
      doc_type,
      rawContent: rawText,
      sections: parsedSections,
    })
    setInputMode('sections')
    message.success(`Đã nạp mẫu và chia thành ${parsedSections.length} đoạn trích (sections)`)
  }

  const handleDelete = async (id) => {
    try {
      await api(`/ai/knowledge-docs/${id}`, { method: 'DELETE' })
      message.success('Đã xóa tài liệu khỏi kho tri thức')
      loadData()
    } catch (e) {
      message.error(e.message || 'Không thể xóa tài liệu')
    }
  }

  const confirmDeleteDoc = (record, e) => {
    e?.stopPropagation?.()
    Modal.confirm({
      title: `Xóa tài liệu "${record.title}"?`,
      icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
      content: 'Tài liệu này cùng toàn bộ các đoạn trích (chunks) sẽ bị xóa vĩnh viễn khỏi kho tri thức. AI sẽ không còn sử dụng thông tin này để tư vấn cho khách hàng nữa.',
      okText: 'Xóa tài liệu',
      okType: 'danger',
      cancelText: 'Hủy',
      centered: true,
      onOk: () => handleDelete(record.id),
    })
  }

  // Thống kê nhanh theo phân loại
  const stats = {
    totalDocs: data.length,
    totalChunks: data.reduce((acc, d) => acc + (d.chunks?.length || 0), 0),
    guideCount: data.filter((d) => d.doc_type === 'guide').length,
    sopCount: data.filter((d) => d.doc_type === 'sop').length,
    policyCount: data.filter((d) => d.doc_type === 'policy').length,
    faqCount: data.filter((d) => d.doc_type === 'faq').length,
  }

  const filteredData = filterType === 'all' ? data : data.filter((d) => d.doc_type === filterType)

  const columns = [
    {
      title: 'Tiêu đề tài liệu',
      dataIndex: 'title',
      render: (v) => <strong>{v}</strong>,
    },
    {
      title: 'Phân loại tri thức',
      dataIndex: 'doc_type',
      width: 220,
      render: (dt) => {
        const item = DOC_TYPES[dt] || { label: dt?.toUpperCase(), color: 'default', icon: '📄' }
        return (
          <Tag color={item.color} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6 }}>
            <span style={{ marginRight: 4 }}>{item.icon}</span> {item.label}
          </Tag>
        )
      },
    },
    {
      title: 'Số đoạn tri thức (Chunks)',
      key: 'chunks',
      width: 170,
      render: (_, r) => (
        <Tag color="geekblue" style={{ fontWeight: 600 }}>
          {r.chunks?.length || 0} đoạn trích
        </Tag>
      ),
    },
    {
      title: 'Cập nhật lần cuối',
      dataIndex: 'updated_at',
      width: 160,
      render: (d) => (d ? dayjs(d).format('DD/MM/YYYY HH:mm') : '—'),
    },
    {
      title: 'Thao tác',
      key: 'act',
      width: 160,
      render: (_, r) => (
        <Space onClick={(e) => e.stopPropagation()}>
          <Button
            size="small"
            icon={<FileTextOutlined />}
            onClick={(e) => { e.stopPropagation(); setDetailDoc(r); }}
          >
            Đoạn trích
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={(e) => { e.stopPropagation(); handleOpenEdit(r); }}
          />
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={(e) => confirmDeleteDoc(r, e)}
          />
        </Space>
      ),
    },
  ]

  return (
    <div>
      {/* 4 Thẻ thống kê tri thức */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8, background: '#f0fdfa', border: '1px solid #ccfbf1' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>📖 Cẩm nang chăm sóc giống</Text>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0f766e', marginTop: 4 }}>
              {stats.guideCount} <span style={{ fontSize: 13, fontWeight: 400 }}>tài liệu</span>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8, background: '#eff6ff', border: '1px solid #dbeafe' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>🧼 Quy trình SOP an toàn</Text>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#1d4ed8', marginTop: 4 }}>
              {stats.sopCount} <span style={{ fontSize: 13, fontWeight: 400 }}>tài liệu</span>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8, background: '#faf5ff', border: '1px solid #f3e8ff' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>🩺 Chính sách da liễu & y tế</Text>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#7e22ce', marginTop: 4 }}>
              {stats.policyCount} <span style={{ fontSize: 13, fontWeight: 400 }}>tài liệu</span>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8, background: '#fff7ed', border: '1px solid #ffedd5' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>💬 Hỏi đáp thường gặp (FAQ)</Text>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#c2410c', marginTop: 4 }}>
              {stats.faqCount} <span style={{ fontSize: 13, fontWeight: 400 }}>tài liệu</span>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Thanh công cụ và nút thêm */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Text strong style={{ fontSize: 16 }}>
            Kho Tài Liệu & Cẩm Nang Nghiệp Vụ Chuẩn
          </Text>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            AI tự động trích xuất các đoạn văn bản (chunks) từ đây để tư vấn chính xác và dẫn nguồn minh bạch cho khách hàng.
          </div>
        </div>
        <Space wrap>
          <Select
            value={filterType}
            onChange={setFilterType}
            style={{ width: 210 }}
            options={[
              { value: 'all', label: 'Tất cả phân loại tri thức' },
              { value: 'guide', label: '📖 Cẩm nang giống loài' },
              { value: 'sop', label: '🧼 Quy trình SOP' },
              { value: 'policy', label: '🩺 Chính sách & An toàn' },
              { value: 'faq', label: '💬 Hỏi đáp FAQ' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={loadData}>
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenAdd}
            style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
          >
            Nạp tài liệu mới
          </Button>
        </Space>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>💡 Bấm vào dòng tài liệu hoặc nút "Đoạn trích" để kiểm tra các phần chia nhỏ (chunks)</Text>
        <RowPerPageSelect value={pageSize} onChange={(ps) => { setPageSize(ps); setPage(1); }} />
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={filteredData}
        columns={columns}
        scroll={{ x: 'max-content' }}
        rowClassName={() => 'clickable-row'}
        onRow={(record) => ({
          onClick: () => setDetailDoc(record),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          position: ['bottomRight'],
          current: page,
          pageSize: pageSize,
          showSizeChanger: false,
          showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} tài liệu`,
          onChange: (p) => setPage(p),
        }}
      />

      {/* Modal nạp / sửa tài liệu */}
      <Modal
        centered
        className="ai-knowledge-modal"
        open={modalOpen}
        title={editingDoc ? 'Chỉnh Sửa Tài Liệu Tri Thức' : 'Nạp Tài Liệu Tri Thức Mới Cho AI'}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText={editingDoc ? 'Cập nhật tài liệu' : 'Nạp vào kho tri thức'}
        cancelText="Hủy"
        width={780}
        styles={{
          body: {
            height: 'min(480px, calc(100vh - 180px))',
            maxHeight: 'min(480px, calc(100vh - 180px))',
            overflowY: 'auto',
            overflowX: 'hidden',
            paddingRight: 8,
          },
        }}
      >
        {/* Thanh Mẫu Nhanh gọn gàng trên 1 dòng */}
        {!editingDoc && (
          <div style={{ marginBottom: 10, background: '#f8fafc', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>⚡ Mẫu nhanh:</span>
            <Tag
              color="blue"
              style={{ cursor: 'pointer', margin: 0, fontSize: 12, borderRadius: 4 }}
              onClick={() => {
                applyTemplate(
                  'Cẩm nang Chu kỳ tắm & chải lông theo từng giống chó mèo',
                  'guide',
                  `1. Chó lông xoăn hoặc lông dài (Poodle, Bichon, Maltese, Shih Tzu):
- Tắm và chải lông định kỳ: 2-3 tuần/lần.
- Cắt tỉa tạo kiểu: 4-6 tuần/lần để tránh lông bị bết dính, vón cục rối.

2. Chó lông 2 lớp dày (Corgi, Husky, Alaska, Golden, Phốc Sóc):
- Tắm định kỳ: 3-4 tuần/lần, kết hợp xả tơ dưỡng ẩm và sấy kỹ chân lông chuồng sấy để phòng ngừa ẩm da, viêm nấm.

3. Chó lông ngắn (Pug, Bull, Lạp Xưởng, Phú Quốc):
- Tắm định kỳ: 3-4 tuần/lần hoặc khi vận động ngoài trời bám bẩn.

4. Mèo lông dài (Mèo Ba Tư, Anh lông dài, Ragdoll):
- Tắm dưỡng: 4-6 tuần/lần, kết hợp chải lông và loại bỏ búi lông rụng đều đặn.

5. Mèo lông ngắn (Mèo ta, Anh lông ngắn):
- Tắm dưỡng: 6-8 tuần/lần hoặc khi cần khử mùi và làm sạch sâu.`
                )
              }}
            >
              🐶 Chu kỳ giống
            </Tag>
            <Tag
              color="purple"
              style={{ cursor: 'pointer', margin: 0, fontSize: 12, borderRadius: 4 }}
              onClick={() => {
                applyTemplate(
                  'Quy trình SOP an toàn bàn cắt tỉa & nhiệt độ chuồng sấy',
                  'sop',
                  `1. An toàn trên bàn cắt tỉa thủy lực:
- Kỹ thuật viên luôn luôn cài đai an toàn giữ cổ mềm trước khi thao tác kéo hoặc tông đơ.
- Tuyệt đối không rời mắt khỏi bàn cắt khi thú cưng đang ở trên bàn.

2. Quy định an toàn chuồng sấy tĩnh âm:
- Nhiệt độ buồng sấy luôn duy trì dưới 38 độ C để tránh sốc nhiệt cho thú cưng.
- Thời gian sấy mỗi đợt không quá 30 phút, luôn kiểm tra phản xạ hô hấp của bé.

3. Xử lý thú cưng có tính khí nhạy cảm hoặc hay cắn:
- Sử dụng rọ mõm xốp mềm an toàn, thao tác trấn an nhẹ nhàng và có nhân viên hỗ trợ giữ phụ.`
                )
              }}
            >
              ✂️ SOP bàn cắt & sấy
            </Tag>
            <Tag
              color="orange"
              style={{ cursor: 'pointer', margin: 0, fontSize: 12, borderRadius: 4 }}
              onClick={() => {
                applyTemplate(
                  'Chính sách tiếp nhận và chăm sóc da mẫn cảm, viêm da & dị ứng',
                  'policy',
                  `1. Thú cưng bị viêm da nhẹ hoặc dị ứng thời tiết:
- Hoàn toàn tắm được tại Pet Spa bằng liệu trình chuyên biệt "Tắm dưỡng không hương liệu".
- Dùng sữa tắm thảo dược dịu nhẹ độ pH trung tính, nước ấm 35-37 độ C và sấy khô chân lông.

2. Chống chỉ định hóa chất nồng:
- Bé có thẻ "Dị ứng hương liệu" hoặc đang kích ứng da tuyệt đối KHÔNG dùng các gói có tinh dầu thơm nồng để tránh làm nặng thêm tình trạng da.

3. Trường hợp tạm hoãn phục vụ:
- Thú cưng bị lở loét diện rộng, chảy mủ cấp tính hoặc có dấu hiệu bệnh truyền nhiễm nguy hiểm, spa sẽ hướng dẫn chủ nuôi đưa bé đến phòng khám thú y điều trị ổn định trước.`
                )
              }}
            >
              🌿 Da mẫn cảm & dị ứng
            </Tag>
            <Tag
              color="green"
              style={{ cursor: 'pointer', margin: 0, fontSize: 12, borderRadius: 4 }}
              onClick={() => {
                applyTemplate(
                  'Bộ câu hỏi thường gặp khi khách gửi bé tại Spa (FAQ)',
                  'faq',
                  `1. Quy định gửi lại đồ ăn và vật dụng cá nhân của bé:
- Chủ nuôi có thể gửi kèm thức ăn hạt, pate yêu thích của bé. Lễ tân ghi nhận và cho bé ăn đúng giờ miễn phí.

2. Chính sách đón trả thú cưng sau giờ đóng cửa:
- Khách đón muộn sau 19:00 vui lòng thông báo trước với lễ tân qua hotline để spa sắp xếp nhân sự trực bàn giao chu đáo.

3. Cam kết vệ sinh và an toàn khử trùng:
- Toàn bộ kéo tỉa, lưỡi tông đơ và bồn tắm đều được khử trùng bằng cồn y tế và đèn sấy tia cực tím UV sau mỗi lượt phục vụ.`
                )
              }}
            >
              💬 Hỏi đáp FAQ
            </Tag>
          </div>
        )}

        {/* Thông báo đồng bộ gọn gàng */}
        <div style={{ fontSize: 12, color: '#0369a1', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, padding: '5px 10px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <InfoCircleOutlined style={{ color: '#0284c7' }} />
          <span>Bảng giá dịch vụ và các size được tự động đồng bộ từ module <strong>Dịch Vụ & Giá</strong>. Vui lòng không tạo bảng giá dạng text tại đây.</span>
        </div>

        <Form form={form} layout="vertical" initialValues={{ doc_type: 'guide', sections: [{ heading: '', text: '' }] }}>
          <Row gutter={16}>
            <Col xs={24} sm={15}>
              <Form.Item name="title" label="Tiêu đề tài liệu tri thức" rules={[{ required: true, message: 'Vui lòng nhập tiêu đề tài liệu' }]}>
                <Input placeholder="ví dụ: SOP Tiếp nhận thú cưng và an toàn chuồng sấy..." />
              </Form.Item>
            </Col>
            <Col xs={24} sm={9}>
              <Form.Item name="doc_type" label="Phân loại tri thức nghiệp vụ" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'guide', label: '📖 Cẩm nang giống loài' },
                    { value: 'sop', label: '🧼 Quy trình SOP an toàn' },
                    { value: 'policy', label: '🩺 Chính sách da liễu & y tế' },
                    { value: 'faq', label: '💬 Hỏi đáp FAQ' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '8px 0 16px 0' }} />

          {/* Thanh chuyển chế độ nhập: Từng Section vs Văn bản thô */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Segmented
              value={inputMode}
              onChange={setInputMode}
              options={[
                { label: '📋 Quản lý từng Section (Khuyên dùng)', value: 'sections' },
                { label: '📝 Nhập văn bản thô', value: 'raw' },
              ]}
            />
            {inputMode === 'sections' && (
              <Tag color="cyan" style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4 }}>
                {(form.getFieldValue('sections') || []).length} Đoạn trích
              </Tag>
            )}
          </div>

          {inputMode === 'sections' ? (
            <Form.List name="sections">
              {(fields, { add, remove }) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {fields.map(({ key, name, ...restField }, idx) => (
                    <Card
                      key={key}
                      size="small"
                      style={{ borderRadius: 8, background: '#f8fafc', border: '1px solid #cbd5e1' }}
                      title={
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f766e' }}>
                          📌 Đoạn trích (Section / Chunk) #{idx + 1}
                        </span>
                      }
                      extra={
                        fields.length > 1 && (
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={() => remove(name)}
                          >
                            Xóa đoạn này
                          </Button>
                        )
                      }
                    >
                      <Form.Item
                        {...restField}
                        name={[name, 'heading']}
                        label={<span style={{ fontSize: 12, fontWeight: 600 }}>Tiêu đề / Tiêu điểm của đoạn này (Heading)</span>}
                        style={{ marginBottom: 8 }}
                      >
                        <Input placeholder={`ví dụ: Mục ${idx + 1}: Quy định kiểm tra da lông ban đầu...`} />
                      </Form.Item>
                      <Form.Item
                        {...restField}
                        name={[name, 'text']}
                        label={<span style={{ fontSize: 12, fontWeight: 600 }}>Nội dung chi tiết của đoạn này</span>}
                        rules={[{ required: true, message: 'Vui lòng nhập nội dung cho đoạn này' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <Input.TextArea
                          rows={3}
                          placeholder="Nhập nội dung quy trình hoặc hướng dẫn cụ thể của phần này..."
                        />
                      </Form.Item>
                    </Card>
                  ))}
                  <Button
                    type="dashed"
                    onClick={() => {
                      add({ heading: '', text: '' })
                      setTimeout(() => {
                        const modalBody = document.querySelector('.ai-knowledge-modal .ant-modal-body')
                        if (modalBody) {
                          modalBody.scrollTo({ top: modalBody.scrollHeight, behavior: 'smooth' })
                        }
                      }, 60)
                    }}
                    block
                    icon={<PlusOutlined />}
                    style={{ borderColor: '#0f8b8d', color: '#0f8b8d', height: 40, marginTop: 8, borderRadius: 8, fontWeight: 600 }}
                  >
                    Thêm Đoạn Trích (Section)
                  </Button>
                </div>
              )}
            </Form.List>
          ) : (
            <div>
              <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  💡 Mẹo: Nhập mỗi phần cách nhau 1 dòng trống (Enter 2 lần) hoặc đánh số (1., 2.) để hệ thống tự phân tách.
                </Text>
                <Button
                  size="small"
                  type="primary"
                  ghost
                  onClick={() => {
                    const raw = form.getFieldValue('rawContent') || ''
                    const parsed = parseTextIntoSections(raw, form.getFieldValue('title'))
                    form.setFieldsValue({ sections: parsed })
                    setInputMode('sections')
                    message.success(`Đã tự động phân tách thành ${parsed.length} Sections để bạn kiểm soát!`)
                  }}
                >
                  ⚡ Tách thành các Sections để kiểm soát
                </Button>
              </div>
              <Form.Item name="rawContent" noStyle>
                <Input.TextArea
                  rows={10}
                  placeholder="Dán toàn bộ văn bản quy trình hoặc cẩm nang tại đây..."
                />
              </Form.Item>
            </div>
          )}
        </Form>
      </Modal>

      {/* Modal xem các chunks phân tách */}
      <Modal
        centered
        open={!!detailDoc}
        title={<span><BookOutlined style={{ color: '#0f8b8d', marginRight: 8 }} /> Các đoạn trích tri thức: {detailDoc?.title}</span>}
        onCancel={() => setDetailDoc(null)}
        footer={[
          <Button key="close" onClick={() => setDetailDoc(null)}>
            Đóng
          </Button>,
        ]}
        width={760}
      >
        {detailDoc?.chunks && detailDoc.chunks.length > 0 ? (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Alert
              type="info"
              message={`Tài liệu này được hệ thống AI tự động chia thành ${detailDoc.chunks.length} đoạn trích (chunks) để tìm kiếm chính xác khi khách hỏi.`}
              showIcon
            />
            {detailDoc.chunks.map((chk, i) => (
              <Card size="small" key={chk.id || i} style={{ background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <Text strong style={{ color: '#0f8b8d' }}>
                  Đoạn #{i + 1}: {chk.heading || detailDoc.title}
                </Text>
                <div style={{ marginTop: 6, whiteSpace: 'pre-line', fontSize: 13, color: '#334155' }}>
                  {chk.text}
                </div>
              </Card>
            ))}
          </Space>
        ) : (
          <Empty description="Tài liệu chưa có đoạn trích nào" />
        )}
      </Modal>
    </div>
  )
}

// ==========================================
// TAB 2: BỘ LUẬT CHUYÊN GIA & AN TOÀN (EXPERT RULES)
// ==========================================

function ExpertRulesTab() {
  const [activeSubTab, setActiveSubTab] = useState('contraindications')
  const [contraData, setContraData] = useState([])
  const [rebookData, setRebookData] = useState([])
  const [loading, setLoading] = useState(false)
  const [services, setServices] = useState([])
  const [healthTags, setHealthTags] = useState([])
  const [packages, setPackages] = useState([])
  const [contraModalOpen, setContraModalOpen] = useState(false)
  const [rebookModalOpen, setRebookModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formContra] = Form.useForm()
  const [formRebook] = Form.useForm()

  const loadData = async () => {
    setLoading(true)
    try {
      const [resC, resR, svcs, tags, pkgs] = await Promise.all([
        api('/service-contraindications').catch((err) => {
          console.error('Lỗi tải chống chỉ định:', err)
          return []
        }),
        api('/rebook-rules').catch((err) => {
          console.error('Lỗi tải luật chu kỳ:', err)
          return []
        }),
        api('/services').catch(() => []),
        api('/health-tags').catch(() => []),
        api('/packages').catch(() => []),
      ])
      setContraData(unwrap(resC))
      setRebookData(unwrap(resR))
      setServices(unwrap(svcs))
      setHealthTags(unwrap(tags))
      setPackages(unwrap(pkgs))
    } catch (e) {
      message.error(e.message || 'Không thể tải bộ luật chuyên gia')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleAddContra = async () => {
    try {
      const values = await formContra.validateFields()
      setSubmitting(true)
      await api('/service-contraindications', {
        method: 'POST',
        body: JSON.stringify(values),
      })
      message.success('Đã thêm quy tắc chống chỉ định mới')
      setContraModalOpen(false)
      formContra.resetFields()
      loadData()
    } catch (e) {
      message.error(e.message || 'Lỗi khi lưu quy tắc chống chỉ định')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteContra = async (id) => {
    try {
      await api(`/service-contraindications/${id}`, { method: 'DELETE' })
      message.success('Đã xóa quy tắc chống chỉ định')
      loadData()
    } catch (e) {
      message.error(e.message || 'Không thể xóa')
    }
  }

  const confirmDeleteContra = (record) => {
    const serviceName = record.service_name || `Dịch vụ #${record.service}`
    const healthTagName = record.health_tag_name || `Thẻ #${record.health_tag}`
    Modal.confirm({
      title: `Xóa quy tắc chống chỉ định dịch vụ "${serviceName}"?`,
      icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
      content: `Quy tắc an toàn giữa dịch vụ "${serviceName}" và tiền sử bệnh "${healthTagName}" sẽ bị xóa. Hệ thống sẽ không còn tự động chặn hoặc cảnh báo khi khách hàng có tiền sử này đặt dịch vụ tại quầy.`,
      okText: 'Xóa quy tắc',
      okType: 'danger',
      cancelText: 'Hủy',
      centered: true,
      onOk: () => handleDeleteContra(record.id),
    })
  }

  const handleAddRebook = async () => {
    try {
      const values = await formRebook.validateFields()
      setSubmitting(true)
      await api('/rebook-rules', {
        method: 'POST',
        body: JSON.stringify(values),
      })
      message.success('Đã thêm quy tắc chu kỳ tái spa mới')
      setRebookModalOpen(false)
      formRebook.resetFields()
      loadData()
    } catch (e) {
      message.error(e.message || 'Lỗi khi lưu quy tắc chu kỳ')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteRebook = async (id) => {
    try {
      await api(`/rebook-rules/${id}`, { method: 'DELETE' })
      message.success('Đã xóa quy tắc chu kỳ')
      loadData()
    } catch (e) {
      message.error(e.message || 'Không thể xóa')
    }
  }

  const confirmDeleteRebook = (record) => {
    const packageName = record.package_name || `Gói combo #${record.package}`
    Modal.confirm({
      title: `Xóa quy chuẩn chu kỳ tái spa cho "${packageName}"?`,
      icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
      content: `Quy chuẩn chu kỳ ${record.interval_days} ngày của gói "${packageName}" sẽ bị xóa. Phân hệ "Nhắc Tái Spa Định Kỳ" sẽ không còn căn cứ vào quy chuẩn này để tự động tạo đề xuất thông báo nhắc hẹn cho khách hàng nữa.`,
      okText: 'Xóa quy chuẩn',
      okType: 'danger',
      cancelText: 'Hủy',
      centered: true,
      onOk: () => handleDeleteRebook(record.id),
    })
  }

  // Cột Ma trận chống chỉ định (ĐÃ SỬA TRIỆT ĐỂ LỖI CỘT RỖNG)
  const contraColumns = [
    {
      title: 'Dịch vụ áp dụng',
      dataIndex: 'service_name',
      render: (v, r) => <strong>{v || `Dịch vụ #${r.service}`}</strong>,
    },
    {
      title: 'Thẻ sức khỏe / Tiền sử bệnh lý',
      dataIndex: 'health_tag_name',
      render: (v, r) => (
        <Tag color="purple" style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6 }}>
          🏷️ {v || `Thẻ #${r.health_tag}`}
        </Tag>
      ),
    },
    {
      title: 'Mức độ an toàn',
      dataIndex: 'severity',
      width: 170,
      render: (sev) =>
        sev === 'block' ? (
          <Tag color="red" icon={<CloseCircleOutlined />} style={{ fontWeight: 600 }}>
            CẤM DÙNG (BLOCK)
          </Tag>
        ) : (
          <Tag color="orange" icon={<AlertOutlined />} style={{ fontWeight: 600 }}>
            CẢNH BÁO (WARN)
          </Tag>
        ),
    },
    {
      title: 'Lý do & Hướng dẫn an toàn y tế',
      dataIndex: 'reason_vi',
      render: (v) => <span style={{ color: '#334155' }}>{v || '—'}</span>,
    },
    {
      title: 'Thao tác',
      key: 'act',
      width: 80,
      render: (_, r) => (
        <Button
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => confirmDeleteContra(r)}
        />
      ),
    },
  ]

  const coatTypeLabels = {
    all: 'Mọi loại lông',
    short: 'Lông ngắn',
    long: 'Lông dài',
    curly: 'Lông xoăn',
    double: 'Lông 2 lớp dày',
  }

  const speciesLabels = {
    all: 'Tất cả loài',
    dog: '🐶 Chó',
    cat: '🐱 Mèo',
  }

  // Cột Luật chu kỳ tái spa
  const rebookColumns = [
    {
      title: 'Gói combo áp dụng',
      dataIndex: 'package_name',
      render: (v, r) => <strong>{v || `Gói combo #${r.package}`}</strong>,
    },
    {
      title: 'Đối tượng áp dụng',
      key: 'target',
      render: (_, r) => {
        const specText = speciesLabels[r.species] || (r.species ? r.species : 'Tất cả loài')
        const coatText = coatTypeLabels[r.coat_type] || (r.coat_type ? r.coat_type : 'Mọi loại lông')
        return (
          <Space wrap size={[4, 4]}>
            <Tag color="blue">{specText}</Tag>
            <Tag color="cyan">{coatText}</Tag>
          </Space>
        )
      },
    },
    {
      title: 'Chu kỳ định kỳ',
      dataIndex: 'interval_days',
      render: (days) => <Tag color="orange" style={{ fontWeight: 600 }}>{days} ngày</Tag>,
    },
    {
      title: 'Ngưỡng quá hạn',
      dataIndex: 'overdue_days',
      render: (days) => <Tag color="volcano">+{days || 0} ngày</Tag>,
    },
    {
      title: 'Lý do gửi khách / Ghi chú luật',
      dataIndex: 'note_vi',
      render: (v) => <span style={{ fontSize: 13, color: '#334155' }}>{v || '—'}</span>,
    },
    {
      title: 'Thao tác',
      key: 'act',
      width: 80,
      render: (_, r) => (
        <Button
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => confirmDeleteRebook(r)}
        />
      ),
    },
  ]

  return (
    <div>
      {/* Overview Context Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #f0fdfa 0%, #f8fafc 100%)',
          border: '1px solid #ccfbf1',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ maxWidth: 720 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <SafetyCertificateOutlined style={{ fontSize: 18, color: '#0f766e' }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#0f766e' }}>
                Hệ Thống Quy Tắc & Rào Chắn Nghiệp Vụ Cố Định (Deterministic Safety & Rebook Rules)
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
              Khác với <em>Kho Tri Thức</em> dạng văn bản tự do cho Chatbot, đây là các quy tắc <strong>logic chuẩn xác 100%</strong>:
              AI và Lễ tân đối chiếu trực tiếp để <strong>chặn nguy cơ sốc/dị ứng y tế</strong> khi xếp lịch tại quầy và <strong>tự động tính ngày gửi tin nhắn mời khách</strong> ở phân hệ Nhắc Tái Spa.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '8px 14px',
                textAlign: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                minWidth: 130,
              }}
            >
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>RÀO CHẮN AN TOÀN</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#e11d48' }}>
                {contraData.length} <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>quy tắc</span>
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '8px 14px',
                textAlign: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                minWidth: 130,
              }}
            >
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>CHU KỲ TÁI SPA</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0f8b8d' }}>
                {rebookData.length} <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>quy chuẩn</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Tabs
        type="card"
        activeKey={activeSubTab}
        onChange={setActiveSubTab}
        items={[
          {
            key: 'contraindications',
            label: (
              <span style={{ fontWeight: 600 }}>
                <SafetyCertificateOutlined style={{ color: '#e11d48' }} /> Rào Chắn Y Tế & Chống Chỉ Định ({contraData.length})
              </span>
            ),
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <Text strong style={{ fontSize: 15, color: '#0f172a' }}>
                      🛡️ Ma Trận Chống Chỉ Định Dịch Vụ & An Toàn Da Liễu
                    </Text>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                      Tự động rà soát khi xếp lịch tại Bảng Lễ Tân: Chặn hoặc cảnh báo các dịch vụ có hóa chất/nước hoa gây hại cho bé có bệnh lý nền.
                    </div>
                  </div>
                  <Space>
                    <Button icon={<ReloadOutlined />} onClick={loadData}>
                      Làm mới
                    </Button>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        formContra.resetFields()
                        setContraModalOpen(true)
                      }}
                      style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
                    >
                      Thêm quy tắc chống chỉ định
                    </Button>
                  </Space>
                </div>
                <Table
                  rowKey="id"
                  loading={loading}
                  dataSource={contraData}
                  columns={contraColumns}
                  pagination={{
                    pageSize: 8,
                    showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} quy tắc`,
                  }}
                  scroll={{ x: 'max-content' }}
                />
              </div>
            ),
          },
          {
            key: 'rebook',
            label: (
              <span style={{ fontWeight: 600 }}>
                <ClockCircleOutlined style={{ color: '#0f8b8d' }} /> Quy Chuẩn Chu Kỳ Nhắc Tái Spa ({rebookData.length})
              </span>
            ),
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <Text strong style={{ fontSize: 15, color: '#0f172a' }}>
                      ⏰ Quy Chuẩn Chu Kỳ Chăm Sóc Định Kỳ Theo Giống & Loại Lông
                    </Text>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                      Cung cấp cấu hình số ngày cho thuật toán quét tự động ở phân hệ <strong>Nhắc Tái Spa Định Kỳ</strong> để tạo đề xuất gửi thông báo cho chủ nuôi.
                    </div>
                  </div>
                  <Space>
                    <Button icon={<ReloadOutlined />} onClick={loadData}>
                      Làm mới
                    </Button>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        formRebook.resetFields()
                        setRebookModalOpen(true)
                      }}
                      style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
                    >
                      Thêm quy chuẩn chu kỳ
                    </Button>
                  </Space>
                </div>
                <Table
                  rowKey="id"
                  loading={loading}
                  dataSource={rebookData}
                  columns={rebookColumns}
                  pagination={{
                    pageSize: 8,
                    showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} quy chuẩn`,
                  }}
                  scroll={{ x: 'max-content' }}
                />
              </div>
            ),
          },
        ]}
      />

      {/* Modal thêm chống chỉ định */}
      <Modal
        centered
        open={contraModalOpen}
        title="Thêm Quy Tắc Chống Chỉ Định Mới"
        onCancel={() => setContraModalOpen(false)}
        onOk={handleAddContra}
        confirmLoading={submitting}
        okText="Lưu quy tắc"
        cancelText="Hủy"
        width={600}
      >
        <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: 12, color: '#9f1239' }}>
          💡 <strong>Rào chắn an toàn:</strong> Quy tắc này sẽ có hiệu lực ngay lập tức tại Bảng Lễ Tân khi tạo đơn hoặc khi AI gợi ý gói chăm sóc.
        </div>
        <Form form={formContra} layout="vertical" initialValues={{ severity: 'block' }}>
          <Form.Item name="service" label="Dịch vụ áp dụng" rules={[{ required: true, message: 'Chọn dịch vụ' }]}>
            <Select
              showSearch
              placeholder="Chọn dịch vụ spa hoặc gói dịch vụ"
              filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={services.map((s) => ({ value: s.id, label: s.name }))}
            />
          </Form.Item>

          <Form.Item name="health_tag" label="Thẻ sức khỏe / Tiền sử bệnh lý của bé" rules={[{ required: true, message: 'Chọn thẻ sức khỏe' }]}>
            <Select
              showSearch
              placeholder="Chọn thẻ bệnh lý (viêm da, dị ứng, vết thương hở...)"
              filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={healthTags.map((t) => ({ value: t.id, label: `${t.name_vi} (${t.code})` }))}
            />
          </Form.Item>

          <Form.Item name="severity" label="Mức độ nghiêm trọng & Hành vi xử lý" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'block', label: '🚫 CẤM DÙNG (BLOCK) — Loại bỏ hoàn toàn khỏi gợi ý, chặn xếp lịch' },
                { value: 'warn', label: '⚠️ CẢNH BÁO (WARN) — Cảnh báo KTV & yêu cầu lưu ý quy trình' },
              ]}
            />
          </Form.Item>

          <Form.Item name="reason_vi" label="Lý do y tế & Hướng dẫn an toàn" rules={[{ required: true, message: 'Nhập lý do chống chỉ định' }]}>
            <Input.TextArea rows={3} placeholder="ví dụ: Da đang bị viêm hoặc kích ứng tiếp xúc với tinh dầu nồng có thể gây bỏng rát hoặc ngứa ngáy dữ dội..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal thêm luật chu kỳ */}
      <Modal
        centered
        open={rebookModalOpen}
        title="Thêm Quy Chuẩn Chu Kỳ Tái Spa Mới"
        onCancel={() => setRebookModalOpen(false)}
        onOk={handleAddRebook}
        confirmLoading={submitting}
        okText="Lưu quy chuẩn"
        cancelText="Hủy"
        width={620}
      >
        <div style={{ background: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: 12, color: '#0f766e' }}>
          💡 <strong>Cấu hình chu kỳ:</strong> Hệ thống ở trang <strong>Nhắc Tái Spa Định Kỳ</strong> sẽ quét lịch sử đặt lịch gần nhất của bé, cộng thêm số ngày này để tự động tạo lời nhắc khi đến hạn.
        </div>
        <Form
          form={formRebook}
          layout="vertical"
          initialValues={{ species: 'all', coat_type: 'all', interval_days: 30, overdue_days: 14 }}
        >
          <Form.Item
            name="package"
            label="Gói combo áp dụng"
            rules={[{ required: true, message: 'Vui lòng chọn gói combo' }]}
          >
            <Select
              placeholder="Chọn gói combo áp dụng chu kỳ"
              showSearch
              filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={packages.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="species" label="Loài áp dụng" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'all', label: 'Tất cả loài' },
                    { value: 'dog', label: '🐶 Chó' },
                    { value: 'cat', label: '🐱 Mèo' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="coat_type" label="Loại lông" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'all', label: 'Tất cả loại lông' },
                    { value: 'short', label: 'Lông ngắn' },
                    { value: 'long', label: 'Lông dài' },
                    { value: 'curly', label: 'Lông xoăn' },
                    { value: 'double', label: 'Lông 2 lớp dày' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="interval_days"
                label="Chu kỳ định kỳ (ngày)"
                rules={[{ required: true, message: 'Nhập số ngày chu kỳ' }]}
              >
                <InputNumber min={7} max={180} style={{ width: '100%' }} placeholder="ví dụ: 21" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="overdue_days"
                label="Ngưỡng quá hạn (ngày)"
                rules={[{ required: true, message: 'Nhập số ngày quá hạn' }]}
              >
                <InputNumber min={1} max={60} style={{ width: '100%' }} placeholder="ví dụ: 14" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="note_vi"
            label="Lý do chu kỳ hiển thị cho khách / Ghi chú luật"
            rules={[{ required: true, message: 'Vui lòng nhập lý do/ghi chú luật' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="ví dụ: Đã đến chu kỳ tắm xả tơ và cắt tỉa form lông định kỳ để bé luôn gọn gàng..."
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

// ==========================================
// TAB 4: NHẬT KÝ HOẠT ĐỘNG & GIÁM SÁT AI (AUDIT LOGS)
// ==========================================
function AiLogsTab() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [detailLog, setDetailLog] = useState(null)
  const [filterKind, setFilterKind] = useState('all')
  const [stats, setStats] = useState({ total: 0, chat_count: 0, refused_count: 0, avg_latency: 0 })

  const loadData = useCallback(async (targetPage = page, targetPageSize = pageSize, targetKind = filterKind) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', targetPage)
      params.append('page_size', targetPageSize)
      if (targetKind && targetKind !== 'all') {
        params.append('kind', targetKind)
      }

      const summaryParams = new URLSearchParams()
      if (targetKind && targetKind !== 'all') {
        summaryParams.append('kind', targetKind)
      }

      const [resLogs, resSummary] = await Promise.all([
        api(`/ai/logs?${params.toString()}`),
        api(`/ai/logs/summary?${summaryParams.toString()}`).catch(() => null),
      ])

      if (resLogs && typeof resLogs === 'object' && 'results' in resLogs) {
        setData(resLogs.results || [])
        setTotal(resLogs.count || 0)
      } else {
        const list = unwrap(resLogs)
        setData(list)
        setTotal(list.length)
      }

      if (resSummary) {
        setStats(resSummary)
      }
    } catch (e) {
      message.error(e.message || 'Không thể tải nhật ký AI')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filterKind])

  useEffect(() => {
    loadData(1, pageSize, filterKind)
  }, [])

  const handleFilterChange = (val) => {
    setFilterKind(val)
    setPage(1)
    loadData(1, pageSize, val)
  }

  const handlePageChange = (newPage, newPageSize) => {
    setPage(newPage)
    setPageSize(newPageSize)
    loadData(newPage, newPageSize, filterKind)
  }

  const handleRefresh = () => {
    loadData(page, pageSize, filterKind)
  }

  const columns = [
    {
      title: 'Thời gian',
      dataIndex: 'created_at',
      width: 150,
      render: (d) => (d ? dayjs(d).format('DD/MM/YYYY HH:mm:ss') : '—'),
    },
    {
      title: 'Tác vụ AI',
      dataIndex: 'kind',
      width: 150,
      render: (k) => {
        const map = {
          chat: { label: 'Chatbot tư vấn', color: 'cyan' },
          suggest_package: { label: 'Gợi ý gói combo', color: 'blue' },
          suggest_staff: { label: 'Gợi ý KTV phù hợp', color: 'purple' },
          safety_check: { label: 'Kiểm tra an toàn', color: 'green' },
          rebook: { label: 'Quét nhắc tái spa', color: 'orange' },
        }
        const item = map[k] || { label: k, color: 'default' }
        return <Tag color={item.color}>{item.label}</Tag>
      },
    },
    {
      title: 'Người hỏi / Thực hiện',
      dataIndex: 'user_name',
      width: 140,
      render: (u, r) => u || (r.pet_name ? `Bé ${r.pet_name}` : 'Khách vãng lai'),
    },
    {
      title: 'Câu hỏi / Input đầu vào',
      dataIndex: 'input_text',
      render: (txt) => (
        <Text style={{ fontSize: 13, maxWidth: 260 }} ellipsis={{ tooltip: txt }}>
          {txt || '—'}
        </Text>
      ),
    },
    {
      title: 'Phản hồi từ AI',
      dataIndex: 'output_text',
      render: (txt) => (
        <Text style={{ fontSize: 13, color: '#334155', maxWidth: 300 }} ellipsis={{ tooltip: txt }}>
          {txt || '—'}
        </Text>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 120,
      render: (st) =>
        st === 'ok' ? (
          <Tag color="green" icon={<CheckCircleOutlined />}>Thành công</Tag>
        ) : st === 'refused' ? (
          <Tag color="volcano" icon={<CloseCircleOutlined />}>Từ chối/Thiếu tin</Tag>
        ) : (
          <Tag color="red">Lỗi</Tag>
        ),
    },
    {
      title: 'Thời gian xử lý',
      dataIndex: 'latency_ms',
      width: 110,
      render: (ms) => (ms ? <Tag color="geekblue">{ms}ms</Tag> : '—'),
    },
  ]

  return (
    <div>
      {/* 4 Thẻ thống kê giám sát toàn hệ thống */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Tổng lượt gọi AI</Text>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0f8b8d', marginTop: 4 }}>
              {stats.total} <span style={{ fontSize: 13, fontWeight: 400 }}>lượt</span>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Hỏi đáp Chatbot</Text>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0284c7', marginTop: 4 }}>
              {stats.chat_count} <span style={{ fontSize: 13, fontWeight: 400 }}>cuộc gọi</span>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Câu hỏi chưa có tri thức</Text>
            <div style={{ fontSize: 22, fontWeight: 700, color: stats.refused_count > 0 ? '#ea580c' : '#10b981', marginTop: 4 }}>
              {stats.refused_count} <span style={{ fontSize: 13, fontWeight: 400 }}>lượt cần bổ sung</span>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Độ trễ phản hồi trung bình</Text>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#6366f1', marginTop: 4 }}>
              {stats.avg_latency} <span style={{ fontSize: 13, fontWeight: 400 }}>ms</span>
            </div>
          </Card>
        </Col>
      </Row>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Text strong style={{ fontSize: 16 }}>
            Nhật Ký Hoạt Động & Kiểm Soát Minh Bạch AI
          </Text>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            Toàn bộ các phiên hỏi đáp, trích xuất tài liệu và đề xuất dịch vụ đều được lưu vết chi tiết (Bấm vào dòng để xem chi tiết log).
          </div>
        </div>
        <Space wrap>
          <Select
            value={filterKind}
            onChange={handleFilterChange}
            style={{ width: 180 }}
            options={[
              { value: 'all', label: 'Tất cả tác vụ AI' },
              { value: 'chat', label: 'Chatbot tư vấn' },
              { value: 'suggest_package', label: 'Gợi ý gói combo' },
              { value: 'suggest_staff', label: 'Gợi ý KTV' },
              { value: 'rebook', label: 'Nhắc tái spa' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
            Làm mới
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={columns}
        scroll={{ x: 'max-content' }}
        rowClassName={() => 'clickable-row'}
        onRow={(record) => ({
          onClick: () => setDetailLog(record),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          position: ['bottomRight'],
          current: page,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50'],
          showTotal: (totalCount, range) => `${range[0]}-${range[1]} / ${totalCount} bản ghi`,
          onChange: handlePageChange,
        }}
      />

      {/* Modal xem chi tiết log */}
      <Modal
        centered
        open={!!detailLog}
        title="Chi Tiết Bản Ghi Nhật Ký Hoạt Động AI"
        footer={<Button onClick={() => setDetailLog(null)}>Đóng</Button>}
        onCancel={() => setDetailLog(null)}
        width={720}
      >
        {detailLog && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Thời gian thực hiện">
              {detailLog.created_at ? dayjs(detailLog.created_at).format('DD/MM/YYYY HH:mm:ss') : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Loại chức năng AI">
              <Tag color="cyan">{detailLog.kind}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Người thực hiện">
              {detailLog.user_name || 'Khách vãng lai'}
            </Descriptions.Item>
            <Descriptions.Item label="Động cơ xử lý (Engine)">
              <Tag color="purple">{detailLog.engine || 'rules-v1'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Độ trễ xử lý (Latency)">
              <strong>{detailLog.latency_ms || 0} ms</strong>
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              {detailLog.status === 'ok' ? (
                <Tag color="green">Thành công (OK)</Tag>
              ) : (
                <Tag color="volcano">Từ chối / Chưa có thông tin</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Dữ liệu đầu vào (Input Prompt/Question)">
              <div style={{ maxHeight: 150, overflowY: 'auto', background: '#f8fafc', padding: 10, borderRadius: 6, fontSize: 13, whiteSpace: 'pre-wrap' }}>
                {detailLog.input_text || '—'}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="Phản hồi từ AI (Output Response)">
              <div style={{ maxHeight: 220, overflowY: 'auto', background: '#f0fdfa', padding: 10, borderRadius: 6, fontSize: 13, whiteSpace: 'pre-line', color: '#0f766e' }}>
                {detailLog.output_text || '—'}
              </div>
            </Descriptions.Item>
            {detailLog.context_refs && Object.keys(detailLog.context_refs).length > 0 && (
              <Descriptions.Item label="Dữ kiện & Tài liệu trích xuất">
                <pre style={{ fontSize: 11, background: '#f1f5f9', padding: 8, borderRadius: 6, maxHeight: 120, overflowY: 'auto' }}>
                  {JSON.stringify(detailLog.context_refs, null, 2)}
                </pre>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}

// ==========================================
// MÀN HÌNH CHÍNH: TRUNG TÂM QUẢN TRỊ AI & TRI THỨC
// ==========================================
export default function AiAdmin() {
  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0, color: '#0b3d3f' }}>
          <RobotOutlined style={{ marginRight: 8, color: '#0f8b8d' }} />
          Trung Tâm Quản Trị AI & Tri Thức Spa
        </Title>
        <Text type="secondary">
          Quản lý cơ sở tri thức chuyên sâu (SOP, cẩm nang giống, an toàn da liễu), kiểm thử Chatbot trực tiếp và kiểm soát bộ luật chuyên gia.
        </Text>
      </div>

      {/* 3 Tabs chức năng chính */}
      <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <Tabs
          defaultActiveKey="knowledge"
          items={[
            {
              key: 'knowledge',
              label: (
                <span style={{ fontWeight: 600 }}>
                  <BookOutlined /> Kho Tri Thức & Cẩm Nang Spa
                </span>
              ),
              children: <KnowledgeBaseTab />,
            },
            {
              key: 'rules',
              label: (
                <span style={{ fontWeight: 600 }}>
                  <SafetyCertificateOutlined /> Bộ Luật An Toàn & Chu Kỳ Tái Spa
                </span>
              ),
              children: <ExpertRulesTab />,
            },
            {
              key: 'logs',
              label: (
                <span style={{ fontWeight: 600 }}>
                  <HistoryOutlined /> Nhật Ký Hoạt Động & Giám Sát AI
                </span>
              ),
              children: <AiLogsTab />,
            },
          ]}
        />
      </Card>
    </div>
  )
}
