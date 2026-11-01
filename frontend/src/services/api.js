import axios from 'axios'

export function getApiBaseUrl() {
  // 1. Check user-configured override in localStorage (allows setting live backend URL from frontend)
  if (typeof window !== 'undefined' && window.localStorage) {
    const customUrl = window.localStorage.getItem('medivault_api_base_url')
    if (customUrl && customUrl.trim()) {
      return customUrl.trim().replace(/\/+$/, '')
    }
  }

  // 2. Prioritize explicitly configured environment variable (e.g. production cloud backend URL)
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

export function setApiBaseUrl(url) {
  if (typeof window !== 'undefined' && window.localStorage) {
    if (url && url.trim()) {
      window.localStorage.setItem('medivault_api_base_url', url.trim().replace(/\/+$/, ''))
    } else {
      window.localStorage.removeItem('medivault_api_base_url')
    }
  }
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
    config.baseURL = getApiBaseUrl()
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
