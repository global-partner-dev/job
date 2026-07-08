/** @param {unknown} value */
export function parseClientStat(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/**
 * Block clients with many postings but zero payments (likely non-payers).
 * @param {{ clientProjectsPublished?: number|null, clientProjectsPaid?: number|null }} job
 */
export function passesClientHistoryFilter(job) {
  const published = parseClientStat(job.clientProjectsPublished);
  const paid = parseClientStat(job.clientProjectsPaid);

  if (published === null || paid === null) {
    return { ok: true, verified: false };
  }

  if (paid === 0 && published >= 3) {
    return {
      ok: false,
      verified: true,
      reason: `Client has ${published} published projects but 0 paid — skip`,
    };
  }

  return { ok: true, verified: true };
}

export function needsClientStats(job) {
  return (
    parseClientStat(job.clientProjectsPublished) === null ||
    parseClientStat(job.clientProjectsPaid) === null
  );
}
