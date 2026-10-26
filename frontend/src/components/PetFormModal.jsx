import { useEffect, useMemo, useState } from 'react'
import {
  Alert, App, Card, Col, DatePicker, Form, Input, InputNumber, Modal,
  Row, Select, Space, Tag, Typography,
} from 'antd'
import dayjs from 'dayjs'
import { api, toFormErrors, unwrap } from '../api.js'
import PetAvatar from './PetAvatar.jsx'

const { Text } = Typography

export const SPECIES = { dog: 'Chó', cat: 'Mèo' }
export const COAT = { short: 'Lông ngắn', long: 'Lông dài', curly: 'Lông xoăn', double: 'Lông kép', hairless: 'Không lông' }
export const SEX = { male: 'Đực', female: 'Cái', unknown: 'Chưa rõ' }
const opts = (m) => Object.entries(m).map(([value, label]) => ({ value, label }))

export const SPECIES_OPTIONS = [
  { value: 'dog', label: '🐶 Chó' },
  { value: 'cat', label: '🐱 Mèo' },
]

/**
 * Danh sách giống Chó: nhãn hiển thị súc tích, giữ từ khóa phong phú để tìm kiếm nhanh
 */
export const DOG_BREEDS = [
  { value: 'Poodle', label: 'Poodle', keywords: 'poodle toy tiny teacup standard cho san vit' },
  { value: 'Corgi', label: 'Corgi', keywords: 'corgi pembroke cardigan chan ngan' },
  { value: 'Phốc Sóc', label: 'Phốc Sóc', keywords: 'phoc soc pom pomeranian' },
  { value: 'Golden Retriever', label: 'Golden Retriever', keywords: 'golden retriever san moi' },
  { value: 'Labrador', label: 'Labrador', keywords: 'lab labrador retriever' },
  { value: 'Husky', label: 'Husky', keywords: 'husky sibir ngao keo xe tuyet' },
  { value: 'Alaska', label: 'Alaska', keywords: 'alaska malamute keo xe' },
  { value: 'Samoyed', label: 'Samoyed', keywords: 'samoyed sam tuyet trang cuoi' },
  { value: 'Pug', label: 'Pug', keywords: 'pug mat xe mat gie' },
  { value: 'Bulldog Pháp', label: 'Bulldog Pháp', keywords: 'french bulldog phap bull tai doi' },
  { value: 'Bulldog Anh', label: 'Bulldog Anh', keywords: 'english bulldog anh bull' },
  { value: 'Phú Quốc', label: 'Chó Phú Quốc', keywords: 'phu quoc xoay lung cho ta' },
  { value: 'Chó Cỏ / Chó Ta', label: 'Chó Cỏ / Chó Ta', keywords: 'cho co cho ta vang ven ban dia' },
  { value: 'Chó Bắc Hà', label: 'Chó Bắc Hà', keywords: 'bac ha xu tay bac' },
  { value: 'H\'Mông cộc', label: 'H\'Mông cộc', keywords: 'hmong coc duoi mong coc' },
  { value: 'Chihuahua', label: 'Chihuahua', keywords: 'chihuahua chi hua hua ti hon' },
  { value: 'Phốc hươu', label: 'Phốc hươu', keywords: 'phoc huou pinscher min pin' },
  { value: 'Shiba', label: 'Shiba Inu', keywords: 'shiba inu nhat ban' },
  { value: 'Akita', label: 'Akita Inu', keywords: 'akita inu nhat ban quoc khuyen' },
  { value: 'Beagle', label: 'Beagle', keywords: 'beagle san tho san huong tai dai' },
  { value: 'Chó Nhật', label: 'Chó Nhật', keywords: 'cho nhat japanese chin xu' },
  { value: 'Shih Tzu', label: 'Shih Tzu', keywords: 'shih tzu thach su tay tang' },
  { value: 'Maltese', label: 'Maltese', keywords: 'maltese malta long trang quy toc' },
  { value: 'Yorkshire', label: 'Yorkshire', keywords: 'yorkshire terrier yorkie suc' },
  { value: 'Bichon Frise', label: 'Bichon Frise', keywords: 'bichon frise bong gon trang' },
  { value: 'Schnauzer', label: 'Schnauzer', keywords: 'schnauzer rau kem suc co' },
  { value: 'Doberman', label: 'Doberman', keywords: 'doberman pinscher giu nha' },
  { value: 'Rottweiler', label: 'Rottweiler', keywords: 'rottweiler rot bao ve dung manh' },
  { value: 'American Bully', label: 'American Bully', keywords: 'american bully pitbull co bap ham ho' },
  { value: 'Pitbull', label: 'Pitbull', keywords: 'pitbull cho chien' },
  { value: 'Becgie Đức', label: 'Becgie Đức', keywords: 'becgie duc german shepherd gsd' },
  { value: 'Becgie Bỉ', label: 'Becgie Bỉ', keywords: 'becgie bi malinois quan khuyen' },
  { value: 'Border Collie', label: 'Border Collie', keywords: 'border collie chan cuu thong minh' },
  { value: 'Chow Chow', label: 'Chow Chow', keywords: 'chow chow su tu luoi tim' },
  { value: 'Chó Đốm', label: 'Chó Đốm', keywords: 'cho dom dalmatian 101' },
  { value: 'Lạp Xưởng', label: 'Lạp Xưởng', keywords: 'lap xuong dachshund xuc xich' },
  { value: 'Chó lai', label: 'Chó lai', keywords: 'cho lai f1 f2 crossbreed mix' },
  { value: 'Khác', label: 'Khác', keywords: 'khac other tuy chon' },
]

