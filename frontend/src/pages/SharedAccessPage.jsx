import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Share2,
  QrCode,
  ShieldCheck,
  Clock,
  Eye,
  Download,
  Ban,
  Copy,
  Check,
  AlertCircle,
  Search,
  RefreshCw,
  Plus,
  FileText,
  FileImage,
  UserCheck,
  CheckCircle2,
  ExternalLink,
  X,
  Filter,
} from 'lucide-react'
import shareService from '../services/shareService.js'
import ShareModal from '../components/sharing/ShareModal.jsx'
import QRPreviewModal from '../components/sharing/QRPreviewModal.jsx'
import ConfirmationModal from '../components/ConfirmationModal.jsx'
import { buildShareAccessUrl } from '../utils/network.js'

export default function SharedAccessPage() {
  const [shares, setShares] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all', 'active', 'expired', 'revoked'

  // Action modals
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [qrModalShare, setQrModalShare] = useState(null)

  // Revoke confirm modal
  const [revokeTarget, setRevokeTarget] = useState(null)
  const [isRevoking, setIsRevoking] = useState(false)

  // Toast notice
  const [actionNotice, setActionNotice] = useState(null)
  const [copiedId, setCopiedId] = useState(null)

  const loadShares = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await shareService.getShares({
        status_filter: statusFilter,
        search: searchQuery,
      })
      setShares(data)
    } catch (err) {
      console.error('Failed to load shares:', err)
      setError(err.response?.data?.detail || err.message || 'Could not load document shares.')
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, searchQuery])

  useEffect(() => {
    loadShares()
  }, [loadShares])

  // Stat computations
  const totalShares = shares.length
  const activeShares = shares.filter((s) => s.status === 'ACTIVE' && !s.is_expired).length
  const expiringSoonShares = shares.filter(
    (s) => s.status === 'ACTIVE' && !s.is_expired && s.time_remaining_seconds <= 172800 // 48 hours
  ).length
  const revokedShares = shares.filter((s) => s.status === 'REVOKED').length

  const handleShareCreated = (newShare) => {
    setActionNotice({
      type: 'success',
      text: `Successfully created temporary share for "${newShare.recipient_identifier}".`,
    })
    loadShares()
  }

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return
    setIsRevoking(true)
    try {
      await shareService.revokeShare(revokeTarget.permission_id)
      setActionNotice({
        type: 'success',
        text: `Revoked access for "${revokeTarget.recipient_identifier}". Token is now invalid.`,
      })
      setRevokeTarget(null)
      loadShares()
    } catch (err) {
      console.error('Failed to revoke share:', err)
      setActionNotice({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to revoke temporary share.',
      })
    } finally {
      setIsRevoking(false)
    }
  }

  const handleCopyLink = (share) => {
    if (!share.raw_token) {
      // In zero-knowledge architecture, if raw token isn't in memory, direct them to QR code modal
      setQrModalShare(share)
      return
    }
    const fullUrl = buildShareAccessUrl(share.raw_token, share.lan_ip)
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedId(share.permission_id)
      setTimeout(() => setCopiedId(null), 2500)
    })
  }

  const formatRemainingTime = (seconds, isExpired, status) => {
    if (status === 'REVOKED') return 'Revoked'
    if (isExpired || seconds <= 0) return 'Expired'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours > 24) {
      const days = Math.floor(hours / 24)
      return `${days}d ${hours % 24}h remaining`
    }
    if (hours > 0) return `${hours}h ${minutes}m remaining`
    return `${minutes}m remaining`
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight sm:text-3xl flex items-center gap-2.5">
            <Share2 className="h-7 w-7 text-teal-600" />
            <span>Shared Access &amp; QR Grants</span>
          </h1>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">
            Consent-based temporary document sharing, cryptographically secure QR codes, and instant revocation.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsShareModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition self-start sm:self-auto cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>Share Securely</span>
        </button>
      </div>

      {/* Action Notification Toast */}
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

      {/* MANDATORY PROMINENT SECURITY ARCHITECTURE BANNER */}
      <div className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50/90 to-white p-5 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="rounded-xl bg-teal-100 p-2.5 text-teal-700 shrink-0">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
              Zero-Knowledge Temporary Sharing Guarantee
            </span>
            <p className="text-sm font-bold text-slate-900">
              &quot;The QR code provides temporary access to the selected document. It does not contain the document itself.&quot;
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              Every QR code encodes strictly a temporary, high-entropy random access token. Only the SHA-256 hash is preserved in the database. When the expiry period elapses or you click Revoke, access is permanently terminated.
            </p>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <span className="text-xs font-medium text-slate-500">Active Shares</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{activeShares}</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <span className="text-xs font-medium text-slate-500">Expiring Soon</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-600">{expiringSoonShares}</span>
            <span className="text-[11px] text-slate-400">&lt; 48 hours</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <span className="text-xs font-medium text-slate-500">Revoked Shares</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-600">{revokedShares}</span>
            <span className="text-[11px] text-slate-400">Invalidated</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <span className="text-xs font-medium text-slate-500">Total Grants Issued</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{totalShares}</span>
            <span className="text-[11px] text-slate-400">All time</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
        {/* Search */}
        <div className="relative flex-1 sm:max-w-md">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <Search className="h-4 w-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by recipient or document name..."
            className="w-full rounded-xl border border-slate-200 pl-9 pr-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-hidden"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { label: 'All', value: 'all' },
            { label: 'Active Access', value: 'active' },
            { label: 'Expired', value: 'expired' },
            { label: 'Revoked Access', value: 'revoked' },
          ].map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                statusFilter === tab.value
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              {tab.label}
            </button>
          ))}

          <button
            type="button"
            onClick={loadShares}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            title="Refresh list"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Shares List / Table */}
      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center animate-pulse space-y-3">
          <div className="h-6 w-48 bg-slate-200 rounded mx-auto" />
          <div className="h-4 w-64 bg-slate-100 rounded mx-auto" />
          <div className="h-32 bg-slate-50 rounded-xl" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-8 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-rose-600" />
          <h3 className="mt-2 font-bold text-rose-900 text-sm">Failed to Load Shares</h3>
          <p className="text-xs text-rose-700 mt-1">{error}</p>
          <button
            type="button"
            onClick={loadShares}
            className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
          >
            Retry
          </button>
        </div>
      ) : shares.length === 0 ? (
        /* Empty State */
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 ring-1 ring-teal-200">
            <Share2 className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-900">
            {statusFilter !== 'all' || searchQuery
              ? 'No Matching Share Grants Found'
              : 'No Active Document Shares'}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-xs text-slate-500">
            {statusFilter !== 'all' || searchQuery
              ? 'Try adjusting your search query or status filter.'
              : 'Share medical records and documents securely with doctors, clinics, or laboratories using time-limited QR codes that never expose raw files or keys.'}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => setIsShareModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
            >
              <Plus className="h-4 w-4" />
              <span>Create First Share Grant</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Mobile Shares Card List (visible on md:hidden) */}
          <div className="space-y-3 md:hidden">
            {shares.map((share) => {
              const isPdf = share.file_type === 'PDF'
              const isImage = share.file_type === 'JPEG' || share.file_type === 'PNG'
              const Icon = isPdf ? FileText : FileImage

              const isRevoked = share.status === 'REVOKED'
              const isExpired = share.is_expired || share.status === 'EXPIRED'
              const isActive = share.status === 'ACTIVE' && !isExpired

              return (
                <div
                  key={share.permission_id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3"
                >
                  {/* Top: Doc icon, doc name, recipient */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          isPdf
                            ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200/60'
                            : 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/60'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <Link
                          to={`/documents/${share.document_id}`}
                          className="font-bold text-slate-900 text-sm truncate block hover:text-teal-700"
                        >
                          {share.document_name}
                        </Link>
                        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-600 font-medium">
                          <UserCheck className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{share.recipient_identifier}</span>
                        </div>
                      </div>
                    </div>

                    {/* Status Pill */}
                    <div className="shrink-0">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Active
                        </span>
                      ) : isRevoked ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                          <Ban className="h-3 w-3" />
                          Revoked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          <Clock className="h-3 w-3" />
                          Expired
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Badges & Expiry info */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-50 pt-2.5 text-[11px] text-slate-500">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                        share.can_download
                          ? 'bg-teal-50 text-teal-700 border-teal-200/60'
                          : 'bg-indigo-50 text-indigo-700 border-indigo-200/60'
                      }`}
                    >
                      {share.can_download ? (
                        <>
                          <Download className="h-3 w-3" />
                          <span>View &amp; Download</span>
                        </>
                      ) : (
                        <>
                          <Eye className="h-3 w-3" />
                          <span>View Only</span>
                        </>
                      )}
                    </span>

                    <span className="font-medium text-slate-600">
                      {isActive
                        ? formatRemainingTime(share.time_remaining_seconds, false, 'ACTIVE')
                        : new Date(share.expires_at).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Mobile Actions Bar */}
                  <div className="flex items-center gap-2 border-t border-slate-100 pt-2.5">
                    <button
                      type="button"
                      onClick={() => setQrModalShare(share)}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-teal-50 py-2 text-xs font-semibold text-teal-800 border border-teal-200/60 active:bg-teal-100 transition cursor-pointer"
                    >
                      <QrCode className="h-4 w-4 text-teal-600" />
                      <span>Show QR</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyLink(share)}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-slate-50 py-2 text-xs font-semibold text-slate-700 border border-slate-200 active:bg-slate-100 transition cursor-pointer"
                    >
                      {copiedId === share.permission_id ? (
                        <>
                          <Check className="h-4 w-4 text-emerald-600" />
                          <span className="text-emerald-700 font-bold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 text-slate-500" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>

                    {isActive && (
                      <button
                        type="button"
                        onClick={() => setRevokeTarget(share)}
                        className="flex items-center justify-center rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 border border-rose-200 active:bg-rose-100 transition cursor-pointer"
                        title="Revoke access immediately"
                      >
                        <Ban className="h-4 w-4 text-rose-600" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop Shares Table (visible on md:block) */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Document</th>
                  <th className="px-5 py-3.5">Recipient</th>
                  <th className="px-5 py-3.5">Permission</th>
                  <th className="px-5 py-3.5">Expires In / Status</th>
                  <th className="px-5 py-3.5">Created</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shares.map((share) => {
                  const isPdf = share.file_type === 'PDF'
                  const isImage = share.file_type === 'JPEG' || share.file_type === 'PNG'
                  const Icon = isPdf ? FileText : FileImage

                  const isRevoked = share.status === 'REVOKED'
                  const isExpired = share.is_expired || share.status === 'EXPIRED'
                  const isActive = share.status === 'ACTIVE' && !isExpired

                  return (
                    <tr
                      key={share.permission_id}
                      className="hover:bg-slate-50/60 transition group"
                    >
                      {/* Document info */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                              isPdf
                                ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200/60'
                                : 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/60'
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <Link
                              to={`/documents/${share.document_id}`}
                              className="font-bold text-slate-900 hover:text-teal-700 transition block truncate max-w-[200px]"
                            >
                              {share.document_name}
                            </Link>
                            <span className="text-[11px] text-slate-400 block truncate max-w-[200px]">
                              {share.category_name || 'Personal'} &middot; {share.original_filename}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Recipient Identifier */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                          <UserCheck className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[160px]">
                            {share.recipient_identifier}
                          </span>
                        </div>
                      </td>

                      {/* Permission Level */}
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                            share.can_download
                              ? 'bg-teal-50 text-teal-700 border-teal-200/60'
                              : 'bg-indigo-50 text-indigo-700 border-indigo-200/60'
                          }`}
                        >
                          {share.can_download ? (
                            <>
                              <Download className="h-3 w-3" />
                              <span>View &amp; Download</span>
                            </>
                          ) : (
                            <>
                              <Eye className="h-3 w-3" />
                              <span>View Only</span>
                            </>
                          )}
                        </span>
                      </td>

                      {/* Expiration & Status */}
                      <td className="px-5 py-4">
                        <div className="space-y-1">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200/60">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Active ({formatRemainingTime(share.time_remaining_seconds, false, 'ACTIVE')})
                            </span>
                          ) : isRevoked ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 border border-rose-200/60">
                              <Ban className="h-3 w-3" />
                              Revoked
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                              <Clock className="h-3 w-3" />
                              Expired
                            </span>
                          )}

                          <div className="text-[10px] text-slate-400">
                            Expires: {new Date(share.expires_at).toLocaleDateString()} at{' '}
                            {new Date(share.expires_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </td>

                      {/* Created Date */}
                      <td className="px-5 py-4 text-slate-500 text-[11px]">
                        {new Date(share.created_at).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* QR preview button */}
                          <button
                            type="button"
                            onClick={() => setQrModalShare(share)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 hover:text-teal-700 transition shadow-2xs cursor-pointer"
                            title="View QR Code"
                          >
                            <QrCode className="h-3.5 w-3.5 text-teal-600" />
                            <span>QR Code</span>
                          </button>

                          {/* Revoke button */}
                          {isActive && (
                            <button
                              type="button"
                              onClick={() => setRevokeTarget(share)}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                              title="Revoke access immediately"
                            >
                              <Ban className="h-3.5 w-3.5" />
                              <span>Revoke Access</span>
                            </button>
                          )}
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
      )}

      {/* Revocation Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleConfirmRevoke}
        title="Revoke Access"
        description={`Are you sure you want to revoke access for "${revokeTarget?.recipient_identifier}" to "${revokeTarget?.document_name}"? The temporary access token and QR code will immediately stop working.`}
        confirmText="Revoke Access"
        cancelText="Cancel"
        isDestructive={true}
        isLoading={isRevoking}
        icon={Ban}
      />

      {/* Share Document Modal */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        onShareCreated={handleShareCreated}
      />

      {/* QR Preview Modal for existing share */}
      <QRPreviewModal
        isOpen={!!qrModalShare}
        onClose={() => setQrModalShare(null)}
        share={qrModalShare}
        onRevoked={() => {
          loadShares()
        }}
      />
    </div>
  )
}
