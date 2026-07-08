import type { ReactNode } from 'react'
import type { View } from '../../types'
import Icon from '../ui/Icon'
import { token } from '../../lib/palette'

interface SidebarProps {
  view: View
  onChange: (view: View) => void
  counts: { jobs: number; saved: number; hot: number }
  open: boolean
  onClose: () => void
  isAdmin: boolean
  userEmail: string
  onSignOut: () => void
}

interface NavItem {
  key: View
  label: string
  icon: ReactNode
  badge?: number
}

const icon = (path: ReactNode) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {path}
  </svg>
)

export default function Sidebar({
  view,
  onChange,
  counts,
  open,
  onClose,
  isAdmin,
  userEmail,
  onSignOut,
}: SidebarProps) {
  const items: NavItem[] = [
    { key: 'dashboard', label: 'Dashboard', icon: icon(<><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></>) },
    { key: 'jobs', label: 'Job feed', icon: icon(<><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></>), badge: counts.jobs },
    { key: 'saved', label: 'Saved', icon: icon(<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />), badge: counts.saved },
  ]
  if (isAdmin) {
    items.push({
      key: 'admin',
      label: 'Admin',
      icon: icon(<><path d="M12 2l7 4v6c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>),
    })
  }

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar shadow-sidebar transition-transform duration-300 lg:translate-x-0 ' +
          (open ? 'translate-x-0' : '-translate-x-full')
        }
      >
        {/* Brand */}
        <div className="flex h-16 items-center gap-3 bg-sidebar-2 px-5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: token('primary') }}
          >
            <Icon name="radar" size={20} />
          </span>
          <div className="leading-tight">
            <div className="text-[15px] font-bold text-white">Workana Radar</div>
            <div className="text-[11px] text-sidebar-text">job intelligence</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          <div className="sidebar-section">Navigation</div>
          {items.map((item) => {
            const active = view === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  onChange(item.key)
                  onClose()
                }}
                aria-current={active ? 'page' : undefined}
                className={'sidebar-link mb-0.5 w-full ' + (active ? 'sidebar-link-active' : '')}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  <span
                    className="pill"
                    style={{ backgroundColor: 'rgb(255 255 255 / 0.1)', color: '#fff' }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Footer: hot-leads callout + account */}
        <div className="space-y-2 border-t border-white/10 p-3">
          <div className="rounded-md bg-white/5 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <span style={{ color: token('danger') }}><Icon name="flame" size={16} /></span>
              {counts.hot} hot lead{counts.hot === 1 ? '' : 's'}
            </div>
            <div className="mt-0.5 text-[11px] text-sidebar-text">
              High-opportunity jobs right now
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-md px-1 py-1">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-white">{userEmail || 'Account'}</div>
              {isAdmin && <div className="text-[10px] text-sidebar-text">Administrator</div>}
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-sidebar-text hover:bg-white/10 hover:text-white"
              title="Sign out"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
