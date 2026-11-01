import api from './api.js'

export const getApiHealth = () => api.get('/api/health').then((r) => r.data)
export const getDatabaseHealth = () => api.get('/api/health/db').then((r) => r.data)
