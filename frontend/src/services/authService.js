import api from './api.js'

export const authService = {
  /**
   * Register a new user account.
   * @param {{ full_name: string, email: string, phone?: string, password: string, confirm_password: string }} payload
   */
  async register(payload) {
    const response = await api.post('/api/auth/register', payload)
    return response.data
  },

  /**
   * Log in user with email and password.
   * @param {{ email: string, password: string }} credentials
   */
  async login(credentials) {
    const response = await api.post('/api/auth/login', credentials)
    return response.data
  },

  /**
   * Notify server of logout.
   */
  async logout() {
    try {
      const response = await api.post('/api/auth/logout')
      return response.data
    } catch {
      // Graceful fallback if backend is unreachable
      return { message: 'Logged out locally.' }
    }
  },

  /**
   * Fetch current authenticated user's profile.
   */
  async getCurrentUser() {
    const response = await api.get('/api/auth/me')
    return response.data
  },
}

export default authService
