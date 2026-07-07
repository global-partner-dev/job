import { useCallback, useEffect, useState } from 'react'

const KEY = 'workana-radar:saved'

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

/** Star/bookmark jobs, persisted in localStorage (no auth needed). */
export function useSavedJobs() {
  const [saved, setSaved] = useState<Set<string>>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...saved]))
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [saved])

  const toggle = useCallback((id: string) => {
    setSaved((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const isSaved = useCallback((id: string) => saved.has(id), [saved])

  return { saved, toggle, isSaved }
}
