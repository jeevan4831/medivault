import { useState, useEffect } from 'react'
import {
  History,
  ShieldCheck,
  Search,
  RefreshCw,
  Share2,
  Lock,
  Eye,
  Download,
  Ban,
  AlertCircle,
  CheckCircle2,
  UploadCloud,
  Trash2,
  Key,
  ShieldAlert,
  Clock,
  Server,
  User,
  Filter,
} from 'lucide-react'
import auditService from '../services/auditService.js'

export default function AccessHistoryPage() {
  const [logs, setLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('ALL')
  const [resultFilter, setResultFilter] = useState('ALL')

  const fetchLogs = async () => {
    setIsLoading(true)
    try {
      const data = await auditService.getMyHistory()
      setLogs(data)
    } catch (err) {
      console.error('Failed to load audit logs:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  const filteredLogs = logs.filter((log) => {
    // Action filter
    if (actionFilter === 'AUTH' && !['LOGIN', 'LOGIN_FAILED'].includes(log.action)) {
      return false
    }
    if (actionFilter === 'DOCS' && !log.action.startsWith('DOCUMENT_')) {
      return false
    }
    if (actionFilter === 'SHARES' && !log.action.startsWith('SHARE_')) {
      return false
    }

    // Result filter
    if (resultFilter !== 'ALL' && log.result !== resultFilter) {
      return false
    }

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase()
      const text = `${log.action} ${log.document_name || ''} ${log.access_type || ''} ${log.details || ''} ${log.ip_address || ''} ${log.result || ''}`.toLowerCase()
      if (!text.includes(q)) return false
    }

    return true
  })

  const getActionBadge = (action, result) => {
    const isDenied = result === 'DENIED' || result === 'FAILURE'

    if (action === 'LOGIN') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200/80">
          <Key className="h-3.5 w-3.5 text-emerald-600" />
          LOGIN
        </span>
      )
    }

    if (action === 'LOGIN_FAILED') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 border border-rose-200/80">
          <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
          LOGIN FAILED
        </span>
      )
    }

    if (action === 'DOCUMENT_UPLOADED') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 border border-indigo-200/80">
          <UploadCloud className="h-3.5 w-3.5 text-indigo-600" />
          DOC UPLOADED
        </span>
      )
    }

    if (action === 'DOCUMENT_VIEWED') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 border border-blue-200/80">
          <Eye className="h-3.5 w-3.5 text-blue-600" />
          DOC VIEWED
        </span>
      )
    }

    if (action === 'DOCUMENT_DOWNLOADED') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 border border-sky-200/80">
          <Download className="h-3.5 w-3.5 text-sky-600" />
          DOC DOWNLOADED
        </span>
      )
    }

    if (action === 'DOCUMENT_DELETED') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 border border-slate-300/80">
          <Trash2 className="h-3.5 w-3.5 text-slate-500" />
          DOC DELETED
        </span>
      )
    }

    if (action === 'SHARE_CREATED') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 border border-teal-200/80">
          <Share2 className="h-3.5 w-3.5 text-teal-600" />
          SHARE CREATED
        </span>
      )
    }

    if (action === 'SHARE_ACCESSED') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800 border border-teal-300">
          <Eye className="h-3.5 w-3.5 text-teal-600" />
          SHARE ACCESSED
        </span>
      )
    }

    if (action === 'SHARE_ACCESS_DENIED') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 border border-rose-200/80">
          <Ban className="h-3.5 w-3.5 text-rose-600" />
          SHARE DENIED
        </span>
      )
    }

    if (action === 'SHARE_REVOKED') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 border border-amber-200/80">
          <Ban className="h-3.5 w-3.5 text-amber-600" />
          SHARE REVOKED
        </span>
      )
    }

    if (action === 'SHARE_EXPIRED') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-800 border border-orange-200/80">
          <Clock className="h-3.5 w-3.5 text-orange-600" />
          SHARE EXPIRED
        </span>
      )
    }

    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
        <Lock className="h-3.5 w-3.5" />
        {action}
      </span>
    )
  }

  const getAccessTypeBadge = (accessType) => {
    switch (accessType) {
      case 'Authentication':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200/60">
            <Key className="h-3 w-3" />
            Authentication
          </span>
        )
      case 'Temporary Shared Access':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200/60">
            <Share2 className="h-3 w-3" />
            Temporary Share
          </span>
        )
      case 'Owner Direct Access':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60">
            <User className="h-3 w-3" />
            Direct Owner
          </span>
        )
      case 'System Maintenance':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-300/60">
            <Server className="h-3 w-3" />
            System Worker
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-50 px-2 py-0.5 rounded-md">
            {accessType || 'Standard'}
          </span>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Title & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center p-2 rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200">
              <History className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight sm:text-3xl">
              Access History
            </h1>
          </div>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">
            Immutable, append-only security ledger tracking all document accesses, shares, downloads, and revocations.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchLogs}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs self-start sm:self-auto cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh History</span>
        </button>
      </div>

      {/* Security Notice Banner */}
      <div className="flex items-start gap-3 rounded-2xl bg-indigo-50/60 border border-indigo-100 p-4 text-xs text-indigo-900">
        <ShieldCheck className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-indigo-950">Append-Only Cryptographic Audit Log</p>
          <p className="text-indigo-700/90 mt-0.5">
            Audit logs are tamper-resistant and cannot be modified or deleted by normal users.
            You are authorized to view your own actions and all external access events on documents you own.
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search box */}
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
              <Search className="h-4 w-4" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by action, document, access type, IP address..."
              className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-hidden"
            />
          </div>

          {/* Action Filter */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0">
            {[
              { label: 'All Actions', value: 'ALL' },
              { label: 'Document Activity', value: 'DOCS' },
              { label: 'Sharing Grants', value: 'SHARES' },
              { label: 'Authentication', value: 'AUTH' },
            ].map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActionFilter(tab.value)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  actionFilter === tab.value
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Result Filter */}
          <div className="flex items-center gap-1 border-t lg:border-t-0 lg:border-l border-slate-200 pt-2 lg:pt-0 lg:pl-3">
            {[
              { label: 'All Results', value: 'ALL' },
              { label: 'Success', value: 'SUCCESS' },
              { label: 'Denied / Failed', value: 'DENIED' },
            ].map((resTab) => (
              <button
                key={resTab.value}
                type="button"
                onClick={() => setResultFilter(resTab.value)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  resultFilter === resTab.value
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {resTab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Audit History Table */}
      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center space-y-3">
          <div className="h-6 w-48 bg-slate-200 rounded mx-auto animate-pulse" />
          <div className="h-4 w-72 bg-slate-100 rounded mx-auto animate-pulse" />
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200">
            <History className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-900">No Access Records Found</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
            {search || actionFilter !== 'ALL' || resultFilter !== 'ALL'
              ? 'No audit records match your active search or filter criteria.'
              : 'Security and access events will be logged here as documents are created, shared, accessed, or revoked.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Mobile Audit Timeline Cards (visible on md:hidden) */}
          <div className="space-y-3 md:hidden">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3"
              >
                {/* Header: Action badge & Result */}
                <div className="flex items-center justify-between gap-2">
                  <div>{getActionBadge(log.action, log.result)}</div>
                  <span
                    className={`inline-flex items-center gap-1 font-bold text-xs ${
                      log.result === 'SUCCESS' ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {log.result === 'SUCCESS' ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5" />
                    )}
                    <span>{log.result}</span>
                  </span>
                </div>

                {/* Document Name & Details */}
                <div>
                  <div className="font-bold text-slate-900 text-sm">
                    {log.document_name || (
                      <span className="text-slate-400 font-normal italic">Account / System</span>
                    )}
                  </div>
                  {log.details && (
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed bg-slate-50 p-2 rounded-xl border border-slate-100">
                      {log.details}
                    </p>
                  )}
                </div>

                {/* Footer: Access type, IP address, Timestamp */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
                  <div className="flex items-center gap-2">
                    {getAccessTypeBadge(log.access_type)}
                    <span className="font-mono text-[10px] text-slate-400">
                      {log.ip_address || 'Local'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
                    <Clock className="h-3 w-3" />
                    <span>{new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Audit History Table (visible on md:block) */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Date / Time</th>
                  <th className="px-5 py-3.5">Document</th>
                  <th className="px-5 py-3.5">Action</th>
                  <th className="px-5 py-3.5">Result</th>
                  <th className="px-5 py-3.5">Access Type</th>
                  <th className="px-5 py-3.5">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition">
                    {/* Date/Time */}
                    <td className="px-5 py-4 text-slate-600 whitespace-nowrap text-xs font-mono">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>

                    {/* Document */}
                    <td className="px-5 py-4 max-w-xs">
                      {log.document_name ? (
                        <div className="flex items-center gap-1.5 font-bold text-slate-900 truncate">
                          <span className="truncate">{log.document_name}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Account / System</span>
                      )}
                      {log.details && (
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{log.details}</p>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      {getActionBadge(log.action, log.result)}
                    </td>

                    {/* Result */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 font-bold text-xs ${
                          log.result === 'SUCCESS' ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {log.result === 'SUCCESS' ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5" />
                        )}
                        <span>{log.result}</span>
                      </span>
                    </td>

                    {/* Access Type */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      {getAccessTypeBadge(log.access_type)}
                    </td>

                    {/* IP Address */}
                    <td className="px-5 py-4 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                      {log.ip_address || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}
    </div>
  )
}
