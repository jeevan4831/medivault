import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import {
  Menu,
  ShieldCheck,
  User,
  Settings as SettingsIcon,
  LogOut,
  ChevronDown,
  UploadCloud,
} from 'lucide-react'
import NotificationDropdown from './NotificationDropdown.jsx'

export default function TopNavbar({ onMenuClick, unreadNotifications = 0, onUnreadChange }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const getPageTitle = (path) => {
    if (path.startsWith('/documents/')) return 'Document Details'
    if (path.startsWith('/documents')) return 'My Documents'
    if (path.startsWith('/upload')) return 'Upload'
    if (path.startsWith('/shared')) return 'Shared Access'
    if (path.startsWith('/history')) return 'Access History'
    if (path.startsWith('/notifications')) return 'Notifications'
    if (path.startsWith('/profile')) return 'Profile'
    if (path.startsWith('/settings')) return 'Vault Settings'
    return 'Dashboard'
  }

  const currentTitle = getPageTitle(location.pathname)

  const handleLogout = async () => {
    setDropdownOpen(false)
    await logout()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      {/* Left: Mobile hamburger menu & section title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 focus:outline-none lg:hidden"
          aria-label="Open sidebar menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800 sm:text-base">
            MediVault
          </span>
          <span className="text-slate-300">/</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-700 sm:text-sm truncate max-w-[120px] sm:max-w-none">
            {currentTitle}
          </span>
        </div>
      </div>

      {/* Right: Security Badge, Upload CTA, Notifications, Profile Dropdown */}
      <div className="flex items-center gap-2.5 sm:gap-4">
        {/* Security verification tag */}
        <div className="hidden md:flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs font-semibold text-emerald-800">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          <span>AES-256 Vault Active</span>
        </div>

        {/* Quick Upload Action */}
        <Link
          to="/upload"
          className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700 transition"
        >
          <UploadCloud className="h-4 w-4" />
          <span>Upload Document</span>
        </Link>

        {/* Notifications Dropdown with live bell and mark as read */}
        <NotificationDropdown
          unreadCountProp={unreadNotifications}
          onUnreadChange={onUnreadChange}
        />

        {/* User Profile dropdown menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 rounded-xl border border-slate-200 p-1.5 text-slate-700 hover:bg-slate-50 focus:outline-none"
            aria-expanded={dropdownOpen}
            aria-haspopup="true"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
              {user?.full_name ? user.full_name[0].toUpperCase() : 'U'}
            </div>
            <span className="hidden text-xs font-semibold md:inline max-w-[120px] truncate">
              {user?.full_name || 'Account'}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>

          {dropdownOpen && (
            <>
              {/* Overlay for clicking outside */}
              <div
                className="fixed inset-0 z-30"
                onClick={() => setDropdownOpen(false)}
                aria-hidden="true"
              />

              {/* Menu items */}
              <div className="absolute right-0 z-40 mt-2 w-52 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg shadow-slate-100">
                <div className="border-b border-slate-100 px-4 py-2">
                  <p className="text-xs font-semibold text-slate-900 truncate">
                    {user?.full_name}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                </div>

                <Link
                  to="/profile"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span>My Profile</span>
                </Link>

                <Link
                  to="/settings"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <SettingsIcon className="h-3.5 w-3.5 text-slate-400" />
                  <span>Vault Settings</span>
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50"
                >
                  <LogOut className="h-3.5 w-3.5 text-rose-500" />
                  <span>Sign Out</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
