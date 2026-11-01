import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import documentService from '../services/documentService.js'
import ShareModal from '../components/sharing/ShareModal.jsx'
import ConfirmationModal from '../components/ConfirmationModal.jsx'
import {
  ArrowLeft,
  FileText,
  FileImage,
  Download,
  Eye,
  Trash2,
  Calendar,
  HardDrive,
  ShieldCheck,
  Share2,
  User,
  AlertCircle,
  CheckCircle2,
  Lock,
  X,
  RefreshCw,
} from 'lucide-react'

export default function DocumentDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [document, setDocument] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  // Preview state
  const [previewBlobUrl, setPreviewBlobUrl] = useState(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [actionNotice, setActionNotice] = useState(null)

  // Share modal state
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)

  const fetchDocument = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await documentService.getDocument(id)
      setDocument(data)
    } catch (err) {
      console.error('Failed to load document details:', err)
      setError(
        err.response?.data?.detail || err.message || 'Unable to retrieve document details.'
      )
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchDocument()
  }, [fetchDocument])

  // Clean up preview blob URL on unmount or close
  useEffect(() => {
    return () => {
      if (previewBlobUrl) {
        window.URL.revokeObjectURL(previewBlobUrl)
      }
    }
  }, [previewBlobUrl])

  const handleOpenPreview = async () => {
    setShowPreviewModal(true)
    if (previewBlobUrl) return

    setIsPreviewLoading(true)
    try {
      const blob = await documentService.getDocumentViewBlob(document.id)
      const url = window.URL.createObjectURL(blob)
      setPreviewBlobUrl(url)
    } catch (err) {
      console.error('Preview failed:', err)
      setActionNotice({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to decrypt and preview document.',
      })
      setShowPreviewModal(false)
    } finally {
      setIsPreviewLoading(false)
    }
  }

  const handleClosePreview = () => {
    setShowPreviewModal(false)
    if (previewBlobUrl) {
      window.URL.revokeObjectURL(previewBlobUrl)
      setPreviewBlobUrl(null)
    }
  }

  const handleDownload = async () => {
    try {
      await documentService.downloadDocument(document.id, document.original_filename)
      setActionNotice({
        type: 'success',
        text: `Downloaded and decrypted "${document.original_filename}".`,
      })
    } catch (err) {
      console.error('Download failed:', err)
      setActionNotice({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to download document.',
      })
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await documentService.deleteDocument(document.id)
      navigate('/documents', {
        state: { notice: `Document "${document.document_name}" was permanently deleted.` },
      })
    } catch (err) {
      console.error('Delete failed:', err)
      setActionNotice({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to delete document.',
      })
      setShowDeleteModal(false)
      setIsDeleting(false)
    }
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const formatDate = (dateStr) => {
    try {
      return new Date(dateStr).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl animate-pulse">
        <div className="h-6 w-32 rounded bg-slate-200" />
        <div className="h-28 rounded-2xl bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-48 rounded-2xl bg-slate-200" />
          <div className="h-48 rounded-2xl bg-slate-200" />
        </div>
      </div>
    )
  }

  if (error || !document) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-8 text-center max-w-2xl mx-auto">
        <AlertCircle className="mx-auto h-10 w-10 text-rose-600" />
        <h2 className="mt-3 text-lg font-bold text-rose-900">Document Unavailable</h2>
        <p className="mt-1 text-xs text-rose-700">{error || 'Document could not be located.'}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            to="/documents"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to Documents
          </Link>
          <button
            type="button"
            onClick={fetchDocument}
            className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const isPdf = document.mime_type === 'application/pdf'
  const isImage = document.mime_type.startsWith('image/')
  const Icon = isPdf ? FileText : FileImage

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back Link */}
      <div>
        <Link
          to="/documents"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-700 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to My Documents</span>
        </Link>
      </div>

      {/* Action Notification */}
      {actionNotice && (
        <div
          className={`flex items-center justify-between gap-3 rounded-xl border p-4 text-xs font-medium ${
            actionNotice.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionNotice.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{actionNotice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Header Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
                isPdf ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200' : 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200'
              }`}
            >
              <Icon className="h-7 w-7" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700 border border-brand-200/60">
                  {document.category_name || 'General'}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                  {document.file_type || 'FILE'}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200/60">
                  <ShieldCheck className="h-3 w-3" />
                  {document.security_status || 'AES-256-GCM Encrypted'}
                </span>
              </div>

              <h1 className="mt-2 text-2xl font-extrabold text-slate-900 tracking-tight sm:text-3xl">
                {document.document_name}
              </h1>
              <p className="mt-1 text-xs text-slate-500 font-mono">
                {document.original_filename}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:flex-wrap items-center">
            <button
              type="button"
              onClick={() => setIsShareModalOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2.5 text-xs font-semibold text-teal-800 shadow-2xs hover:bg-teal-100 transition active:scale-95"
              title="Share document securely with temporary QR code"
            >
              <Share2 className="h-4 w-4 text-teal-700" />
              <span>Share Securely</span>
            </button>

            <button
              type="button"
              onClick={handleOpenPreview}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-brand-700 transition active:scale-95"
              title="View decrypted document inline"
            >
              <Eye className="h-4 w-4" />
              <span>View</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-brand-600/25 hover:bg-brand-700 transition active:scale-95"
              title="Download decrypted document"
            >
              <Download className="h-4 w-4" />
              <span>Download</span>
            </button>

            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/50 px-3 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100/70 transition active:scale-95"
              title="Delete document permanently"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid of Details Specs */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Core Metadata Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 uppercase tracking-wider">
            Document Specifications
          </h2>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500 font-semibold">Document Name</span>
              <span className="font-bold text-slate-900">{document.document_name}</span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500 font-semibold">Category</span>
              <span className="font-semibold text-brand-700">{document.category_name}</span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500 font-semibold">File Type</span>
              <span className="font-bold text-slate-800">{document.file_type} ({document.mime_type})</span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500 font-semibold">File Size</span>
              <span className="font-bold text-slate-900">{formatFileSize(document.file_size)}</span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500 font-semibold">Uploaded Date</span>
              <span className="text-slate-800">{formatDate(document.created_at)}</span>
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500 font-semibold">Last Modified</span>
              <span className="text-slate-800">{formatDate(document.updated_at)}</span>
            </div>
          </div>
        </div>

        {/* Ownership & Sharing Status Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 uppercase tracking-wider">
            Ownership &amp; Sharing Status
          </h2>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500 font-semibold flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-slate-400" />
                Owner
              </span>
              <span className="font-bold text-slate-900">
                {document.owner_name || 'Authenticated Owner'}
              </span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500 font-semibold flex items-center gap-1.5">
                <Share2 className="h-3.5 w-3.5 text-slate-400" />
                Sharing Status
              </span>
              <span
                className={`font-semibold rounded-full px-2.5 py-0.5 ${
                  document.active_shares_count > 0
                    ? 'bg-teal-50 text-teal-700 border border-teal-200/60'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {document.sharing_status || 'Private (0 Shares)'}
              </span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500 font-semibold flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Storage Cipher
              </span>
              <span className="font-mono text-slate-800 font-semibold">
                AES-256-GCM + 96-bit Nonce
              </span>
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500 font-semibold flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-brand-600" />
                Storage Path Isolation
              </span>
              <span className="text-emerald-700 font-medium">Protected Server Volume</span>
            </div>
          </div>

          {/* Description Section */}
          {document.description ? (
            <div className="mt-4 rounded-xl bg-slate-50 p-3.5 border border-slate-100">
              <span className="font-bold text-slate-700 block mb-1 text-xs">Description:</span>
              <p className="text-slate-600 text-xs">{document.description}</p>
            </div>
          ) : (
            <div className="mt-4 rounded-xl bg-slate-50/70 p-3 text-xs text-slate-400 italic">
              No additional notes or description provided for this document.
            </div>
          )}
        </div>
      </div>

      {/* Security Details Notice */}
      <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-5 text-xs text-slate-600 space-y-1.5">
        <h4 className="font-bold text-brand-900 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-brand-700" />
          End-to-End Cryptographic Security Guarantee
        </h4>
        <p className="text-slate-600">
          This file is encrypted with a unique 96-bit random nonce before writing to server disk.
          Direct filesystem paths are never exposed to the browser. Decryption is performed
          strictly in-memory upon verified ownership authentication.
        </p>
      </div>

      {/* Decrypted Document Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 backdrop-blur-xs">
          <div className="flex flex-col h-[92vh] sm:h-[85vh] w-full max-w-4xl rounded-2xl bg-white shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 text-sm truncate max-w-[140px] sm:max-w-md">
                    {document.document_name}
                  </h3>
                  <span className="text-[11px] text-slate-500 font-mono truncate block max-w-[140px] sm:max-w-md">
                    {document.original_filename} &middot; {formatFileSize(document.file_size)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={handleClosePreview}
                  className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                  aria-label="Close preview"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Content Body */}
            <div className="flex-1 overflow-auto bg-slate-100/60 p-4 flex items-center justify-center">
              {isPreviewLoading ? (
                <div className="flex flex-col items-center gap-3 text-slate-500">
                  <div className="h-8 w-8 animate-spin rounded-full border-3 border-brand-600 border-t-transparent" />
                  <span className="text-xs font-medium">Decrypting file in memory...</span>
                </div>
              ) : previewBlobUrl ? (
                isPdf ? (
                  <iframe
                    src={previewBlobUrl}
                    title={document.document_name}
                    className="h-full w-full rounded-xl border border-slate-200 bg-white"
                  />
                ) : isImage ? (
                  <img
                    src={previewBlobUrl}
                    alt={document.document_name}
                    className="max-h-full max-w-full rounded-xl object-contain shadow-sm"
                  />
                ) : (
                  <div className="text-center p-8 bg-white rounded-xl">
                    <p className="text-sm font-semibold text-slate-700">Preview not available for this format.</p>
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download Decrypted File</span>
                    </button>
                  </div>
                )
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Encrypted Document"
        description={`Are you sure you want to permanently delete "${document.document_name}"? The encrypted file will be cryptographically overwritten and deleted from storage.`}
        confirmText="Delete Document"
        cancelText="Cancel"
        isDestructive={true}
        isLoading={isDeleting}
        icon={Trash2}
      />

      {/* Share Document Modal */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        initialDocument={document}
        onShareCreated={() => {
          fetchDocument()
          setActionNotice({
            type: 'success',
            text: `Temporary QR share created for "${document?.document_name}".`,
          })
        }}
      />
    </div>
  )
}
