import api from './api.js'

export const notificationService = {
  /**
   * Fetch in-app notifications for authenticated user.
   * @param {{ unread_only?: boolean, limit?: number, offset?: number }} [params]
   */
  async getNotifications(params = {}) {
    const response = await api.get('/api/notifications', { params })
    return response.data
  },

  /**
   * Fetch total unread notifications count.
   */
  async getUnreadCount() {
    const response = await api.get('/api/notifications/unread-count')
    return response.data
  },

  /**
   * Mark a single notification as read.
   * @param {number} id
   */
  async markAsRead(id) {
    const response = await api.post(`/api/notifications/${id}/read`)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('medivault:notifications-changed'))
    }
    return response.data
  },

  /**
   * Mark all unread notifications as read.
   */
  async markAllAsRead() {
    const response = await api.post('/api/notifications/mark-all-read')
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('medivault:notifications-changed'))
    }
    return response.data
  },

  /**
   * Delete a single notification permanently.
   * @param {number} id
   */
  async deleteNotification(id) {
    const response = await api.delete(`/api/notifications/${id}`)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('medivault:notifications-changed'))
    }
    return response.data
  },

  /**
   * Clear and delete all notifications for the authenticated user.
   */
  async clearAllNotifications() {
    const response = await api.delete('/api/notifications')
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('medivault:notifications-changed'))
    }
    return response.data
  },
}

export default notificationService
