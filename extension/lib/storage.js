/** Bump when the built-in system prompt changes; triggers auto-migration on install/startup. */
export const PROMPT_VERSION = 9;

export const DEFAULT_SETTINGS = {
  openaiApiKey: '',
  model: 'gpt-4o-mini',
  freelancerSlug: '',

  // --- BidBot filters (applied to the selection before bidding) ---
  minBudget: 100,
  maxBudget: 5000,

  // --- Identity / portfolio ---
  // Your name is intentionally NOT put in proposals. Optional portfolio link only.
  portfolioUrl: '',

  // --- BidBot queue behaviour ---
  submitMode: 'auto',        // 'auto' = place the bid; 'manual' = open + prefill, you click Place Bid
  genDelayMinSec: 10,        // random wait after a proposal is written, before submitting
  genDelayMaxSec: 30,
  gapDelayMinSec: 30,        // random wait between one bid and the next
  gapDelayMaxSec: 40,

  // --- Pricing (OpenAI analyses the project → amount + delivery) ---
  priceStrategy: 'ai',       // 'ai' | 'fixed'
  bidAmountFixed: 150,       // used only when priceStrategy === 'fixed'
  bidDeliveryTime: '7 days', // fallback delivery when priceStrategy === 'fixed'

  // --- Supabase source (same project the dashboard reads) ---
  supabaseUrl: '',
  supabaseAnonKey: '',

  promptVersion: PROMPT_VERSION,
  systemPrompt: `You write Workana first-message proposals that win trust and replies. Match the project's language (Portuguese, Spanish, or English). Write like an experienced senior freelancer: warm, confident, specific, and commercially smart — never generic, academic, or salesy.

IDENTITY RULES (mandatory):
- NEVER reveal or invent your own name. Do not sign with a personal name, initials, company, or persona.
- Never write "I'm <name>", "meu nome é", "soy", or "Regards, <name>". Refer to yourself only as "I" / "eu" / "yo".

Structure (adapt every section to THIS project; never copy example phrases verbatim):
1) Greeting — use ONLY the client's first name. PT: "Olá {FirstName}," · ES: "Hola {FirstName}," · EN: "Hi {FirstName},".
2) Opening hook (1–2 paragraphs) — show you understood the real business and technical goal, not just the task list. Signal seniority when the project calls for it (architecture, integrations, finishing an in-progress system, automation).
3) Credibility (0–1 paragraph, only when it strengthens the bid) — reference similar work concretely but anonymously (no client names, no unverifiable claims).
4) Technical approach (1–2 paragraphs) — map a plan to their stack, modules, and pending items; name relevant technologies, APIs, patterns, deliverables; explain HOW you work (review first, phased delivery, integrations, security, docs). For integration/automation projects you may sketch a short end-to-end "day in the life" flow.
5) Business value (0–1 paragraph) — translate the work into outcomes: less rework, faster evolution, fewer manual hours, stability, easier maintenance.
6) First deliverable + timeline (1 paragraph) — a clear first milestone and a realistic-but-fast timeframe; describe what they receive. Do NOT quote any price, USD amount, or the delivery number (those are submitted separately).
7) Portfolio — ONLY if a portfolio link is provided in the input, reference it once, naturally, as proof of past work. Otherwise omit entirely.
8) Closing — a warm sign-off in the project language WITHOUT any name ("Abraço.", "Um abraço.", "Un abrazo.", "Best regards.") OR end with exactly ONE short clarifying question. Never both, and never a name.

Format and length:
- Flowing paragraphs only, blank lines between them. No markdown. ~300–600 words. Personalize every sentence to the posted title, skills, and description.

Workana policy (mandatory):
- No email, phone, WhatsApp, Telegram, Skype. Do NOT ask the client to contact you outside Workana.
- The ONLY external link allowed is the portfolio link provided in the input (if any) — no other links.
- Do NOT include price, budget, USD amounts, or payment terms.
- At most ONE question. Be honest about limitations and third-party/API dependencies; never promise unverified scope.`,
};

const BIDDED_KEY = 'biddedSlugs';
const LATEST_SLUG_KEY = 'lastSeenLatestSlug';
const PENDING_SENDS_KEY = 'pendingSends';

export async function getSettings() {
  const data = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...data };
}

export async function saveSettings(partial) {
  await chrome.storage.sync.set(partial);
  return getSettings();
}

export async function getBiddedSlugs() {
  const { [BIDDED_KEY]: biddedSlugs = [] } = await chrome.storage.local.get(BIDDED_KEY);
  return new Set(biddedSlugs);
}

export async function markSlugBidded(slug) {
  const set = await getBiddedSlugs();
  set.add(slug);
  await chrome.storage.local.set({ [BIDDED_KEY]: [...set].slice(-500) });
}

export async function getLastSeenLatestSlug() {
  const { [LATEST_SLUG_KEY]: slug } = await chrome.storage.local.get(LATEST_SLUG_KEY);
  return slug || null;
}

export async function setLastSeenLatestSlug(slug) {
  await chrome.storage.local.set({ [LATEST_SLUG_KEY]: slug });
}

export async function clearBidTracking() {
  await chrome.storage.local.remove([BIDDED_KEY, LATEST_SLUG_KEY]);
}

/** Proposals generated but not yet sent (keyed by project slug). */
export async function getPendingSends() {
  const { [PENDING_SENDS_KEY]: map = {} } = await chrome.storage.local.get(PENDING_SENDS_KEY);
  return map;
}

export async function getPendingSend(slug) {
  const map = await getPendingSends();
  return map[slug] || null;
}

export async function setPendingSend(slug, record) {
  const map = await getPendingSends();
  map[slug] = record;
  await chrome.storage.local.set({ [PENDING_SENDS_KEY]: map });
}

export async function removePendingSend(slug) {
  const map = await getPendingSends();
  if (slug in map) {
    delete map[slug];
    await chrome.storage.local.set({ [PENDING_SENDS_KEY]: map });
  }
}

export async function appendLog(entry) {
  const { activityLog = [] } = await chrome.storage.local.get('activityLog');
  activityLog.unshift({ ...entry, at: new Date().toISOString() });
  await chrome.storage.local.set({ activityLog: activityLog.slice(0, 100) });
}

export async function clearActivityLog() {
  await chrome.storage.local.set({ activityLog: [] });
}
