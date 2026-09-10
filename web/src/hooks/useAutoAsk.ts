import { useCallback, useState } from 'react'

const KEY = 'workana-radar:autoask'

interface Stored {
  enabled: boolean
  /** ISO timestamp of the moment the toggle was switched on. */
  enabledAt: string | null
}

const OFF: Stored = { enabled: false, enabledAt: null }

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return OFF
    const parsed = JSON.parse(raw) as Partial<Stored>
    if (!parsed.enabled || !parsed.enabledAt) return OFF
    return { enabled: true, enabledAt: parsed.enabledAt }
  } catch {
    return OFF
  }
}

function write(state: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

/**
 * The auto-ask switch.
 *
 * Turning it on stamps the moment it happened; the queue is then everything
 * published from that moment on that hasn't been asked yet. It survives a
 * reload so refreshing the page doesn't silently re-open the whole archive.
 */
export function useAutoAsk() {
  const [state, setState] = useState<Stored>(read)

  const enable = useCallback(() => {
    const next: Stored = { enabled: true, enabledAt: new Date().toISOString() }
    setState(next)
    write(next)
  }, [])

  const disable = useCallback(() => {
    setState(OFF)
    write(OFF)
  }, [])

  const toggle = useCallback(() => {
    setState((prev) => {
      const next: Stored = prev.enabled
        ? OFF
        : { enabled: true, enabledAt: new Date().toISOString() }
      write(next)
      return next
    })
  }, [])

  return {
    enabled: state.enabled,
    enabledAt: state.enabledAt,
    enabledAtMs: state.enabledAt ? new Date(state.enabledAt).getTime() : null,
    enable,
    disable,
    toggle,
  }
}
