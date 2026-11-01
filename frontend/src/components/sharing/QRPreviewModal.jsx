import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import {
  X,
  ShieldCheck,
  Download,
  Copy,
  Check,
  ExternalLink,
  Ban,
  Clock,
  UserCheck,
  FileText,
  FileImage,
  Smartphone,
} from 'lucide-react'
import shareService from '../../services/shareService.js'
import { fetchLanIp, buildShareAccessUrl } from '../../utils/network.js'

export default function QRPreviewModal({ isOpen, onClose, share, onRevoked = null }) {
  const canvasRef = useRef(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [isRevoking, setIsRevoking] = useState(false)
  const [isRevoked, setIsRevoked] = useState(share?.status === 'REVOKED')
  const [lanIp, setLanIp] = useState(null)

  useEffect(() => {
    fetchLanIp().then((ip) => ip && setLanIp(ip))
  }, [])

  const accessUrl = share ? buildShareAccessUrl(share.raw_token || '', lanIp || share.lan_ip) : ''

  useEffect(() => {
    if (share) {
      setIsRevoked(share.status === 'REVOKED')
      setCopiedLink(false)
    }
  }, [share])

  useEffect(() => {
    if (isOpen && share && canvasRef.current && share.raw_token) {
      const fullUrl = buildShareAccessUrl(share.raw_token, lanIp || share.lan_ip)
      QRCode.toCanvas(canvasRef.current, fullUrl, {
        width: 260,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      }).catch((err) => {
        console.error('QR code render error:', err)
      })
    }
  }, [isOpen, share, lanIp])

  if (!isOpen || !share) return null

  const handleCopyLink = () => {
    if (!share.raw_token) return
    const fullUrl = buildShareAccessUrl(share.raw_token, lanIp || share.lan_ip)
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2500)
    })
  }

  const handleDownloadQR = () => {
    if (!canvasRef.current) return
    const imageUri = canvasRef.current.toDataURL('image/png')
    const link = document.createElement('a')
    link.href = imageUri
    link.download = `MediVault_QR_${share.document_name.replace(/\s+/g, '_')}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleRevoke = async () => {
    setIsRevoking(true)
    try {
      await shareService.revokeShare(share.permission_id)
      setIsRevoked(true)
      if (onRevoked) {
        onRevoked(share.permission_id)
      }
    } catch (err) {
      console.error('Failed to revoke:', err)
    } finally {
      setIsRevoking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100 my-auto sm:my-8 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-slate-50 to-white shrink-0">
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
              Document Share QR Code
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-500 font-mono truncate max-w-xs">
              {share.document_name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1">
          {isRevoked ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
              <Ban className="h-10 w-10 text-rose-600 mx-auto mb-2" />
              <h3 className="font-bold text-rose-900 text-sm">Access Grant Revoked</h3>
              <p className="text-xs text-rose-700 mt-1">
                This share link and QR code have been permanently invalidated. Access is denied for all recipients.
              </p>
            </div>
          ) : (
            <>
              {/* QR Canvas */}
              {share.raw_token ? (
                <div className="flex flex-col items-center justify-center p-4 bg-slate-50/80 rounded-2xl border border-slate-200">
                  <div className="rounded-xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200">
                    <canvas ref={canvasRef} className="block rounded-lg" />
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadQR}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
                    >
                      <Download className="h-3 w-3 text-slate-500" />
                      <span>Save QR Image</span>
                    </button>

                    <a
                      href={`/shared-access/${share.raw_token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
                    >
                      <ExternalLink className="h-3 w-3 text-slate-500" />
                      <span>Open Link</span>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
                  <p className="font-bold">Zero-Knowledge Security Storage:</p>
                  <p className="mt-1 text-[11px]">
                    In accordance with security requirements, raw access tokens are returned only once upon generation and are never stored in the database. Only the SHA-256 hash exists on the server.
                  </p>
                </div>
              )}

              {/* REQUIRED EXPLANATION */}
              <div className="rounded-xl border border-teal-200 bg-teal-50/80 p-3.5 text-xs text-teal-950">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 text-teal-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-teal-950 block">Security Guarantee</span>
                    <p className="font-semibold text-teal-900 mt-0.5">
                      &quot;The QR code provides temporary access to the selected document. It does not contain the document itself.&quot;
                    </p>
                  </div>
                </div>
              </div>

              {/* Link copy if token exists */}
              {share.raw_token && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Temporary Access Link
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 truncate select-all">
                      {accessUrl}
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                        copiedLink
                          ? 'bg-emerald-600 text-white'
                          : 'bg-brand-600 text-white hover:bg-brand-700'
                      }`}
                    >
                      {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs space-y-1.5">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Recipient:</span>
                  <span className="font-bold text-slate-900">{share.recipient_identifier}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Permission:</span>
                  <span className="font-semibold text-slate-800">
                    {share.can_download ? 'View & Download' : 'View Only'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Expires In / At:</span>
                  <span className="font-semibold text-amber-700">
                    {new Date(share.expires_at).toLocaleString()}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            {!isRevoked ? (
              <button
                type="button"
                onClick={handleRevoke}
                disabled={isRevoking}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition disabled:opacity-50"
              >
                <Ban className="h-3.5 w-3.5" />
                <span>{isRevoking ? 'Revoking...' : 'Revoke Access'}</span>
              </button>
            ) : (
              <div />
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
