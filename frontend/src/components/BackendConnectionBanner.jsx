import { useState } from 'react'
import { Server, Check, X, Edit2, AlertCircle } from 'lucide-react'
import useBackendStatus from '../hooks/useBackendStatus.js'
import { getApiBaseUrl, setApiBaseUrl } from '../services/api.js'

export default function BackendConnectionBanner() {
  const { api } = useBackendStatus()
  const [showConfig, setShowConfig] = useState(false)
  const currentUrl = getApiBaseUrl()
  const [customUrl, setCustomUrl] = useState(currentUrl)

  // Only show warning banner if API is offline or user opened config
  if (api.status === 'online' && !showConfig) {
    return null
  }

  const handleSave = (e) => {
    e.preventDefault()
    setApiBaseUrl(customUrl)
    window.location.reload()
  }

  const handleReset = () => {
    setApiBaseUrl('')
    window.location.reload()
  }

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-xs text-amber-800 transition">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
          <span>
            {api.status === 'offline' ? (
              <>
                <strong>Backend Offline:</strong> Unable to reach API server at{' '}
                <code className="bg-amber-100 px-1.5 py-0.5 rounded text-amber-900 font-mono text-[11px]">{currentUrl}</code>.
              </>
            ) : (
              <>Connected to API at: <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono text-[11px]">{currentUrl}</code></>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {!showConfig ? (
            <button
              onClick={() => setShowConfig(true)}
              className="inline-flex items-center gap-1 rounded bg-amber-600 px-2.5 py-1 font-semibold text-white hover:bg-amber-700 shadow-sm transition"
            >
              <Edit2 className="h-3 w-3" />
              Configure Backend URL
            </button>
          ) : (
            <form onSubmit={handleSave} className="flex items-center gap-2 flex-wrap">
              <input
                type="url"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://your-backend.onrender.com"
                className="rounded border border-amber-300 bg-white px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 min-w-[240px]"
                required
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:bg-emerald-700 transition"
              >
                <Check className="h-3 w-3" />
                Save & Connect
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="rounded bg-slate-200 px-2 py-1 font-medium text-slate-700 hover:bg-slate-300 transition"
              >
                Reset Default
              </button>
              <button
                type="button"
                onClick={() => setShowConfig(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-200 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