/**
 * Danh sách giống Mèo: nhãn hiển thị súc tích, giữ từ khóa phong phú để tìm kiếm nhanh
 */
export const CAT_BREEDS = [
  { value: 'Mèo ta', label: 'Mèo ta', keywords: 'meo ta muop vang mun tam the ban dia' },
  { value: 'Mèo Anh lông ngắn', label: 'Mèo Anh lông ngắn', keywords: 'meo anh long ngan british shorthair aln' },
  { value: 'Mèo Anh lông dài', label: 'Mèo Anh lông dài', keywords: 'meo anh long dai british longhair ald' },
  { value: 'Mèo tai cụp', label: 'Mèo tai cụp', keywords: 'meo scottish fold tai cup scottish' },
  { value: 'Mèo tai thẳng', label: 'Mèo tai thẳng', keywords: 'meo scottish straight tai thang' },
  { value: 'Munchkin', label: 'Mèo Munchkin', keywords: 'munchkin chan ngan nam lun' },
  { value: 'Ba Tư', label: 'Mèo Ba Tư', keywords: 'ba tu persian mat tit long xu' },
  { value: 'Mèo Ragdoll', label: 'Mèo Ragdoll', keywords: 'meo ragdoll mat xanh bup be' },
  { value: 'Mèo Bengal', label: 'Mèo Bengal', keywords: 'meo bengal van bao bao dom hoang da' },
  { value: 'Mèo Sphynx', label: 'Mèo Sphynx', keywords: 'meo sphynx khong long ai cap' },
  { value: 'Mèo Xiêm', label: 'Mèo Xiêm', keywords: 'meo xiem siamese thai lan mat xanh' },
  { value: 'Mèo Nga', label: 'Mèo Nga', keywords: 'meo nga mat xanh russian blue long xam' },
  { value: 'Mèo Maine Coon', label: 'Mèo Maine Coon', keywords: 'meo maine coon khong lo rung my' },
  { value: 'Mèo Mỹ lông ngắn', label: 'Mèo Mỹ lông ngắn', keywords: 'meo my long ngan american shorthair ash' },
  { value: 'Mèo Exotic', label: 'Mèo Exotic', keywords: 'meo exotic ba tu mat tit long ngan' },
  { value: 'Mèo Birman', label: 'Mèo Birman', keywords: 'meo birman than mien dien' },
  { value: 'Mèo Chinchilla', label: 'Mèo Chinchilla', keywords: 'meo chinchilla bac vang' },
  { value: 'Mèo Thổ Nhĩ Kỳ', label: 'Mèo Thổ Nhĩ Kỳ', keywords: 'meo tho nhi ky turkish angora' },
  { value: 'Mèo Abyssinian', label: 'Mèo Abyssinian', keywords: 'meo abyssinian chau phi' },
  { value: 'Mèo Devon Rex', label: 'Mèo Devon Rex', keywords: 'meo devon rex long xoan' },
  { value: 'Mèo Bombay', label: 'Mèo Bombay', keywords: 'meo bombay bao den nho' },
  { value: 'Mèo lai', label: 'Mèo lai', keywords: 'meo lai crossbreed f1 mix' },
  { value: 'Khác', label: 'Khác', keywords: 'khac other tuy chon' },
]

/** Chuẩn hóa xâu tiếng Việt bỏ dấu để tìm kiếm nhanh */
const removeDiacritics = (str = '') =>
  str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()

/**
 * Modal thêm/sửa thú cưng dùng chung.
 * - pet: null (đóng) | {} (thêm mới) | object (sửa)
 * - clientId: chủ thú cố định (lễ tân/quản lý); bỏ trống khi khách tự quản lý thú của mình
 */
