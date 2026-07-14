interface TopbarProps {
  title: string
  subtitle: string
  live: boolean
  loading: boolean
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onRefresh: () => void
  onOpenMenu: () => void
}

export default function Topbar({
  title,
  subtitle,
  live,
  loading,
  theme,
  onToggleTheme,
  onRefresh,
  onOpenMenu,
}: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-surface/85 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        {/* Mobile menu */}
        <button
          type="button"
          className="btn-icon lg:hidden"
          aria-label="Open menu"
          onClick={onOpenMenu}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Title */}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-content">{title}</h1>
          <p className="hidden truncate text-xs text-subtle sm:block">{subtitle}</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Live status */}
          <span className="hidden items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 sm:inline-flex">
            <span
              className={'h-2 w-2 rounded-full ' + (live ? 'animate-pulse-ring-success' : '')}
              style={{ backgroundColor: live ? 'rgb(var(--success))' : 'rgb(var(--text-subtle))' }}
            />
            <span className="text-xs font-medium text-muted">{live ? 'Live' : 'Offline'}</span>
          </span>

          {/* Refresh */}
          <button type="button" className="btn-icon" aria-label="Refresh" onClick={onRefresh}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'animate-spin' : ''} aria-hidden="true">
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>

          {/* Theme */}
          <button type="button" className="btn-icon" aria-label="Toggle theme" onClick={onToggleTheme}>
            {theme === 'dark' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  )
}
