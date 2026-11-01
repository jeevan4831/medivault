import api from '../services/api.js'

let cachedLanIp = null

/**
 * Fetch and cache the machine's local Wi-Fi / LAN IP from the backend.
 */
export async function fetchLanIp() {
  if (cachedLanIp) return cachedLanIp
  try {
    const res = await api.get('/api/health/network')
    if (res.data?.lan_ip && res.data.lan_ip !== '127.0.0.1') {
      cachedLanIp = res.data.lan_ip
      return cachedLanIp
    }
  } catch {
    // Graceful fallback
  }
  return null
}

/**
 * Construct an absolute URL for mobile QR code scanning.
 * If user is browsing on localhost/127.0.0.1, we substitute the machine's LAN IP
 * (e.g. http://10.41.75.57:5173/shared-access/...) so phones on the same Wi-Fi can open it.
 *
 * @param {string} rawToken
 * @param {string} [overrideLanIp]
 * @returns {string}
 */
export function buildShareAccessUrl(rawToken, overrideLanIp = null) {
  if (!rawToken) return ''
  const { protocol, hostname, port, origin } = window.location

  // 1. If currently on a public cloud domain (Vercel, Render, Tunnel, etc.), always use current public origin!
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `${origin}/shared-access/${rawToken}`
  }

  // 2. If user configured a custom public URL in localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    const customPublic = window.localStorage.getItem('medivault_public_url')
    if (customPublic && customPublic.trim()) {
      return `${customPublic.trim().replace(/\/+$/, '')}/shared-access/${rawToken}`
    }
  }

  // 3. Fallback to Wi-Fi / LAN IP if on local machine
  const lanIp = overrideLanIp || cachedLanIp
  if (lanIp && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    const portPart = port ? `:${port}` : ''
    return `${protocol}//${lanIp}${portPart}/shared-access/${rawToken}`
  }

  return `${origin}/shared-access/${rawToken}`
}
