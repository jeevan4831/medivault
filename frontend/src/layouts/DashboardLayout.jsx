import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../components/dashboard/Sidebar.jsx'
import TopNavbar from '../components/dashboard/TopNavbar.jsx'
import MobileBottomNav from '../components/dashboard/MobileBottomNav.jsx'
import BackendConnectionBanner from '../components/BackendConnectionBanner.jsx'
import notificationService from '../services/notificationService.js'

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)

  const fetchUnreadCount = async () => {
    try {
      const data = await notificationService.getUnreadCount()
      setUnreadNotifications(data.unread_count || 0)
    } catch {
      // Ignore background errors
    }
  }

  useEffect(() => {
    fetchUnreadCount()

    const handleNotificationsChanged = () => {
      fetchUnreadCount()
    }

    window.addEventListener('medivault:notifications-changed', handleNotificationsChanged)
    const interval = setInterval(fetchUnreadCount, 30000)

    return () => {
      window.removeEventListener('medivault:notifications-changed', handleNotificationsChanged)
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-800">
      {/* Sidebar navigation */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        unreadNotifications={unreadNotifications}
      />

      {/* Main content wrapper */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        <BackendConnectionBanner />
        <TopNavbar
          onMenuClick={() => setSidebarOpen(true)}
          unreadNotifications={unreadNotifications}
          onUnreadChange={setUnreadNotifications}
        />

        <main className="flex-1 p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-8">
          <Outlet context={{ unreadNotifications, refreshUnreadCount: fetchUnreadCount }} />
        </main>

        {/* Mobile quick bottom navigation */}
        <MobileBottomNav
          onOpenSidebar={() => setSidebarOpen(true)}
          unreadNotifications={unreadNotifications}
        />
      </div>
    </div>
  )
}
