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
  const lanIp = overrideLanIp || cachedLanIp
  const { protocol, hostname, port } = window.location

  // If user is accessing from localhost or 127.0.0.1 and we have a valid LAN IP, use LAN IP
  if (lanIp && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    const portPart = port ? `:${port}` : ''
    return `${protocol}//${lanIp}${portPart}/shared-access/${rawToken}`
  }

  return `${window.location.origin}/shared-access/${rawToken}`
}
