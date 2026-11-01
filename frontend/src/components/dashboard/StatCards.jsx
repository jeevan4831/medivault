import { Files, Share2, Clock, Activity, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function StatCards({ stats }) {
  const cards = [
    {
      title: 'Total Documents',
      value: stats?.total_documents ?? 0,
      description: 'Encrypted files stored in vault',
      icon: Files,
      color: 'text-brand-600',
      bgColor: 'bg-brand-50',
      borderColor: 'border-brand-200/60',
      link: '/documents',
    },
    {
      title: 'Active Access',
      value: stats?.active_shares ?? 0,
      description: 'Live consent grants with recipients',
      icon: Share2,
      color: 'text-teal-600',
      bgColor: 'bg-teal-50',
      borderColor: 'border-teal-200/60',
      link: '/shared',
    },
    {
      title: 'Expiring Soon',
      value: stats?.expiring_soon ?? 0,
      description: 'Shares expiring in next 48 hours',
      icon: Clock,
      color: stats?.expiring_soon > 0 ? 'text-amber-600' : 'text-slate-600',
      bgColor: stats?.expiring_soon > 0 ? 'bg-amber-50' : 'bg-slate-50',
      borderColor: stats?.expiring_soon > 0 ? 'border-amber-200/60' : 'border-slate-200/60',
      link: '/shared',
    },
    {
      title: 'Recent Access',
      value: stats?.recent_access ?? 0,
      description: 'Total verified security audit events',
      icon: Activity,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200/60',
      link: '/history',
    },
  ]

  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon
        return (
          <div
            key={c.title}
            className={`group relative flex flex-col justify-between rounded-2xl border bg-white p-3.5 sm:p-5 shadow-sm transition hover:shadow-md ${c.borderColor}`}
          >
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 truncate">
                  {c.title}
                </span>
                <div
                  className={`flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl ${c.bgColor} ${c.color}`}
                >
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
              </div>

              <div className="mt-2.5 sm:mt-4">
                <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                  {c.value}
                </p>
                <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs text-slate-500 line-clamp-1 sm:line-clamp-none">
                  {c.description}
                </p>
              </div>
            </div>

            <div className="mt-3 sm:mt-4 border-t border-slate-100 pt-2.5 sm:pt-3">
              <Link
                to={c.link}
                className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-brand-700 hover:text-brand-800"
              >
                <span>Details</span>
                <ArrowUpRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>
          </div>
        )
      })}
    </div>
  )
}
