import { useMemo, useState } from 'react'
import { useJobs } from './hooks/useJobs'
import { useSavedJobs } from './hooks/useSavedJobs'
import { useTheme } from './hooks/useTheme'
import { useAuth } from './hooks/useAuth'
import { useBids } from './hooks/useBids'
import { useBidBot } from './hooks/useBidBot'
import { isSupabaseConfigured } from './lib/supabase'
import { jobToBidJob } from './lib/bidbot'
import { withScore } from './lib/scoring'
import { applyFilters, uniqueCountries } from './lib/filter'
import { computeStats } from './lib/stats'
import { topOpportunities } from './lib/insights'
import type { Filters, ScoredJob, View } from './types'

import Sidebar from './components/layout/Sidebar'
import Topbar from './components/layout/Topbar'
import Icon from './components/ui/Icon'
import { token } from './lib/palette'
import SetupNotice from './components/SetupNotice'
import StatsBar from './components/StatsBar'
import CountryBreakdown from './components/panels/CountryBreakdown'
import TierDistribution from './components/panels/TierDistribution'
import FilterBar from './components/FilterBar'
import JobList from './components/JobList'
import JobDetailDrawer from './components/JobDetailDrawer'
import AuthScreen from './components/auth/AuthScreen'
import AccountStatus from './components/auth/AccountStatus'
import AdminPanel from './components/admin/AdminPanel'
import BidBotBar from './components/bidbot/BidBotBar'
import BidBotSettings from './components/bidbot/BidBotSettings'

const DEFAULT_FILTERS: Filters = {
  search: '',
  budgetType: 'all',
  verifiedOnly: false,
  savedOnly: false,
  country: '',
  minScore: 0,
  sort: 'newest',
}

const VIEW_META: Record<View, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Live overview of Workana opportunities' },
  jobs: { title: 'Job feed', subtitle: 'Every scraped job, filtered and scored' },
  saved: { title: 'Saved jobs', subtitle: 'Opportunities you bookmarked' },
  admin: { title: 'Admin', subtitle: 'Manage users and access' },
}

function FullscreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-border"
        style={{ borderTopColor: token('primary') }}
      />
    </div>
  )
}

/** Auth + approval gate. Only mounts the data app for approved users. */
export default function App() {
  const { loading, profileLoading, session, profile, isApproved } = useAuth()

  if (!isSupabaseConfigured) return <SetupNotice />
  if (loading) return <FullscreenSpinner />
  if (!session) return <AuthScreen />
  // Session exists but the profile is still loading (e.g. just after sign-in):
  // hold on the spinner instead of flashing the "pending" screen.
  if (profileLoading && !profile) return <FullscreenSpinner />
  if (!isApproved) return <AccountStatus />
  return <AppShell />
}

