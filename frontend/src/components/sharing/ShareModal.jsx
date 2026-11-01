import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import {
  X,
  Share2,
  ShieldCheck,
  Clock,
  Eye,
  Download,
  Copy,
  Check,
  AlertCircle,
  QrCode,
  Lock,
  UserCheck,
  FileText,
  FileImage,
  ArrowRight,
  ExternalLink,
  Ban,
  RefreshCw,
} from 'lucide-react'
import shareService from '../../services/shareService.js'
import documentService from '../../services/documentService.js'
import { fetchLanIp, buildShareAccessUrl } from '../../utils/network.js'

const EXPIRY_PRESETS = [
  { label: '5 Mins', minutes: 5 },
  { label: '15 Mins', minutes: 15 },
  { label: '30 Mins', minutes: 30 },
  { label: '1 Hour', minutes: 60 },
  { label: '6 Hours', minutes: 360 },
  { label: '24 Hours', minutes: 1440 },
  { label: '7 Days', minutes: 10080 },
]

export default function ShareModal({
  isOpen,
  onClose,
  initialDocument = null,
  onShareCreated = null,
}) {
  const canvasRef = useRef(null)

  // Document selection
  const [selectedDocId, setSelectedDocId] = useState(initialDocument?.id || '')
  const [userDocs, setUserDocs] = useState([])
  const [isLoadingDocs, setIsLoadingDocs] = useState(false)

  // Form parameters
  const [recipientIdentifier, setRecipientIdentifier] = useState('')
  const [permissionType, setPermissionType] = useState('VIEW_ONLY') // 'VIEW_ONLY' or 'VIEW_AND_DOWNLOAD'
  const [selectedMinutes, setSelectedMinutes] = useState(1440) // Default 24 hours
  const [isCustomExpiry, setIsCustomExpiry] = useState(false)
  const [customAmount, setCustomAmount] = useState('15')
  const [customUnit, setCustomUnit] = useState('minutes') // 'minutes', 'hours', 'days'

  // Submission & Result state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const [shareResult, setShareResult] = useState(null) // holds response with raw_token
  const [copiedLink, setCopiedLink] = useState(false)

  // Revoke state from result screen
  const [isRevoking, setIsRevoking] = useState(false)
  const [revokedNotice, setRevokedNotice] = useState(false)
  const [lanIp, setLanIp] = useState(null)

  // Load user's documents if not preselected & pre-fetch LAN IP for mobile QR
  useEffect(() => {
    if (isOpen) {
      setShareResult(null)
      setErrorMessage(null)
      setCopiedLink(false)
      setRevokedNotice(false)
      fetchLanIp().then((ip) => ip && setLanIp(ip))
      if (initialDocument) {
        setSelectedDocId(initialDocument.id)
      } else {
        fetchUserDocuments()
      }
    }
  }, [isOpen, initialDocument])

  const fetchUserDocuments = async () => {
    setIsLoadingDocs(true)
    try {
      const docs = await documentService.getDocuments()
      setUserDocs(docs)
      if (docs.length > 0 && !selectedDocId) {
        setSelectedDocId(docs[0].id)
      }
    } catch (err) {
      console.error('Failed to load documents for sharing:', err)
      setErrorMessage('Could not load your documents. Please try again.')
    } finally {
      setIsLoadingDocs(false)
    }
  };

  const activeDoc =
    initialDocument || userDocs.find((d) => String(d.id) === String(selectedDocId))

  // Render QR Code once shareResult is available
  useEffect(() => {
    if (shareResult && canvasRef.current) {
      const fullUrl = buildShareAccessUrl(shareResult.raw_token, lanIp || shareResult.lan_ip)
      QRCode.toCanvas(canvasRef.current, fullUrl, {
        width: 260,
        margin: 2,
        color: {
          dark: '#0f172a', // slate-900
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      }).catch((err) => {
        console.error('Failed to generate QR code canvas:', err)
      })
    }
  }, [shareResult, lanIp])

  if (!isOpen) return null

  const getActiveMinutes = () => {
    if (!isCustomExpiry) {
      return selectedMinutes
    }
    const num = parseFloat(customAmount)
    if (isNaN(num) || num <= 0) return 60
    if (customUnit === 'minutes') return Math.max(1, Math.round(num))
    if (customUnit === 'hours') return Math.max(1, Math.round(num * 60))
    if (customUnit === 'days') return Math.max(1, Math.round(num * 1440))
    return 60
  }

  const formatActiveDuration = (minutes) => {
    if (minutes < 60) return `${minutes} min${minutes !== 1 ? 's' : ''}`
    if (minutes < 1440) {
      const hrs = (minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1)
      return `${hrs} hr${hrs !== '1' ? 's' : ''}`
    }
    const days = (minutes / 1440).toFixed(minutes % 1440 === 0 ? 0 : 1)
    return `${days} day${days !== '1' ? 's' : ''}`
  }

  const calculateExpiryDateFromMinutes = (minutes) => {
    const d = new Date()
    d.setMinutes(d.getMinutes() + Math.round(minutes))
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const handleExpiryPresetClick = (minutes) => {
    setIsCustomExpiry(false)
    setSelectedMinutes(minutes)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedDocId) {
      setErrorMessage('Please select a document to share.')
      return
    }
    if (!recipientIdentifier.trim()) {
      setErrorMessage('Please provide a recipient identifier or name.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const activeMinutes = getActiveMinutes()
      const payload = {
        document_id: parseInt(selectedDocId, 10),
        recipient_identifier: recipientIdentifier.trim(),
        permission_type: permissionType,
        expiry_minutes: activeMinutes,
        expiry_hours: activeMinutes / 60.0,
      }

      const result = await shareService.createShare(payload)
      setShareResult(result)
      if (onShareCreated) {
        onShareCreated(result)
      }
    } catch (err) {
      console.error('Error creating share:', err)
      setErrorMessage(
        err.response?.data?.detail || err.message || 'Failed to generate temporary share link.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopyLink = () => {
    if (!shareResult) return
    const fullUrl = buildShareAccessUrl(shareResult.raw_token, lanIp || shareResult.lan_ip)
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2500)
    })
  }

  const handleDownloadQR = () => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const imageUri = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.href = imageUri
    link.download = `MediVault_Share_QR_${shareResult?.permission_id || 'code'}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleImmediateRevoke = async () => {
    if (!shareResult) return
    setIsRevoking(true)
    try {
      await shareService.revokeShare(shareResult.permission_id)
      setRevokedNotice(true)
      if (onShareCreated) {
        onShareCreated({ ...shareResult, status: 'REVOKED' })
      }
    } catch (err) {
      console.error('Failed to revoke:', err)
      setErrorMessage('Failed to revoke access: ' + (err.response?.data?.detail || err.message))
    } finally {
      setIsRevoking(false)
    }
  }

  const isPdf = activeDoc?.mime_type === 'application/pdf'
  const DocIcon = isPdf ? FileText : FileImage

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100 my-auto sm:my-8 max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-slate-50 to-white shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-200/70">
              <Share2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
                Share Securely
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500">
                Zero-Knowledge QR &amp; Time-Limited Access Grant
              </p>
            </div>
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

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {!shareResult ? (
            /* STEP 1: CONFIGURATION FORM */
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Document Selector / Display */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  1. Selected Document
                </label>
                {initialDocument ? (
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-100/60 text-teal-800">
                      <DocIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 text-xs truncate">
                        {activeDoc.document_name}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {activeDoc.original_filename} &middot; {activeDoc.category_name || 'Personal'}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200/60">
                      AES-256 Encrypted
                    </span>
                  </div>
                ) : (
                  <div>
                    {isLoadingDocs ? (
                      <div className="h-10 rounded-xl bg-slate-100 animate-pulse" />
                    ) : (
                      <select
                        value={selectedDocId}
                        onChange={(e) => setSelectedDocId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 font-medium focus:border-brand-600 focus:outline-hidden focus:ring-1 focus:ring-brand-600"
                        required
                      >
                        {userDocs.length === 0 ? (
                          <option value="">No documents found</option>
                        ) : (
                          userDocs.map((doc) => (
                            <option key={doc.id} value={doc.id}>
                              {doc.document_name} ({doc.original_filename})
                            </option>
                          ))
                        )}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* Recipient Identifier Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  2. Recipient Identifier
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <UserCheck className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    value={recipientIdentifier}
                    onChange={(e) => setRecipientIdentifier(e.target.value)}
                    placeholder="e.g., Dr. Sarah Jenkins, City Diagnostic Lab, or insurance@care.org"
                    className="w-full rounded-xl border border-slate-200 pl-9 pr-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-hidden focus:ring-1 focus:ring-brand-600"
                    required
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Name, department, or email of the authorized party for the audit log.
                </p>
              </div>

              {/* Permission Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  3. Permission Level
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Option 1: View Only */}
                  <button
                    type="button"
                    onClick={() => setPermissionType('VIEW_ONLY')}
                    className={`flex flex-col text-left p-3.5 rounded-xl border transition cursor-pointer ${
                      permissionType === 'VIEW_ONLY'
                        ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div
                          className={`p-1.5 rounded-lg ${
                            permissionType === 'VIEW_ONLY'
                              ? 'bg-brand-600 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </div>
                        <span className="font-bold text-xs text-slate-900">View Only</span>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        High Privacy
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Recipient can preview decrypted document inline. File download is prohibited.
                    </p>
                  </button>

                  {/* Option 2: View & Download */}
                  <button
                    type="button"
                    onClick={() => setPermissionType('VIEW_AND_DOWNLOAD')}
                    className={`flex flex-col text-left p-3.5 rounded-xl border transition cursor-pointer ${
                      permissionType === 'VIEW_AND_DOWNLOAD'
                        ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div
                          className={`p-1.5 rounded-lg ${
                            permissionType === 'VIEW_AND_DOWNLOAD'
                              ? 'bg-brand-600 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </div>
                        <span className="font-bold text-xs text-slate-900">View &amp; Download</span>
                      </div>
                      <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
                        Full Access
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Recipient can view inline and export the decrypted document file to their device.
                    </p>
                  </button>
                </div>
              </div>

              {/* Expiry Selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-slate-500" />
                    <span>4. Expiration Time ({formatActiveDuration(getActiveMinutes())})</span>
                  </label>
                  <span className="text-[11px] font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                    Expires ~{calculateExpiryDateFromMinutes(getActiveMinutes())}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {EXPIRY_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handleExpiryPresetClick(preset.minutes)}
                      className={`rounded-xl px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                        !isCustomExpiry && selectedMinutes === preset.minutes
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIsCustomExpiry(true)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
                      isCustomExpiry
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'border border-teal-200 bg-teal-50/60 text-teal-800 hover:bg-teal-100'
                    }`}
                  >
                    <span>Custom</span>
                  </button>
                </div>

                {/* Custom Duration Controls (Minutes, Hours, Days) */}
                {isCustomExpiry && (
                  <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3 transition-all">
                    <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <span>Customize exact time:</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <input
                          type="number"
                          min="1"
                          max={customUnit === 'minutes' ? 43200 : customUnit === 'hours' ? 720 : 30}
                          step="1"
                          value={customAmount}
                          onChange={(e) => setCustomAmount(e.target.value)}
                          className="w-24 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                          placeholder="15"
                        />
                      </div>

                      {/* Unit Selector: Minutes / Hours / Days */}
                      <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setCustomUnit('minutes')}
                          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                            customUnit === 'minutes'
                              ? 'bg-white text-teal-800 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Minutes
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomUnit('hours')}
                          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                            customUnit === 'hours'
                              ? 'bg-white text-teal-800 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Hours
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomUnit('days')}
                          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                            customUnit === 'days'
                              ? 'bg-white text-teal-800 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Days
                        </button>
                      </div>

                      <span className="text-[11px] text-slate-500">
                        (Active: {formatActiveDuration(getActiveMinutes())})
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* CRITICAL SECURITY EXPLANATION BANNER */}
              <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-3.5 text-xs text-teal-950">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 text-teal-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-teal-900 block mb-0.5">
                      Zero-Knowledge Architecture Guarantee:
                    </span>
                    <p className="text-teal-900 font-medium">
                      &quot;The QR code provides temporary access to the selected document. It does not contain the document itself.&quot;
                    </p>
                    <p className="mt-1 text-[11px] text-teal-700">
                      Only a cryptographically random, one-time access token is encoded. The database stores only a SHA-256 hash.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || !selectedDocId}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition"
                >
                  {isSubmitting ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Generating QR &amp; Token...</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="h-4 w-4" />
                      <span>Share Securely</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* STEP 2: QR CODE PREVIEW & COPY LINK SCREEN */
            <div className="space-y-5 text-center">
              {revokedNotice ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center">
                  <Ban className="h-8 w-8 text-rose-600 mx-auto mb-2" />
                  <h4 className="font-bold text-rose-900 text-sm">Access Grant Revoked</h4>
                  <p className="text-xs text-rose-700 mt-1">
                    The temporary token and QR code have been permanently invalidated. Any attempt to use this link will be rejected.
                  </p>
                </div>
              ) : (
                <>
                  {/* QR Canvas Box */}
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
                        href={`/shared-access/${shareResult.raw_token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
                      >
                        <ExternalLink className="h-3 w-3 text-slate-500" />
                        <span>Test Link in Tab</span>
                      </a>
                    </div>
                  </div>

                  {/* PROMINENT EXPLANATION REQUIRED BY USER */}
                  <div className="rounded-xl border border-teal-200 bg-teal-50/80 p-3.5 text-left text-xs">
                    <div className="flex items-start gap-2.5">
                      <ShieldCheck className="h-4 w-4 text-teal-700 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-teal-950 block">Security Guarantee</span>
                        <p className="font-semibold text-teal-900 mt-0.5">
                          &quot;The QR code provides temporary access to the selected document. It does not contain the document itself.&quot;
                        </p>
                        <p className="text-[11px] text-teal-700 mt-1">
                          No document bytes, passwords, or encryption keys are stored inside this QR code.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Share Link Copy Box */}
                  <div className="text-left">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Secure Access URL
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 font-mono text-xs text-slate-700 truncate select-all">
                        {buildShareAccessUrl(shareResult.raw_token, lanIp || shareResult.lan_ip)}
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                          copiedLink
                            ? 'bg-emerald-600 text-white'
                            : 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm'
                        }`}
                      >
                        {copiedLink ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy Link</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Details summary */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-left text-xs space-y-1.5">
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Recipient:</span>
                      <span className="font-bold text-slate-900">{shareResult.recipient_identifier}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Permission:</span>
                      <span className="font-semibold text-slate-800">
                        {shareResult.can_download ? 'View & Download' : 'View Only'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Expires In / At:</span>
                      <span className="font-bold text-amber-700">
                        {new Date(shareResult.expires_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600">
                      <span>DB Security Storage:</span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {shareResult.token_hash_preview}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* Footer Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                {!revokedNotice ? (
                  <button
                    type="button"
                    onClick={handleImmediateRevoke}
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
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
