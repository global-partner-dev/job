import { chatCompletion } from './openai.js';

/**
 * The second bidder's check before it bids: is this project worth a proposal?
 * The budget is never looked at. A project passes only when
 *   - its brief doesn't open the way Workana's assistant writes them
 *     ("The client is looking for…"; checked here by its opening, not by the
 *     model, which took any polished brief for the assistant's),
 *   - the scope is clear enough to estimate, and
 *   - it is one of the project types the second bidder works on.
 */

/** Project types the second bidder bids on. Anything else is 'other'. */
export const CATEGORIES = {
  mvp: 'MVP of a specific concept (PWA, mobile app, web app)',
  internal_system: 'internal management system',
  crm_erp: 'CRM / ERP',
  process_automation: 'business process automation',
};

// Workana's assistant rewrites a client's request in the third person
// ("O cliente busca um profissional altamente especializado para…"). Those
// posts rarely lead anywhere, and they are easy to spot by their opening.
const CLIENT_OPENER_RE = new RegExp(
  '^\\s*(?:the|o|a|el|la)\\s+cliente?\\s+(?:is\\s+)?' +
    '(?:look|seek|search|need|want|requir|request|' + // EN
    'busca|procura|est[áa]\\s+(?:buscando|procurando)|necessit|precisa|desej|quer|requer|solicit|gostaria|' + // PT
    'necesit|requier|quier|dese)', // ES
  'i',
);
const SPECIALIST_RE = /highly specialized (?:freelancer|professional)|(?:freelancer|profissional|profesional) altamente especializad/i;

/** Whether the brief opens the way Workana's assistant writes them. */
export function looksWorkanaWritten(description) {
  const text = String(description || '');
  return CLIENT_OPENER_RE.test(text) || SPECIALIST_RE.test(text.slice(0, 300));
}

// The listing card only shows ~350 characters ending in "View more"; a real
// brief is longer. Same rule as the scraper's is_truncated_description().
const PREVIEW_MARKERS = /view more|ver m[áa]s|ver mais/i;
const MIN_FULL_DESCRIPTION_CHARS = 500;

/** Whether this text is (probably) the listing preview rather than the full brief. */
export function isPreviewText(description) {
  const text = String(description || '');
  return !text || PREVIEW_MARKERS.test(text) || text.length < MIN_FULL_DESCRIPTION_CHARS;
}

const SCREEN_PROMPT = `You screen Workana projects for a freelance developer before a proposal is written. Budget and price play no part in the decision, and neither does the writing style: a polished or formal brief is fine. Judge two things and answer with JSON only.

1. "clear_scope": false only for a sparse or vague brief, one that leaves you unable to tell WHAT is to be built or changed, for WHAT business or users, or what its main features, workflow or data are. For example: "We need to migrate an existing system. The freelancer must ensure a stable migration and have practical experience with PHP." (migrate what, how big, from what to what, for which business?). A brief that names the product, who uses it and its main features is clear, even when details such as exact business rules, integrations or volumes are left open; those get settled with the client later. Otherwise true.

2. "category", exactly one of:
   - "mvp": an MVP or new product built around a specific, explained concept: PWA, mobile app, web app, SaaS idea.
   - "internal_system": an internal management system for a business: operations, production, inventory, orders, scheduling, HR, finance, field service, school or clinic management and similar.
   - "crm_erp": a CRM or ERP, built custom or substantially customised.
   - "process_automation": automating a business process: integrations between systems, document or data processing, reports, internal workflows. Simple WhatsApp automation (chatbots, auto-replies, mass messages) is NOT this; it is "other".
   - "other": anything else, for example websites, landing pages, WordPress or Shopify stores, design, video, marketing, SEO, data entry, small fixes or tweaks to an existing site, game mods, consulting only, hiring for a team.

Reply as {"clear_scope": true|false, "category": "...", "reason": "one short sentence in English"}.`;

/**
 * Ask the model whether to bid on a project.
 * @param {{ apiKey: string, model: string, project: { title: string, description: string, skills?: string[] } }} opts
 * @returns {Promise<{ bid: boolean, category: string, reason: string }>}
 */
export async function screenProject({ apiKey, model, project }) {
  const content = await chatCompletion({
    apiKey,
    model,
    json: true,
    messages: [
      { role: 'system', content: SCREEN_PROMPT },
      {
        role: 'user',
        content: [
          `Title: ${project.title}`,
          `Skills: ${(project.skills || []).join(', ')}`,
          '',
          'Description:',
          project.description,
        ].join('\n'),
      },
    ],
  });

  let v;
  try {
    v = JSON.parse(content);
  } catch {
    throw new Error(`Project check: unreadable answer from OpenAI: ${content.slice(0, 120)}`);
  }
  const category = Object.hasOwn(CATEGORIES, v.category) ? v.category : 'other';
  const note = String(v.reason || '').trim();
  const why = (what) => (note ? `${what}: ${note}` : what);

  if (v.clear_scope !== true) return { bid: false, category, reason: why('scope too vague') };
  if (category === 'other') return { bid: false, category, reason: why('not a project type we bid on') };
  return { bid: true, category, reason: note };
}
