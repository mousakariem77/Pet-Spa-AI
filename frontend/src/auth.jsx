import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, getToken, setToken } from './api'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export const ROLE_LABEL = {
  customer: 'Khách hàng',
  receptionist: 'Lễ tân',
  technician: 'Kỹ thuật viên',
  manager: 'Quản lý',
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(!!getToken())

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      setUser(await api('/auth/me'))
    } catch {
      setToken(null)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const onUnauthorized = () => setUser(null)
    window.addEventListener('petspa:unauthorized', onUnauthorized)
    return () => window.removeEventListener('petspa:unauthorized', onUnauthorized)
  }, [refresh])

  const value = useMemo(
    () => ({
      user,
      loading,
      refresh,
      async login(username, password) {
        const data = await api('/auth/login', { method: 'POST', body: { username, password } })
        setToken(data.token)
        setUser(data.user)
        return data
      },
      async register(body) {
        const data = await api('/auth/register', { method: 'POST', body })
        setToken(data.token)
        setUser(data.user)
        return data
      },
      async logout() {
        try {
          await api('/auth/logout', { method: 'POST' })
        } finally {
          setToken(null)
          setUser(null)
        }
      },
    }),
    [user, loading, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
