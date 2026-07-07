interface HeaderProps {
  live: boolean;
  jobCount: number;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onRefresh: () => void;
  loading: boolean;
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={spinning ? 'animate-spin' : undefined}
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx={12} cy={12} r={4} />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default function Header({
  live,
  jobCount,
  theme,
  onToggleTheme,
  onRefresh,
  loading,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 h-14">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-lg">
            🛰️
          </span>
          <span className="font-semibold text-content">Workana Radar</span>
          <span className="hidden sm:inline text-sm text-muted">job monitor</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              {live && (
                <span
                  className="absolute inline-flex h-full w-full rounded-full animate-pulse-ring"
                  style={{ backgroundColor: 'rgb(var(--good))' }}
                  aria-hidden
                />
              )}
              <span
                className={
                  live
                    ? 'relative inline-flex h-2 w-2 rounded-full'
                    : 'relative inline-flex h-2 w-2 rounded-full bg-subtle'
                }
                style={live ? { backgroundColor: 'rgb(var(--good))' } : undefined}
              />
            </span>
            <span className="hidden sm:inline text-xs text-muted">
              {live ? 'Live' : 'Offline'}
            </span>
          </div>

          <span className="hidden sm:inline text-xs text-subtle">{jobCount} jobs</span>

          <button
            type="button"
            className="btn-icon"
            aria-label="Refresh"
            onClick={onRefresh}
          >
            <RefreshIcon spinning={loading} />
          </button>

          <button
            type="button"
            className="btn-icon"
            aria-label="Toggle theme"
            onClick={onToggleTheme}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>
    </header>
  );
}
