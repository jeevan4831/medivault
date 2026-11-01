import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import {
  ShieldCheck,
  Lock,
  Key,
  Database,
  Bell,
  Clock,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  Sliders,
  FileCheck,
  Share2,
  RefreshCw,
  LogOut,
  Info,
} from 'lucide-react'

export default function SettingsPage() {
  const { user, logout } = useAuth()

  // Local preferences stored in localStorage for user convenience
  const [defaultExpiryHours, setDefaultExpiryHours] = useState(() => {
    return localStorage.getItem('medivault_pref_expiry') || '24'
  })
  const [defaultPermission, setDefaultPermission] = useState(() => {
    return localStorage.getItem('medivault_pref_permission') || 'VIEW_ONLY'
  })
  const [notifyOnShareAccess, setNotifyOnShareAccess] = useState(() => {
    return localStorage.getItem('medivault_pref_notify_share') !== 'false'
  })
  const [notifyOnFailedLogin, setNotifyOnFailedLogin] = useState(() => {
    return localStorage.getItem('medivault_pref_notify_login') !== 'false'
  })

  const [savedNotice, setSavedNotice] = useState(false)

  const handleSavePreferences = (e) => {
    e.preventDefault()
    localStorage.setItem('medivault_pref_expiry', defaultExpiryHours)
    localStorage.setItem('medivault_pref_permission', defaultPermission)
    localStorage.setItem('medivault_pref_notify_share', String(notifyOnShareAccess))
    localStorage.setItem('medivault_pref_notify_login', String(notifyOnFailedLogin))

    setSavedNotice(true)
    setTimeout(() => setSavedNotice(false), 3000)
  }

  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-700">
          <ShieldCheck className="h-4 w-4 text-brand-600" />
          <span>Security &amp; Consent Configuration</span>
        </div>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900 tracking-tight sm:text-3xl">
          Vault Settings
        </h1>
        <p className="mt-1 text-xs text-slate-600 sm:text-sm">
          Manage your document vault cryptography standards, default sharing policies, and alert preferences.
        </p>
      </div>

      {savedNotice && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>Vault preferences saved successfully.</span>
        </div>
      )}

      {/* Grid of Settings Cards */}
      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
        {/* Card 1: Cryptographic Architecture (Read-Only Verified Status) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-200">
                <Lock className="h-5 w-5" />
              </div>
              <h2 className="text-sm font-bold text-slate-900">
                Cryptographic Storage Status
              </h2>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Verified Active
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
              <span className="font-semibold text-slate-600">Encryption Standard</span>
              <span className="font-mono font-bold text-slate-900">AES-256-GCM</span>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
              <span className="font-semibold text-slate-600">Key Length</span>
              <span className="font-mono font-bold text-slate-900">256-bit Symmetric</span>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
              <span className="font-semibold text-slate-600">Per-File Nonce</span>
              <span className="font-mono font-bold text-slate-900">96-bit CSPRNG</span>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
              <span className="font-semibold text-slate-600">Integrity Authentication</span>
              <span className="font-mono font-bold text-slate-900">128-bit Tag Verified</span>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
              <span className="font-semibold text-slate-600">Deletion Hygiene</span>
              <span className="font-bold text-slate-900">Cryptographic Shredding</span>
            </div>
          </div>
        </div>

        {/* Card 2: Consent & Share Defaults */}
        <form
          onSubmit={handleSavePreferences}
          className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-200">
              <Share2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Default Sharing Policies
              </h2>
              <p className="text-[11px] text-slate-500">
                Preset parameters applied when creating a new share
              </p>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label
                htmlFor="pref-expiry"
                className="block font-semibold text-slate-700 mb-1"
              >
                Default "Expires In" Duration
              </label>
              <select
                id="pref-expiry"
                value={defaultExpiryHours}
                onChange={(e) => setDefaultExpiryHours(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-800 shadow-2xs focus:border-brand-500 focus:outline-none"
              >
                <option value="1">1 Hour</option>
                <option value="6">6 Hours</option>
                <option value="24">24 Hours (Recommended)</option>
                <option value="48">48 Hours</option>
                <option value="168">7 Days</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="pref-permission"
                className="block font-semibold text-slate-700 mb-1"
              >
                Default Access Permission
              </label>
              <select
                id="pref-permission"
                value={defaultPermission}
                onChange={(e) => setDefaultPermission(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-800 shadow-2xs focus:border-brand-500 focus:outline-none"
              >
                <option value="VIEW_ONLY">View Document Only (No Download)</option>
                <option value="VIEW_AND_DOWNLOAD">View &amp; Download Document</option>
              </select>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2.5 p-1 rounded-lg hover:bg-slate-50 transition cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyOnShareAccess}
                  onChange={(e) => setNotifyOnShareAccess(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-slate-700 font-medium select-none">
                  In-app notification whenever a share link is accessed
                </span>
              </label>

              <label className="flex items-center gap-2.5 p-1 rounded-lg hover:bg-slate-50 transition cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyOnFailedLogin}
                  onChange={(e) => setNotifyOnFailedLogin(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-slate-700 font-medium select-none">
                  Security alert notification on failed login attempts
                </span>
              </label>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700 active:scale-95 transition"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Save Share Preferences</span>
              </button>
            </div>
          </div>
        </form>

        {/* Card 3: Audit Trail & Immutability Standard */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-200">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Access History &amp; Non-Repudiation
              </h2>
              <p className="text-[11px] text-slate-500">
                Legal accountability and tamper-resistant audit logs
              </p>
            </div>
          </div>

          <div className="space-y-2.5 text-xs text-slate-600">
            <p className="leading-relaxed">
              MediVault maintains an <strong>append-only audit log</strong> for all security events. Every upload, decrypted view, download, share creation, token verification, and revocation is recorded with client IP and timestamps.
            </p>

            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-amber-900">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <p className="text-[11px]">
                  <strong>Tamper Resistance:</strong> Audit logs cannot be modified, edited, or deleted by any user or administrator through the API.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Session & Credentials Management */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-200">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Active Session &amp; Credentials
              </h2>
              <p className="text-[11px] text-slate-500">
                Session lifetime and Bearer token status
              </p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
              <span className="font-semibold text-slate-600">Authenticated Email</span>
              <span className="font-medium text-slate-900 break-all">{user?.email}</span>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
              <span className="font-semibold text-slate-600">Session Protocol</span>
              <span className="font-mono text-slate-900 font-semibold">JWT (HS256)</span>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
              <span className="font-semibold text-slate-600">Token Lifespan</span>
              <span className="font-medium text-slate-900">30 Minutes Expiring</span>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={logout}
                className="flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 active:scale-95 transition"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out Active Session</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
