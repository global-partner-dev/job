import { useEffect, useMemo, useRef, useState } from 'react'
import { useJobs } from './hooks/useJobs'
import { useSavedJobs } from './hooks/useSavedJobs'
import { useDismissedJobs } from './hooks/useDismissedJobs'
import { useTheme } from './hooks/useTheme'
import { useAuth } from './hooks/useAuth'
import { useAsks } from './hooks/useAsks'
import { useAskBot } from './hooks/useAskBot'
import { useAutoAsk } from './hooks/useAutoAsk'
import { isSupabaseConfigured } from './lib/supabase'
import { jobToAskJob, type AskPhase } from './lib/askbot'
import { jobInBudgetRange } from './lib/format'
import { computeStats } from './lib/stats'
import { latestJobs } from './lib/insights'
import { applyJobFilters, DEFAULT_FILTERS, type JobFilterState } from './lib/jobFilters'
import { token } from './lib/palette'
import type { AskStatus, Job, View } from './types'

import Sidebar from './components/layout/Sidebar'
import Topbar from './components/layout/Topbar'
import SetupNotice from './components/SetupNotice'
import StatsBar from './components/StatsBar'
import CountryBreakdown from './components/panels/CountryBreakdown'
import JobList from './components/JobList'
import JobFilters from './components/JobFilters'
import AuthScreen from './components/auth/AuthScreen'
import AccountStatus from './components/auth/AccountStatus'
import AdminPanel from './components/admin/AdminPanel'
import AskBotBar from './components/askbot/AskBotBar'
import AskBotSettingsDrawer from './components/askbot/AskBotSettings'

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

const seenAt = (job: Job) => (job.first_seen_at ? new Date(job.first_seen_at).getTime() : 0)

