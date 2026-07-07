import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import type { ScrapeRun } from '../types'

/**
 * Loads the most recent scrape runs (oldest → newest) for the activity chart.
 * `reloadKey` lets the caller refetch (e.g. from the header Refresh button).
 */
export function useScrapeHistory(reloadKey = 0): { runs: ScrapeRun[]; loading: boolean } {
  const [runs, setRuns] = useState<ScrapeRun[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    supabase
      .from('scrape_history')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(60)
      .then(({ data, error }) => {
        if (!active) return
        if (!error && data) {
          setRuns((data as ScrapeRun[]).slice().reverse())
        }
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  return { runs, loading }
}
