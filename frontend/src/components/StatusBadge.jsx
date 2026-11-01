const styles = {
  checking: 'bg-slate-100 text-slate-600',
  online: 'bg-emerald-100 text-emerald-700',
  offline: 'bg-red-100 text-red-700',
}
const labels = { checking: 'Checking…', online: 'Connected', offline: 'Unreachable' }

export default function StatusBadge({ label, status, detail }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {detail && <p className="text-xs text-slate-500">{detail}</p>}
      </div>
      <span className={`rounded-full px-3 py-1 text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    </div>
  )
}
