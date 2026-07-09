import { useCallback, useEffect, useState } from 'react'

const KEY = 'workana-radar:dismissed'

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr) : new Set()
  } catch {
    return new Set()
  }
}

/**
 * Projects the user has "deleted" from their own feed. Per-user (localStorage) —
 * it hides shared jobs from this user without affecting other users or the DB.
 */
export function useDismissedJobs() {
  const [dismissed, setDismissed] = useState<Set<string>>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...dismissed]))
    } catch {
      /* ignore quota errors */
    }
  }, [dismissed])

  const dismiss = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    setDismissed((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.add(id)
      return next
    })
  }, [])

  const restoreAll = useCallback(() => setDismissed(new Set()), [])

  return { dismissed, dismiss, restoreAll }
}
