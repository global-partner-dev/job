/**
 * HTML parsing for Workana project pages.
 *
 * AskBot never posts to Workana directly — it fills the site's own "Ask a
 * question" form in a real tab — so no CSRF/dcst token parsing lives here any
 * more. All that's left is reading a project's public detail page.
 */

/** @param {string} url */
export function slugFromJobUrl(url) {
  const m = (url || '').match(/workana\.com\/job\/([^/?#]+)/i);
  return m ? m[1] : null;
}

function stripTags(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Published / paid counts from job sidebar (EN, PT, ES). */
export function parseClientProjectStats(html) {
  const labels = [
    { key: 'published', patterns: [/Published projects/i, /Projetos publicados/i, /Proyectos publicados/i] },
    { key: 'paid', patterns: [/Projects paid/i, /Projetos pagos/i, /Proyectos pagados/i] },
  ];
  const out = { clientProjectsPublished: null, clientProjectsPaid: null };

  for (const { key, patterns } of labels) {
    for (const pattern of patterns) {
      const re = new RegExp(
        `<p[^>]*class=["']h4["'][^>]*>\\s*(\\d+)\\s*</p>\\s*<p[^>]*>\\s*${pattern.source}\\s*</p>`,
        'i'
      );
      const m = html.match(re);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n)) {
          if (key === 'published') out.clientProjectsPublished = n;
          else out.clientProjectsPaid = n;
        }
        break;
      }
    }
  }
  return out;
}

/** Client display name from job page sidebar (after the CTA block). */
export function parseClientName(html) {
  const afterCta = html.match(
    /block-cta[\s\S]{0,1500}?class=["']h4 user-name["'][^>]*>\s*<span[^>]*>([^<]+)</i
  );
  if (afterCta?.[1]) return stripTags(afterCta[1]);

  const aside = html.match(/<aside[\s\S]*?<\/aside>/i)?.[0];
  if (aside) {
    const inAside = aside.match(/class=["']h4 user-name["'][^>]*>\s*<span[^>]*>([^<]+)</i);
    if (inAside?.[1]) return stripTags(inAside[1]);
  }
  return '';
}

/** @param {string} html */
export function parseProjectPage(html) {
  const titleMatch =
    html.match(/id=["']productName["'][\s\S]*?<h1[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ||
    html.match(/<h1[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);

  const budgetMatch =
    html.match(/<h[34][^>]*class=["'][^"']*budget[^"']*["'][^>]*>([\s\S]*?)<\/h[34]>/i) ||
    html.match(/class=["']budget[^"']*["'][^>]*>([\s\S]*?)<\//i);

  const descMatch =
    html.match(/class=["']expander["'][^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/class=["']specification["'][^>]*>([\s\S]*?)<\/(?:p|div)>/i);

  const countryMatch =
    html.match(/class=["']country-name["'][^>]*>([\s\S]*?)<\//i) ||
    html.match(/class=["']country["'][^>]*>[\s\S]*?country-name["'][^>]*>([\s\S]*?)<\//i);

  const skills = [];
  const skillRe = /class=["'][^"']*skill[^"']*label[^"']*["'][^>]*>([^<]+)</gi;
  let sm;
  while ((sm = skillRe.exec(html)) !== null) {
    const t = sm[1].trim();
    if (t) skills.push(t);
  }

  return {
    title: stripTags(titleMatch?.[1] || ''),
    budget: stripTags(budgetMatch?.[1] || '').replace(/\s+/g, ' '),
    description: stripTags(descMatch?.[1] || ''),
    skills,
    country: stripTags(countryMatch?.[1] || countryMatch?.[2] || ''),
    clientName: parseClientName(html),
    ...parseClientProjectStats(html),
  };
}

// ---------------------------------------------------------------------------
// Conversation pages (/inbox/<project>/<you>). The chat is drawn by script, but
// the data behind it is in the page source: Workana hands it to its <inbox>
// component as one HTML-escaped JSON attribute.
// ---------------------------------------------------------------------------

/** Undo the HTML escaping of an attribute value (a service worker has no DOMParser). */
function decodeAttribute(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Your own Workana user name (the "miki-16" in /inbox/<project>/miki-16), from
 * the `Workana = {… "me": {…}}` settings every logged-in page carries.
 */
export function parseOwnSlug(html) {
  const m = (html || '').match(/"me"\s*:\s*\{\s*"id"\s*:\s*\d+\s*,\s*"info"\s*:\s*\{[^{}]*?"slug"\s*:\s*"([^"]+)"/);
  return m ? m[1] : null;
}

/**
 * What a conversation page says about the client.
 *   found         the page has a conversation at all
 *   online        Workana shows the client online (null when it doesn't say)
 *   clientReplied the client has written in the conversation
 *   ownMessages   how many messages in it are yours
 *   canAddMessage whether Workana lets you write another one (null = unknown)
 */
export function parseConversation(html) {
  const out = { found: false, online: null, clientReplied: false, ownMessages: 0, canAddMessage: null };
  const attr = (html || '').match(/<inbox\b[^>]*?\s:initial="([^"]*)"/);
  if (!attr) return out;
  const raw = decodeAttribute(attr[1]);

  let conv = null;
  try {
    conv = JSON.parse(raw)?.messageIndexData;
  } catch {
    /* read the few fields straight from the text below */
  }
  if (conv && typeof conv === 'object') {
    const messages = Array.isArray(conv.messages) ? conv.messages : [];
    const mine = (m) => /\bself\b/.test(m?.classes || '');
    out.found = true;
    out.online = typeof conv.otherParty?.online === 'boolean' ? conv.otherParty.online : null;
    out.canAddMessage = typeof conv.canAddMessage === 'boolean' ? conv.canAddMessage : null;
    out.ownMessages = messages.filter(mine).length;
    out.clientReplied = messages.some((m) => m && !mine(m) && m.isByHuman !== false);
    return out;
  }

  const online = raw.match(/"otherParty"\s*:\s*\{[^{}]*?"online"\s*:\s*(true|false)/);
  if (!online) return out;
  out.found = true;
  out.online = online[1] === 'true';
  const can = raw.match(/"canAddMessage"\s*:\s*(true|false)/);
  out.canAddMessage = can ? can[1] === 'true' : null;
  out.ownMessages = (raw.match(/"classes"\s*:\s*"[^"]*\bself\b[^"]*"/g) || []).length;
  out.clientReplied = /"classes"\s*:\s*"(?![^"]*\bself\b)[^"]*"\s*,\s*"isByHuman"\s*:\s*true/.test(raw);
  return out;
}
