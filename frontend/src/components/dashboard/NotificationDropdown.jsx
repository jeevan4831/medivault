import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bell,
  Check,
  CheckCheck,
  ShieldAlert,
  Share2,
  FileText,
  Info,
  ExternalLink,
  ChevronRight,
  Clock,
  Trash2,
  Loader2,
} from 'lucide-react'
import notificationService from '../../services/notificationService.js'

export default function NotificationDropdown({ unreadCountProp, onUnreadChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(unreadCountProp || 0)
  const [isLoading, setIsLoading] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [isClearingAll, setIsClearingAll] = useState(false)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const dropdownRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (typeof unreadCountProp === 'number') {
      setUnreadCount(unreadCountProp)
    }
  }, [unreadCountProp])

  const fetchUnreadCount = async () => {
    try {
      const data = await notificationService.getUnreadCount()
      setUnreadCount(data.unread_count)
      if (onUnreadChange) onUnreadChange(data.unread_count)
    } catch {
      // silently fail
    }
  }

  const fetchRecentNotifications = async () => {
    setIsLoading(true)
    try {
      const items = await notificationService.getNotifications({ limit: 6 })
      setNotifications(items)
      fetchUnreadCount()
    } catch (err) {
      console.error('Failed to fetch notifications:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchUnreadCount()
    const handleNotificationsChanged = () => {
      fetchUnreadCount()
      if (isOpen) {
        notificationService.getNotifications({ limit: 6 }).then(setNotifications).catch(() => {})
      }
    }
    window.addEventListener('medivault:notifications-changed', handleNotificationsChanged)
    return () => {
      window.removeEventListener('medivault:notifications-changed', handleNotificationsChanged)
    }
  }, [isOpen])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [isOpen])

  const handleToggle = () => {
    if (!isOpen) {
      fetchRecentNotifications()
    }
    setIsOpen(!isOpen)
  }

  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation()
    try {
      await notificationService.markAsRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      )
      setUnreadCount((prev) => {
        const next = Math.max(0, prev - 1)
        if (onUnreadChange) onUnreadChange(next)
        return next
      })
    } catch (err) {
      console.error('Failed to mark notification as read:', err)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllAsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
      if (onUnreadChange) onUnreadChange(0)
    } catch (err) {
      console.error('Failed to mark all as read:', err)
    }
  }

  const handleDelete = async (id, e) => {
    if (e) e.stopPropagation()
    setDeletingId(id)
    try {
      await notificationService.deleteNotification(id)
      setNotifications((prev) => {
        const target = prev.find((n) => n.id === id)
        if (target && !target.is_read) {
          setUnreadCount((count) => {
            const next = Math.max(0, count - 1)
            if (onUnreadChange) onUnreadChange(next)
            return next
          })
        }
        return prev.filter((n) => n.id !== id)
      })
    } catch (err) {
      console.error('Failed to delete notification:', err)
    } finally {
      setDeletingId(null)
    }
  }

  const handleClearAll = async (e) => {
    if (e) e.stopPropagation()
    setIsClearingAll(true)
    try {
      await notificationService.clearAllNotifications()
      setNotifications([])
      setUnreadCount(0)
      if (onUnreadChange) onUnreadChange(0)
      setConfirmClearOpen(false)
    } catch (err) {
      console.error('Failed to clear notifications:', err)
    } finally {
      setIsClearingAll(false)
    }
  }

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'SECURITY':
        return <ShieldAlert className="h-4 w-4 text-rose-600" />
      case 'SHARING':
        return <Share2 className="h-4 w-4 text-teal-600" />
      case 'DOCUMENT':
        return <FileText className="h-4 w-4 text-indigo-600" />
      default:
        return <Info className="h-4 w-4 text-blue-600" />
    }
  }

  const getIconBg = (type) => {
    switch (type) {
      case 'SECURITY':
        return 'bg-rose-50 border-rose-200/80 ring-1 ring-rose-200/50'
      case 'SHARING':
        return 'bg-teal-50 border-teal-200/80 ring-1 ring-teal-200/50'
      case 'DOCUMENT':
        return 'bg-indigo-50 border-indigo-200/80 ring-1 ring-indigo-200/50'
      default:
        return 'bg-blue-50 border-blue-200/80 ring-1 ring-blue-200/50'
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={handleToggle}
        className="relative rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 focus:outline-hidden transition cursor-pointer"
        aria-label="View notifications"
        aria-expanded={isOpen}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] px-1 items-center justify-center rounded-full bg-rose-600 text-[10px] font-black text-white ring-2 ring-white animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="fixed inset-x-3 top-16 sm:static sm:inset-auto sm:absolute sm:right-0 sm:top-auto sm:mt-2 sm:w-96 rounded-2xl border border-slate-200 bg-white shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 bg-slate-50/80">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs sm:text-sm text-slate-900">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200/60">
                  {unreadCount} unread
                </span>
              )}
            </div>

            {confirmClearOpen ? (
              <div className="flex items-center gap-1.5 bg-rose-50 px-2 py-1 rounded-lg border border-rose-200 animate-in fade-in duration-150">
                <span className="text-[11px] font-medium text-rose-700">Delete all?</span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  disabled={isClearingAll}
                  className="text-[11px] font-bold text-rose-700 hover:text-rose-900 px-1 py-0.5 rounded hover:bg-rose-100 transition cursor-pointer disabled:opacity-50"
                >
                  {isClearingAll ? 'Clearing...' : 'Yes'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearOpen(false)}
                  disabled={isClearingAll}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 px-1 py-0.5 rounded hover:bg-slate-200/50 transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                    title="Mark all notifications as read"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Mark read</span>
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirmClearOpen(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-rose-600 transition cursor-pointer"
                    title="Clear all notifications"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Clear all</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {isLoading ? (
              <div className="p-6 text-center space-y-2">
                <div className="h-4 w-32 bg-slate-100 rounded mx-auto animate-pulse" />
                <div className="h-3 w-48 bg-slate-50 rounded mx-auto animate-pulse" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <Bell className="h-5 w-5" />
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-800">No Notifications</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  You are all caught up on system security and sharing events.
                </p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => {
                    if (!n.is_read) handleMarkAsRead(n.id)
                  }}
                  className={`group flex items-start gap-3 p-3.5 transition cursor-pointer ${
                    !n.is_read ? 'bg-indigo-50/30 hover:bg-indigo-50/50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${getIconBg(
                      n.notification_type
                    )}`}
                  >
                    {getNotificationIcon(n.notification_type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className="text-xs font-bold text-slate-900 truncate">{n.title}</h4>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {new Date(n.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5 leading-relaxed">
                      {n.message}
                    </p>
                  </div>

                  <div className="shrink-0 flex items-center gap-1 self-center">
                    {!n.is_read && (
                      <button
                        type="button"
                        onClick={(e) => handleMarkAsRead(n.id, e)}
                        title="Mark as read"
                        aria-label="Mark notification as read"
                        className="p-1 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleDelete(n.id, e)}
                      title="Delete notification"
                      aria-label="Delete notification"
                      disabled={deletingId === n.id}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer disabled:opacity-40"
                    >
                      {deletingId === n.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-600" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 bg-slate-50/70 p-2 text-center">
            <Link
              to="/notifications"
              onClick={() => setIsOpen(false)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-indigo-600 transition p-1"
            >
              <span>View all notifications</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
