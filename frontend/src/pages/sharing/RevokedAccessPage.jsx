import { Link } from 'react-router-dom'
import {
  Ban,
  ShieldAlert,
  ArrowLeft,
  Lock,
  AlertOctagon,
} from 'lucide-react'

export default function RevokedAccessPage({
  documentName = null,
  recipientIdentifier = null,
  revokedAt = null,
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6">
      {/* Background radial glow */}
      <div className="fixed inset-0 pointer-events-none flex items-center justify-center">
        <div className="h-[400px] w-[400px] rounded-full bg-rose-600/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-lg rounded-3xl border border-rose-600/30 bg-slate-900/90 p-6 sm:p-8 text-center shadow-2xl backdrop-blur-md">
        {/* Ban Icon */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-600/20 text-rose-400 ring-2 ring-rose-600/40 shadow-lg shadow-rose-950/40">
          <Ban className="h-8 w-8" />
        </div>

        {/* Status Badge */}
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-950/60 px-3 py-1 text-xs font-bold text-rose-300">
          <Lock className="h-3.5 w-3.5" />
          <span>Access Revoked by Document Owner</span>
        </div>

        {/* Title */}
        <h1 className="mt-4 text-2xl font-black text-white tracking-tight sm:text-3xl">
          Access Grant Revoked
        </h1>

        {/* Subtitle */}
        <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
          The owner of this document has explicitly revoked this temporary share permission.
          In accordance with the security model, all associated tokens and QR codes have been permanently deactivated.
        </p>

        {/* Metadata Details if available */}
        {(documentName || recipientIdentifier) && (
          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-left text-xs space-y-2">
            {documentName && (
              <div className="flex justify-between items-center text-slate-400">
                <span>Document:</span>
                <span className="font-bold text-white truncate max-w-[200px]">{documentName}</span>
              </div>
            )}
            {recipientIdentifier && (
              <div className="flex justify-between items-center text-slate-400">
                <span>Revoked Recipient:</span>
                <span className="font-semibold text-slate-200">{recipientIdentifier}</span>
              </div>
            )}
            {revokedAt && (
              <div className="flex justify-between items-center text-slate-400">
                <span>Revoked At:</span>
                <span className="font-mono text-rose-400">{new Date(revokedAt).toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        {/* Zero Knowledge Security Guarantee */}
        <div className="mt-5 rounded-2xl border border-rose-900/40 bg-rose-950/20 p-4 text-left text-xs space-y-1.5">
          <div className="flex items-center gap-2 text-rose-300 font-bold">
            <AlertOctagon className="h-4 w-4 shrink-0" />
            <span>Immediate Cryptographic Invalidation</span>
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            &quot;The QR code provides temporary access to the selected document. It does not contain the document itself.&quot;
          </p>
          <p className="text-slate-400 text-[11px]">
            Once revoked, the server immediately marks the token hash as revoked. No cached or unauthenticated scans can retrieve document bytes or keys.
          </p>
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <span>Audit Action: SHARE_REVOKED</span>
            <span>HTTP Status: 410 Gone</span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-5 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition border border-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Return to MediVault Home</span>
          </Link>
        </div>
      </div>

      <div className="mt-8 text-center text-xs text-slate-500">
        MediVault Confidential Document Vault &bull; End-to-End Cryptographic Security
      </div>
    </div>
  )
}
