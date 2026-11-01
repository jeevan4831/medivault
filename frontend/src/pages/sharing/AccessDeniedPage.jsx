import { Link } from 'react-router-dom'
import {
  ShieldAlert,
  AlertTriangle,
  Lock,
  ArrowLeft,
  FileQuestion,
  HelpCircle,
  Clock,
  UserX,
} from 'lucide-react'

export default function AccessDeniedPage({
  title = 'Access Denied',
  reason = 'Invalid or Unrecognized Temporary Token',
  details = 'The provided token does not match an active sharing permission, or recipient verification could not be completed.',
  onRetry = null,
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6">
      {/* Background radial glow */}
      <div className="fixed inset-0 pointer-events-none flex items-center justify-center">
        <div className="h-[400px] w-[400px] rounded-full bg-rose-500/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-lg rounded-3xl border border-rose-500/30 bg-slate-900/90 p-6 sm:p-8 text-center shadow-2xl backdrop-blur-md">
        {/* Shield Icon */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 ring-2 ring-rose-500/40 shadow-lg shadow-rose-950/40">
          <ShieldAlert className="h-8 w-8" />
        </div>

        {/* Status Badge */}
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-950/60 px-3 py-1 text-xs font-bold text-rose-300">
          <Lock className="h-3.5 w-3.5" />
          <span>Security Authorization Denied</span>
        </div>

        {/* Title */}
        <h1 className="mt-4 text-2xl font-black text-white tracking-tight sm:text-3xl">
          {title}
        </h1>

        {/* Subtitle / Reason */}
        <h2 className="mt-1 text-sm font-semibold text-rose-300">
          {reason}
        </h2>

        {/* Detailed Explanation */}
        <p className="mt-3 text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
          {details}
        </p>

        {/* Security Policy Architecture Notice */}
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-left text-xs space-y-2">
          <div className="flex items-center gap-2 text-rose-400 font-bold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Zero-Knowledge &amp; Access Control Policy</span>
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            MediVault temporary access tokens are cryptographically random, single-purpose identifiers.
            Access is granted only when a valid, active grant exists, the token has not expired, and the recipient is verified.
          </p>
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <span>Audit Action: SHARE_ACCESS_DENIED</span>
            <span>Status: Logged with IP &amp; Timestamp</span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition"
            >
              <span>Retry Verification</span>
            </button>
          )}

          <Link
            to="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-950/50 hover:bg-rose-500 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Return to MediVault</span>
          </Link>
        </div>
      </div>

      <div className="mt-8 text-center text-xs text-slate-500">
        MediVault Confidential Document Vault &bull; End-to-End Cryptographic Security
      </div>
    </div>
  )
}
