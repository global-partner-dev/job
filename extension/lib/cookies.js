/**
 * Build Cookie header for extension fetch (service worker does not send cookies automatically).
 * @param {string} url
 */
export async function cookieHeaderFor(url) {
  const cookies = await chrome.cookies.getAll({ url });
  if (!cookies.length) return '';
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}
