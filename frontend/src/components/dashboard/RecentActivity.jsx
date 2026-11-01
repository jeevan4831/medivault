import { History, CheckCircle2, XCircle, LogIn, Upload, Share2, Eye, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'

const ACTION_ICONS = {
  LOGIN: LogIn,
  DOCUMENT_UPLOADED: Upload,
  SHARE_CREATED: Share2,
  SHARE_ACCESSED: Eye,
  DOCUMENT_VIEWED: Eye,
  DOCUMENT_DOWNLOADED: Eye,
  SHARE_REVOKED: ShieldAlert,
}

export default function RecentActivity({ activity = [] }) {
  const formatTime = (ts) => {
    try {
      const d = new Date(ts)
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return ts
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">Recent Security Activity</h2>
          <p className="text-xs text-slate-500">
            Immutable audit log tracking all vault operations and access events
          </p>
        </div>
        <Link
          to="/history"
          className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline self-start sm:self-auto"
        >
          Access History &rarr;
        </Link>
      </div>

      {activity.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <History className="h-6 w-6" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-slate-800">
            No Activity Recorded Yet
          </h3>
          <p className="mt-1 max-w-sm text-xs text-slate-500">
            Your vault operations, logins, and share verifications will appear here in real-time.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          {/* Mobile Feed (visible on md:hidden) */}
          <div className="space-y-3 md:hidden divide-y divide-slate-100">
            {activity.map((item) => {
              const IconComponent = ACTION_ICONS[item.action] || History
              const isSuccess = item.result === 'SUCCESS'

              return (
                <div key={item.id} className="pt-3 first:pt-0 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        <IconComponent className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-xs text-slate-900 block truncate">
                          {item.action.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[11px] text-slate-500 truncate block">
                          {item.document_name || 'User session'}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        isSuccess
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                          : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                      }`}
                    >
                      {isSuccess ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <XCircle className="h-3 w-3 text-rose-600" />
                      )}
                      <span>{item.result}</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pl-10">
                    <span className="truncate">{item.details || ''}</span>
                    <span className="shrink-0">{formatTime(item.timestamp)}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop Activity Table (visible on md:block) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-3 pr-4">Event</th>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 pl-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activity.map((item) => {
                  const IconComponent = ACTION_ICONS[item.action] || History
                  const isSuccess = item.result === 'SUCCESS'

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 pr-4 font-medium text-slate-800">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                            <IconComponent className="h-4 w-4" />
                          </div>
                          <div>
                            <span className="font-semibold block">{item.action.replace(/_/g, ' ')}</span>
                            {item.details && (
                              <span className="text-[11px] text-slate-500 font-normal">{item.details}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-600">
                        {item.document_name ? (
                          <span className="font-medium text-slate-800">{item.document_name}</span>
                        ) : (
                          <span className="text-slate-400 italic">User session</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            isSuccess
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                              : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                          }`}
                        >
                          {isSuccess ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <XCircle className="h-3 w-3 text-rose-600" />
                          )}
                          <span>{item.result}</span>
                        </span>
                      </td>

                      <td className="py-3 pl-4 text-right text-slate-500 font-mono">
                        {formatTime(item.timestamp)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
