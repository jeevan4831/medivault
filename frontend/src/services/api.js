import axios from 'axios'

function getApiBaseUrl() {
  // If explicitly configured via environment variable (e.g. production cloud backend URL), prioritize it
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '')
  }

  if (typeof window !== 'undefined' && window.location) {
    const { hostname, protocol } = window.location
    // If accessing via local private network IP on Wi-Fi (e.g. 192.168.x.x, 10.x.x.x), target port 8000
    if (
      hostname &&
      hostname !== 'localhost' &&
      hostname !== '127.0.0.1' &&
      /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)
    ) {
      return `${protocol}//${hostname}:8000`
    }
  }
  return 'http://localhost:8000'
}

const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
})

// Request interceptor to attach JWT token and ensure network hostname alignment
api.interceptors.request.use(
  (config) => {
    // Only apply Wi-Fi IP override if VITE_API_BASE_URL is NOT set
    if (!import.meta.env.VITE_API_BASE_URL && typeof window !== 'undefined' && window.location) {
      const { hostname, protocol } = window.location
      if (
        hostname &&
        hostname !== 'localhost' &&
        hostname !== '127.0.0.1' &&
        /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)
      ) {
        config.baseURL = `${protocol}//${hostname}:8000`
      }
    }
    const token = localStorage.getItem('medivault_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor to handle token expiration/auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // If we got 401 on an authenticated call, remove expired token
      const originalRequestUrl = error.config?.url || ''
      if (!originalRequestUrl.includes('/api/auth/login')) {
        localStorage.removeItem('medivault_token')
        localStorage.removeItem('medivault_user')
      }
    }
    return Promise.reject(error)
  }
)

export default api
