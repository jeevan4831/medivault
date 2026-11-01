import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import documentService from '../services/documentService.js'
import {
  Files,
  UploadCloud,
  Search,
  Download,
  Trash2,
  Eye,
  Calendar,
  HardDrive,
  AlertCircle,
  CheckCircle2,
  FileText,
  FileImage,
  RefreshCw,
  X,
  LayoutGrid,
  List,
  ShieldCheck,
  ArrowUpDown,
  Lock,
  ExternalLink,
  Share2,
  QrCode,
} from 'lucide-react'
import ShareModal from '../components/sharing/ShareModal.jsx'
import ConfirmationModal from '../components/ConfirmationModal.jsx'

const CATEGORY_TABS = [
  'All',
  'Identity',
  'Healthcare',
  'Education',
  'Vehicle',
  'Insurance',
  'Employment',
  'Other',
]

const SORT_OPTIONS = [
  { label: 'Newest First', value: 'date_desc' },
  { label: 'Oldest First', value: 'date_asc' },
  { label: 'Name (A to Z)', value: 'name_asc' },
  { label: 'Name (Z to A)', value: 'name_desc' },
  { label: 'Size (Largest)', value: 'size_desc' },
  { label: 'Size (Smallest)', value: 'size_asc' },
]

export default function DocumentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialCategory = searchParams.get('category') || 'All'

  const [documents, setDocuments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(initialCategory)
  const [sortBy, setSortBy] = useState('date_desc')
  const [viewMode, setViewMode] = useState('table') // 'table' or 'grid'

  // Decrypted Preview Modal state
  const [previewDoc, setPreviewDoc] = useState(null)
  const [previewBlobUrl, setPreviewBlobUrl] = useState(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)

  // Delete Confirm Modal state
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Action Notice Toast
  const [actionNotice, setActionNotice] = useState(null)

  // Share Modal state
  const [sharingDoc, setSharingDoc] = useState(null)

  const loadDocuments = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = {
        sort_by: sortBy,
      }
      if (selectedCategory && selectedCategory !== 'All') {
        params.category_name = selectedCategory
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim()
      }

      const list = await documentService.getDocuments(params)
      setDocuments(list)
    } catch (err) {
      console.error('Failed to load documents:', err)
      setError(
        err.response?.data?.detail || err.message || 'Could not load your document repository.'
      )
    } finally {
      setIsLoading(false)
    }
  }, [selectedCategory, searchQuery, sortBy])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  // Sync category changes with URL search params
  const handleCategoryChange = (cat) => {
    setSelectedCategory(cat)
    if (cat === 'All') {
      searchParams.delete('category')
      setSearchParams(searchParams)
    } else {
      setSearchParams({ category: cat })
    }
  }

  // Preview management
  const handleOpenPreview = async (doc) => {
    setPreviewDoc(doc)
    setIsPreviewLoading(true)
    try {
      const blob = await documentService.getDocumentViewBlob(doc.id)
      const url = window.URL.createObjectURL(blob)
      setPreviewBlobUrl(url)
    } catch (err) {
      console.error('Preview error:', err)
      setActionNotice({
        type: 'error',
        text: err.response?.data?.detail || 'Unable to decrypt document for preview.',
      })
      setPreviewDoc(null)
    } finally {
      setIsPreviewLoading(false)
    }
  }

  const handleClosePreview = () => {
    if (previewBlobUrl) {
      window.URL.revokeObjectURL(previewBlobUrl)
      setPreviewBlobUrl(null)
    }
    setPreviewDoc(null)
  }

  // Download
  const handleDownload = async (doc) => {
    try {
      await documentService.downloadDocument(doc.id, doc.original_filename)
      setActionNotice({
        type: 'success',
        text: `Downloaded and decrypted "${doc.original_filename}".`,
      })
    } catch (err) {
      console.error('Download error:', err)
      setActionNotice({
        type: 'error',
        text: err.response?.data?.detail || 'Download failed. Please check permissions.',
      })
    }
  }

  // Delete
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await documentService.deleteDocument(deleteTarget.id)
      setActionNotice({
        type: 'success',
        text: `Document "${deleteTarget.document_name}" has been permanently shredded and deleted from vault.`,
      })
      setDeleteTarget(null)
      loadDocuments()
    } catch (err) {
      console.error('Delete error:', err)
      setActionNotice({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to delete document.',
      })
    } finally {
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
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight sm:text-3xl">
            My Documents
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Encrypted personal records protected with AES-256-GCM. Decrypted only upon authorized owner access.
          </p>
        </div>

        <Link
          to="/upload"
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-brand-600/25 hover:bg-brand-700 transition self-start sm:self-auto"
        >
          <UploadCloud className="h-4 w-4" />
          <span>Upload Document</span>
        </Link>
      </div>

      {/* Action Notification Toast */}
      {actionNotice && (
        <div
          className={`flex items-center justify-between gap-3 rounded-xl border p-4 text-xs font-medium shadow-2xs ${
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

      {/* Controls Bar: Search, Sort, View Toggle */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, filename, notes..."
              className="w-full rounded-xl border border-slate-200 py-2 pl-10 pr-4 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Sort Select */}
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-700">
              <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-transparent font-semibold text-slate-700 focus:outline-none cursor-pointer"
                aria-label="Sort documents"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`rounded-lg p-1.5 transition ${
                  viewMode === 'table'
                    ? 'bg-white text-brand-700 shadow-2xs font-semibold'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Table View"
                aria-label="Table View"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`rounded-lg p-1.5 transition ${
                  viewMode === 'grid'
                    ? 'bg-white text-brand-700 shadow-2xs font-semibold'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Grid/Card View"
                aria-label="Grid/Card View"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>

            {/* Refresh */}
            <button
              type="button"
              onClick={loadDocuments}
              className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition"
              title="Refresh repository"
              aria-label="Refresh repository"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none border-t border-slate-100 pt-3">
          {CATEGORY_TABS.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => handleCategoryChange(cat)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition shrink-0 ${
                selectedCategory === cat
                  ? 'bg-brand-600 text-white shadow-2xs'
                  : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content: Loading, Error, Empty, Table, or Grid */}
      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-10 rounded-xl bg-slate-200" />
          <div className="h-14 rounded-xl bg-slate-200" />
          <div className="h-14 rounded-xl bg-slate-200" />
          <div className="h-14 rounded-xl bg-slate-200" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-8 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-rose-600" />
          <h3 className="mt-2 text-sm font-bold text-rose-900">Failed to Load Documents</h3>
          <p className="mt-1 text-xs text-rose-700">{error}</p>
          <button
            type="button"
            onClick={loadDocuments}
            className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
          >
            Try Again
          </button>
        </div>
      ) : documents.length === 0 ? (
        /* Empty State */
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-200">
            <Files className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-900">
            {searchQuery || selectedCategory !== 'All'
              ? 'No Matching Documents Found'
              : 'Your Vault Has No Documents Yet'}
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
            {searchQuery || selectedCategory !== 'All'
              ? 'No documents matched your search filter criteria. Try resetting filters or using a broader query.'
              : 'Upload your identity cards, healthcare records, academic degrees, and insurance policies to store them with AES-256-GCM encryption.'}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {searchQuery || selectedCategory !== 'All' ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  handleCategoryChange('All')
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear Search &amp; Filters
              </button>
            ) : null}
            <Link
              to="/upload"
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition"
            >
              <UploadCloud className="h-4 w-4" />
              <span>Upload Document</span>
            </Link>
          </div>
        </div>
      ) : viewMode === 'table' ? (
        /* Document Table & Mobile Card View */
        <div className="space-y-3">
          {/* Mobile Card List (visible on md:hidden) */}
          <div className="space-y-3 md:hidden">
            {documents.map((doc) => {
              const isPdf = doc.file_type === 'PDF' || doc.mime_type === 'application/pdf'
              const Icon = isPdf ? FileText : FileImage

              return (
                <div
                  key={doc.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          isPdf ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <Link
                          to={`/documents/${doc.id}`}
                          className="font-bold text-slate-900 text-sm truncate block hover:text-brand-700"
                        >
                          {doc.document_name}
                        </Link>
                        <p className="text-[11px] text-slate-400 font-mono truncate">
                          {doc.original_filename}
                        </p>
                      </div>
                    </div>

                    <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700 border border-brand-200/50">
                      {doc.category_name || 'General'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-50 pt-2">
                    <span className="flex items-center gap-1 font-medium">
                      <HardDrive className="h-3 w-3 text-slate-400" />
                      {formatFileSize(doc.file_size)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-slate-400" />
                      {formatDate(doc.created_at)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                      <ShieldCheck className="h-3 w-3" />
                      Encrypted
                    </span>
                  </div>

                  {/* Mobile Actions Bar */}
                  <div className="grid grid-cols-4 gap-2 border-t border-slate-100 pt-2.5">
                    <button
                      type="button"
                      onClick={() => handleOpenPreview(doc)}
                      className="flex items-center justify-center gap-1 rounded-xl bg-slate-50 py-2 text-xs font-semibold text-slate-700 active:bg-slate-100 transition"
                    >
                      <Eye className="h-3.5 w-3.5 text-slate-500" />
                      <span>View</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSharingDoc(doc)}
                      className="flex items-center justify-center gap-1 rounded-xl bg-teal-50 py-2 text-xs font-semibold text-teal-800 border border-teal-200/60 active:bg-teal-100 transition"
                    >
                      <Share2 className="h-3.5 w-3.5 text-teal-600" />
                      <span>Share</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownload(doc)}
                      className="flex items-center justify-center gap-1 rounded-xl bg-slate-50 py-2 text-xs font-semibold text-slate-700 active:bg-slate-100 transition"
                    >
                      <Download className="h-3.5 w-3.5 text-slate-500" />
                      <span>Save</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteTarget(doc)}
                      className="flex items-center justify-center gap-1 rounded-xl bg-rose-50 py-2 text-xs font-semibold text-rose-700 active:bg-rose-100 transition"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop Document Table View */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3.5 pl-6 pr-4">Document Name</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">File Type</th>
                  <th className="py-3.5 px-4">Upload Date</th>
                  <th className="py-3.5 px-4">Size</th>
                  <th className="py-3.5 px-4">Security Status</th>
                  <th className="py-3.5 pl-4 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.map((doc) => {
                  const isPdf = doc.file_type === 'PDF' || doc.mime_type === 'application/pdf'
                  const Icon = isPdf ? FileText : FileImage

                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/70 transition">
                      {/* Document Name & Original Filename */}
                      <td className="py-3.5 pl-6 pr-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                              isPdf ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                            }`}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 max-w-xs">
                            <Link
                              to={`/documents/${doc.id}`}
                              className="font-bold text-slate-900 hover:text-brand-700 transition truncate block"
                              title={doc.document_name}
                            >
                              {doc.document_name}
                            </Link>
                            <span
                              className="text-[11px] text-slate-400 font-mono truncate block"
                              title={doc.original_filename}
                            >
                              {doc.original_filename}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4">
                        <span className="inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-700 border border-brand-200/50">
                          {doc.category_name || 'General'}
                        </span>
                      </td>

                      {/* File Type */}
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-700 text-[11px] rounded bg-slate-100 px-2 py-0.5">
                          {doc.file_type || 'FILE'}
                        </span>
                      </td>

                      {/* Upload Date */}
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        {formatDate(doc.created_at)}
                      </td>

                      {/* Size */}
                      <td className="py-3.5 px-4 text-slate-700 font-medium whitespace-nowrap">
                        {formatFileSize(doc.file_size)}
                      </td>

                      {/* Security Status */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200/60 whitespace-nowrap">
                          <ShieldCheck className="h-3 w-3" />
                          <span>{doc.security_status || 'AES-256-GCM'}</span>
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 pl-4 pr-6 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenPreview(doc)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-brand-50 hover:text-brand-700 transition"
                            title="View decrypted preview"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          <Link
                            to={`/documents/${doc.id}`}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                            title="View document metadata"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>

                          <button
                            type="button"
                            onClick={() => setSharingDoc(doc)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-teal-50 hover:text-teal-700 transition"
                            title="Share with temporary QR code"
                          >
                            <Share2 className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDownload(doc)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-brand-50 hover:text-brand-700 transition"
                            title="Download file"
                          >
                            <Download className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteTarget(doc)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition"
                            title="Delete document"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      ) : (
        /* Document Card / Grid View */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => {
            const isPdf = doc.file_type === 'PDF' || doc.mime_type === 'application/pdf'
            const Icon = isPdf ? FileText : FileImage

            return (
              <div
                key={doc.id}
                className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md hover:border-brand-300"
              >
                <div>
                  {/* Top Bar: Icon & Category badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                        isPdf
                          ? 'bg-rose-50 text-rose-600'
                          : 'bg-emerald-50 text-emerald-600'
                      }`}
                    >
                      <Icon className="h-6 w-6" />
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-700 border border-brand-200/50">
                        {doc.category_name || 'General'}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        {doc.file_type || 'FILE'}
                      </span>
                    </div>
                  </div>

                  {/* Document Name */}
                  <Link
                    to={`/documents/${doc.id}`}
                    className="mt-3 font-bold text-slate-900 group-hover:text-brand-700 transition block truncate"
                    title={doc.document_name}
                  >
                    {doc.document_name}
                  </Link>

                  {/* Original Filename */}
                  <p className="mt-0.5 text-xs text-slate-400 font-mono truncate" title={doc.original_filename}>
                    {doc.original_filename}
                  </p>

                  {/* Metadata Row */}
                  <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1 font-medium">
                      <HardDrive className="h-3 w-3 text-slate-400" />
                      {formatFileSize(doc.file_size)}
                    </span>
                    <span>&middot;</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-slate-400" />
                      {formatDate(doc.created_at)}
                    </span>
                  </div>

                  {/* Security Status Badge */}
                  <div className="mt-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200/60">
                      <ShieldCheck className="h-3 w-3" />
                      <span>{doc.security_status || 'AES-256-GCM Encrypted'}</span>
                    </span>
                  </div>

                  {doc.description && (
                    <p className="mt-2 text-xs text-slate-600 line-clamp-2 bg-slate-50 p-2 rounded-lg">
                      {doc.description}
                    </p>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenPreview(doc)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-brand-700 transition"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>View</span>
                    </button>
                    <span className="text-slate-200">|</span>
                    <Link
                      to={`/documents/${doc.id}`}
                      className="text-xs font-semibold text-brand-600 hover:text-brand-800 transition"
                    >
                      Details
                    </Link>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSharingDoc(doc)}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-teal-50 hover:text-teal-700 transition"
                      title="Share with temporary QR code"
                    >
                      <Share2 className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownload(doc)}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-brand-50 hover:text-brand-700 transition"
                      title="Download decrypted document"
                    >
                      <Download className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteTarget(doc)}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition"
                      title="Delete document"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Decrypted Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 backdrop-blur-xs">
          <div className="flex flex-col h-[92vh] sm:h-[85vh] w-full max-w-4xl rounded-2xl bg-white shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  {previewDoc.file_type === 'PDF' ? (
                    <FileText className="h-5 w-5" />
                  ) : (
                    <FileImage className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 text-sm truncate max-w-[150px] sm:max-w-md">
                    {previewDoc.document_name}
                  </h3>
                  <span className="text-[11px] text-slate-500 font-mono truncate block max-w-[150px] sm:max-w-md">
                    {previewDoc.original_filename} &middot; {formatFileSize(previewDoc.file_size)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownload(previewDoc)}
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

            {/* Body */}
            <div className="flex-1 overflow-auto bg-slate-100/60 p-4 flex items-center justify-center">
              {isPreviewLoading ? (
                <div className="flex flex-col items-center gap-3 text-slate-500">
                  <div className="h-8 w-8 animate-spin rounded-full border-3 border-brand-600 border-t-transparent" />
                  <span className="text-xs font-medium">Decrypting file in memory...</span>
                </div>
              ) : previewBlobUrl ? (
                previewDoc.file_type === 'PDF' || previewDoc.mime_type === 'application/pdf' ? (
                  <iframe
                    src={previewBlobUrl}
                    title={previewDoc.document_name}
                    className="h-full w-full rounded-xl border border-slate-200 bg-white"
                  />
                ) : (
                  <img
                    src={previewBlobUrl}
                    alt={previewDoc.document_name}
                    className="max-h-full max-w-full rounded-xl object-contain shadow-sm"
                  />
                )
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Encrypted Document"
        description={`Are you sure you want to permanently delete "${deleteTarget?.document_name}"? The encrypted file will be cryptographically overwritten and deleted from storage.`}
        confirmText="Delete Document"
        cancelText="Cancel"
        isDestructive={true}
        isLoading={isDeleting}
        icon={Trash2}
      />

      {/* Share Document Modal */}
      <ShareModal
        isOpen={!!sharingDoc}
        onClose={() => setSharingDoc(null)}
        initialDocument={sharingDoc}
        onShareCreated={() => {
          loadDocuments()
          setActionNotice({
            type: 'success',
            text: `Temporary QR share link generated for "${sharingDoc?.document_name}".`,
          })
        }}
      />
    </div>
  )
}
