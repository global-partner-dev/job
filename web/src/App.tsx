import { useMemo, useState } from 'react'
import { useJobs } from './hooks/useJobs'
import { useSavedJobs } from './hooks/useSavedJobs'
import { useScrapeHistory } from './hooks/useScrapeHistory'
import { useTheme } from './hooks/useTheme'
import { isSupabaseConfigured } from './lib/supabase'
import { withScore } from './lib/scoring'
import { applyFilters, uniqueCountries } from './lib/filter'
import { computeStats } from './lib/stats'
import type { Filters, ScoredJob } from './types'

import Header from './components/Header'
import SetupNotice from './components/SetupNotice'
import StatsBar from './components/StatsBar'
import ScrapeHistoryChart from './components/ScrapeHistoryChart'
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

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme()
  const { jobs, loading, error, liveIds, refresh } = useJobs()
  const { saved, toggle: toggleSave } = useSavedJobs()
  const [historyKey, setHistoryKey] = useState(0)
  const { runs } = useScrapeHistory(historyKey)

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [selected, setSelected] = useState<ScoredJob | null>(null)

  const scored = useMemo<ScoredJob[]>(() => jobs.map(withScore), [jobs])
  const stats = useMemo(() => computeStats(scored), [scored])
  const countries = useMemo(() => uniqueCountries(scored), [scored])
  const visible = useMemo(
    () => applyFilters(scored, filters, saved),
    [scored, filters, saved],
  )

  const patchFilters = (patch: Partial<Filters>) =>
    setFilters((prev) => ({ ...prev, ...patch }))

  const handleRefresh = () => {
    refresh()
    setHistoryKey((k) => k + 1)
  }

  return (
    <div className="min-h-full">
      <Header
        live={isSupabaseConfigured && !error}
        jobCount={scored.length}
        theme={theme}
        onToggleTheme={toggleTheme}
        onRefresh={handleRefresh}
        loading={loading}
      />

      <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        {!isSupabaseConfigured ? (
          <SetupNotice />
        ) : (
          <>
            <StatsBar stats={stats} />

            <div className="mt-4">
              <ScrapeHistoryChart runs={runs} />
            </div>

            <div className="mt-6">
              <FilterBar
                filters={filters}
                onChange={patchFilters}
                countries={countries}
                resultCount={visible.length}
              />
            </div>

            {error && (
              <p className="mt-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
                Couldn’t load jobs: {error}
              </p>
            )}

            <div className="mt-4">
              <JobList
                jobs={visible}
                liveIds={liveIds}
                savedIds={saved}
                onToggleSave={toggleSave}
                onOpen={setSelected}
                loading={loading}
              />
            </div>
          </>
        )}
      </main>

      <JobDetailDrawer
        job={selected}
        isSaved={selected ? saved.has(selected.id) : false}
        onToggleSave={toggleSave}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
