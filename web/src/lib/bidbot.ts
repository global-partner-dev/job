import type { Job } from '../types'
import { skillsOf } from './format'

/**
 * BidBot settings + the web↔extension bridge protocol.
 *
 * The web app is the single source of truth for BidBot settings and the job
 * selection. On "Start Bidding" it locks the selected projects in Supabase
 * (per-user) and hands the jobs + settings + the user's session to the browser
 * extension via window.postMessage. The extension does the actual Workana work.
 */

export interface BidBotSettings {
  openaiApiKey: string
  model: string
  freelancerSlug: string
  portfolioUrl: string
  // manual = open + prefill (you click Place bid) · auto = auto-submit selected
  // full = fully automated: continuously bids on all jobs matching feed filters
  submitMode: 'manual' | 'auto' | 'full'
  genDelayMinSec: number
  genDelayMaxSec: number
  gapDelayMinSec: number
  gapDelayMaxSec: number
  priceStrategy: 'ai' | 'fixed'
  bidAmountFixed: number
  bidDeliveryTime: string
  systemPrompt: string
}

export const NO_NAME_PROMPT = `You write Workana first-message proposals that win trust and replies. Match the project's language (Portuguese, Spanish, or English). Write like an experienced senior freelancer: warm, confident, specific, and commercially smart — never generic, academic, or salesy.

IDENTITY RULES (mandatory):
- NEVER reveal or invent your own name. Do not sign with a personal name, initials, company, or persona.
- Never write "I'm <name>", "meu nome é", "soy", or "Regards, <name>". Refer to yourself only as "I" / "eu" / "yo".

Structure (adapt every section to THIS project; never copy example phrases verbatim):
1) Greeting — use ONLY the client's first name. PT: "Olá {FirstName}," · ES: "Hola {FirstName}," · EN: "Hi {FirstName},".
2) Opening hook (1–2 paragraphs) — show you understood the real business and technical goal, not just the task list.
3) Credibility (0–1 paragraph, only when it strengthens the bid) — reference similar work concretely but anonymously.
4) Technical approach (1–2 paragraphs) — map a plan to their stack, modules, and pending items; name relevant technologies and how you work.
5) Business value (0–1 paragraph) — translate the work into outcomes.
6) First deliverable + timeline (1 paragraph) — a clear first milestone and a realistic-but-fast timeframe. Do NOT quote any price or the delivery number (submitted separately).
7) Portfolio — ONLY if a portfolio link is provided, reference it once, naturally. Otherwise omit.
8) Closing — a warm sign-off WITHOUT any name, OR exactly ONE short clarifying question. Never both, never a name.

Format: flowing paragraphs, no markdown, ~300–600 words, personalized. Workana policy: no contact info; the only external link allowed is the portfolio link; no price/budget; at most one question.`

export const DEFAULT_BIDBOT_SETTINGS: BidBotSettings = {
  openaiApiKey: '',
  model: 'gpt-4o-mini',
  freelancerSlug: '',
  portfolioUrl: '',
  submitMode: 'manual',
  genDelayMinSec: 10,
  genDelayMaxSec: 30,
  gapDelayMinSec: 30,
  gapDelayMaxSec: 40,
  priceStrategy: 'ai',
  bidAmountFixed: 150,
  bidDeliveryTime: '7 days',
  systemPrompt: NO_NAME_PROMPT,
}

const SETTINGS_KEY = 'workana-radar:bidbot'

export function loadBidBotSettings(): BidBotSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_BIDBOT_SETTINGS }
    return { ...DEFAULT_BIDBOT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_BIDBOT_SETTINGS }
  }
}

export function saveBidBotSettings(s: BidBotSettings) {
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

/** Minimal job payload the extension needs to bid. */
export interface BidJob {
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

export interface BidAuth {
  supabaseUrl: string
  anonKey: string
  accessToken: string
  userId: string
}

export interface StartPayload {
  jobs: BidJob[]
  settings: BidBotSettings
  auth: BidAuth
}

export interface BidProgress {
  jobId: string
  phase: 'prepare' | 'wait' | 'submit' | 'placed' | 'manual' | 'skipped' | 'failed'
  message?: string
  amount?: number
  deliveryTime?: string
}

export function jobToBidJob(job: Job): BidJob {
  return {
    slug: job.id,
    title: job.title || job.title_en || '',
    description: job.description || job.description_en || '',
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

export function startBidding(payload: StartPayload) {
  window.postMessage({ source: EXT_CHANNEL, type: 'START_BIDDING', payload }, window.location.origin)
}

export function stopBidding() {
  window.postMessage({ source: EXT_CHANNEL, type: 'STOP_BIDDING' }, window.location.origin)
}

/** Subscribe to progress/done events from the extension. Returns an unsubscribe. */
export function onBidEvents(handlers: {
  onProgress?: (p: BidProgress) => void
  onDone?: (summary: { total: number; placed: number; failed: number }) => void
}): () => void {
  const onMsg = (e: MessageEvent) => {
    if (e.source !== window || e.data?.source !== EXT_REPLY) return
    if (e.data.type === 'BID_PROGRESS') handlers.onProgress?.(e.data.payload as BidProgress)
    else if (e.data.type === 'BID_DONE') handlers.onDone?.(e.data.payload)
  }
  window.addEventListener('message', onMsg)
  return () => window.removeEventListener('message', onMsg)
}
