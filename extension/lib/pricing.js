import { parseBudgetRange } from './parse.js';

const PLATFORM_MIN = 60;

function roundAmount(amount, max) {
  if (!Number.isFinite(amount) || amount <= 0) return PLATFORM_MIN;
  const step = amount >= 100 ? 10 : 5;
  // When a budget max is known, round DOWN so we never round up past it.
  const hasMax = Number.isFinite(max) && max !== Infinity && max > 0;
  const rounded = hasMax ? Math.floor(amount / step) * step : Math.round(amount / step) * step;
  return Math.max(PLATFORM_MIN, rounded);
}

/** Clamp an amount into the posted budget range (when known). */
function clampToBudget(amount, min, max) {
  let a = amount;
  if (Number.isFinite(max) && max !== Infinity && max > 0) a = Math.min(a, max);
  if (min > 0) a = Math.max(a, Math.min(min, Number.isFinite(max) ? max : min));
  return a;
}

function formatDelivery(days) {
  const d = Math.max(1, Math.min(60, Math.round(Number(days) || 7)));
  if (d % 7 === 0 && d >= 7) {
    const w = d / 7;
    return `${w} week${w === 1 ? '' : 's'}`;
  }
  return `${d} day${d === 1 ? '' : 's'}`;
}

/**
 * Compute a competitive USD amount + delivery time for a project.
 * @param {{apiKey:string, model:string, project:object, settings:object}} opts
 * @returns {Promise<{amount:number, deliveryTime:string, rationale?:string}>}
 */
export async function computeBidPricing({ apiKey, model, project, settings }) {
  const { min, max } = parseBudgetRange(project.budget);

  // Fixed strategy: no OpenAI call.
  if ((settings.priceStrategy || 'ai') === 'fixed') {
    const fixed = roundAmount(Number(settings.bidAmountFixed) || 150);
    return {
      amount: Math.max(PLATFORM_MIN, fixed),
      deliveryTime: (settings.bidDeliveryTime || '7 days').trim() || '7 days',
    };
  }

  const budgetLine =
    min > 0 || (Number.isFinite(max) && max !== Infinity)
      ? `Posted budget (USD): min=${min || '?'} max=${max === Infinity ? '?' : max}. Type: ${project.budgetType || 'fixed'}.`
      : 'Posted budget: not specified.';

  const system =
    'You are a competitive freelance-bidding strategist in the AI-accelerated era. ' +
    'Given a project and its posted budget, output a bid amount and delivery time that WIN the job: ' +
    'priced at the competitive lower-to-middle part of the client\'s range (NEVER above the max), ' +
    'reflecting that modern AI tooling lets a senior developer deliver faster and cheaper than legacy estimates — ' +
    'but not so low it signals low quality. Delivery should be aggressive yet credible. ' +
    'Respond ONLY as strict JSON: {"amount": number, "currency": "USD", "deliveryDays": number, "rationale": string}.';

  const user = [
    `Title: ${project.title}`,
    budgetLine,
    `Skills: ${(project.skills || []).join(', ')}`,
    '',
    'Description:',
    (project.description || '').slice(0, 4000),
  ].join('\n');

  let amount;
  let deliveryDays;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
      amount = Number(parsed.amount);
      deliveryDays = Number(parsed.deliveryDays);
    }
  } catch (e) {
    console.warn('[BidBot] pricing model failed, falling back:', e?.message || e);
  }

  // Fallback if the model didn't return a usable amount: competitive lower end.
  if (!Number.isFinite(amount) || amount <= 0) {
    if (min > 0) amount = min;
    else if (Number.isFinite(max) && max !== Infinity) amount = max * 0.5;
    else amount = 150;
  }
  if (!Number.isFinite(deliveryDays) || deliveryDays <= 0) deliveryDays = 7;

  // Clamp → round (down, if a max exists) → clamp again so the final amount can
  // never exceed the posted maximum.
  amount = clampToBudget(roundAmount(clampToBudget(amount, min, max), max), min, max);
  return { amount, deliveryTime: formatDelivery(deliveryDays) };
}
