import { Link } from 'react-router-dom'
import {
  Clock,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  Send,
} from 'lucide-react'

export default function ExpiredAccessPage({
  documentName = null,
  recipientIdentifier = null,
  expiredAt = null,
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6">
      {/* Background radial glow */}
      <div className="fixed inset-0 pointer-events-none flex items-center justify-center">
        <div className="h-[400px] w-[400px] rounded-full bg-amber-500/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-lg rounded-3xl border border-amber-500/30 bg-slate-900/90 p-6 sm:p-8 text-center shadow-2xl backdrop-blur-md">
        {/* Clock Icon */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 ring-2 ring-amber-500/40 shadow-lg shadow-amber-950/40">
          <Clock className="h-8 w-8" />
        </div>

        {/* Status Badge */}
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-950/60 px-3 py-1 text-xs font-bold text-amber-300">
          <Clock className="h-3.5 w-3.5" />
          <span>Temporary Access Grant Expired</span>
        </div>

        {/* Title */}
        <h1 className="mt-4 text-2xl font-black text-white tracking-tight sm:text-3xl">
          Share Link Has Expired
        </h1>

        {/* Subtitle */}
        <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
          This temporary document sharing grant has passed its configured expiration window.
          For privacy and compliance, expired access tokens are permanently deactivated.
        </p>

        {/* Grant Details if available */}
        {(documentName || recipientIdentifier || expiredAt) && (
          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-left text-xs space-y-2">
            {documentName && (
              <div className="flex justify-between items-center text-slate-400">
                <span>Document:</span>
                <span className="font-bold text-white truncate max-w-[200px]">{documentName}</span>
              </div>
            )}
            {recipientIdentifier && (
              <div className="flex justify-between items-center text-slate-400">
                <span>Designated Recipient:</span>
                <span className="font-semibold text-slate-200">{recipientIdentifier}</span>
              </div>
            )}
            {expiredAt && (
              <div className="flex justify-between items-center text-slate-400">
                <span>Expired At:</span>
                <span className="font-mono text-amber-400">{new Date(expiredAt).toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        {/* Security Policy Information */}
        <div className="mt-5 rounded-2xl border border-amber-900/40 bg-amber-950/20 p-4 text-left text-xs space-y-1.5">
          <div className="flex items-center gap-2 text-amber-300 font-bold">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>Time-Limited Consent Guarantee</span>
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            &quot;The QR code provides temporary access to the selected document. It does not contain the document itself.&quot;
          </p>
          <p className="text-slate-400 text-[11px]">
            Because no document bytes were stored in the QR code, closing this grant guarantees that sensitive records cannot be accessed through this link or QR scan again.
          </p>
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <span>Audit Action: SHARE_EXPIRED</span>
            <span>HTTP Status: 410 Gone</span>
          </div>
        </div>

        {/* How to Resolve Guidance */}
        <div className="mt-5 text-xs text-slate-400 flex items-start gap-2 bg-slate-950/40 p-3 rounded-xl border border-slate-800/80 text-left">
          <Send className="h-4 w-4 text-teal-400 shrink-0 mt-0.5" />
          <span>
            <strong className="text-slate-200">Need access?</strong> Contact the document owner (patient or record holder) and ask them to issue a new QR code or extend the temporary share grant from their MediVault dashboard.
          </span>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-5 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition border border-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Go to MediVault Home</span>
          </Link>
        </div>
      </div>

      <div className="mt-8 text-center text-xs text-slate-500">
        MediVault Confidential Document Vault &bull; End-to-End Cryptographic Security
      </div>
    </div>
  )
}
