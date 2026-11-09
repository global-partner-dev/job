export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Sleep that keeps the MV3 service worker alive. An idle connected port does NOT
 * reset the ~30s idle timer (Chrome 114+), so we poke an extension API every
 * <30s to keep the worker running through long waits.
 */
export async function keepAliveSleep(ms, isStopped = () => false) {
  const PING_MS = 20000;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (isStopped()) return;
    await sleep(Math.min(PING_MS, end - Date.now()));
    try {
      await chrome.runtime.getPlatformInfo(); // resets the SW idle timer
    } catch {
      /* ignore */
    }
  }
}

/**
 * Await `promise` while keeping the MV3 service worker alive. A network call
 * (a slow OpenAI reply, a Cloudflare-delayed Workana page) fires no extension
 * event, so Chrome counts it as idle and kills the worker after ~30s — taking
 * the whole run with it ("Background worker stopped"). Poking an extension API
 * every 20s resets that idle timer for as long as the call takes.
 */
export async function keepAliveWhile(promise) {
  const pinger = setInterval(() => chrome.runtime.getPlatformInfo().catch(() => {}), 20000);
  try {
    return await promise;
  } finally {
    clearInterval(pinger);
  }
}

/** Random delay in ms within [minSec, maxSec]. */
export function randMs(minSec, maxSec) {
  const lo = Math.max(1, Number(minSec) || 1);
  const hi = Math.max(lo, Number(maxSec) || lo);
  return Math.round((lo + Math.random() * (hi - lo)) * 1000);
}
