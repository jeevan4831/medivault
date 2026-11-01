import { Link } from 'react-router-dom'
import {
  IdCard,
  HeartPulse,
  GraduationCap,
  Car,
  Shield,
  Briefcase,
  Layers,
  FolderOpen,
} from 'lucide-react'

const CATEGORY_ICONS = {
  Identity: IdCard,
  Healthcare: HeartPulse,
  Education: GraduationCap,
  Vehicle: Car,
  Insurance: Shield,
  Employment: Briefcase,
  Other: Layers,
}

export default function CategoryCards({ categories = [] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">Document Categories</h2>
          <p className="text-xs text-slate-500">
            Encrypted organization by official document classification
          </p>
        </div>
        <Link
          to="/documents"
          className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline self-start sm:self-auto"
        >
          View All Documents &rarr;
        </Link>
      </div>

      <div className="mt-4 sm:mt-5 grid gap-2.5 sm:gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {categories.map((cat) => {
          const IconComponent = CATEGORY_ICONS[cat.name] || FolderOpen
          const count = cat.document_count ?? 0

          return (
            <Link
              key={cat.id || cat.name}
              to={`/documents?category=${encodeURIComponent(cat.name)}`}
              className="group flex flex-col justify-between rounded-xl border border-slate-200/90 bg-slate-50/50 p-3 sm:p-4 transition hover:border-brand-500 hover:bg-white hover:shadow-sm focus:outline-none"
            >
              <div>
                <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-white border border-slate-200 text-brand-600 shadow-2xs group-hover:bg-brand-600 group-hover:text-white transition">
                  <IconComponent className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                </div>
                <h3 className="mt-2.5 sm:mt-3 text-xs sm:text-sm font-semibold text-slate-900 group-hover:text-brand-700 truncate">
                  {cat.name}
                </h3>
                <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] text-slate-500 line-clamp-1 sm:line-clamp-2">
                  {cat.description || `${cat.name} documents`}
                </p>
              </div>

              <div className="mt-3 sm:mt-4 flex items-center justify-between border-t border-slate-200/60 pt-2 text-[11px] sm:text-xs">
                <span
                  className={`font-semibold ${
                    count > 0 ? 'text-brand-700 font-bold' : 'text-slate-400'
                  }`}
                >
                  {count} {count === 1 ? 'file' : 'files'}
                </span>
                <span className="text-[11px] text-slate-400 group-hover:text-brand-600 font-medium">
                  Browse
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
