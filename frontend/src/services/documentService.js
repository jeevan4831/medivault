import api from './api.js'

export const documentService = {
  /**
   * Fetch available document categories.
   */
  async getCategories() {
    const response = await api.get('/api/documents/categories')
    return response.data
  },

  /**
   * Upload an encrypted document.
   * @param {FormData} formData
   * @param {(percent: number) => void} [onProgress]
   */
  async uploadDocument(formData, onProgress) {
    const response = await api.post('/api/documents/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onProgress(percent)
        }
      },
    })
    return response.data
  },

  /**
   * List user's documents with optional filtering.
   * @param {{ category_id?: number, category_name?: string, search?: string }} [params]
   */
  async getDocuments(params = {}) {
    const response = await api.get('/api/documents', { params })
    return response.data
  },

  /**
   * Get metadata for a specific document.
   * @param {number} documentId
   */
  async getDocument(documentId) {
    const response = await api.get(`/api/documents/${documentId}`)
    return response.data
  },

  /**
   * Delete a document and its stored file.
   * @param {number} documentId
   */
  async deleteDocument(documentId) {
    const response = await api.delete(`/api/documents/${documentId}`)
    return response.data
  },

  /**
   * Download and save the decrypted document locally.
   * @param {number} documentId
   * @param {string} filename
   */
  async downloadDocument(documentId, filename) {
    const response = await api.get(`/api/documents/${documentId}/download`, {
      responseType: 'blob',
    })

    // Create browser download URL
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename || 'document')
    document.body.appendChild(link)
    link.click()
    link.parentNode.removeChild(link)
    window.URL.revokeObjectURL(url)
  },

  /**
   * Fetch decrypted document as a Blob for in-browser preview.
   * @param {number} documentId
   */
  async getDocumentViewBlob(documentId) {
    const response = await api.get(`/api/documents/${documentId}/view`, {
      responseType: 'blob',
    })
    return response.data
  },
}

export default documentService
