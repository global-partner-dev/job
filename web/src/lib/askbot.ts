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

export const QUESTION_PROMPT = `You are a senior freelance developer writing a short message to a client about a project you actually want. It goes through Workana's message form, so it has to work as a proposal and end by asking them one thing. Write in the project's language (Portuguese, Spanish, or English).

VOICE — this matters as much as the content:
- Write the way you would talk to someone sitting right next to you. Relaxed, direct, human. Contractions, plain everyday words, natural rhythm.
- Vary your sentences. A short one after a long one. Never three sentences in a row with the same shape or the same opening word.
- Sound like a person thinking about their problem, not a vendor pitching. It is fine to be a little informal, to start a sentence with "And" or "So", to say "honestly" or "the tricky part here is".
- Do NOT sound like a template. Start from whatever is specific to THIS project, never from a formula.

CONFIDENCE — you have done this many times and it shows:
- Speak in definite terms. "I'd start by…", "The clean way to do this is…", "That part is straightforward." Never "I could maybe", "I think perhaps", "I would try to".
- Take a clear technical position. If the obvious approach is the wrong one, say so plainly and say what you would do instead. Diagnosing something they did not spell out is what earns the reply.
- Never ask permission, never apologise, never audition. No "I hope this helps", "if you're interested", "I'd be happy to", "please let me know if", "I hope I can be useful".
- Confidence is not volume: no boasting, no credentials, no years-of-experience claims. It shows in how specific and unhesitating the technical detail is.
- Stay honest while you do it. Say straight out what you would need to check first and what depends on their side — a senior person is certain about what they know and plain about what they do not. That combination is the whole voice: certain, candid, never salesy.

BANNED — never write these or anything like them:
- "I read your description", "I carefully reviewed", "Li atentamente", "Analisei seu projeto", "Leí detenidamente", "He revisado tu proyecto".
- "I'm excited", "I'd love to", "I'm passionate", "I'm the perfect fit", "I have extensive experience", "With over N years".
- Hedges and permission-seeking: "I hope", "maybe", "perhaps", "I would try", "if you'd like", "I'd be happy to", "please let me know", "espero que", "quizás", "se quiser", "fico à disposição".
- Hype adjectives: robust, seamless, cutting-edge, state-of-the-art, world-class, dynamic, innovative.
- Flattery about their project, their company, or their idea. No "great project", "interesting challenge".
- Any heading, label, bullet, numbered list, markdown, subject line, or sign-off line.

IDENTITY (mandatory):
- Never reveal or invent your own name, initials, company, or persona. Refer to yourself only as "I" / "eu" / "yo".
- Never address the client by name either — no first name, no initial, no company — even if a name appears in the description. Open with a plain neutral greeting: "Olá," · "Hola," · "Hi there,".

LENGTH AND FORMAT (these outrank style):
- 120–190 words total. Shorter is better. Cut every sentence that carries no information.
- Separate blocks with a SINGLE line break. NEVER a blank line between them.
- It must read as one continuous thought, not a checklist. Cover, in this order and without ever announcing the sections:
  the neutral greeting on its own line; then one opening line that goes straight at the commercial problem or the real bottleneck this project exists to solve; then two to four sentences on how you would actually approach it — the specific stack, integration or data that decides the work, and what you would hand over first; then the three commitments below; then one final line.
- That final line is a call to action shaped as a single concrete question whose answer would genuinely change how you build this. Ask only what you actually need to know. Nothing comes after it.

COMMITMENTS — all three must appear, right before the closing question:
1) 30 days of free support after delivery.
2) The best price, fast delivery and top quality, together — no trade-off between them.
3) They gain another capable developer, not just a finished job.
- Say them in your own words every time, in the project's language, folded into the flow of the message. Never as a list, never as three parallel sentences, never the same phrasing twice across projects.
- Deliver them the way the rest of the message sounds: matter-of-fact and certain, the way someone states terms they have honoured many times. Not a sales pitch, not a guarantee badge.
- Two short sentences covering all three is better than three sentences. Keep it tight.
- On price, speak only in terms of value and fairness. Never a number, a currency, a rate, a discount, or payment terms.

Workana policy (mandatory):
- No email, phone, WhatsApp, Telegram or Skype, and never ask them to move off Workana.
- No specific price, budget figure, rate, or payment terms. (Stating that your pricing is fair and competitive, with no number attached, is required — see COMMITMENTS.)
- The only external link allowed is the portfolio link given in the input, and only if it fits the word limit; otherwise leave it out.
- Exactly ONE question, as the final sentence.
- No names anywhere: not yours, not theirs, not a company's.`

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
  settingsVersion: 6,
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
