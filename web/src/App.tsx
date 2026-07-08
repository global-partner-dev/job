import { useMemo, useState } from 'react'
import { useJobs } from './hooks/useJobs'
import { useSavedJobs } from './hooks/useSavedJobs'
import { useTheme } from './hooks/useTheme'
import { isSupabaseConfigured } from './lib/supabase'
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
}

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme()
  const { jobs, loading, error, liveIds, refresh } = useJobs()
  const { saved, toggle: toggleSave } = useSavedJobs()

  const [view, setView] = useState<View>('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [selected, setSelected] = useState<ScoredJob | null>(null)

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

  const meta = VIEW_META[view]

  return (
    <div className="min-h-full">
      <Sidebar
        view={view}
        onChange={setView}
        counts={{ jobs: scored.length, saved: saved.size, hot: stats.hotLeads }}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      <div className="lg:pl-64">
        <Topbar
          title={meta.title}
          subtitle={meta.subtitle}
          live={isSupabaseConfigured && !error}
          loading={loading}
          theme={theme}
          search={filters.search}
          showSearch={view === 'dashboard'}
          onSearch={handleSearch}
          onToggleTheme={toggleTheme}
          onRefresh={refresh}
          onOpenMenu={() => setMenuOpen(true)}
        />

        <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6">
          {!isSupabaseConfigured ? (
            <SetupNotice />
          ) : (
            <>
              {error && (
                <p className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
                  Couldn’t load jobs: {error}
                </p>
              )}

              {view === 'dashboard' && (
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

              {view === 'jobs' && (
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
                  />
                </div>
              )}

              {view === 'saved' && (
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
    </div>
  )
}
