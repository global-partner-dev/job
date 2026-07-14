import { useEffect, useMemo, useRef, useState } from 'react'
import { useJobs } from './hooks/useJobs'
import { useSavedJobs } from './hooks/useSavedJobs'
import { useDismissedJobs } from './hooks/useDismissedJobs'
import { useTheme } from './hooks/useTheme'
import { useAuth } from './hooks/useAuth'
import { useBids } from './hooks/useBids'
import { useBidBot } from './hooks/useBidBot'
import { isSupabaseConfigured } from './lib/supabase'
import { jobToBidJob } from './lib/bidbot'
import { jobMeetsMinBudget } from './lib/format'
import { computeStats } from './lib/stats'
import { latestJobs } from './lib/insights'
import { token } from './lib/palette'
import type { Bid, Job, View } from './types'

import Sidebar from './components/layout/Sidebar'
import Topbar from './components/layout/Topbar'
import SetupNotice from './components/SetupNotice'
import StatsBar from './components/StatsBar'
import CountryBreakdown from './components/panels/CountryBreakdown'
import JobList from './components/JobList'
import AuthScreen from './components/auth/AuthScreen'
import AccountStatus from './components/auth/AccountStatus'
import AdminPanel from './components/admin/AdminPanel'
import BidBotBar from './components/bidbot/BidBotBar'
import BidBotSettings from './components/bidbot/BidBotSettings'

const VIEW_META: Record<View, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Live overview of stored opportunities' },
  jobs: { title: 'Job feed', subtitle: 'Every project that passed the archive filters' },
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
  if (profileLoading && !profile) return <FullscreenSpinner />
  if (!isApproved) return <AccountStatus />
  return <AppShell />
}

