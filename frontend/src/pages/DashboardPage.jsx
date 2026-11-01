import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import dashboardService from '../services/dashboardService.js'
import StatCards from '../components/dashboard/StatCards.jsx'
import CategoryCards from '../components/dashboard/CategoryCards.jsx'
import RecentActivity from '../components/dashboard/RecentActivity.jsx'
import DashboardSkeleton from '../components/dashboard/DashboardSkeleton.jsx'
import {
  UploadCloud,
  Share2,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  Lock,
  ArrowRight,
} from 'lucide-react'

export default function DashboardPage() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchSummary = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await dashboardService.getDashboardSummary()
      setData(result)
    } catch (err) {
      console.error('Failed to load dashboard summary:', err)
      const message =
        err.response?.data?.detail ||
        err.message ||
        'Could not load dashboard statistics from the server.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  if (isLoading) {
    return <DashboardSkeleton />
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-200">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-slate-900">
          Unable to Load Dashboard
        </h2>
        <p className="mt-1 max-w-md text-sm text-slate-600">{error}</p>
        <button
          onClick={fetchSummary}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Try Again</span>
        </button>
      </div>
    )
  }

  const { stats, categories, recent_activity } = data || {
    stats: { total_documents: 0, active_shares: 0, expiring_soon: 0, recent_access: 0 },
    categories: [],
    recent_activity: [],
  }

  return (
    <div className="space-y-8">
      {/* Welcome & Quick Action Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-700">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Verified Vault Owner
          </div>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900 tracking-tight sm:text-3xl">
            Welcome back, {user?.full_name || 'Vault Member'}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Manage your personal records, active consent tokens, and security audits.
          </p>
        </div>

        {/* Quick action buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={fetchSummary}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
            title="Refresh statistics"
          >
            <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
            <span>Refresh</span>
          </button>

          <Link
            to="/shared"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
          >
            <Share2 className="h-3.5 w-3.5 text-slate-400" />
            <span>Shared Access</span>
          </Link>

          <Link
            to="/upload"
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-brand-600/25 hover:bg-brand-700 transition"
          >
            <UploadCloud className="h-4 w-4" />
            <span>Upload Document</span>
          </Link>
        </div>
      </div>

      {/* Primary Dashboard Metric Cards */}
      <StatCards stats={stats} />

      {/* Empty State Banner if no documents yet */}
      {stats.total_documents === 0 && (
        <div className="rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50/80 via-white to-brand-50/30 p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm shadow-brand-600/30">
                <Lock className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Your MediVault Is Ready for Encrypted Files
                </h3>
                <p className="mt-1 text-xs text-slate-600 max-w-xl">
                  Store personal identity records, health reports, prescriptions, educational
                  certificates, and vehicle documentation with granular time-limited consent.
                </p>
              </div>
            </div>

            <Link
              to="/upload"
              className="inline-flex items-center gap-2 self-start sm:self-center rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-brand-700 transition shrink-0"
            >
              <span>Upload Document</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Document Categories Grid */}
      <CategoryCards categories={categories} />

      {/* Recent Activity Log Section */}
      <RecentActivity activity={recent_activity} />
    </div>
  )
}
