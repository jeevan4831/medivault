import { useEffect, useState } from 'react'
import { getApiHealth, getDatabaseHealth } from '../services/healthService.js'

// status: 'checking' | 'online' | 'offline'
export default function useBackendStatus() {
  const [api, setApi] = useState({ status: 'checking', data: null })
  const [db, setDb] = useState({ status: 'checking', data: null })

  useEffect(() => {
    let cancelled = false
    getApiHealth()
      .then((data) => !cancelled && setApi({ status: 'online', data }))
      .catch(() => !cancelled && setApi({ status: 'offline', data: null }))
    getDatabaseHealth()
      .then((data) => !cancelled && setDb({ status: 'online', data }))
      .catch(() => !cancelled && setDb({ status: 'offline', data: null }))
    return () => {
      cancelled = true
    }
  }, [])

  return { api, db }
}
