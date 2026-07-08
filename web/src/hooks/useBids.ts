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

  return { byJob, loading, lockJobs, refetch }
}
