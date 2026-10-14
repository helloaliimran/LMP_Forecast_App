import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, TOKEN_KEY } from '../api/client'
import type { AuthResponse, Role, User } from '../api/types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (fullName: string, email: string, password: string) => Promise<void>
  logout: () => void
  hasRole: (...roles: Role[]) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setLoading(false)
      return
    }
    api
      .get<User>('/auth/me')
      .then((r) => setUser(r.data))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false))
  }, [])

  const accept = (data: AuthResponse) => {
    localStorage.setItem(TOKEN_KEY, data.token)
    setUser(data.user)
  }

  const login = useCallback(async (email: string, password: string) => {
    accept((await api.post<AuthResponse>('/auth/login', { email, password })).data)
  }, [])

  const register = useCallback(async (fullName: string, email: string, password: string) => {
    accept((await api.post<AuthResponse>('/auth/register', { fullName, email, password })).data)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
  }, [])

  const hasRole = useCallback((...roles: Role[]) => !!user && roles.some((r) => user.roles.includes(r)), [user])

  const value = useMemo(() => ({ user, loading, login, register, logout, hasRole }), [user, loading, login, register, logout, hasRole])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
