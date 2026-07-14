import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { Bid } from '../types'

interface UseBidsResult {
  /** job_id → the user's bid record for it (if any). */
  byJob: Map<string, Bid>
  loading: boolean
  /** Insert a 'locked' bid for each job the user hasn't already bid. Returns count newly locked. */
  lockJobs: (jobIds: string[]) => Promise<{ locked: number; skipped: number; error?: string }>
  /** Upsert a bid's status (written by the web app from the extension's progress). */
  markBid: (jobId: string, patch: Partial<Pick<Bid, 'status' | 'amount' | 'delivery_time'>>) => Promise<void>
  /** Delete the user's bid rows with any of the given statuses. Returns count deleted. */
  deleteBids: (statuses: Bid['status'][]) => Promise<number>
  refetch: () => void
}

export function useBids(): UseBidsResult {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [byJob, setByJob] = useState<Map<string, Bid>>(new Map())
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
      .from('bids')
      .select('*')
      .then(({ data, error }) => {
        if (!active) return
        if (!error && data) {
          setByJob(new Map((data as Bid[]).map((b) => [b.job_id, b])))
        }
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [userId, reloadKey])

  // Live updates as the extension writes bid status.
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel('bids-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bids', filter: `user_id=eq.${userId}` },
        (payload) => {
          setByJob((prev) => {
            const next = new Map(prev)
            if (payload.eventType === 'DELETE') {
              const old = payload.old as Bid
              if (old?.job_id) next.delete(old.job_id)
            } else {
              const row = payload.new as Bid
              if (row?.job_id) next.set(row.job_id, row)
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

  const lockJobs = useCallback(
    async (jobIds: string[]) => {
      if (!userId) return { locked: 0, skipped: 0, error: 'Not signed in' }
      const fresh = jobIds.filter((id) => !byJob.has(id))
      const skipped = jobIds.length - fresh.length
      if (fresh.length === 0) return { locked: 0, skipped }

      const rows = fresh.map((job_id) => ({ user_id: userId, job_id, status: 'locked' as const }))
      const { data, error } = await supabase
        .from('bids')
        .upsert(rows, { onConflict: 'user_id,job_id', ignoreDuplicates: true })
        .select()

      if (error) return { locked: 0, skipped, error: error.message }

      if (data) {
        setByJob((prev) => {
          const next = new Map(prev)
          for (const b of data as Bid[]) next.set(b.job_id, b)
          return next
        })
      }
      return { locked: (data as Bid[] | null)?.length ?? fresh.length, skipped }
    },
    [userId, byJob],
  )

  const markBid = useCallback(
    async (jobId: string, patch: Partial<Pick<Bid, 'status' | 'amount' | 'delivery_time'>>) => {
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
            status: 'locked',
            amount: null,
            delivery_time: null,
            proposal: null,
            bid_url: null,
            error: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...patch,
          })
        return next
      })
      // Persist with the web app's live session (no token-expiry problem).
      const { error } = await supabase
        .from('bids')
        .upsert(
          { user_id: userId, job_id: jobId, ...patch, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,job_id' },
        )
      if (error) console.warn('[bids] markBid failed:', error.message)
    },
    [userId],
  )

  const deleteBids = useCallback(
    async (statuses: Bid['status'][]) => {
      if (!userId || statuses.length === 0) return 0
      const victims = [...byJob.values()].filter((b) => statuses.includes(b.status))
      if (victims.length === 0) return 0
      const { error } = await supabase
        .from('bids')
        .delete()
        .eq('user_id', userId)
        .in('status', statuses)
      if (error) {
        console.warn('[bids] delete failed:', error.message)
        return 0
      }
      setByJob((prev) => {
        const next = new Map(prev)
        for (const [jobId, b] of prev) if (statuses.includes(b.status)) next.delete(jobId)
        return next
      })
      return victims.length
    },
    [userId, byJob],
  )

  return { byJob, loading, lockJobs, markBid, deleteBids, refetch }
}