function AppShell() {
  const { theme, toggle: toggleTheme } = useTheme()
  const { jobs, loading, error, liveIds, refresh } = useJobs()
  const { saved, toggle: toggleSave } = useSavedJobs()
  const { dismissed, dismiss } = useDismissedJobs()
  const { profile, isAdmin, signOut, session } = useAuth()
  const { byJob: bidsByJob, lockJobs, markBid, deleteBids } = useBids()
  const bidbot = useBidBot()

  const [view, setView] = useState<View>('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [autoRunning, setAutoRunning] = useState(false)
  const batchInFlight = useRef(false)
  const autoSentRef = useRef<Set<string>>(new Set())

  const auth = useMemo(
    () =>
      session
        ? {
            supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
            anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            accessToken: session.access_token,
            userId: session.user.id,
          }
        : null,
    [session],
  )

  // The archive is already filtered at the scraper; here we only drop jobs the
  // user has deleted from their own feed. Newest-first (useJobs order).
  const activeJobs = useMemo<Job[]>(() => jobs.filter((j) => !dismissed.has(j.id)), [jobs, dismissed])
  const stats = useMemo(() => computeStats(activeJobs), [activeJobs])
  const latest = useMemo(() => latestJobs(activeJobs, 6), [activeJobs])
  const savedJobs = useMemo(() => activeJobs.filter((j) => saved.has(j.id)), [activeJobs, saved])

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const clearSelect = () => setSelectedIds(new Set())

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Remove ${selectedIds.size} selected project(s) from your feed?`)) return
    dismiss([...selectedIds])
    clearSelect()
  }

  // Persist bid status in Supabase from the extension's progress stream, using
  // the web app's live session — the extension's captured token can expire and
  // silently fail to write, which left placed bids stuck at "locked".
  const statusWrittenRef = useRef<Map<string, string>>(new Map())
  useEffect(() => {
    const PHASE_TO_STATUS: Partial<Record<string, Bid['status']>> = {
      submit: 'placing',
      placed: 'placed',
      manual: 'manual',
      failed: 'failed',
      skipped: 'skipped',
    }
    for (const [jobId, p] of bidbot.progress) {
      const status = PHASE_TO_STATUS[p.phase]
      if (!status) continue
      if (statusWrittenRef.current.get(jobId) === status) continue
      statusWrittenRef.current.set(jobId, status)
      const patch: Partial<Pick<Bid, 'status' | 'amount' | 'delivery_time'>> = { status }
      if (p.amount != null) patch.amount = p.amount
      if (p.deliveryTime != null) patch.delivery_time = p.deliveryTime
      markBid(jobId, patch)
    }
  }, [bidbot.progress, markBid])

  const progressDone = useMemo(
    () =>
      [...bidbot.progress.values()].filter((p) =>
        ['placed', 'manual', 'failed', 'skipped'].includes(p.phase),
      ).length,
    [bidbot.progress],
  )

  // --- Fully automated bidding: bids the whole (pre-filtered) archive, minus
  // placed / already-tried / below the optional bid-budget floor. -------------
  const eligibleAuto = useMemo(
    () =>
      activeJobs.filter(
        (j) =>
          bidsByJob.get(j.id)?.status !== 'placed' &&
          !autoSentRef.current.has(j.id) &&
          jobMeetsMinBudget(j, bidbot.settings.minBidBudget),
      ),
    [activeJobs, bidsByJob, bidbot.settings.minBidBudget],
  )

  const placedCount = useMemo(
    () => [...bidsByJob.values()].filter((b) => b.status === 'placed').length,
    [bidsByJob],
  )

  const handleDeletePlaced = async () => {
    if (placedCount === 0) return
    if (!window.confirm(`Delete ${placedCount} already-bid project(s) from your bid list?`)) return
    await deleteBids(['placed'])
  }

  const toggleAuto = () => {
    if (autoRunning) {
      setAutoRunning(false)
      bidbot.stop()
    } else {
      autoSentRef.current = new Set()
      setAutoRunning(true)
    }
  }

  const AUTO_BATCH = 20
  useEffect(() => {
    if (!autoRunning || bidbot.running || batchInFlight.current || !auth) return
    const batch = eligibleAuto.slice(0, AUTO_BATCH)
    if (batch.length === 0) return
    batch.forEach((j) => autoSentRef.current.add(j.id))
    batchInFlight.current = true
    lockJobs(batch.map((j) => j.id))
      .then(() => bidbot.begin(batch.map(jobToBidJob), auth))
      .finally(() => {
        batchInFlight.current = false
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunning, bidbot.running, eligibleAuto, auth])

  const activeView: View = view === 'admin' && !isAdmin ? 'dashboard' : view
  const selectable = activeView === 'jobs' || activeView === 'saved'
  const meta = VIEW_META[activeView]

  return (
    <div className="min-h-full">
      <Sidebar
        view={activeView}
        onChange={setView}
        counts={{ jobs: activeJobs.length, saved: saved.size }}
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
                  <CountryBreakdown jobs={activeJobs} />
                  <section>
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h2 className="card-title">Latest projects</h2>
                        <p className="card-sub">Most recently scraped</p>
                      </div>
                      <button className="btn btn-ghost text-sm" onClick={() => setView('jobs')}>
                        View all →
                      </button>
                    </div>
                    <JobList
                      jobs={latest}
                      liveIds={liveIds}
                      savedIds={saved}
                      onToggleSave={toggleSave}
                      loading={loading}
                    />
                  </section>
                </div>
              )}

              {activeView === 'jobs' && (
                <div className="space-y-3 animate-fade-in">
                  <p className="text-sm text-muted">{activeJobs.length} projects</p>
                  <JobList
                    jobs={activeJobs}
                    liveIds={liveIds}
                    savedIds={saved}
                    onToggleSave={toggleSave}
                    loading={loading}
                    selectable
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    bidStatuses={bidsByJob}
                  />
                </div>
              )}

              {activeView === 'saved' && (
                <div className="space-y-3 animate-fade-in">
                  <p className="text-sm text-muted">{savedJobs.length} saved</p>
                  <JobList
                    jobs={savedJobs}
                    liveIds={liveIds}
                    savedIds={saved}
                    onToggleSave={toggleSave}
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

      {selectable && (
        <BidBotBar
          selectedCount={selectedIds.size}
          extPresent={bidbot.extPresent}
          progressDone={progressDone}
          summary={bidbot.summary}
          autoRunning={autoRunning}
          autoEligibleCount={eligibleAuto.length}
          onOpenSettings={() => setSettingsOpen(true)}
          onClear={clearSelect}
          onDeleteSelected={handleDeleteSelected}
          onToggleAuto={toggleAuto}
        />
      )}

      <BidBotSettings
        open={settingsOpen}
        settings={bidbot.settings}
        onChange={bidbot.setSettings}
        onClose={() => setSettingsOpen(false)}
        placedCount={placedCount}
        onDeletePlaced={handleDeletePlaced}
      />
    </div>
  )
}
