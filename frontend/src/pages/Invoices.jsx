import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Alert, Avatar, Button, Card, Checkbox, Col, Descriptions, Divider, Drawer,
  Dropdown, Empty, Form, Input, Modal, Radio, Row, Segmented, Select,
  Space, Statistic, Table, Tag, Tooltip, Typography, message,
} from 'antd'
import {
  CalendarOutlined, CheckCircleOutlined, CloseCircleOutlined, DollarOutlined,
  DownloadOutlined, EyeOutlined, FileTextOutlined, IdcardOutlined,
  MoreOutlined, PlusOutlined, PrinterOutlined, QrcodeOutlined,
  ReloadOutlined, StopOutlined, UserOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { api, getToken, money, toFormErrors, unwrap } from '../api.js'
import { useAuth } from '../auth.jsx'
import RowPerPageSelect from '../components/RowPerPageSelect.jsx'
import PetAvatar from '../components/PetAvatar.jsx'

const { Title, Text, Paragraph } = Typography

export const INVOICE_STATUS = {
  unpaid: { label: 'Chưa thu', color: 'gold' },
  paid: { label: 'Đã thu tiền', color: 'success' },
  void: { label: 'Đã hủy', color: 'default' },
}

export default function Invoices() {
  const [searchParams, setSearchParams] = useSearchParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const isManager = user?.role === 'manager'
  const isFrontDesk = ['receptionist', 'manager'].includes(user?.role)

  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'unpaid' | 'paid' | 'void'
  const [methodFilter, setMethodFilter] = useState('all') // 'all' | 'cash' | 'transfer'
  const [ordering, setOrdering] = useState('-created_at')
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '')
  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '')
  const [counts, setCounts] = useState({ all: 0, unpaid: 0, paid: 0, void: 0, revenue: 0 })

  const [detailInvoice, setDetailInvoice] = useState(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Thu tiền
  const [payModalOpen, setPayModalOpen] = useState(false)
  const [payTarget, setPayTarget] = useState(null)
  const [payMethod, setPayMethod] = useState('cash')
  const [paying, setPaying] = useState(false)

  // Hủy hóa đơn
  const [voidModalOpen, setVoidModalOpen] = useState(false)
  const [voidTarget, setVoidTarget] = useState(null)
  const [voidReason, setVoidReason] = useState('')
  const [voiding, setVoiding] = useState(false)

  // Lập hóa đơn mới
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [unbilledBookings, setUnbilledBookings] = useState([])
  const [pets, setPets] = useState([])
  const [clients, setClients] = useState([])
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [packages, setPackages] = useState([])
  const [services, setServices] = useState([])
  const [createMode, setCreateMode] = useState('booking') // 'booking' | 'walk_in'
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [createForm] = Form.useForm()

  const clientAvailablePets = useMemo(() => {
    if (!selectedClientId) return []
    return pets.filter((p) => p.client === selectedClientId && p.is_active !== false)
  }, [pets, selectedClientId])

  // Nạp danh sách hóa đơn và số liệu thống kê
  const loadInvoices = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter
      if (methodFilter && methodFilter !== 'all') params.payment_method = methodFilter
      if (searchQuery) params.q = searchQuery
      if (ordering) params.ordering = ordering

      const [res, countRes] = await Promise.all([
        api('/invoices', { params }),
        api('/invoices/counts').catch(() => null),
      ])

      const list = unwrap(res)
      setInvoices(list)
      if (countRes) {
        setCounts(countRes)
      } else {
        const totalRev = list
          .filter((i) => i.status === 'paid')
          .reduce((sum, i) => sum + Number(i.total || 0), 0)
        setCounts({
          all: list.length,
          unpaid: list.filter((i) => i.status === 'unpaid').length,
          paid: list.filter((i) => i.status === 'paid').length,
          void: list.filter((i) => i.status === 'void').length,
          revenue: totalRev,
        })
      }

    } catch (e) {
      message.error(e.message || 'Không thể tải danh sách hóa đơn')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, methodFilter, ordering, searchQuery])

  useEffect(() => {
    loadInvoices()
  }, [loadInvoices])

  // Xử lý mở xem chi tiết hóa đơn nếu có ?id=... từ trang khác sang, đồng thời xóa param khỏi URL ngay lập tức
  useEffect(() => {
    const paramId = searchParams.get('id')
    if (paramId) {
      api(`/invoices/${paramId}`)
        .then((res) => {
          if (res) {
            setDetailInvoice(res)
            setDetailOpen(true)
          }
        })
        .catch(() => {})
        .finally(() => {
          // Xóa ngay ?id khỏi URL để khi đổi tab, filter, phân trang không bao giờ bị tự mở lại
          const next = new URLSearchParams(searchParams)
          next.delete('id')
          setSearchParams(next, { replace: true })
        })
    }
  }, [searchParams.get('id')])

  // Xử lý mở modal lập hóa đơn nếu có booking_id từ trang khác sang, đồng thời xóa param khỏi URL ngay lập tức
  useEffect(() => {
    const bookingParam = searchParams.get('booking_id')
    if (bookingParam && isFrontDesk) {
      openCreateModal(bookingParam)
      const next = new URLSearchParams(searchParams)
      next.delete('booking_id')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams.get('booking_id'), isFrontDesk])

  const openCreateModal = async (preselectedBookingId = null) => {
    createForm.resetFields()
    setSelectedBooking(null)
    setSelectedClientId(null)
    setCreateMode('booking')
    setCreateModalOpen(true)
    createForm.setFieldsValue({
      booking_id: preselectedBookingId ? Number(preselectedBookingId) : undefined,
      is_paid: true,
      payment_method: 'cash',
      booking_type: 'package',
    })

    try {
      const [unbilled, pts, pkgs, svcs, clts] = await Promise.all([
        api('/invoices/unbilled-bookings').catch(() => []),
        api('/pets').catch(() => []),
        api('/packages').catch(() => []),
        api('/services').catch(() => []),
        api('/clients').catch(() => []),
      ])
      const unbilledList = unwrap(unbilled)
      setUnbilledBookings(unbilledList)
      setPets(unwrap(pts))
      setPackages(unwrap(pkgs))
      setServices(unwrap(svcs))
      setClients(unwrap(clts))

      if (preselectedBookingId) {
        const match = unbilledList.find((b) => Number(b.id) === Number(preselectedBookingId))
        if (match) setSelectedBooking(match)
      }
    } catch {
      // ignore
    }
  }

  const handleSaveInvoice = async () => {
    try {
      const values = await createForm.validateFields()
      setCreateBusy(true)

      let payload = {
        is_paid: !!values.is_paid,
        payment_method: values.is_paid ? values.payment_method : undefined,
      }

      if (createMode === 'booking') {
        payload.booking_id = values.booking_id
      } else {
        payload.pet_id = values.pet_id
        payload.note = values.note
        if (values.booking_type === 'package') {
          payload.package_id = values.package_id
        } else {
          payload.services = values.services
        }
      }

      const res = await api('/invoices', {
        method: 'POST',
        body: payload,
      })

      message.success(`Đã lập hóa đơn ${res.invoice_no} thành công!`)
      setCreateModalOpen(false)
      loadInvoices()
      if (res?.id) {
        setDetailInvoice(res)
        setDetailOpen(true)
      }
    } catch (e) {
      createForm.setFields(toFormErrors(e))
      message.error(e.message || 'Lỗi khi lập hóa đơn')
    } finally {
      setCreateBusy(false)
    }
  }

  const openPay = (inv) => {
    setPayTarget(inv)
    setPayMethod('cash')
    setPayModalOpen(true)
  }

  const submitPay = async () => {
    if (!payTarget) return
    setPaying(true)
    try {
      const updated = await api(`/invoices/${payTarget.id}/pay`, {
        method: 'POST',
        body: { payment_method: payMethod },
      })
      message.success(`Đã ghi nhận thu tiền thành công cho hóa đơn ${payTarget.invoice_no}!`)
      setPayModalOpen(false)
      if (detailInvoice?.id === payTarget.id) {
        setDetailInvoice(updated)
      }
      loadInvoices()
    } catch (e) {
      message.error(e.message || 'Lỗi khi thu tiền')
    } finally {
      setPaying(false)
    }
  }

  const openVoid = (inv) => {
    setVoidTarget(inv)
    setVoidReason('')
    setVoidModalOpen(true)
  }

  const submitVoid = async () => {
    if (!voidReason.trim()) {
      message.warning('Vui lòng nhập lý do hủy hóa đơn')
      return
    }
    setVoiding(true)
    try {
      const updated = await api(`/invoices/${voidTarget.id}/void`, {
        method: 'POST',
        body: { reason: voidReason.trim() },
      })
      message.success(`Đã hủy hóa đơn ${voidTarget.invoice_no}`)
      setVoidModalOpen(false)
      if (detailInvoice?.id === voidTarget.id) {
        setDetailInvoice(updated)
      }
      loadInvoices()
    } catch (e) {
      message.error(e.message || 'Không thể hủy hóa đơn')
    } finally {
      setVoiding(false)
    }
  }

  // Trả về HTML chứng từ hóa đơn chuẩn in ấn & xuất PDF
  const getInvoicePrintHtml = (inv) => {
    if (!inv) return ''
    const linesHtml = (inv.lines || [])
      .map(
        (l, idx) => `
        <tr>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${idx + 1}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">
            <strong>${l.description}</strong>
          </td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${l.quantity}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${money(l.unit_price)}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #0f8b8d;">${money(l.amount)}</td>
        </tr>
      `
      )
      .join('')

    const statusText = inv.status === 'paid' ? 'ĐÃ THANH TOÁN' : inv.status === 'unpaid' ? 'CHƯA THANH TOÁN' : 'HÓA ĐƠN ĐÃ HỦY'
    const statusBg = inv.status === 'paid' ? '#10b981' : inv.status === 'unpaid' ? '#f59e0b' : '#64748b'
    const logoSrc = `${window.location.origin}/petspa-logo.svg`
    const petAvatarSrc = `${window.location.origin}/avatars/${inv.pet_species === 'cat' ? 'cat.svg' : 'dog.svg'}`

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Hoa_Don_${inv.invoice_no}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 20px;
            font-size: 13px;
            line-height: 1.5;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #0f8b8d;
            padding-bottom: 16px;
            margin-bottom: 20px;
          }
          .title {
            color: #0f8b8d;
            font-size: 22px;
            font-weight: 800;
            margin: 0;
            letter-spacing: -0.5px;
          }
          .badge {
            display: inline-block;
            background: ${statusBg};
            color: #fff;
            padding: 4px 12px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 12px;
            margin-top: 6px;
          }
          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 20px;
            background: #f8fafc;
            padding: 14px;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th {
            background: #f1f5f9;
            color: #475569;
            padding: 10px;
            font-size: 12px;
            border-bottom: 2px solid #cbd5e1;
          }
          .total-box {
            text-align: right;
            margin-top: 10px;
            margin-bottom: 30px;
          }
          .total-amount {
            font-size: 22px;
            color: #0f8b8d;
            font-weight: 800;
          }
          .footer {
            border-top: 1px dashed #cbd5e1;
            padding-top: 16px;
            text-align: center;
            color: #64748b;
            font-size: 12px;
          }
          @media print {
            body { padding: 0; }
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="display: flex; align-items: center; gap: 14px;">
            <img src="${logoSrc}" style="width: 46px; height: 46px; border-radius: 12px; object-fit: contain;" alt="Logo" />
            <div>
              <h1 class="title">PET SPA AI</h1>
              <div style="color: #64748b; font-size: 13px;">Hệ thống Spa & Chăm sóc Thú cưng Cao cấp</div>
              <div style="color: #64748b; font-size: 12px; margin-top: 2px;">📍 25 Lê Văn Thịnh, P. Bình Trưng Tây, TP. Thủ Đức, TP.HCM · 📞 Hotline: 0909 111 222</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 16px; font-weight: 700; color: #0b3d3f;">HÓA ĐƠN DỊCH VỤ</div>
            <div style="font-size: 13px; color: #64748b;">Số HĐ: <strong>${inv.invoice_no}</strong></div>
            <div style="font-size: 12px; color: #64748b;">Ngày lập: ${dayjs(inv.created_at).format('DD/MM/YYYY HH:mm')}</div>
            <div class="badge">${statusText}</div>
          </div>
        </div>

        <div class="grid">
          <div>
            <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; color: #0f8b8d; margin-bottom: 8px;">
              <span style="display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; background: #0f8b8d; border-radius: 50%; color: #fff;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </span>
              <span>KHÁCH HÀNG:</span>
            </div>
            <div><strong>${inv.client_name || 'Khách vãng lai'}</strong></div>
            <div>SĐT: <strong>${inv.client_phone || '—'}</strong></div>
            <div>Địa chỉ: ${inv.client_address || '—'}</div>
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; color: #0f8b8d; margin-bottom: 8px;">
              <img src="${petAvatarSrc}" style="width: 22px; height: 22px; border-radius: 50%; object-fit: cover;" alt="Pet" />
              <span>BÉ CƯNG ĐƯỢC CHĂM SÓC:</span>
            </div>
            <div>Tên bé: <strong>${inv.pet_name || '—'}</strong> (${inv.pet_species === 'dog' ? 'Chó' : 'Mèo'}${inv.pet_breed ? ` · ${inv.pet_breed}` : ''})</div>
            <div>Cân nặng: <strong>${inv.pet_weight_kg || '—'} kg</strong> · Phân hạng: <strong>Size ${inv.pet_size_class || '—'}</strong></div>
            <div>KTV phụ trách: ${inv.staff_name || 'Đội ngũ chuyên viên'}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">STT</th>
              <th style="text-align: left;">Nội dung dịch vụ / Gói spa</th>
              <th style="width: 50px; text-align: center;">SL</th>
              <th style="width: 120px; text-align: right;">Đơn giá</th>
              <th style="width: 130px; text-align: right;">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml || '<tr><td colspan="5" style="text-align:center; padding: 12px;">Chi tiết dịch vụ spa trọn gói</td></tr>'}
          </tbody>
        </table>

        <div class="total-box">
          <div style="margin-bottom: 4px; color: #64748b;">Tổng tiền dịch vụ: <strong>${money(inv.subtotal || inv.total)}</strong></div>
          <div style="margin-bottom: 6px; font-size: 15px;">Tổng cộng thanh toán: <span class="total-amount">${money(inv.total)}</span></div>
          <div style="font-size: 12px; color: #64748b;">
            Hình thức: <strong>${inv.payment_method === 'cash' ? 'Tiền mặt tại quầy' : inv.payment_method === 'transfer' ? 'Chuyển khoản ngân hàng' : 'Chưa thanh toán'}</strong>
            ${inv.paid_at ? ` · Thu lúc: ${dayjs(inv.paid_at).format('HH:mm DD/MM/YYYY')}` : ''}
            ${inv.received_by_name ? ` · Thu ngân: ${inv.received_by_name}` : ''}
          </div>
        </div>

        ${
          inv.payment_method === 'transfer' || inv.status === 'unpaid'
            ? `
          <div style="display: flex; align-items: center; justify-content: space-between; background: #f0fdfa; border: 1px solid #99f6e4; padding: 12px 16px; border-radius: 8px; margin-bottom: 24px;">
            <div>
              <div style="font-weight: 700; color: #0f766e; font-size: 13px;">💳 THÔNG TIN CHUYỂN KHOẢN SPA:</div>
              <div style="font-size: 12px; margin-top: 2px;">Ngân hàng: <strong>Vietcombank (VCB)</strong> · Số TK: <strong>1028999888</strong></div>
              <div style="font-size: 12px;">Chủ TK: <strong>PET SPA LÔNG MƯỢT</strong> · Cú pháp: <strong>${inv.invoice_no}</strong></div>
            </div>
            <div style="text-align: right; font-size: 11px; color: #0f766e;">
              ✅ Quét mã QR tại quầy để thanh toán tự động
            </div>
          </div>
        `
            : ''
        }

        <div class="footer">
          <div style="font-weight: 600; color: #334155; margin-bottom: 4px;">❤️ CẢM ƠN QUÝ KHÁCH ĐÃ TIN TƯỞNG GỬI GẮM BÉ CƯNG TẠI PET SPA AI!</div>
          <div>Mọi thắc mắc hoặc cần hỗ trợ thêm, vui lòng liên hệ hotline 0909 111 222 để được chăm sóc tận tình.</div>
        </div>
      </body>
      </html>
    `
  }

  // In hóa đơn trực tiếp ra máy in / Print preview
  const handlePrint = (inv) => {
    if (!inv) return
    const prevTitle = document.title
    document.title = `Hoa_Don_${inv.invoice_no}`

    const printWin = window.open('', '_blank', 'width=850,height=900')
    if (printWin) {
      printWin.document.open()
      printWin.document.write(getInvoicePrintHtml(inv))
      printWin.document.title = `Hoa_Don_${inv.invoice_no}`
      printWin.document.close()
      setTimeout(() => {
        printWin.focus()
        printWin.print()
        document.title = prevTitle
      }, 350)
    } else {
      window.print()
      document.title = prevTitle
    }
  }

  // Tải file PDF trực tiếp về máy tính (tự động điền đúng tên file Hoa_Don_{so_hd}.pdf)
  const handleDownloadPdf = async (inv) => {
    if (!inv) return
    const hide = message.loading(`Đang tải hóa đơn ${inv.invoice_no}.pdf...`, 0)
    try {
      const token = getToken()
      const res = await fetch(`/api/v1/invoices/${inv.id}/pdf`, {
        headers: token ? { Authorization: `Token ${token}` } : {},
      })
      if (!res.ok) {
        throw new Error('Không thể tải file PDF từ máy chủ')
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Hoa_Don_${inv.invoice_no}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      message.success(`Đã tải hóa đơn Hoa_Don_${inv.invoice_no}.pdf thành công!`)
    } catch (err) {
      message.error(err.message || 'Lỗi khi tải file PDF')
    } finally {
      hide()
    }
  }

  // Cột bảng hóa đơn
  const columns = [
    {
      title: 'Số Hóa Đơn',
      dataIndex: 'invoice_no',
      width: 170,
      render: (no, r) => (
        <div>
          <Button
            type="link"
            style={{ padding: 0, fontWeight: 700, fontSize: 14, color: '#0f8b8d' }}
            onClick={() => { setDetailInvoice(r); setDetailOpen(true) }}
          >
            {no}
          </Button>
          {r.booking && (
            <div style={{ marginTop: 2 }}>
              <Tag
                color="default"
                style={{ cursor: 'pointer', fontSize: 11, padding: '0 6px', margin: 0, borderRadius: 4 }}
                onClick={(e) => {
                  e.stopPropagation()
                  nav(`/app/lich-hen?id=${r.booking}`)
                }}
                title="Bấm để xem lịch hẹn liên quan"
              >
                📅 Lịch: #{r.booking}
              </Tag>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Khách hàng',
      key: 'client',
      width: 220,
      render: (_, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar style={{ background: '#0f8b8d', flexShrink: 0 }} icon={<UserOutlined />} />
          <div>
            <Text
              strong
              style={{ fontSize: 14, color: '#0b3d3f', display: 'block', cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation()
                nav(`/app/khach-hang?q=${r.client_name || ''}`)
              }}
              title="Xem hồ sơ khách hàng"
            >
              {r.client_name || 'Khách vãng lai'}
            </Text>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              <span>📞 {r.client_phone || '—'}</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Thú cưng',
      key: 'pet',
      width: 210,
      render: (_, r) => (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation()
            nav(`/app/khach-hang?q=${r.client_name || ''}`)
          }}
          title="Bấm để xem chi tiết thú cưng"
        >
          <PetAvatar
            species={r.pet_species}
            size={38}
            style={{
              border: '2px solid #ffffff',
              boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
              flexShrink: 0,
            }}
          />
          <div>
            <Text strong style={{ fontSize: 14, color: '#0f766e', display: 'block' }}>
              {r.pet_name || 'Bé cưng'}
            </Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
              <Tag color="cyan" style={{ margin: 0, fontSize: 10, lineHeight: '18px', padding: '0 4px', borderRadius: 4 }}>
                {r.pet_species === 'dog' ? '🐶 Chó' : r.pet_species === 'cat' ? '🐱 Mèo' : r.pet_species || 'Thú cưng'}
                {r.pet_breed ? ` · ${r.pet_breed}` : ''}
              </Tag>
              {r.pet_size_class && (
                <Tag color="blue" style={{ margin: 0, fontSize: 10, lineHeight: '18px', padding: '0 4px', borderRadius: 4 }}>
                  Size {r.pet_size_class}
                </Tag>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Tổng tiền',
      dataIndex: 'total',
      width: 140,
      render: (t) => <Text strong style={{ color: '#0f8b8d', fontSize: 15 }}>{money(t)}</Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 130,
      render: (st) => {
        const s = INVOICE_STATUS[st] || { label: st, color: 'default' }
        return <Tag color={s.color} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4 }}>{s.label}</Tag>
      },
    },
    {
      title: 'Hình thức',
      dataIndex: 'payment_method',
      width: 130,
      render: (m) => (
        m === 'cash' ? (
          <Tag color="geekblue">💵 Tiền mặt</Tag>
        ) : m === 'transfer' ? (
          <Tag color="purple">💳 Chuyển khoản</Tag>
        ) : (
          <Text type="secondary">—</Text>
        )
      ),
    },
    {
      title: 'Thao tác',
      key: 'act',
      width: 140,
      render: (_, r) => {
        const moreItems = [
          {
            key: 'view',
            label: 'Xem chi tiết',
            icon: <EyeOutlined />,
            onClick: () => {
              setDetailInvoice(r)
              setDetailOpen(true)
            },
          },
          {
            key: 'print',
            label: 'In hóa đơn',
            icon: <PrinterOutlined />,
            onClick: () => handlePrint(r),
          },
          {
            key: 'download_pdf',
            label: 'Tải PDF hóa đơn',
            icon: <DownloadOutlined />,
            onClick: () => handleDownloadPdf(r),
          },
          ...(isFrontDesk && r.status === 'unpaid'
            ? [
                {
                  type: 'divider',
                },
                {
                  key: 'pay',
                  label: 'Ghi nhận thu tiền',
                  icon: <DollarOutlined style={{ color: '#0f8b8d' }} />,
                  onClick: () => openPay(r),
                },
              ]
            : []),
          ...(isManager && r.status !== 'void'
            ? [
                {
                  type: 'divider',
                },
                {
                  key: 'void',
                  label: 'Hủy hóa đơn này',
                  icon: <CloseCircleOutlined />,
                  danger: true,
                  onClick: () => openVoid(r),
                },
              ]
            : []),
        ]

        return (
          <Space size={6} onClick={(e) => e.stopPropagation()}>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={(e) => {
                e.stopPropagation()
                setDetailInvoice(r)
                setDetailOpen(true)
              }}
              style={{ borderRadius: 6 }}
            >
              Xem
            </Button>
            {isFrontDesk && r.status === 'unpaid' && (
              <Button
                type="primary"
                size="small"
                icon={<DollarOutlined />}
                onClick={(e) => {
                  e.stopPropagation()
                  openPay(r)
                }}
                style={{ background: '#0f8b8d', borderColor: '#0f8b8d', borderRadius: 6 }}
              >
                Thu tiền
              </Button>
            )}
            <span onClick={(e) => e.stopPropagation()}>
              <Dropdown
                menu={{ items: moreItems }}
                trigger={['click']}
                placement="bottomRight"
              >
                <Button
                  size="small"
                  icon={<MoreOutlined />}
                  style={{ borderRadius: 6, padding: '0 8px' }}
                />
              </Dropdown>
            </span>
          </Space>
        )
      },
    },
  ]

  return (
    <div>
      {/* ===== TIÊU ĐỀ & NÚT THAO TÁC TRANG ===== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0, color: '#0b3d3f' }}>
            <DollarOutlined style={{ marginRight: 8, color: '#0f8b8d' }} />
            Hóa Đơn & Thu Ngân
          </Title>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            Quản lý thanh toán dịch vụ spa, ghi nhận tiền mặt/chuyển khoản và in chứng từ tài chính
          </Paragraph>
        </div>

        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={loadInvoices}>
            Làm mới
          </Button>
          {isFrontDesk && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openCreateModal()}
              style={{ background: '#0f8b8d', borderColor: '#0f8b8d', fontWeight: 600, borderRadius: 6 }}
            >
              Lập hóa đơn mới
            </Button>
          )}
        </Space>
      </div>

      {/* ===== THỐNG KÊ NHANH ===== */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <Statistic
              title="Tổng số hóa đơn"
              value={counts.all}
              valueStyle={{ fontWeight: 700, color: '#1e293b' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <Statistic
              title="Hóa đơn chờ thu"
              value={counts.unpaid}
              valueStyle={{ color: counts.unpaid > 0 ? '#d97706' : '#10b981', fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <Statistic
              title="Doanh thu thực thu"
              value={money(counts.revenue)}
              valueStyle={{ color: '#0f8b8d', fontWeight: 800 }}
            />
          </Card>
        </Col>
      </Row>

      {/* ===== THANH TÌM KIẾM & BỘ LỌC ĐẶT NGAY TRÊN BẢNG (ĐỒNG BỘ TRANG KHÁCH HÀNG) ===== */}
      <div
        style={{
          background: '#fff',
          padding: '12px 16px',
          borderRadius: 10,
          border: '1px solid #e8f0f0',
          marginBottom: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Space wrap size={10} style={{ flex: 1 }}>
          <Input.Search
            placeholder="Tìm theo số HĐ, tên khách, SĐT, thú cưng..."
            allowClear
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value)
              if (!e.target.value && searchQuery) {
                setPage(1)
                setSearchQuery('')
              }
            }}
            onSearch={(v) => {
              setPage(1)
              setSearchQuery(v ? v.trim() : '')
            }}
            style={{ width: 280 }}
          />

          <Segmented
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val)
              setPage(1)
              setDetailOpen(false)
            }}
            options={[
              { label: `Tất cả (${counts.all})`, value: 'all' },
              { label: `Chờ thu (${counts.unpaid})`, value: 'unpaid' },
              { label: `Đã thu (${counts.paid})`, value: 'paid' },
              { label: `Đã hủy (${counts.void})`, value: 'void' },
            ]}
          />

          <Select
            placeholder="Hình thức thanh toán"
            value={methodFilter}
            onChange={(val) => {
              setMethodFilter(val)
              setPage(1)
            }}
            style={{ width: 170 }}
            options={[
              { value: 'all', label: 'Tất cả hình thức' },
              { value: 'cash', label: '💵 Tiền mặt' },
              { value: 'transfer', label: '💳 Chuyển khoản' },
            ]}
          />

          <Select
            value={ordering}
            onChange={(val) => {
              setOrdering(val)
              setPage(1)
            }}
            style={{ width: 175 }}
            options={[
              { value: '-created_at', label: '🕒 Tạo mới nhất' },
              { value: 'created_at', label: '⏳ Cũ nhất' },
              { value: '-total', label: '💰 Tổng tiền cao nhất' },
              { value: 'total', label: '🏷️ Tổng tiền thấp nhất' },
            ]}
          />
        </Space>

        <Space size={12}>
          <RowPerPageSelect value={pageSize} onChange={(ps) => { setPageSize(ps); setPage(1); }} />
        </Space>
      </div>

      {statusFilter === 'unpaid' && counts.unpaid > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12, borderRadius: 8 }}
          message={`Có ${counts.unpaid} hóa đơn đang chờ thu tiền.`}
          description="Bạn có thể bấm trực tiếp nút 'Thu tiền' ở từng dòng để xác nhận thanh toán tiền mặt hoặc chuyển khoản."
        />
      )}

      {/* ===== BẢNG DANH SÁCH HÓA ĐƠN ===== */}
      <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 10, overflow: 'hidden' }}>
        <Table
          dataSource={invoices}
          columns={columns}
          rowKey="id"
          loading={loading}
          scroll={{ x: 'max-content' }}
          rowClassName={() => 'clickable-row'}
          onRow={(record) => ({
            onClick: () => {
              setDetailInvoice(record)
              setDetailOpen(true)
            },
            style: { cursor: 'pointer' },
          })}
          pagination={{
            position: ['bottomRight'],
            current: page,
            pageSize: pageSize,
            showSizeChanger: false,
            showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} hóa đơn`,
            onChange: (p) => setPage(p),
          }}
          locale={{ emptyText: <Empty description="Chưa có hóa đơn nào phù hợp." /> }}
        />
      </Card>

      {/* ===== DRAWER XEM CHI TIẾT & IN / XUẤT PDF HÓA ĐƠN ===== */}
      <Drawer
        title={
          detailInvoice ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <FileTextOutlined style={{ color: '#0f8b8d', fontSize: 20 }} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Text strong style={{ fontSize: 16 }}>Hóa đơn: {detailInvoice.invoice_no}</Text>
                  <Tag color={INVOICE_STATUS[detailInvoice.status]?.color}>
                    {INVOICE_STATUS[detailInvoice.status]?.label}
                  </Tag>
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Lập lúc: {dayjs(detailInvoice.created_at).format('HH:mm DD/MM/YYYY')}
                </div>
              </div>
            </div>
          ) : null
        }
        placement="right"
        width={620}
        onClose={() => {
          setDetailOpen(false)
          setDetailInvoice(null)
          if (searchParams.get('id')) {
            const next = new URLSearchParams(searchParams)
            next.delete('id')
            setSearchParams(next, { replace: true })
          }
        }}
        open={detailOpen}
        extra={
          <Space>
            <Button icon={<PrinterOutlined />} onClick={() => handlePrint(detailInvoice)}>
              In hóa đơn
            </Button>
            <Button icon={<DownloadOutlined />} onClick={() => handleDownloadPdf(detailInvoice)}>
              Tải PDF
            </Button>
            {isFrontDesk && detailInvoice?.status === 'unpaid' && (
              <Button
                type="primary"
                icon={<DollarOutlined />}
                onClick={() => openPay(detailInvoice)}
                style={{ background: '#0f8b8d', borderColor: '#0f8b8d' }}
              >
                Thu tiền ngay
              </Button>
            )}
          </Space>
        }
      >
        {detailInvoice && (
          <div>
            {/* Thanh công cụ nhanh */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                background: '#f8fafc',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                marginBottom: 16,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <Space size={8} wrap>
                <Button
                  icon={<PrinterOutlined />}
                  onClick={() => handlePrint(detailInvoice)}
                >
                  In hóa đơn
                </Button>
                <Button
                  type="primary"
                  ghost
                  icon={<DownloadOutlined />}
                  onClick={() => handleDownloadPdf(detailInvoice)}
                >
                  Tải hóa đơn (PDF)
                </Button>
                {detailInvoice.booking && (
                  <Button
                    icon={<CalendarOutlined />}
                    onClick={() => {
                      setDetailOpen(false)
                      nav(`/app/lich-hen?id=${detailInvoice.booking}`)
                    }}
                  >
                    Xem lịch hẹn #{detailInvoice.booking}
                  </Button>
                )}
                {isManager && detailInvoice.status !== 'void' && (
                  <Button
                    danger
                    icon={<CloseCircleOutlined />}
                    onClick={() => openVoid(detailInvoice)}
                  >
                    Hủy hóa đơn
                  </Button>
                )}
              </Space>
            </div>

            {/* Khung Phiếu thanh toán */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '20px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 4 }}>
                  <img src="/petspa-logo.svg" alt="Pet Spa AI" style={{ width: 36, height: 36, borderRadius: 10 }} />
                  <Title level={4} style={{ margin: 0, color: '#0b3d3f' }}>PET SPA AI - SPA THÚ CƯNG</Title>
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>25 Lê Văn Thịnh, P. Bình Trưng Tây, TP. Thủ Đức, TP.HCM · Hotline: 0909 111 222</Text>
                <Divider style={{ margin: '10px 0' }} />
                <Title level={4} style={{ margin: '4px 0', color: '#0f8b8d' }}>PHIẾU THANH TOÁN DỊCH VỤ</Title>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Số: <strong>{detailInvoice.invoice_no}</strong> — Ngày: {dayjs(detailInvoice.created_at).format('DD/MM/YYYY HH:mm')}
                </Text>
              </div>

              <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
                <Descriptions.Item label="Khách hàng">
                  <Space align="center" size={8}>
                    <Avatar style={{ background: '#0f8b8d' }} icon={<UserOutlined />} size={24} />
                    <Text strong style={{ color: '#0b3d3f' }}>{detailInvoice.client_name || 'Khách vãng lai'}</Text>
                    {detailInvoice.client_phone ? <Text type="secondary">(📞 {detailInvoice.client_phone})</Text> : null}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="Bé cưng">
                  <Space align="center" size={8}>
                    <PetAvatar species={detailInvoice.pet_species} size={26} />
                    <Text strong style={{ color: '#0f766e' }}>{detailInvoice.pet_name || '—'}</Text>
                    <Tag color="cyan" style={{ margin: 0 }}>
                      {detailInvoice.pet_species === 'dog' ? 'Chó' : 'Mèo'}{detailInvoice.pet_breed ? ` · ${detailInvoice.pet_breed}` : ''}
                    </Tag>
                    {detailInvoice.pet_size_class && <Tag color="blue" style={{ margin: 0 }}>Size {detailInvoice.pet_size_class}</Tag>}
                  </Space>
                </Descriptions.Item>
                {detailInvoice.staff_name && (
                  <Descriptions.Item label="Kỹ thuật viên phụ trách">
                    {detailInvoice.staff_name}
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="Trạng thái">
                  <Tag color={INVOICE_STATUS[detailInvoice.status]?.color}>
                    {INVOICE_STATUS[detailInvoice.status]?.label}
                  </Tag>
                </Descriptions.Item>
                {detailInvoice.status === 'paid' && (
                  <>
                    <Descriptions.Item label="Hình thức thanh toán">
                      {detailInvoice.payment_method === 'cash' ? '💵 Tiền mặt' : '💳 Chuyển khoản ngân hàng'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Thời gian thu">
                      {dayjs(detailInvoice.paid_at).format('HH:mm DD/MM/YYYY')}
                    </Descriptions.Item>
                    <Descriptions.Item label="Thu ngân ghi nhận">
                      {detailInvoice.received_by_name || 'Hệ thống'}
                    </Descriptions.Item>
                  </>
                )}
                {detailInvoice.status === 'void' && (
                  <Descriptions.Item label="Lý do hủy">
                    <Text type="danger">{detailInvoice.void_reason || 'Không có lý do cụ thể'}</Text>
                  </Descriptions.Item>
                )}
              </Descriptions>

              <Title level={5} style={{ marginBottom: 8, fontSize: 14 }}>Chi tiết bảng kê dịch vụ:</Title>
              <Table
                dataSource={detailInvoice.lines || []}
                rowKey="id"
                pagination={false}
                size="small"
                columns={[
                  { title: 'Dịch vụ / Gói', dataIndex: 'description' },
                  { title: 'SL', dataIndex: 'quantity', width: 50, align: 'center' },
                  { title: 'Đơn giá', dataIndex: 'unit_price', align: 'right', render: (p) => money(p) },
                  { title: 'Thành tiền', dataIndex: 'amount', align: 'right', render: (a) => <Text strong>{money(a)}</Text> },
                ]}
              />

              <div style={{ textAlign: 'right', marginTop: 16 }}>
                <Paragraph style={{ fontSize: 14, margin: '4px 0' }}>
                  Tổng cộng: <Text strong style={{ fontSize: 20, color: '#0f8b8d' }}>{money(detailInvoice.total)}</Text>
                </Paragraph>
                <Text type="secondary" italic style={{ fontSize: 12 }}>
                  Cảm ơn Quý khách đã tin tưởng và đồng hành cùng Pet Spa AI!
                </Text>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* ===== MODAL LẬP HÓA ĐƠN MỚI TỪ LỊCH HOẶC TẠI QUẦY ===== */}
      <Modal
        centered
        open={createModalOpen}
        title="Lập Hóa Đơn Thu Ngân"
        onCancel={() => setCreateModalOpen(false)}
        onOk={handleSaveInvoice}
        confirmLoading={createBusy}
        okText="Xác nhận tạo & Xuất hóa đơn"
        cancelText="Hủy"
        width={700}
        destroyOnHidden
      >
        <Segmented
          block
          size="large"
          value={createMode}
          onChange={(val) => {
            setCreateMode(val)
            setSelectedBooking(null)
            setSelectedClientId(null)
            createForm.setFieldValue('client_id', undefined)
            createForm.setFieldValue('pet_id', undefined)
          }}
          options={[
            {
              label: (
                <div style={{ padding: '6px 0', fontWeight: 600, fontSize: 13 }}>
                  <CalendarOutlined style={{ marginRight: 8, color: '#0f8b8d' }} />
                  Xuất từ Lịch hẹn (Khách đặt lịch)
                </div>
              ),
              value: 'booking',
            },
            {
              label: (
                <div style={{ padding: '6px 0', fontWeight: 600, fontSize: 13 }}>
                  <UserOutlined style={{ marginRight: 8, color: '#0f8b8d' }} />
                  Thu ngân trực tiếp (Khách vãng lai / Walk-in)
                </div>
              ),
              value: 'walk_in',
            },
          ]}
          style={{ marginBottom: 20 }}
        />

        <Form form={createForm} layout="vertical">
          {createMode === 'booking' ? (
            <div>
              <Form.Item
                name="booking_id"
                label="Chọn lịch hẹn cần xuất hóa đơn"
                rules={[{ required: true, message: 'Vui lòng chọn lịch hẹn' }]}
              >
                <Select
                  showSearch
                  placeholder="Chọn lịch hẹn cần lập hóa đơn..."
                  filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                  onChange={(val) => {
                    const match = unbilledBookings.find((b) => b.id === val)
                    setSelectedBooking(match || null)
                  }}
                  options={unbilledBookings.map((b) => ({
                    value: b.id,
                    label: `#BK-${b.id} — ${b.client_name} (${b.client_phone}) · Bé: ${b.pet_name} (${b.pet_species === 'dog' ? 'Chó' : 'Mèo'}, Size ${b.pet_size || '—'}) · ${b.package_name} [${money(b.total_price)}]`,
                  }))}
                />
              </Form.Item>

              {selectedBooking && (
                <div
                  style={{
                    background: '#f0fdfa',
                    border: '1px solid #99f6e4',
                    padding: '12px 14px',
                    borderRadius: 8,
                    marginBottom: 16,
                  }}
                >
                  <Row gutter={[12, 8]}>
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 12 }}>Khách hàng:</Text>
                      <div><strong>{selectedBooking.client_name}</strong> (📞 {selectedBooking.client_phone})</div>
                    </Col>
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 12 }}>Bé cưng & Phân hạng size:</Text>
                      <div>
                        <strong>{selectedBooking.pet_name}</strong> ({selectedBooking.pet_species === 'dog' ? 'Chó' : 'Mèo'} · Size {selectedBooking.pet_size || '—'})
                      </div>
                    </Col>
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 12 }}>Kỹ thuật viên thực hiện:</Text>
                      <div>{selectedBooking.staff_name || 'Đội ngũ chuyên viên'}</div>
                    </Col>
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 12 }}>Gói & Dòng tiền dự kiến:</Text>
                      <div>
                        <strong>{selectedBooking.package_name}</strong>: <Text strong style={{ color: '#0f8b8d', fontSize: 15 }}>{money(selectedBooking.total_price)}</Text>
                      </div>
                    </Col>
                  </Row>
                </div>
              )}

              {unbilledBookings.length === 0 && (
                <Alert
                  type="info"
                  showIcon
                  message="Không có lịch hẹn nào đang chờ xuất hóa đơn."
                  description='Nếu khách sử dụng dịch vụ tại quầy không qua đặt trước, vui lòng chuyển sang mục "Thu ngân trực tiếp (Khách vãng lai)".'
                  style={{ marginBottom: 12 }}
                />
              )}
            </div>
          ) : (
            <div>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item
                    name="client_id"
                    label="1. Chọn khách hàng (chủ nuôi)"
                    rules={[{ required: true, message: 'Vui lòng chọn khách hàng' }]}
                  >
                    <Select
                      showSearch
                      placeholder="Gõ tìm khách hàng theo họ tên hoặc SĐT..."
                      filterOption={(input, opt) => (opt?.searchStr ?? '').toLowerCase().includes(input.toLowerCase())}
                      onChange={(val) => {
                        setSelectedClientId(val)
                        createForm.setFieldValue('client_id', val)
                        createForm.setFieldValue('pet_id', undefined)
                        const cPets = pets.filter((p) => p.client === val && p.is_active !== false)
                        if (cPets.length === 1) {
                          createForm.setFieldValue('pet_id', cPets[0].id)
                        }
                      }}
                      options={clients.map((c) => ({
                        value: c.id,
                        searchStr: `${c.full_name} ${c.phone || ''}`,
                        label: (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>
                              <Avatar style={{ background: '#0f8b8d', marginRight: 8 }} icon={<UserOutlined />} size={20} />
                              <strong>{c.full_name}</strong> {c.phone ? `(📞 ${c.phone})` : ''}
                            </span>
                            <Tag color="cyan" style={{ margin: 0, fontSize: 11 }}>
                              {pets.filter((p) => p.client === c.id).length} bé cưng
                            </Tag>
                          </div>
                        ),
                      }))}
                    />
                  </Form.Item>
                </Col>

                <Col span={12}>
                  <Form.Item
                    name="pet_id"
                    label="2. Chọn bé cưng của khách hàng này"
                    rules={[{ required: true, message: 'Vui lòng chọn bé cưng thực hiện dịch vụ' }]}
                  >
                    <Select
                      placeholder={selectedClientId ? 'Chọn bé cưng của khách...' : 'Vui lòng chọn khách hàng ở mục 1 trước...'}
                      disabled={!selectedClientId || clientAvailablePets.length === 0}
                      options={clientAvailablePets.map((p) => ({
                        value: p.id,
                        label: (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <PetAvatar species={p.species} size={22} />
                            <strong>{p.name}</strong>
                            <span style={{ color: '#64748b', fontSize: 12 }}>
                              ({p.species === 'dog' ? 'Chó' : 'Mèo'}{p.breed ? ` · ${p.breed}` : ''} · {p.weight_kg}kg · Size {p.size_class || '—'})
                            </span>
                          </div>
                        ),
                      }))}
                    />
                  </Form.Item>
                </Col>
              </Row>

              {selectedClientId && clientAvailablePets.length === 0 && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16, borderRadius: 8 }}
                  message="Khách hàng này chưa có thú cưng đăng ký"
                  description="Vui lòng thêm thú cưng trong mục Quản lý Khách hàng trước khi lập dịch vụ tại quầy."
                />
              )}

              <Form.Item name="booking_type" label="Hình thức tính tiền">
                <Radio.Group>
                  <Radio value="package">Gói combo</Radio>
                  <Radio value="services">Dịch vụ lẻ</Radio>
                </Radio.Group>
              </Form.Item>

              <Form.Item noStyle shouldUpdate={(p, c) => p.booking_type !== c.booking_type}>
                {({ getFieldValue }) =>
                  getFieldValue('booking_type') === 'package' ? (
                    <Form.Item name="package_id" label="Chọn gói dịch vụ" rules={[{ required: true, message: 'Chọn gói combo' }]}>
                      <Select
                        placeholder="Chọn gói..."
                        options={packages.map((pkg) => ({
                          value: pkg.id,
                          label: `${pkg.name} (${pkg.items?.map((i) => i.service_name).join(' + ')})`,
                        }))}
                      />
                    </Form.Item>
                  ) : (
                    <Form.Item name="services" label="Chọn các dịch vụ lẻ" rules={[{ required: true, message: 'Chọn dịch vụ' }]}>
                      <Select
                        mode="multiple"
                        placeholder="Chọn các dịch vụ lẻ..."
                        options={services.map((s) => ({
                          value: s.id,
                          label: `${s.name} (~${s.duration_minutes} phút)`,
                        }))}
                      />
                    </Form.Item>
                  )
                }
              </Form.Item>

              <Form.Item name="note" label="Ghi chú dịch vụ tại quầy">
                <Input placeholder="ví dụ: Khách vãng lai tắm dưỡng và cắt móng nhanh..." />
              </Form.Item>
            </div>
          )}

          <Divider style={{ margin: '16px 0' }} />

          <Row gutter={16} align="middle">
            <Col span={10}>
              <Form.Item name="is_paid" valuePropName="checked" style={{ marginBottom: 0 }}>
                <Checkbox defaultChecked>
                  <Text strong>Ghi nhận đã thu tiền ngay</Text>
                </Checkbox>
              </Form.Item>
            </Col>

            <Col span={14}>
              <Form.Item noStyle shouldUpdate={(p, c) => p.is_paid !== c.is_paid}>
                {({ getFieldValue }) =>
                  getFieldValue('is_paid') ? (
                    <Form.Item name="payment_method" label="Phương thức nhận tiền" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                      <Radio.Group>
                        <Radio value="cash">💵 Tiền mặt</Radio>
                        <Radio value="transfer">💳 Chuyển khoản (VietQR)</Radio>
                      </Radio.Group>
                    </Form.Item>
                  ) : null
                }
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* ===== MODAL THU TIỀN HÓA ĐƠN CÓ SẴN ===== */}
      <Modal
        centered
        title="Ghi nhận thanh toán hóa đơn"
        open={payModalOpen}
        onCancel={() => setPayModalOpen(false)}
        onOk={submitPay}
        confirmLoading={paying}
        okText="Xác nhận đã thu tiền"
        cancelText="Đóng"
        width={500}
      >
        <div style={{ background: '#f8fafc', padding: '14px', borderRadius: 8, marginBottom: 16 }}>
          <Paragraph style={{ margin: '4px 0' }}>Hóa đơn: <Text strong>{payTarget?.invoice_no}</Text></Paragraph>
          <Paragraph style={{ margin: '4px 0' }}>Khách hàng: <Text strong>{payTarget?.client_name}</Text> (📞 {payTarget?.client_phone || '—'})</Paragraph>
          <Paragraph style={{ margin: '4px 0' }}>Thú cưng: <Text strong>{payTarget?.pet_name}</Text></Paragraph>
          <Divider style={{ margin: '8px 0' }} />
          <Paragraph style={{ margin: '4px 0' }}>
            Số tiền cần thu: <Text strong style={{ fontSize: 20, color: '#0f8b8d' }}>{money(payTarget?.total)}</Text>
          </Paragraph>
        </div>

        <Paragraph strong style={{ marginBottom: 8 }}>Chọn hình thức nhận tiền:</Paragraph>
        <Radio.Group value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={{ width: '100%' }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Radio value="cash" style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, width: '100%' }}>
              💵 <strong>Tiền mặt tại quầy</strong>
            </Radio>
            <Radio value="transfer" style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, width: '100%' }}>
              💳 <strong>Chuyển khoản ngân hàng / Quét mã VietQR</strong>
            </Radio>
          </Space>
        </Radio.Group>

        {payMethod === 'transfer' && (
          <div style={{ marginTop: 14, background: '#f0fdfa', border: '1px solid #99f6e4', padding: '12px', borderRadius: 8 }}>
            <div style={{ fontWeight: 700, color: '#0f766e', marginBottom: 4 }}>Thông tin tài khoản nhận:</div>
            <div style={{ fontSize: 12 }}>Ngân hàng: <strong>Vietcombank (VCB)</strong></div>
            <div style={{ fontSize: 12 }}>Số tài khoản: <strong>1028999888</strong></div>
            <div style={{ fontSize: 12 }}>Chủ tài khoản: <strong>PET SPA LÔNG MƯỢT</strong></div>
            <div style={{ fontSize: 12 }}>Cú pháp chuyển khoản: <strong>{payTarget?.invoice_no}</strong></div>
          </div>
        )}
      </Modal>

      {/* ===== MODAL HỦY HÓA ĐƠN ===== */}
      <Modal
        centered
        title="Xác nhận hủy hóa đơn"
        open={voidModalOpen}
        onCancel={() => setVoidModalOpen(false)}
        onOk={submitVoid}
        confirmLoading={voiding}
        okText="Hủy hóa đơn"
        okButtonProps={{ danger: true }}
        cancelText="Đóng"
      >
        <Alert
          type="warning"
          showIcon
          message="Lưu ý thao tác quản lý"
          description="Hóa đơn sau khi hủy sẽ không thể phục hồi hoặc thu tiền được nữa."
          style={{ marginBottom: 12 }}
        />
        <Paragraph>Hóa đơn: <Text strong>{voidTarget?.invoice_no}</Text></Paragraph>
        <Input.TextArea
          rows={3}
          value={voidReason}
          onChange={(e) => setVoidReason(e.target.value)}
          placeholder="Nhập lý do hủy hóa đơn (bắt buộc)..."
        />
      </Modal>
    </div>
  )
}
