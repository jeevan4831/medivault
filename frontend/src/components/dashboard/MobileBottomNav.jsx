import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Files,
  UploadCloud,
  Share2,
  Menu,
} from 'lucide-react'

export default function MobileBottomNav({ onOpenSidebar, unreadNotifications = 0 }) {
  const navTabs = [
    {
      name: 'Dashboard',
      to: '/dashboard',
      icon: LayoutDashboard,
    },
    {
      name: 'Documents',
      to: '/documents',
      icon: Files,
    },
    {
      name: 'Upload',
      to: '/upload',
      icon: UploadCloud,
      isCenterAction: true,
    },
    {
      name: 'Shares',
      to: '/shared',
      icon: Share2,
    },
  ]

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden border-t border-slate-200/90 bg-white/95 backdrop-blur-md px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
      aria-label="Mobile Navigation Bar"
    >
      <div className="flex items-center justify-around">
        {navTabs.map((item) => {
          const Icon = item.icon

          if (item.isCenterAction) {
            return (
              <NavLink
                key={item.name}
                to={item.to}
                className={({ isActive }) =>
                  `group relative flex flex-col items-center -mt-5 transition-transform active:scale-95 focus:outline-none ${
                    isActive ? 'scale-105' : ''
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition ${
                        isActive
                          ? 'bg-brand-700 shadow-brand-700/40 ring-4 ring-brand-100'
                          : 'bg-brand-600 shadow-brand-600/30 group-hover:bg-brand-700'
                      }`}
                    >
                      <Icon className="h-6 w-6 stroke-[2.2]" />
                    </div>
                    <span
                      className={`mt-1 text-[10px] font-bold tracking-tight transition ${
                        isActive ? 'text-brand-700' : 'text-slate-600'
                      }`}
                    >
                      {item.name}
                    </span>
                  </>
                )}
              </NavLink>
            )
          }

          return (
            <NavLink
              key={item.name}
              to={item.to}
              className={({ isActive }) =>
                `flex min-w-[56px] flex-col items-center justify-center py-1 text-[10px] font-semibold transition active:scale-95 focus:outline-none ${
                  isActive
                    ? 'text-brand-600 font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className="relative">
                    <Icon
                      className={`h-5 w-5 transition ${
                        isActive ? 'text-brand-600 stroke-[2.3]' : 'text-slate-400 stroke-[1.8]'
                      }`}
                    />
                  </div>
                  <span className="mt-0.5 tracking-tight">{item.name}</span>
                </>
              )}
            </NavLink>
          )
        })}

        {/* Menu / More Button */}
        <button
          type="button"
          onClick={onOpenSidebar}
          className="relative flex min-w-[56px] flex-col items-center justify-center py-1 text-[10px] font-semibold text-slate-500 hover:text-slate-800 active:scale-95 focus:outline-none"
          aria-label="Open More Menu"
        >
          <div className="relative">
            <Menu className="h-5 w-5 text-slate-400 stroke-[1.8]" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1.5 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
              </span>
            )}
          </div>
          <span className="mt-0.5 tracking-tight">More</span>
        </button>
      </div>
    </nav>
  )
}

