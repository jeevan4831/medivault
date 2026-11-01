import api from './api.js'

export const dashboardService = {
  /**
   * Fetch authenticated user's dashboard statistics, categories, and activity.
   */
  async getDashboardSummary() {
    const response = await api.get('/api/dashboard/summary')
    return response.data
  },

  /**
   * Fetch complete append-only audit trail for authenticated user.
   */
  async getAuditLogs() {
    const response = await api.get('/api/dashboard/audit-logs')
    return response.data
  },

  /**
   * Fetch user notifications including share grants and revocations.
   */
  async getNotifications() {
    const response = await api.get('/api/dashboard/notifications')
    return response.data
  },

  /**
   * Mark all unread notifications as read.
   */
  async markNotificationsRead() {
    const response = await api.post('/api/dashboard/notifications/mark-read')
    return response.data
  },
}

export default dashboardService
