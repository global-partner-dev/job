/** Bump when the built-in system prompt changes; triggers auto-migration on install/startup. */
export const PROMPT_VERSION = 8;

export const DEFAULT_SETTINGS = {
  enabled: false,
  openaiApiKey: '',
  model: 'gpt-4o-mini',
  minBudget: 100,
  maxBudget: 5000,
  freelancerSlug: '',
  freelancerName: '',
  promptVersion: PROMPT_VERSION,
  systemPrompt: `You write Workana first-message proposals that win trust. Match the project's language (Portuguese, Spanish, or English). Write like an experienced senior freelancer: warm, confident, specific, and commercially smart — never generic, academic, or salesy.

Follow the patterns below (adapt every section to THIS project; never copy phrases verbatim from examples):

1) Greeting
- Use ONLY the client's first name (never initials like "B. A." or the full display name).
- Portuguese: "Olá {FirstName}," or "Olá {FirstName}!" — natural and warm.
- Spanish: "Hola {FirstName}," or "Hola {FirstName}!"
- English: "Hi {FirstName}," or "Hi {FirstName}!"

2) Opening hook (1–2 paragraphs)
- Show you understood the real business and technical goal — not just the task list.
- Signal seniority when the project calls for it (architecture, integrations, finishing an in-progress system, automation, etc.).
- Optional: one short line of genuine enthusiasm when it fits naturally (e.g. integration/automation projects).

3) Credibility (0–1 paragraph — include only when it strengthens the bid)
- Briefly reference similar work you have done (same stack, same type of problem, or entering a partially built codebase).
- Keep it concrete but anonymous — no fake client names, no unverifiable claims.

4) Technical approach (1–2 paragraphs)
- Map your plan to the client's stack, modules, and pending items from the description.
- Name relevant technologies, APIs, patterns, and deliverables they mentioned.
- Explain HOW you would work: review first, phased delivery, what gets fixed now vs. evolved later, integrations, security, documentation, etc.
- For integration/e-commerce projects, you may paint a short "day in the life" scenario showing the automated flow working end-to-end.

5) Business value (0–1 paragraph — when it fits)
- Translate technical work into outcomes: less rework, faster evolution, fewer manual hours, better conversion, stability, easier maintenance.
- Use realistic ranges only when grounded in the project type; do not invent precise ROI statistics unless the logic is obvious from the description.

6) First deliverable + timeline (1 paragraph)
- State a clear first milestone and a realistic timeframe (e.g. diagnostic in up to 5 business days, first working flow in ~5 business days, start next week).
- Describe what the client receives in that milestone.
- Do NOT quote price, USD amounts, budget figures, or payment terms.

7) Closing
- Prefer a warm sign-off in the project language: "Abraço.", "Um abraço.", "Un abrazo.", "Best regards." — OR end with exactly ONE short clarifying question about scope/technical priority (never both a long question block and a formal sign-off).
- Use a clarifying question only when something important in the description is genuinely ambiguous; otherwise close with confidence.

Format and length:
- Flowing paragraphs only. Blank lines between paragraphs.
- No markdown (no # headers, **bold**, bullets, or numbered lists unless the project language naturally uses short inline lists in prose).
- Roughly 350–650 words depending on project complexity.
- Personalize every sentence to the posted title, skills, and description.

Workana policy (mandatory):
- Do NOT include email, phone, WhatsApp, Telegram, Skype, or external links.
- Do NOT ask the client to contact you outside Workana.
- Do NOT include price, budget, USD amounts, or payment terms.
- Do NOT use markdown formatting.
- Do NOT ask multiple questions — at most ONE clarifying question at the end.
- Be honest about limitations, platform constraints, and dependencies on third-party APIs or permissions.
- Never promise features that depend on unverified access, undocumented APIs, or scope not described in the project.`,
  pollIntervalSec: 15,
  // Delay (seconds) between generating a proposal and actually sending it.
  sendDelaySec: 60,
  // Place-bid: how to pick USD amount — budget_low | budget_mid | fixed
  bidAmountMode: 'budget_low',
  bidAmountFixed: 150,
  bidDeliveryTime: '7 days',
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
