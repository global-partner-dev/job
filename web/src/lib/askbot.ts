import type { Job } from '../types'
import { skillsOf } from './format'

/**
 * AskBot settings + the web↔extension bridge protocol.
 *
 * The web app is the single source of truth. While the auto-ask toggle is on it
 * hands the newest not-yet-asked project (plus settings and the user's Supabase
 * session) to the browser extension via window.postMessage. The extension writes
 * the question, opens Workana's "Ask a question" form pre-filled, and reports
 * back when you press Send. Nothing is ever sent without that click.
 */

export interface AskBotSettings {
  openaiApiKey: string
  model: string
  portfolioUrl: string
  /**
   * Only queue projects whose posted budget overlaps [minBudget, maxBudget].
   * 0 / null mean "no bound on that side"; the scraper already stores only
   * $101+. Lets you narrow the queue without re-scraping.
   */
  minBudget: number
  maxBudget: number | null
  /** Random pause after the question is written, before the tab opens. */
  genDelayMinSec: number
  genDelayMaxSec: number
  /** Random pause between one project and the next. */
  gapDelayMinSec: number
  gapDelayMaxSec: number
  /**
   * Send the proposal automatically instead of waiting for your click. When a
   * page's Send button can't be found the tab is left open for you to finish.
   */
  autoSend: boolean
  /** How long the queue waits for you to press Send, when autoSend is off. */
  sendWaitSec: number
  systemPrompt: string
  settingsVersion: number
}

export const QUESTION_PROMPT = `You write Workana proposals that win trust and replies. This message is sent through the project's message form, so it must read as a full PROPOSAL — not a bare question — and it must close by asking the client something. Match the project's language (Portuguese, Spanish, or English).

IDENTITY RULES (mandatory):
- NEVER reveal or invent your own name. Do not sign with a personal name, initials, company, or persona.
- Never write "I'm <name>", "meu nome é", "soy", or "Regards, <name>". Refer to yourself only as "I" / "eu" / "yo".
- NEVER address the client by name either. No first name, no initial, no company name, no "Prezado Sr. X" — not even if a name appears in the project description. Always open with a plain neutral greeting: "Olá," · "Hola," · "Hi there,".

Structure (adapt every section to THIS project; never copy example phrases verbatim):
1) Greeting — neutral, with no name. Exactly "Olá," / "Hola," / "Hi there," in the project's language.
2) Opening hook (1 paragraph) — show you understood the real business and technical goal, not just the task list.
3) Technical approach (1–2 paragraphs) — map a concrete plan to their stack, modules and pending items; name the relevant technologies, integrations and how you work (review first, phased delivery, testing, docs).
4) Business value (0–1 paragraph) — translate the work into outcomes: fewer manual hours, faster iteration, stability, easier maintenance.
5) First deliverable + timeline (1 paragraph) — a clear first milestone and a realistic-but-fast timeframe. Do NOT quote any price, amount or payment terms.
6) Portfolio — ONLY if a portfolio link is provided in the input, reference it once, naturally. Otherwise omit entirely.
7) Closing — end with exactly ONE concrete question whose answer would genuinely change how the work is approached (stack, integration surface, data source, scope boundary, existing code). No generic "tell me more about your project". Close without a name.

Format: flowing paragraphs with blank lines between them. No markdown, no bullet lists, no headings, no subject line. Roughly 200–400 words.

Workana policy (mandatory):
- No email, phone, WhatsApp, Telegram or Skype, and never ask the client to move off Workana.
- No price, budget, USD amounts or payment terms.
- The only external link allowed is the portfolio link provided in the input (if any).
- Exactly ONE question, at the end. Be honest about third-party/API dependencies; never promise unverified scope.
- No names anywhere: not yours, not the client's, not a company's.`

export const DEFAULT_ASKBOT_SETTINGS: AskBotSettings = {
  openaiApiKey: '',
  model: 'gpt-4o-mini',
  portfolioUrl: '',
  minBudget: 0,
  maxBudget: null,
  genDelayMinSec: 2,
  genDelayMaxSec: 5,
  gapDelayMinSec: 5,
  gapDelayMaxSec: 10,
  autoSend: true,
  sendWaitSec: 300,
  systemPrompt: QUESTION_PROMPT,
  settingsVersion: 2,
}

const SETTINGS_KEY = 'workana-radar:askbot'
const LEGACY_SETTINGS_KEY = 'workana-radar:bidbot'

/** Carry the still-relevant fields over from the old BidBot settings, once. */
function migrateLegacySettings(): Partial<AskBotSettings> {
  try {
    const raw = localStorage.getItem(LEGACY_SETTINGS_KEY)
    if (!raw) return {}
    const old = JSON.parse(raw) as Record<string, unknown>
    const carried: Partial<AskBotSettings> = {}
    if (typeof old.openaiApiKey === 'string') carried.openaiApiKey = old.openaiApiKey
    if (typeof old.model === 'string') carried.model = old.model
    if (typeof old.portfolioUrl === 'string') carried.portfolioUrl = old.portfolioUrl
    if (typeof old.minBidBudget === 'number') carried.minBudget = old.minBidBudget
    return carried
  } catch {
    return {}
  }
}

