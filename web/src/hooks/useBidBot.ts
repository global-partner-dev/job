import { useCallback, useEffect, useState } from 'react'
import {
  loadBidBotSettings,
  saveBidBotSettings,
  onBidEvents,
  onExtReady,
  pingExtension,
  startBidding,
  stopBidding,
  type BidAuth,
  type BidBotSettings,
  type BidJob,
  type BidProgress,
} from '../lib/bidbot'

export interface BidRunSummary {
  total: number
  placed: number
  failed: number
}

export function useBidBot() {
  const [settings, setSettingsState] = useState<BidBotSettings>(loadBidBotSettings)
  const [extPresent, setExtPresent] = useState<boolean | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<Map<string, BidProgress>>(new Map())
  const [summary, setSummary] = useState<BidRunSummary | null>(null)

  const recheckExt = useCallback(async () => {
    const ok = await pingExtension()
    setExtPresent(ok)
    return ok
  }, [])

  useEffect(() => {
    recheckExt()
  }, [recheckExt])

  // Latch present=true whenever the bridge announces itself (handles a bridge
  // that injects after the initial ping window closed).
  useEffect(() => onExtReady(() => setExtPresent(true)), [])

  useEffect(() => {
    return onBidEvents({
      onProgress: (p) => setProgress((prev) => new Map(prev).set(p.jobId, p)),
      onDone: (s) => {
        setSummary(s)
        setRunning(false)
      },
    })
  }, [])

  const setSettings = useCallback((next: BidBotSettings) => {
    setSettingsState(next)
    saveBidBotSettings(next)
  }, [])

  const begin = useCallback(
    (jobs: BidJob[], auth: BidAuth) => {
      setProgress(new Map())
      setSummary(null)
      setRunning(true)
      // The extension only knows 'auto' (submit) vs 'manual' (prefill); 'full'
      // is a web-app selection concept and auto-submits at the extension.
      const extSettings =
        settings.submitMode === 'full'
          ? { ...settings, submitMode: 'auto' as const }
          : settings
      startBidding({ jobs, settings: extSettings, auth })
    },
    [settings],
  )

  const stop = useCallback(() => {
    stopBidding()
    setRunning(false)
  }, [])

  return { settings, setSettings, extPresent, recheckExt, running, progress, summary, begin, stop }
}
