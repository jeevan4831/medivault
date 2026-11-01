import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ShieldCheck,
  Lock,
  Download,
  Eye,
  Clock,
  AlertCircle,
  FileText,
  FileImage,
  UserCheck,
  CheckCircle2,
  Ban,
  Sparkles,
  ExternalLink,
  Shield,
  ArrowRight,
} from 'lucide-react'
import shareService from '../services/shareService.js'
import DocumentViewer from '../components/sharing/DocumentViewer.jsx'
import AccessDeniedPage from './sharing/AccessDeniedPage.jsx'
import ExpiredAccessPage from './sharing/ExpiredAccessPage.jsx'
import RevokedAccessPage from './sharing/RevokedAccessPage.jsx'

export default function RecipientAccessPage() {
  const { token } = useParams()

  // State: Token & Grant Metadata
  const [metadata, setMetadata] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorStatus, setErrorStatus] = useState(null) // 404, 403, 410, or 500
  const [errorMessage, setErrorMessage] = useState(null)

  // State: Recipient Verification according to security model
  const [isRecipientVerified, setIsRecipientVerified] = useState(false)
  const [verificationInput, setVerificationInput] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [verificationError, setVerificationError] = useState(null)

  // State: Decrypted Inline Document
  const [previewBlobUrl, setPreviewBlobUrl] = useState(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(null)
  const [isDownloading, setIsDownloading] = useState(false)

  // Countdown timer in seconds
  const [secondsRemaining, setSecondsRemaining] = useState(null)

  // Step 1: Open temporary access page and validate token
  useEffect(() => {
    fetchMetadata()
  }, [token])

  const fetchMetadata = async () => {
    if (!token) return
    setIsLoading(true)
    setErrorStatus(null)
    setErrorMessage(null)

    try {
      // 2. Validate token, 3. Check exists, 4. Check ACTIVE, 5. Check expiry, 6. Check revocation
      const data = await shareService.getSharedAccessInfo(token)
      setMetadata(data)
      setSecondsRemaining(data.time_remaining_seconds)

      // Pre-fill recipient verification input with designated identifier for convenience
      if (data.recipient_identifier) {
        setVerificationInput(data.recipient_identifier)
      }
    } catch (err) {
      console.error('Failed to validate share token:', err)
      const status = err.response?.status || 500
      setErrorStatus(status)
      if (status === 404) {
        setErrorMessage(err.response?.data?.detail || 'This shared document link was not found or is invalid.')
      } else if (status === 410) {
        setErrorMessage(err.response?.data?.detail || 'This temporary share link has expired.')
      } else if (status === 403) {
        setErrorMessage(err.response?.data?.detail || 'Access to this shared document has been revoked by the owner.')
      } else if (!err.response || err.code === 'ERR_NETWORK') {
        setErrorMessage('Cannot connect to MediVault server. Please check your network connection.')
      } else {
        setErrorMessage(err.response?.data?.detail || 'Unable to access shared document with this token.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Step 5: Countdown timer to live expiry
  useEffect(() => {
    if (secondsRemaining === null || secondsRemaining <= 0) return

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          setErrorStatus(410)
          setErrorMessage('This temporary share link has expired.')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [secondsRemaining])

  // Cleanup decrypted in-memory blob URL on unmount
  useEffect(() => {
    return () => {
      if (previewBlobUrl) {
        window.URL.revokeObjectURL(previewBlobUrl)
      }
    }
  }, [previewBlobUrl])

  // Step 7: Authenticate / Verify recipient identity
  const handleVerifyRecipient = async (e) => {
    if (e) e.preventDefault()
    if (!verificationInput.trim()) {
      setVerificationError('Please enter your recipient identifier to confirm identity.')
      return
    }

    setIsVerifying(true)
    setVerificationError(null)

    try {
      await shareService.verifyRecipientIdentity(token, verificationInput.trim())
      setIsRecipientVerified(true)

      // Step 8 & 9: Load decrypted document buffer in-memory
      loadDecryptedPreview()
    } catch (err) {
      console.error('Recipient verification failed:', err)
      setVerificationError(
        err.response?.data?.detail ||
          'Recipient verification failed. Please verify that your name matches the authorized party.'
      )
    } finally {
      setIsVerifying(false)
    }
  }

  // Step 8 & 9: In-memory decrypted document fetch
  const loadDecryptedPreview = async () => {
    setIsPreviewLoading(true)
    setPreviewError(null)
    try {
      const blob = await shareService.getSharedAccessViewBlob(token)
      const url = window.URL.createObjectURL(blob)
      setPreviewBlobUrl(url)
    } catch (err) {
      console.error('Decryption failed:', err)
      setPreviewError(
        err.response?.data?.detail || 'Failed to decrypt document buffer in memory.'
      )
    } finally {
      setIsPreviewLoading(false)
    }
  }

  // Step 9: Download handler enforcing permission check
  const handleDownload = async () => {
    if (!metadata || !metadata.can_download) return
    setIsDownloading(true)
    try {
      await shareService.downloadSharedDocument(token, metadata.original_filename)
    } catch (err) {
      console.error('Download failed:', err)
      alert(err.response?.data?.detail || 'Failed to download shared document.')
    } finally {
      setIsDownloading(false)
    }
  }

  const formatCountdown = (secs) => {
    if (secs === null || secs <= 0) return 'Expired'
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    if (h > 0) return `${h}h ${m}m ${s}s`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  // 1. Loading State
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="h-14 w-14 rounded-2xl bg-teal-500/20 text-teal-400 flex items-center justify-center ring-2 ring-teal-500/40 animate-pulse">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h2 className="text-lg font-bold text-white">Validating Temporary Access Token</h2>
          <p className="text-xs text-slate-400">
            Checking cryptographic token hash, expiration status, and revocation in real-time...
          </p>
          <div className="h-1.5 w-40 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full w-full bg-teal-500 animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  // 6. Check Revocation Status -> Render RevokedAccessPage
  if (
    errorStatus === 410 &&
    errorMessage &&
    errorMessage.toLowerCase().includes('revoked')
  ) {
    return (
      <RevokedAccessPage
        documentName={metadata?.document_name}
        recipientIdentifier={metadata?.recipient_identifier}
      />
    )
  }

  // 5. Check Expiry -> Render ExpiredAccessPage
  if (
    (errorStatus === 410 &&
      errorMessage &&
      errorMessage.toLowerCase().includes('expired')) ||
    (secondsRemaining !== null && secondsRemaining <= 0)
  ) {
    return (
      <ExpiredAccessPage
        documentName={metadata?.document_name}
        recipientIdentifier={metadata?.recipient_identifier}
        expiredAt={metadata?.expires_at}
      />
    )
  }

  // 3. Check Token Exists / 4. Check ACTIVE -> Render AccessDeniedPage
  if (errorStatus || !metadata) {
    return (
      <AccessDeniedPage
        title="Access Denied"
        reason={
          errorStatus === 404
            ? 'Token Not Found in System'
            : errorStatus === 403
            ? 'Permission Not Active'
            : 'Access Unauthorized'
        }
        details={errorMessage}
        onRetry={fetchMetadata}
      />
    )
  }

  const isPdf = metadata.mime_type === 'application/pdf'
  const isImage = metadata.mime_type?.startsWith('image/')
  const DocIcon = isPdf ? FileText : FileImage

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-4 sm:px-8 py-3.5 sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/20 text-teal-400 ring-1 ring-teal-500/40">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <span className="font-black text-sm tracking-tight text-white flex items-center gap-1.5">
                MediVault <span className="font-medium text-xs text-teal-400">Temporary Access Portal</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-950/50 px-3 py-1 text-xs font-semibold text-teal-300">
              <Clock className="h-3.5 w-3.5 text-teal-400 animate-pulse" />
              <span>Expires in: {formatCountdown(secondsRemaining)}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 mx-auto max-w-6xl w-full p-4 sm:p-8 space-y-6">
        {/* MANDATORY PROMINENT UI EXPLANATION BANNER */}
        <div className="rounded-2xl border border-teal-500/30 bg-gradient-to-r from-teal-950/70 via-slate-900/90 to-slate-900/90 p-4 sm:p-5 shadow-lg backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-teal-500/20 p-2 text-teal-400 shrink-0 mt-0.5">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400 block mb-0.5">
                  Temporary QR Access Architecture
                </span>
                <p className="text-sm font-bold text-white">
                  &quot;The QR code provides temporary access to the selected document. It does not contain the document itself.&quot;
                </p>
                <p className="text-xs text-slate-300 mt-1">
                  This document is decrypted strictly in-memory over an encrypted TLS connection. Direct server storage paths and cryptographic master keys are never exposed.
                </p>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              <span className="rounded-full bg-slate-800 border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-300">
                AES-256-GCM Verified
              </span>
            </div>
          </div>
        </div>

        {/* 7. Recipient Identity Verification Gate (if not yet confirmed) */}
        {!isRecipientVerified ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl max-w-2xl mx-auto">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/20 text-teal-400 ring-1 ring-teal-500/40">
                <UserCheck className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  Recipient Identity Verification
                </h2>
                <p className="text-xs text-slate-400">
                  Verify recipient credentials to decrypt and unlock this temporary grant.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {/* Document Summary Card */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2 text-xs">
                <div className="flex justify-between items-center text-slate-400">
                  <span>Permitted Document:</span>
                  <span className="font-bold text-white">{metadata.document_name}</span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Designated Recipient:</span>
                  <span className="font-bold text-teal-300">{metadata.recipient_identifier}</span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Permitted Access:</span>
                  <span className="font-semibold text-slate-200">
                    {metadata.can_download ? 'View & Download Allowed' : 'View Only (Download Disabled)'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Time-To-Live:</span>
                  <span className="font-mono text-amber-400">{formatCountdown(secondsRemaining)}</span>
                </div>
              </div>

              {verificationError && (
                <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-300">
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{verificationError}</span>
                </div>
              )}

              {/* Recipient Verification Form */}
              <form onSubmit={handleVerifyRecipient} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Confirm Recipient Name or Identifier
                  </label>
                  <input
                    type="text"
                    value={verificationInput}
                    onChange={(e) => setVerificationInput(e.target.value)}
                    placeholder="Enter your name, clinic, or email..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-teal-500 focus:outline-hidden"
                    required
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Must match the authorized party recorded by the document owner.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isVerifying}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-5 py-3 text-xs font-bold text-slate-950 shadow-lg shadow-teal-500/20 hover:bg-teal-400 disabled:opacity-50 transition cursor-pointer"
                  >
                    {isVerifying ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                        <span>Verifying Recipient Identity...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Confirm Identity &amp; Unlock Document</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          /* 8. Show only the permitted document & 9. Enforce VIEW or VIEW_AND_DOWNLOAD */
          <div className="space-y-6">
            {/* Metadata Summary Card */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                      isPdf
                        ? 'bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/40'
                        : 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40'
                    }`}
                  >
                    <DocIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-lg font-black text-white">{metadata.document_name}</h1>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>{metadata.category_name || 'Medical Record'}</span>
                      <span>&bull;</span>
                      <span>{metadata.file_type} &bull; {formatFileSize(metadata.file_size)}</span>
                      <span>&bull;</span>
                      <span className="text-teal-400 font-semibold">
                        Recipient: {metadata.recipient_identifier}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      metadata.can_download
                        ? 'bg-teal-900/60 text-teal-300 border border-teal-600/50'
                        : 'bg-indigo-950/60 text-indigo-300 border border-indigo-700/50'
                    }`}
                  >
                    {metadata.can_download
                      ? 'Full Access (View & Download)'
                      : 'High Privacy (View Only)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Document Viewer Component */}
            <DocumentViewer
              metadata={metadata}
              previewBlobUrl={previewBlobUrl}
              isPreviewLoading={isPreviewLoading}
              previewError={previewError}
              onRetry={loadDecryptedPreview}
              onDownload={handleDownload}
              isDownloading={isDownloading}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        MediVault Confidential Document Vault &bull; End-to-End Cryptographic Access Control
      </footer>
    </div>
  )
}
