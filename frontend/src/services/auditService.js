import api from './api.js'

export const auditService = {
  /**
   * Fetch authenticated user's append-only audit & access history.
   * @param {{
   *   action?: string,
   *   result?: string,
   *   search?: string,
   *   limit?: number,
   *   offset?: number
   * }} [params]
   */
  async getMyHistory(params = {}) {
    const response = await api.get('/api/audit/my-history', { params })
    return response.data
  },
}

export default auditService