export function loadAskBotSettings(): AskBotSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) {
      const migrated = { ...DEFAULT_ASKBOT_SETTINGS, ...migrateLegacySettings() }
      saveAskBotSettings(migrated)
      return migrated
    }
    const merged: AskBotSettings = { ...DEFAULT_ASKBOT_SETTINGS, ...JSON.parse(raw) }

    // The built-in prompt lives in this file, but a saved copy in localStorage
    // would shadow it forever. Bumping settingsVersion re-adopts the new one —
    // unless the user has edited it into something of their own.
    if ((merged.settingsVersion ?? 0) < DEFAULT_ASKBOT_SETTINGS.settingsVersion) {
      merged.systemPrompt = QUESTION_PROMPT
      merged.settingsVersion = DEFAULT_ASKBOT_SETTINGS.settingsVersion
      saveAskBotSettings(merged)
    }
    return merged
  } catch {
    return { ...DEFAULT_ASKBOT_SETTINGS }
  }
}

export function saveAskBotSettings(s: AskBotSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Bridge protocol (web ↔ extension content script, over window.postMessage)
// ---------------------------------------------------------------------------
export const EXT_CHANNEL = 'workana-radar'
export const EXT_REPLY = 'workana-radar-ext'

/** Minimal job payload the extension needs to write a question. */
export interface AskJob {
  slug: string
  title: string
  description: string
  budget: string
  budgetMin: number | null
  budgetMax: number | null
  budgetType: string | null
  country: string
  clientName: string
  skills: string[]
  url: string
}

export interface AskAuth {
  supabaseUrl: string
  anonKey: string
  accessToken: string
  userId: string
}

export interface StartPayload {
  jobs: AskJob[]
  settings: AskBotSettings
  auth: AskAuth
}

export type AskPhase =
  | 'prepare'
  | 'wait'
  | 'opening'
  | 'prepared'
  | 'sent'
  | 'skipped'
  | 'failed'

export interface AskProgress {
  jobId: string
  phase: AskPhase
  message?: string
  question?: string
}

export interface AskRunSummary {
  total: number
  sent: number
  prepared: number
  failed: number
  error?: string
}

export function jobToAskJob(job: Job): AskJob {
  return {
    slug: job.id,
    title: job.title || '',
    description: job.description || '',
    budget: job.budget || '',
    budgetMin: job.budget_min,
    budgetMax: job.budget_max,
    budgetType: job.budget_type,
    country: job.client_country || '',
    clientName: job.client_name || '',
    skills: skillsOf(job),
    url: job.url || `https://www.workana.com/job/${job.id}`,
  }
}

/** Is the extension installed and listening? Resolves false after a timeout. */
export function pingExtension(timeoutMs = 900): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false
    const onMsg = (e: MessageEvent) => {
      if (e.source === window && e.data?.source === EXT_REPLY && e.data?.type === 'PONG') {
        finish(true)
      }
    }
    const finish = (v: boolean) => {
      if (done) return
      done = true
      window.removeEventListener('message', onMsg)
      resolve(v)
    }
    window.addEventListener('message', onMsg)
    window.postMessage({ source: EXT_CHANNEL, type: 'PING' }, window.location.origin)
    setTimeout(() => finish(false), timeoutMs)
  })
}

/**
 * Standing listener that latches "extension present" when the bridge announces
 * itself — covers the race where the content script injects AFTER the initial
 * ping window closes. Also re-pings so an already-loaded bridge replies.
 */
export function onExtReady(cb: () => void): () => void {
  const onMsg = (e: MessageEvent) => {
    if (e.source === window && e.data?.source === EXT_REPLY && e.data?.type === 'PONG') cb()
  }
  window.addEventListener('message', onMsg)
  window.postMessage({ source: EXT_CHANNEL, type: 'PING' }, window.location.origin)
  return () => window.removeEventListener('message', onMsg)
}

export function startAsking(payload: StartPayload) {
  window.postMessage({ source: EXT_CHANNEL, type: 'START_ASKING', payload }, window.location.origin)
}

export function stopAsking() {
  window.postMessage({ source: EXT_CHANNEL, type: 'STOP_ASKING' }, window.location.origin)
}

/** Subscribe to progress/done events from the extension. Returns an unsubscribe. */
export function onAskEvents(handlers: {
  onProgress?: (p: AskProgress) => void
  onDone?: (summary: AskRunSummary) => void
}): () => void {
  const onMsg = (e: MessageEvent) => {
    if (e.source !== window || e.data?.source !== EXT_REPLY) return
    if (e.data.type === 'ASK_PROGRESS') handlers.onProgress?.(e.data.payload as AskProgress)
    else if (e.data.type === 'ASK_DONE') handlers.onDone?.(e.data.payload as AskRunSummary)
  }
  window.addEventListener('message', onMsg)
  return () => window.removeEventListener('message', onMsg)
}