function AppShell() {
  const { theme, toggle: toggleTheme } = useTheme()
  const { jobs, loading, error, liveIds, refresh } = useJobs()
  const { saved, toggle: toggleSave } = useSavedJobs()
  const { dismissed, dismiss } = useDismissedJobs()
  const { profile, isAdmin, signOut, session } = useAuth()
  const { byJob: asksByJob, claimJobs, markAsk, deleteAsks } = useAsks()
  const askbot = useAskBot()
  const autoAsk = useAutoAsk()

  const [view, setView] = useState<View>('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [filters, setFilters] = useState<JobFilterState>(DEFAULT_FILTERS)
  const handoffInFlight = useRef(false)
  // Projects already handed to the extension this session — so a project you
  // chose not to send doesn't reopen itself in a loop.
  const handedOffRef = useRef<Set<string>>(new Set())

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

  // --- The auto-ask queue ---------------------------------------------------
  // Everything published since the toggle was switched on that you haven't sent
  // a question about yet. A sent question drops the project off this list.
  const queue = useMemo<Job[]>(() => {
    const since = autoAsk.enabledAtMs
    if (!autoAsk.enabled || since == null) return []
    return activeJobs
      .filter(
        (j) =>
          seenAt(j) >= since &&
          asksByJob.get(j.id)?.status !== 'sent' &&
          jobInBudgetRange(j, askbot.settings.minBudget, askbot.settings.maxBudget),
      )
      .sort((a, b) => seenAt(b) - seenAt(a))
  }, [
    activeJobs,
    asksByJob,
    autoAsk.enabled,
    autoAsk.enabledAtMs,
    askbot.settings.minBudget,
    askbot.settings.maxBudget,
  ])

  // While auto-ask runs the feed IS the queue; otherwise it's the whole archive.
  const feedBase = autoAsk.enabled ? queue : activeJobs
  const visibleJobs = useMemo(
    () => applyJobFilters(feedBase, filters, asksByJob),
    [feedBase, filters, asksByJob],
  )

  const stats = useMemo(() => computeStats(activeJobs), [activeJobs])
  const latest = useMemo(() => latestJobs(feedBase, 6), [feedBase])
  const savedBase = useMemo(() => activeJobs.filter((j) => saved.has(j.id)), [activeJobs, saved])
  const savedJobs = useMemo(
    () => applyJobFilters(savedBase, filters, asksByJob),
    [savedBase, filters, asksByJob],
  )

  const sentCount = useMemo(
    () => [...asksByJob.values()].filter((a) => a.status === 'sent').length,
    [asksByJob],
  )

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

  const handleDeleteSent = async () => {
    if (sentCount === 0) return
    if (!window.confirm(`Forget ${sentCount} sent question(s)? Those projects can be queued again.`))
      return
    await deleteAsks(['sent'])
  }

  const handleToggleAuto = () => {
    if (autoAsk.enabled) {
      autoAsk.disable()
      askbot.stop()
    } else {
      handedOffRef.current = new Set()
      autoAsk.enable()
    }
  }

  // Persist ask status in Supabase from the extension's progress stream, using
  // the web app's live session — the extension's captured token can expire and
  // silently fail to write.
  const statusWrittenRef = useRef<Map<string, AskStatus>>(new Map())
  useEffect(() => {
    const PHASE_TO_STATUS: Partial<Record<AskPhase, AskStatus>> = {
      prepare: 'preparing',
      opening: 'preparing',
      prepared: 'prepared',
      sent: 'sent',
      failed: 'failed',
      skipped: 'skipped',
    }
    for (const [jobId, p] of askbot.progress) {
      const status = PHASE_TO_STATUS[p.phase]
      if (!status) continue
      if (statusWrittenRef.current.get(jobId) === status) continue
      statusWrittenRef.current.set(jobId, status)
      markAsk(jobId, p.question ? { status, question: p.question } : { status })
    }
  }, [askbot.progress, markAsk])

  // --- Hand the newest unasked project to the extension, one at a time -------
  // Sending a single project per run keeps "newest first" honest: a project
  // published while the previous one is open still goes next.
  useEffect(() => {
    if (!autoAsk.enabled || askbot.running || handoffInFlight.current || !auth) return
    if (askbot.extPresent === false) return
    // Only projects nothing has been attempted on yet. A reload must not reopen
    // one that is already prepared and waiting for your click, or that failed.
    const next = queue.find((j) => {
      if (handedOffRef.current.has(j.id)) return false
      const status = asksByJob.get(j.id)?.status
      return status == null || status === 'queued'
    })
    if (!next) return

    handedOffRef.current.add(next.id)
    handoffInFlight.current = true
    claimJobs([next.id])
      .then(() => askbot.begin([jobToAskJob(next)], auth))
      .finally(() => {
        handoffInFlight.current = false
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAsk.enabled, askbot.running, askbot.extPresent, queue, asksByJob, auth])

  const activeView: View = view === 'admin' && !isAdmin ? 'dashboard' : view
  const showBar = activeView !== 'admin'
  const filterable = activeView === 'jobs' || activeView === 'saved'
  const meta = VIEW_META[activeView]
  const jobsSubtitle =
    activeView === 'jobs' && autoAsk.enabled
      ? 'Projects published since auto-ask was switched on, minus the ones you sent'
      : meta.subtitle

  return (
    <div className="min-h-full">
      <Sidebar
        view={activeView}
        onChange={setView}
        counts={{ jobs: feedBase.length, saved: saved.size }}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        isAdmin={isAdmin}
        userEmail={profile?.email || ''}
        onSignOut={signOut}
      />

      <div className="lg:pl-64">
        <Topbar
          title={meta.title}
          subtitle={jobsSubtitle}
          live={isSupabaseConfigured && !error}
          loading={loading}
          theme={theme}
          onToggleTheme={toggleTheme}
          onRefresh={refresh}
          onOpenMenu={() => setMenuOpen(true)}
        />

        <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-6 sm:px-6">
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
                        <h2 className="card-title">
                          {autoAsk.enabled ? 'Waiting for a question' : 'Latest projects'}
                        </h2>
                        <p className="card-sub">
                          {autoAsk.enabled ? 'Newest first — sent ones drop off' : 'Most recently scraped'}
                        </p>
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
                      asks={asksByJob}
                      emptyHint={
                        autoAsk.enabled
                          ? 'Nothing published since auto-ask was switched on yet.'
                          : undefined
                      }
                    />
                  </section>
                </div>
              )}

              {activeView === 'jobs' && (
                <div className="space-y-3 animate-fade-in">
                  <JobFilters
                    jobs={feedBase}
                    filters={filters}
                    onChange={setFilters}
                    shown={visibleJobs.length}
                    total={feedBase.length}
                  />
                  <JobList
                    jobs={visibleJobs}
                    liveIds={liveIds}
                    savedIds={saved}
                    onToggleSave={toggleSave}
                    loading={loading}
                    selectable
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    asks={asksByJob}
                    emptyHint={
                      autoAsk.enabled
                        ? 'Nothing published since auto-ask was switched on. New projects land here the moment they are scraped.'
                        : undefined
                    }
                  />
                </div>
              )}

              {activeView === 'saved' && (
                <div className="space-y-3 animate-fade-in">
                  <JobFilters
                    jobs={savedBase}
                    filters={filters}
                    onChange={setFilters}
                    shown={savedJobs.length}
                    total={savedBase.length}
                  />
                  <JobList
                    jobs={savedJobs}
                    liveIds={liveIds}
                    savedIds={saved}
                    onToggleSave={toggleSave}
                    loading={loading}
                    selectable
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    asks={asksByJob}
                  />
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {showBar && (
        <AskBotBar
          autoOn={autoAsk.enabled}
          enabledAt={autoAsk.enabledAt}
          pendingCount={queue.length}
          sentCount={sentCount}
          activity={askbot.latest?.message ?? null}
          extPresent={askbot.extPresent}
          summary={askbot.summary}
          selectedCount={filterable ? selectedIds.size : 0}
          onToggleAuto={handleToggleAuto}
          onOpenSettings={() => setSettingsOpen(true)}
          onClear={clearSelect}
          onDeleteSelected={handleDeleteSelected}
        />
      )}

      <AskBotSettingsDrawer
        open={settingsOpen}
        settings={askbot.settings}
        onChange={askbot.setSettings}
        onClose={() => setSettingsOpen(false)}
        sentCount={sentCount}
        onDeleteSent={handleDeleteSent}
      />
    </div>
  )
}
