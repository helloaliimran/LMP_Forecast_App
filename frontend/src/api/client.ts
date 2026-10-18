import axios from 'axios'

export const TOKEN_KEY = 'lmp_token'

// Empty in development (Vite proxies /api); set VITE_API_URL to the backend's URL for a production build.
const apiOrigin = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export const api = axios.create({ baseURL: `${apiOrigin}/api` })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY)
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

/** Turns an API error into one readable sentence. */
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; errors?: Record<string, string[]>; errorMessage?: string } | undefined
    if (data?.message) return data.message
    if (data?.errorMessage) return data.errorMessage
    if (data?.errors) return Object.values(data.errors).flat().join(' ')
    return error.message
  }
  return String(error)
}
