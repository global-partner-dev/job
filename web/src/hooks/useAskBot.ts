import { useCallback, useEffect, useState } from 'react'
import {
  loadAskBotSettings,
  saveAskBotSettings,
  onAskEvents,
  onExtReady,
  pingExtension,
  startAsking,
  stopAsking,
  type AskAuth,
  type AskBotSettings,
  type AskJob,
  type AskProgress,
  type AskRunSummary,
} from '../lib/askbot'

export function useAskBot() {
  const [settings, setSettingsState] = useState<AskBotSettings>(loadAskBotSettings)
  const [extPresent, setExtPresent] = useState<boolean | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<Map<string, AskProgress>>(new Map())
  /** Most recent progress event, for the status line. */
  const [latest, setLatest] = useState<AskProgress | null>(null)
  const [summary, setSummary] = useState<AskRunSummary | null>(null)

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
    return onAskEvents({
      onProgress: (p) => {
        setProgress((prev) => new Map(prev).set(p.jobId, p))
        setLatest(p)
      },
      onDone: (s) => {
        setSummary(s)
        setRunning(false)
      },
    })
  }, [])

  const setSettings = useCallback((next: AskBotSettings) => {
    setSettingsState(next)
    saveAskBotSettings(next)
  }, [])

  const begin = useCallback(
    (jobs: AskJob[], auth: AskAuth) => {
      setSummary(null)
      setLatest(null)
      setRunning(true)
      startAsking({ jobs, settings, auth })
    },
    [settings],
  )

  const stop = useCallback(() => {
    stopAsking()
    setRunning(false)
  }, [])

  return {
    settings,
    setSettings,
    extPresent,
    recheckExt,
    running,
    progress,
    latest,
    summary,
    begin,
    stop,
  }
}
