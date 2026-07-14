import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import type { Job } from '../types'

const MAX_JOBS = 1000

interface UseJobsResult {
  jobs: Job[]
  loading: boolean
  error: string | null
  /** IDs that arrived via realtime this session (drives the "new" pulse). */
  liveIds: Set<string>
  refresh: () => void
}

/**
 * Loads recent jobs from Supabase and keeps them live via realtime
 * INSERT/UPDATE events on the `jobs` table.
 */
export function useJobs(): UseJobsResult {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set())
  const [reloadKey, setReloadKey] = useState(0)
  const mounted = useRef(true)

  const refresh = useCallback(() => setReloadKey((k) => k + 1), [])

  // Initial + manual fetch
  useEffect(() => {
    mounted.current = true
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    supabase
      .from('jobs')
      .select('*')
      .order('first_seen_at', { ascending: false })
      .limit(MAX_JOBS)
      .then(({ data, error }) => {
        if (!mounted.current) return
        if (error) {
          setError(error.message)
        } else {
          setError(null)
          const snapshot = (data as Job[]) ?? []
          // Merge rather than overwrite: a realtime INSERT can arrive before this
          // snapshot resolves, and a plain replace would drop that live row.
          setJobs((prev) => {
            if (prev.length === 0) return snapshot
            const byId = new Map<string, Job>(snapshot.map((j) => [j.id, j]))
            for (const j of prev) if (!byId.has(j.id)) byId.set(j.id, j)
            const ts = (j: Job) => (j.first_seen_at ? new Date(j.first_seen_at).getTime() : 0)
            return [...byId.values()].sort((a, b) => ts(b) - ts(a)).slice(0, MAX_JOBS)
          })
        }
        setLoading(false)
      })
    return () => {
      mounted.current = false
    }
  }, [reloadKey])

  // Realtime subscription
  useEffect(() => {
    if (!isSupabaseConfigured) return
    const channel = supabase
      .channel('jobs-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'jobs' },
        (payload) => {
          const row = payload.new as Job
          if (!row?.id) return
          setJobs((prev) =>
            prev.some((j) => j.id === row.id) ? prev : [row, ...prev].slice(0, MAX_JOBS),
          )
          setLiveIds((prev) => new Set(prev).add(row.id))
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs' },
        (payload) => {
          const row = payload.new as Job
          if (!row?.id) return
          setJobs((prev) => prev.map((j) => (j.id === row.id ? { ...j, ...row } : j)))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Safety net: refetch periodically so the list stays current without a manual
  // page refresh even if the realtime stream drops. Realtime handles instant
  // updates; this catches anything it misses.
  useEffect(() => {
    if (!isSupabaseConfigured) return
    const id = setInterval(() => refresh(), 45_000)
    return () => clearInterval(id)
  }, [refresh])

  return { jobs, loading, error, liveIds, refresh }
}
