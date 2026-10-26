// Lớp gọi API Django. Token lưu localStorage; lỗi chuẩn hóa {code, detail, fields}.
const BASE = '/api/v1'
const TOKEN_KEY = 'petspa_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY))

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.detail || body?.error || (typeof body === 'string' ? body : 'Có lỗi xảy ra.'))
    this.status = status
    this.code = body?.code
    this.fields = body?.fields || {}
  }
}

export async function api(path, { method = 'GET', body, params } = {}) {
  const url = new URL(BASE + path, window.location.origin)
  if (params) Object.entries(params).forEach(([k, v]) => v !== undefined && v !== '' && url.searchParams.set(k, v))
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Token ${token}`
  let payload
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = typeof body === 'string' ? body : JSON.stringify(body)
  }
  const res = await fetch(url, { method, headers, body: payload })
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null)
      window.dispatchEvent(new Event('petspa:unauthorized'))
    }
    throw new ApiError(res.status, data)
  }
  return data
}

// Dữ liệu danh sách có thể có hoặc không có phân trang
export const unwrap = (d) => (Array.isArray(d) ? d : d?.results ?? [])

export const money = (n) => (n == null ? '' : new Intl.NumberFormat('vi-VN').format(n) + ' ₫')

// Chuyển lỗi 422 của DRF thành danh sách field lỗi cho antd Form
export const toFormErrors = (err) =>
  Object.entries(err.fields || {}).map(([name, msgs]) => ({
    name,
    errors: Array.isArray(msgs) ? msgs : [String(msgs)],
  }))
