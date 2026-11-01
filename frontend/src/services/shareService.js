import api from './api.js'
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export const shareService = {
  /**
   * Create a temporary document share grant and generate random access token.
   * @param {{
   *   document_id: number,
   *   recipient_identifier: string,
   *   permission_type: 'VIEW_ONLY' | 'VIEW_AND_DOWNLOAD',
   *   expiry_hours: number
   * }} payload
   */
  async createShare(payload) {
    const response = await api.post('/api/shares', payload)
    return response.data
  },

  /**
   * List temporary shares created by authenticated owner.
   * @param {{
   *   document_id?: number,
   *   status_filter?: 'active' | 'expired' | 'revoked' | 'all',
   *   search?: string
   * }} [params]
   */
  async getShares(params = {}) {
    const response = await api.get('/api/shares', { params })
    return response.data
  },

  /**
   * Immediately revoke a temporary share grant and invalidate tokens.
   * @param {number} permissionId
   */
  async revokeShare(permissionId) {
    const response = await api.post(`/api/shares/${permissionId}/revoke`)
    return response.data
  },

  /**
   * Public: Fetch document metadata and share parameters using temporary token.
   * @param {string} token
   */
  async getSharedAccessInfo(token) {
    const response = await axios.get(`${API_BASE_URL}/api/shared-access/${token}`)
    return response.data
  },

  /**
   * Public: Verify recipient identifier against temporary grant.
   * @param {string} token
   * @param {string} recipientIdentifier
   */
  async verifyRecipientIdentity(token, recipientIdentifier) {
    const response = await axios.post(`${API_BASE_URL}/api/shared-access/${token}/verify`, {
      recipient_identifier: recipientIdentifier,
    })
    return response.data
  },

  /**
   * Public: Fetch decrypted document Blob for inline view.
   * @param {string} token
   */
  async getSharedAccessViewBlob(token) {
    const response = await axios.get(`${API_BASE_URL}/api/shared-access/${token}/view`, {
      responseType: 'blob',
    })
    return response.data
  },

  /**
   * Public: Download decrypted shared document.
   * @param {string} token
   * @param {string} filename
   */
  async downloadSharedDocument(token, filename) {
    const response = await axios.get(`${API_BASE_URL}/api/shared-access/${token}/download`, {
      responseType: 'blob',
    })

    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename || 'shared-document')
    document.body.appendChild(link)
    link.click()
    link.parentNode.removeChild(link)
    window.URL.revokeObjectURL(url)
  },
}

export default shareService