function AppShell() {
  const { theme, toggle: toggleTheme } = useTheme()
  const { jobs, loading, error, liveIds, refresh } = useJobs()
  const { saved, toggle: toggleSave } = useSavedJobs()
  const { profile, isAdmin, signOut, session } = useAuth()
  const { byJob: bidsByJob, lockJobs } = useBids()
  const bidbot = useBidBot()

  const [view, setView] = useState<View>('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [selected, setSelected] = useState<ScoredJob | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [settingsOpen, setSettingsOpen] = useState(false)

  const scored = useMemo<ScoredJob[]>(() => jobs.map(withScore), [jobs])
  const stats = useMemo(() => computeStats(scored), [scored])
  const countries = useMemo(() => uniqueCountries(scored), [scored])
  const visible = useMemo(() => applyFilters(scored, filters, saved), [scored, filters, saved])
  const savedList = useMemo(
    () => applyFilters(scored, { ...filters, savedOnly: true }, saved),
    [scored, filters, saved],
  )
  const topOpps = useMemo(() => topOpportunities(scored, 6), [scored])

  const patchFilters = (patch: Partial<Filters>) => setFilters((prev) => ({ ...prev, ...patch }))

  const handleSearch = (value: string) => {
    patchFilters({ search: value })
    if (value && view === 'dashboard') setView('jobs')
  }

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const clearSelect = () => setSelectedIds(new Set())

  const handleStartBidding = async () => {
    if (!session) return
    const chosen = scored.filter((j) => selectedIds.has(j.id))
    // Only bid jobs the user hasn't already locked/bid — mirrors lockJobs' dedup
    // and prevents re-sending already-bid projects to the extension.
    const toBid = chosen.filter((j) => !bidsByJob.has(j.id))
    if (toBid.length === 0) {
      clearSelect()
      return
    }
    await lockJobs(toBid.map((j) => j.id))
    bidbot.begin(toBid.map(jobToBidJob), {
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      accessToken: session.access_token,
      userId: session.user.id,
    })
    clearSelect()
  }

  const progressDone = useMemo(
    () =>
      [...bidbot.progress.values()].filter((p) =>
        ['placed', 'manual', 'failed', 'skipped'].includes(p.phase),
      ).length,
    [bidbot.progress],
  )

  // Guard: non-admins can never land on the admin view.
  const activeView: View = view === 'admin' && !isAdmin ? 'dashboard' : view
  const selectable = activeView === 'jobs' || activeView === 'saved'
  const meta = VIEW_META[activeView]

  return (
    <div className="min-h-full">
      <Sidebar
        view={activeView}
        onChange={setView}
        counts={{ jobs: scored.length, saved: saved.size, hot: stats.hotLeads }}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        isAdmin={isAdmin}
        userEmail={profile?.email || ''}
        onSignOut={signOut}
      />

      <div className="lg:pl-64">
        <Topbar
          title={meta.title}
          subtitle={meta.subtitle}
          live={isSupabaseConfigured && !error}
          loading={loading}
          theme={theme}
          search={filters.search}
          showSearch={activeView === 'dashboard'}
          onSearch={handleSearch}
          onToggleTheme={toggleTheme}
          onRefresh={refresh}
          onOpenMenu={() => setMenuOpen(true)}
        />

        <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6">
          {activeView === 'admin' && isAdmin ? (
            <AdminPanel />
          ) : (
            <>
              {error && (
                <p className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
                  Couldn’t load jobs: {error}
                </p>
              )}

              {activeView === 'dashboard' && (
                <div className="space-y-4 animate-fade-in">
                  <StatsBar stats={stats} />

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <TierDistribution jobs={scored} />
                    <CountryBreakdown jobs={scored} />
                  </div>

                  <section>
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h2 className="card-title flex items-center gap-1.5">
                          <span style={{ color: token('danger') }}>
                            <Icon name="flame" size={18} />
                          </span>
                          Top opportunities
                        </h2>
                        <p className="card-sub">Highest-scoring jobs right now</p>
                      </div>
                      <button className="btn btn-ghost text-sm" onClick={() => setView('jobs')}>
                        View all →
                      </button>
                    </div>
                    <JobList
                      jobs={topOpps}
                      liveIds={liveIds}
                      savedIds={saved}
                      onToggleSave={toggleSave}
                      onOpen={setSelected}
                      loading={loading}
                    />
                  </section>
                </div>
              )}

              {activeView === 'jobs' && (
                <div className="space-y-4 animate-fade-in">
                  <FilterBar
                    filters={filters}
                    onChange={patchFilters}
                    countries={countries}
                    resultCount={visible.length}
                  />
                  <JobList
                    jobs={visible}
                    liveIds={liveIds}
                    savedIds={saved}
                    onToggleSave={toggleSave}
                    onOpen={setSelected}
                    loading={loading}
                    selectable
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    bidStatuses={bidsByJob}
                  />
                </div>
              )}

              {activeView === 'saved' && (
                <div className="space-y-4 animate-fade-in">
                  <FilterBar
                    filters={filters}
                    onChange={patchFilters}
                    countries={countries}
                    resultCount={savedList.length}
                  />
                  <JobList
                    jobs={savedList}
                    liveIds={liveIds}
                    savedIds={saved}
                    onToggleSave={toggleSave}
                    onOpen={setSelected}
                    loading={loading}
                    selectable
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    bidStatuses={bidsByJob}
                  />
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <JobDetailDrawer
        job={selected}
        isSaved={selected ? saved.has(selected.id) : false}
        onToggleSave={toggleSave}
        onClose={() => setSelected(null)}
      />

      {selectable && (
        <BidBotBar
          selectedCount={selectedIds.size}
          running={bidbot.running}
          extPresent={bidbot.extPresent}
          submitMode={bidbot.settings.submitMode}
          progressDone={progressDone}
          summary={bidbot.summary}
          onToggleMode={() =>
            bidbot.setSettings({
              ...bidbot.settings,
              submitMode: bidbot.settings.submitMode === 'auto' ? 'manual' : 'auto',
            })
          }
          onOpenSettings={() => setSettingsOpen(true)}
          onClear={clearSelect}
          onStart={handleStartBidding}
          onStop={bidbot.stop}
        />
      )}

      <BidBotSettings
        open={settingsOpen}
        settings={bidbot.settings}
        onChange={bidbot.setSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}
