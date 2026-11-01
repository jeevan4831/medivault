import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  Check,
  CheckCheck,
  ShieldAlert,
  Share2,
  FileText,
  Info,
  RefreshCw,
  Clock,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Trash2,
  Loader2,
} from 'lucide-react'
import notificationService from '../services/notificationService.js'
import ConfirmationModal from '../components/ConfirmationModal.jsx'

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('ALL') // 'ALL', 'UNREAD', 'SECURITY', 'SHARING', 'DOCUMENT'
  const [searchQuery, setSearchQuery] = useState('')
  const [markingId, setMarkingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [isMarkingAll, setIsMarkingAll] = useState(false)
  const [isClearingAll, setIsClearingAll] = useState(false)
  const [showConfirmMarkAll, setShowConfirmMarkAll] = useState(false)
  const [showConfirmClearAll, setShowConfirmClearAll] = useState(false)
  const [actionError, setActionError] = useState(null)

  const loadNotifications = async () => {
    setIsLoading(true)
    setActionError(null)
    try {
      const data = await notificationService.getNotifications()
      setNotifications(data)
    } catch (err) {
      console.error('Failed to load notifications:', err)
      setActionError('Could not load notifications from the server.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadNotifications()

    const handleNotificationsChanged = () => {
      loadNotifications()
    }

    window.addEventListener('medivault:notifications-changed', handleNotificationsChanged)
    return () => {
      window.removeEventListener('medivault:notifications-changed', handleNotificationsChanged)
    }
  }, [])

  const handleMarkAsRead = async (id) => {
    setMarkingId(id)
    setActionError(null)
    try {
      await notificationService.markAsRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      )
    } catch (err) {
      console.error('Failed to mark notification as read:', err)
      setActionError('Failed to mark notification as read. Please try again.')
    } finally {
      setMarkingId(null)
    }
  }

  const handleConfirmMarkAllRead = async () => {
    setIsMarkingAll(true)
    setActionError(null)
    try {
      await notificationService.markAllAsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setShowConfirmMarkAll(false)
    } catch (err) {
      console.error('Failed to mark all notifications read:', err)
      setActionError('Failed to mark all notifications as read. Please try again.')
    } finally {
      setIsMarkingAll(false)
    }
  }

  const handleDeleteNotification = async (id, e) => {
    if (e) e.stopPropagation()
    setDeletingId(id)
    setActionError(null)
    try {
      await notificationService.deleteNotification(id)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    } catch (err) {
      console.error('Failed to delete notification:', err)
      setActionError('Failed to delete notification. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleConfirmClearAll = async () => {
    setIsClearingAll(true)
    setActionError(null)
    try {
      await notificationService.clearAllNotifications()
      setNotifications([])
      setShowConfirmClearAll(false)
    } catch (err) {
      console.error('Failed to clear notifications:', err)
      setActionError('Failed to clear notifications. Please try again.')
    } finally {
      setIsClearingAll(false)
    }
  }

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  )

  const countsByType = useMemo(() => {
    return {
      all: notifications.length,
      unread: notifications.filter((n) => !n.is_read).length,
      security: notifications.filter((n) => n.notification_type === 'SECURITY').length,
      sharing: notifications.filter((n) => n.notification_type === 'SHARING').length,
      document: notifications.filter((n) => n.notification_type === 'DOCUMENT').length,
    }
  }, [notifications])

  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      // Tab filter
      if (activeTab === 'UNREAD' && item.is_read) return false
      if (activeTab === 'SECURITY' && item.notification_type !== 'SECURITY') return false
      if (activeTab === 'SHARING' && item.notification_type !== 'SHARING') return false
      if (activeTab === 'DOCUMENT' && item.notification_type !== 'DOCUMENT') return false

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchTitle = item.title?.toLowerCase().includes(query)
        const matchMsg = item.message?.toLowerCase().includes(query)
        const matchType = item.notification_type?.toLowerCase().includes(query)
        return matchTitle || matchMsg || matchType
      }

      return true
    })
  }, [notifications, activeTab, searchQuery])

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'SECURITY':
        return <ShieldAlert className="h-5 w-5 text-rose-600" />
      case 'SHARING':
        return <Share2 className="h-5 w-5 text-teal-600" />
      case 'DOCUMENT':
        return <FileText className="h-5 w-5 text-indigo-600" />
      default:
        return <Info className="h-5 w-5 text-blue-600" />
    }
  }

  const getIconContainerStyles = (type, isRead) => {
    switch (type) {
      case 'SECURITY':
        return isRead
          ? 'bg-rose-50/70 border-rose-200/50 text-rose-500'
          : 'bg-rose-100 border-rose-300 text-rose-600 ring-2 ring-rose-200/50'
      case 'SHARING':
        return isRead
          ? 'bg-teal-50/70 border-teal-200/50 text-teal-500'
          : 'bg-teal-100 border-teal-300 text-teal-600 ring-2 ring-teal-200/50'
      case 'DOCUMENT':
        return isRead
          ? 'bg-indigo-50/70 border-indigo-200/50 text-indigo-500'
          : 'bg-indigo-100 border-indigo-300 text-indigo-600 ring-2 ring-indigo-200/50'
      default:
        return isRead
          ? 'bg-slate-100 border-slate-200 text-slate-500'
          : 'bg-blue-100 border-blue-300 text-blue-600 ring-2 ring-blue-200/50'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-md shadow-brand-600/20">
              <Bell className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight sm:text-3xl flex items-center gap-2.5">
                <span>In-App Notifications</span>
                {unreadCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700 border border-rose-200">
                    {unreadCount} unread
                  </span>
                )}
              </h1>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                Activity feeds for uploaded documents, recipient access, revocations, and security alerts.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => setShowConfirmMarkAll(true)}
              disabled={isMarkingAll}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs cursor-pointer disabled:opacity-50"
            >
              <CheckCheck className="h-4 w-4 text-emerald-600" />
              <span>Mark all read</span>
            </button>
          )}

          {notifications.length > 0 && (
            <button
              type="button"
              onClick={() => setShowConfirmClearAll(true)}
              disabled={isClearingAll}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/60 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 hover:border-rose-300 transition shadow-2xs cursor-pointer disabled:opacity-50"
              title="Clear all notifications"
            >
              <Trash2 className="h-4 w-4 text-rose-600" />
              <span>Clear all</span>
            </button>
          )}

          <button
            type="button"
            onClick={loadNotifications}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition shadow-2xs cursor-pointer"
            title="Refresh notifications"
            aria-label="Refresh notifications"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Control bar: Tabs & Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none whitespace-nowrap">
          <button
            type="button"
            onClick={() => setActiveTab('ALL')}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              activeTab === 'ALL'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            All ({countsByType.all})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('UNREAD')}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              activeTab === 'UNREAD'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            Unread ({countsByType.unread})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('SECURITY')}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              activeTab === 'SECURITY'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            Security ({countsByType.security})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('SHARING')}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              activeTab === 'SHARING'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            Sharing ({countsByType.sharing})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('DOCUMENT')}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              activeTab === 'DOCUMENT'
                ? 'bg-indigo-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            Documents ({countsByType.document})
          </button>
        </div>

        {/* Search input */}
        <div className="relative min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter notifications..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:bg-white focus:outline-hidden transition"
          />
        </div>
      </div>

      {/* Notifications list */}
      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center animate-pulse space-y-3">
          <div className="h-5 w-48 bg-slate-200 rounded mx-auto" />
          <div className="h-3 w-64 bg-slate-100 rounded mx-auto" />
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Bell className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-900">
            {searchQuery ? 'No matching notifications found' : 'All caught up!'}
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
            {searchQuery
              ? `No alerts matched your search query "${searchQuery}".`
              : activeTab === 'UNREAD'
              ? 'You have no unread notifications at this time.'
              : 'There are no notification events recorded in this category yet.'}
          </p>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-4 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Clear filter
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredNotifications.map((n) => {
            const isUnread = !n.is_read
            const isBeingMarked = markingId === n.id

            return (
              <div
                key={n.id}
                className={`group relative flex items-start gap-4 rounded-2xl border p-4 transition duration-150 ${
                  isUnread
                    ? 'border-indigo-200 bg-indigo-50/20 shadow-2xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                {/* Visual unread left indicator bar */}
                {isUnread && (
                  <span
                    className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-brand-600"
                    aria-hidden="true"
                  />
                )}

                {/* Event type icon badge */}
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition ${getIconContainerStyles(
                    n.notification_type,
                    n.is_read
                  )}`}
                >
                  {getNotificationIcon(n.notification_type)}
                </div>

                {/* Content body */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <div className="flex items-center gap-2">
                      <h3
                        className={`text-xs sm:text-sm font-bold truncate ${
                          isUnread ? 'text-slate-900' : 'text-slate-700'
                        }`}
                      >
                        {n.title}
                      </h3>
                      {isUnread && (
                        <span className="inline-flex h-2 w-2 rounded-full bg-brand-600 ring-2 ring-brand-100" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 shrink-0">
                      <Clock className="h-3 w-3" />
                      <span>
                        {new Date(n.created_at).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  <p
                    className={`mt-1 text-xs leading-relaxed ${
                      isUnread ? 'text-slate-800 font-medium' : 'text-slate-600'
                    }`}
                  >
                    {n.message}
                  </p>
                </div>

                {/* Action buttons (Mark as read & Delete) */}
                <div className="shrink-0 flex items-center gap-1.5 self-center">
                  {isUnread ? (
                    <button
                      type="button"
                      onClick={() => handleMarkAsRead(n.id)}
                      disabled={isBeingMarked}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 transition shadow-2xs cursor-pointer disabled:opacity-50"
                      title="Mark as read"
                    >
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="hidden sm:inline">
                        {isBeingMarked ? 'Saving...' : 'Mark read'}
                      </span>
                    </button>
                  ) : (
                    <span
                      className="p-1.5 text-slate-300"
                      title="Read"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={(e) => handleDeleteNotification(n.id, e)}
                    disabled={deletingId === n.id}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition shadow-2xs cursor-pointer disabled:opacity-50"
                    title="Delete notification"
                    aria-label="Delete notification"
                  >
                    {deletingId === n.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-600" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Confirmation Modal for Mark All Read */}
      <ConfirmationModal
        isOpen={showConfirmMarkAll}
        onClose={() => setShowConfirmMarkAll(false)}
        onConfirm={handleConfirmMarkAllRead}
        title="Mark All Notifications as Read?"
        message={`You have ${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}. Are you sure you want to mark all of them as read?`}
        confirmLabel="Mark All as Read"
        confirmVariant="primary"
        isLoading={isMarkingAll}
      />

      {/* Confirmation Modal for Clear All */}
      <ConfirmationModal
        isOpen={showConfirmClearAll}
        onClose={() => setShowConfirmClearAll(false)}
        onConfirm={handleConfirmClearAll}
        title="Clear All Notifications?"
        message={`This will permanently delete all ${notifications.length} notification${notifications.length === 1 ? '' : 's'}. This action cannot be undone.`}
        confirmLabel="Clear All"
        confirmVariant="danger"
        isLoading={isClearingAll}
      />
    </div>
  )
}
