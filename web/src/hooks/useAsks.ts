import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { toAskRecord, type AskRecord, type AskStatus } from '../types'

/** Table name is historical — a row records one question asked about a project. */
const TABLE = 'bids'

interface UseAsksResult {
  /** job_id → the user's ask record for it (if any). */
  byJob: Map<string, AskRecord>
  loading: boolean
  /** Claim projects so a second tab/device won't ask about them too. */
  claimJobs: (jobIds: string[]) => Promise<{ claimed: number; skipped: number; error?: string }>
  /** Upsert an ask's status (written by the web app from the extension's progress). */
  markAsk: (jobId: string, patch: Partial<Pick<AskRecord, 'status' | 'question'>>) => Promise<void>
  /** Delete the user's ask rows with any of the given statuses. Returns count deleted. */
  deleteAsks: (statuses: AskStatus[]) => Promise<number>
  refetch: () => void
}

export function useAsks(): UseAsksResult {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [byJob, setByJob] = useState<Map<string, AskRecord>>(new Map())
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    if (!userId) {
      setByJob(new Map())
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    supabase
      .from(TABLE)
      .select('*')
      .then(({ data, error }) => {
        if (!active) return
        if (!error && data) {
          setByJob(new Map(data.map((row) => [String(row.job_id), toAskRecord(row)])))
        }
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [userId, reloadKey])

  // Live updates as the extension writes ask status.
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel('asks-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${userId}` },
        (payload) => {
          setByJob((prev) => {
            const next = new Map(prev)
            if (payload.eventType === 'DELETE') {
              const jobId = (payload.old as { job_id?: string })?.job_id
              if (jobId) next.delete(jobId)
            } else {
              const row = toAskRecord(payload.new as Record<string, unknown>)
              if (row.job_id) next.set(row.job_id, row)
            }
            return next
          })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  const claimJobs = useCallback(
    async (jobIds: string[]) => {
      if (!userId) return { claimed: 0, skipped: 0, error: 'Not signed in' }
      const fresh = jobIds.filter((id) => !byJob.has(id))
      const skipped = jobIds.length - fresh.length
      if (fresh.length === 0) return { claimed: 0, skipped }

      const rows = fresh.map((job_id) => ({ user_id: userId, job_id, status: 'queued' as const }))
      const { data, error } = await supabase
        .from(TABLE)
        .upsert(rows, { onConflict: 'user_id,job_id', ignoreDuplicates: true })
        .select()

      if (error) return { claimed: 0, skipped, error: error.message }

      if (data) {
        setByJob((prev) => {
          const next = new Map(prev)
          for (const row of data) {
            const rec = toAskRecord(row)
            next.set(rec.job_id, rec)
          }
          return next
        })
      }
      return { claimed: data?.length ?? fresh.length, skipped }
    },
    [userId, byJob],
  )

  const markAsk = useCallback(
    async (jobId: string, patch: Partial<Pick<AskRecord, 'status' | 'question'>>) => {
      if (!userId) return
      // Optimistic local update so the badge is instant + survives refresh.
      setByJob((prev) => {
        const next = new Map(prev)
        const cur = next.get(jobId)
        if (cur) next.set(jobId, { ...cur, ...patch })
        else
          next.set(jobId, {
            id: '',
            user_id: userId,
            job_id: jobId,
            status: 'queued',
            question: null,
            error: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...patch,
          })
        return next
      })
      // Persist with the web app's live session (no token-expiry problem).
      const { error } = await supabase
        .from(TABLE)
        .upsert(
          { user_id: userId, job_id: jobId, ...patch, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,job_id' },
        )
      if (error) console.warn('[asks] markAsk failed:', error.message)
    },
    [userId],
  )

  const deleteAsks = useCallback(
    async (statuses: AskStatus[]) => {
      if (!userId || statuses.length === 0) return 0
      const victims = [...byJob.values()].filter((a) => statuses.includes(a.status))
      if (victims.length === 0) return 0
      // Include the legacy names for the same states so pre-migration rows go too.
      const legacy = statuses.includes('sent') ? ['placed', 'manual'] : []
      const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq('user_id', userId)
        .in('status', [...statuses, ...legacy])
      if (error) {
        console.warn('[asks] delete failed:', error.message)
        return 0
      }
      setByJob((prev) => {
        const next = new Map(prev)
        for (const [jobId, a] of prev) if (statuses.includes(a.status)) next.delete(jobId)
        return next
      })
      return victims.length
    },
    [userId, byJob],
  )

  return { byJob, loading, claimJobs, markAsk, deleteAsks, refetch }
}
