import { useAuth } from '../context/AuthContext.jsx'
import {
  User,
  Mail,
  Phone,
  ShieldCheck,
  Calendar,
  Lock,
  LogOut,
  KeyRound,
} from 'lucide-react'

export default function ProfilePage() {
  const { user, logout } = useAuth()

  const formattedDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Recently'

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight sm:text-3xl">
          User Profile &amp; Security
        </h1>
        <p className="mt-1 text-xs text-slate-500 sm:text-sm">
          Account identity and cryptographic credentials for your MediVault.
        </p>
      </div>

      <div className="grid gap-4 sm:gap-6 sm:grid-cols-3">
        {/* Profile Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm sm:col-span-1">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white shadow-md shadow-brand-600/30">
              {user?.full_name ? user.full_name[0].toUpperCase() : 'U'}
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">{user?.full_name}</h2>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200/60">
              <ShieldCheck className="h-3 w-3" />
              Verified User
            </span>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-4">
            <button
              onClick={logout}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100/70 active:scale-95 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out Session</span>
            </button>
          </div>
        </div>

        {/* Detailed Info Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm sm:col-span-2 space-y-4 sm:space-y-5">
          <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
            Account Specifications
          </h3>

          <div className="grid gap-4 sm:grid-cols-2 text-xs">
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
              <span className="flex items-center gap-2 font-semibold text-slate-500">
                <Mail className="h-3.5 w-3.5 text-brand-600" />
                Email Address
              </span>
              <p className="mt-1 font-bold text-slate-900 text-sm break-all">
                {user?.email}
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
              <span className="flex items-center gap-2 font-semibold text-slate-500">
                <Phone className="h-3.5 w-3.5 text-brand-600" />
                Phone Number
              </span>
              <p className="mt-1 font-bold text-slate-900 text-sm">
                {user?.phone || 'Not provided'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
              <span className="flex items-center gap-2 font-semibold text-slate-500">
                <Calendar className="h-3.5 w-3.5 text-brand-600" />
                Member Since
              </span>
              <p className="mt-1 font-bold text-slate-900 text-sm">{formattedDate}</p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
              <span className="flex items-center gap-2 font-semibold text-slate-500">
                <KeyRound className="h-3.5 w-3.5 text-brand-600" />
                Security Standards
              </span>
              <p className="mt-1 font-bold text-slate-900 text-sm">
                Bcrypt (12 Rounds) &amp; JWT
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 text-xs text-brand-900">
            <div className="flex items-center gap-2 font-bold">
              <Lock className="h-4 w-4 text-brand-700" />
              Privacy &amp; Data Sovereign Guarantee
            </div>
            <p className="mt-1 text-slate-600">
              MediVault uses consent tokens for all third-party document access. Passwords and
              file encryption keys are never stored in plaintext.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
