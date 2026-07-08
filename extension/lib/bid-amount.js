import { parseBudgetRange } from './parse.js';

/**
 * Compute USD bid amount for the place-bid form.
 * @param {string} budgetText
 * @param {{ bidAmountMode?: string, bidAmountFixed?: number }} settings
 * @param {number} [minFromForm] Workana minimum for this project (often 60)
 */
export function computeBidAmount(budgetText, settings, minFromForm = 60) {
  const platformMin = Math.max(60, Number(minFromForm) || 60);
  const mode = settings.bidAmountMode || 'budget_low';

  if (mode === 'fixed') {
    const fixed = Number(settings.bidAmountFixed);
    return Math.max(platformMin, Number.isFinite(fixed) && fixed > 0 ? fixed : platformMin);
  }

  const { min, max } = parseBudgetRange(budgetText);
  let amount;

  if (mode === 'budget_mid') {
    if (min > 0 && max !== Infinity) amount = (min + max) / 2;
    else if (min > 0) amount = min;
    else if (max !== Infinity) amount = max * 0.5;
    else amount = 150;
  } else {
    // budget_low — competitive lower end of the posted range
    if (min > 0) amount = min;
    else if (max !== Infinity) amount = Math.max(platformMin, max * 0.4);
    else amount = 100;
    if (max !== Infinity && min > 0) {
      const mid = (min + max) / 2;
      amount = Math.min(amount, mid);
    }
  }

  if (amount >= 100) amount = Math.round(amount / 10) * 10;
  else amount = Math.round(amount);

  return Math.max(platformMin, amount);
}