export default function PetFormModal({ pet, clientId, clientName, isCustomer, onClose, onSaved }) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const watchedSpecies = Form.useWatch('species', form)
  const watchedBreed = Form.useWatch('breed', form)
  const [searchBreedText, setSearchBreedText] = useState('')
  const [tags, setTags] = useState([])
  const [busy, setBusy] = useState(false)

  // Loài đang chọn hiện tại (ưu tiên form watch, fallback theo dữ liệu pet hoặc mặc định 'dog')
  const activeSpecies = watchedSpecies || pet?.species || 'dog'

  useEffect(() => {
    api('/health-tags').then((t) => setTags(unwrap(t))).catch(() => {})
  }, [])

  useEffect(() => {
    if (!pet) {
      form.resetFields()
      setSearchBreedText('')
      return
    }
    form.setFieldsValue({
      species: 'dog',
      coat_type: 'short',
      sex: 'unknown',
      health_tags: [],
      allergy_note: 'Không',
      ...pet,
      birth_date: pet.birth_date ? dayjs(pet.birth_date) : null,
      weight_kg: pet.weight_kg ? Number(pet.weight_kg) : 5,
    })
    setSearchBreedText('')
  }, [pet, form])

  // Xử lý khi người dùng đổi Loài: tự động dọn giống cũ nếu giống cũ thuộc loài trước đó
  const handleSpeciesChange = (newSpecies) => {
    form.setFieldValue('species', newSpecies)
    const currentBreed = form.getFieldValue('breed')
    const oldBreeds = (newSpecies === 'cat' ? DOG_BREEDS : CAT_BREEDS).map((b) => b.value)
    if (currentBreed && oldBreeds.includes(currentBreed)) {
      form.setFieldValue('breed', undefined)
    }
    setSearchBreedText('')
  }

  // Danh sách giống tương ứng theo loài đã chọn
  const breedOptions = useMemo(() => {
    const list = activeSpecies === 'cat' ? CAT_BREEDS : DOG_BREEDS
    const res = list.map((b) => ({
      value: b.value,
      label: b.label,
      keywords: b.keywords,
    }))

    // Nếu pet hiện tại có giống tùy biến chưa nằm trong danh sách, thêm vào để hiển thị đầy đủ
    const currentBreed = watchedBreed || pet?.breed
    if (currentBreed && !res.some((b) => b.value.toLowerCase() === currentBreed.toLowerCase())) {
      res.unshift({
        value: currentBreed,
        label: currentBreed,
        keywords: currentBreed,
      })
    }

    // Nếu người dùng gõ tìm kiếm một giống mới chưa có trong danh sách, cho phép chọn làm giá trị mới
    const trimmed = searchBreedText?.trim()
    if (
      trimmed &&
      !res.some((b) => b.value.toLowerCase() === trimmed.toLowerCase())
    ) {
      res.unshift({
        value: trimmed,
        label: `➕ Dùng giống: "${trimmed}"`,
        keywords: trimmed,
      })
    }

    return res
  }, [activeSpecies, watchedBreed, pet?.breed, searchBreedText])

  // Bộ lọc tìm kiếm thông minh hỗ trợ cả tiếng Việt có dấu và không dấu
  const filterBreedOption = (input, option) => {
    if (!input) return true
    const normInput = removeDiacritics(input)
    const normLabel = removeDiacritics(option?.label || '')
    const normVal = removeDiacritics(option?.value || '')
    const normKey = removeDiacritics(option?.keywords || '')
    return normLabel.includes(normInput) || normVal.includes(normInput) || normKey.includes(normInput)
  }

  const save = async () => {
    const v = await form.validateFields()
    const body = {
      ...v,
      name: v.name?.trim(),
      breed: v.breed?.trim() || '',
      allergy_note: v.allergy_note?.trim() || 'Không',
      birth_date: v.birth_date ? dayjs(v.birth_date).format('YYYY-MM-DD') : null,
      weight_kg: String(v.weight_kg),
    }
    if (isCustomer) delete body.client
    else body.client = pet?.client || clientId
    setBusy(true)
    try {
      if (pet?.id) await api(`/pets/${pet.id}`, { method: 'PATCH', body })
      else await api('/pets', { method: 'POST', body })
      message.success(pet?.id ? 'Đã cập nhật hồ sơ thú.' : `Đã thêm bé ${body.name}.`)
      onSaved?.()
      onClose()
    } catch (e) {
      form.setFields(toFormErrors(e))
      if (!e.fields || !Object.keys(e.fields).length) message.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const owner = clientName || pet?.client_name

  return (
    <Modal
      centered open={!!pet} width={680} destroyOnHidden
      title={pet?.id ? `Sửa hồ sơ bé: ${pet.name || ''}` : `Thêm thú cưng${owner ? ` cho khách: ${owner}` : ''}`}
      onCancel={onClose} onOk={save} okText="Lưu" cancelText="Hủy" confirmLoading={busy}
    >
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message="Cân nặng, dị ứng và tiêm phòng giúp spa chọn gói và hóa chất an toàn cho thú." />

      {/* Khối hiển thị Avatar thông minh theo Loài */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '12px 16px',
          marginBottom: 16,
          background: 'linear-gradient(135deg, #f0fdfa 0%, #e6fffa 100%)',
          border: '1px solid #99f6e4',
          borderRadius: 10,
        }}
      >
        <PetAvatar species={activeSpecies} size={64} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Text strong style={{ fontSize: 15, color: '#0f766e' }}>
              Ảnh đại diện: Bé {SPECIES[activeSpecies] || 'Cưng'}
            </Text>
            <Tag color={activeSpecies === 'cat' ? 'purple' : 'cyan'}>
              {activeSpecies === 'cat' ? 'Avatar Mèo' : 'Avatar Chó'}
            </Tag>
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            💡 Avatar tự động đồng bộ theo <strong>Loài</strong> bạn chọn bên dưới (Chó hoặc Mèo).
          </Text>
        </div>
      </div>

      <Form form={form} layout="vertical">
        {/* Hàng 1: Tên thú (7), Loài (5), Giống (12 - 50% hàng) */}
        <Row gutter={12}>
          <Col span={7}>
            <Form.Item name="name" label={<span style={{ whiteSpace: 'nowrap' }}>Tên thú</span>} rules={[{ required: true, message: 'Nhập tên thú' }]}>
              <Input placeholder="Tên bé cưng..." />
            </Form.Item>
          </Col>
          <Col span={5}>
            <Form.Item name="species" label={<span style={{ whiteSpace: 'nowrap' }}>Loài</span>} rules={[{ required: true }]}>
              <Select options={SPECIES_OPTIONS} onChange={handleSpeciesChange} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="breed"
              label={<span style={{ whiteSpace: 'nowrap' }}>Giống ({activeSpecies === 'cat' ? 'Mèo' : 'Chó'})</span>}
              rules={[{ required: true, message: 'Vui lòng chọn hoặc nhập giống thú cưng' }]}
            >
              <Select
                showSearch
                allowClear
                placeholder={activeSpecies === 'cat' ? 'Chọn hoặc gõ tìm giống mèo...' : 'Chọn hoặc gõ tìm giống chó...'}
                options={breedOptions}
                filterOption={filterBreedOption}
                onSearch={setSearchBreedText}
                onSelect={() => setSearchBreedText('')}
                notFoundContent="Không có trong danh mục (gõ tiếp để dùng tên này)"
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* Hàng 2: Loại lông (6), Giới tính (5), Ngày sinh (6), Cân nặng (kg) (7) - tất cả cùng 1 hàng, không lệch */}
        <Row gutter={12}>
          <Col span={6}>
            <Form.Item name="coat_type" label={<span style={{ whiteSpace: 'nowrap' }}>Loại lông</span>}>
              <Select style={{ width: '100%' }} options={opts(COAT)} />
            </Form.Item>
          </Col>
          <Col span={5}>
            <Form.Item name="sex" label={<span style={{ whiteSpace: 'nowrap' }}>Giới tính</span>}>
              <Select style={{ width: '100%' }} options={opts(SEX)} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item
              name="birth_date"
              label={<span style={{ whiteSpace: 'nowrap' }}>Ngày sinh</span>}
              rules={[{ required: true, message: 'Vui lòng chọn ngày sinh của thú cưng' }]}
            >
              <DatePicker format="DD/MM/YYYY" disabledDate={(d) => d.isAfter(dayjs())} style={{ width: '100%' }} placeholder="Chọn ngày" />
            </Form.Item>
          </Col>
          <Col span={7}>
            <Form.Item
              name="weight_kg"
              label={<span style={{ whiteSpace: 'nowrap' }}>Cân nặng (kg)</span>}
              rules={[{ required: true, message: 'Nhập cân nặng' }]}
            >
              <InputNumber min={0.1} step={0.1} style={{ width: '100%' }} placeholder="VD: 4.8" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="health_tags" label="Thẻ sức khỏe / an toàn">
          <Select mode="multiple" options={tags.map((t) => ({ value: t.id, label: t.name_vi }))} placeholder="Chọn nếu có" />
        </Form.Item>
        <Form.Item name="allergy_note" label='Dị ứng (ghi "Không" nếu không có)' rules={[{ required: true, whitespace: true, message: 'Bắt buộc ghi dị ứng' }]}>
          <Input.TextArea rows={2} />
        </Form.Item>
        {!isCustomer && <Form.Item name="safety_note" label="Ghi chú an toàn nội bộ"><Input.TextArea rows={2} /></Form.Item>}
      </Form>
    </Modal>
  )
}
