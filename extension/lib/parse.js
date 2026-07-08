/** @param {string} budgetText e.g. "USD 100 - 250" or "USD 1,000 - 3,000" */
export function parseBudgetRange(budgetText) {
  if (!budgetText) return { min: 0, max: Infinity };
  const nums = budgetText.replace(/,/g, '').match(/\d+/g);
  if (!nums || nums.length === 0) return { min: 0, max: Infinity };
  const values = nums.map(Number);
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** @param {string} url */
export function slugFromJobUrl(url) {
  const m = url.match(/workana\.com\/job\/([^/?#]+)/i);
  return m ? m[1] : null;
}

/** @param {string} html @param {string} name */
function inputValue(html, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<input[^>]*name=["']${esc}["'][^>]*value=["']([^"']*)["']`, 'gi'),
    new RegExp(`<input[^>]*value=["']([^"']*)["'][^>]*name=["']${esc}["']`, 'gi'),
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    const m = re.exec(html);
    if (m) return m[1];
  }
  return '';
}

/** @param {string} token "csrfName/csrfValue" */
function splitCsrfToken(token) {
  if (!token) return null;
  const normalized = token.replace(/\\\//g, '/');
  const slash = normalized.indexOf('/');
  if (slash <= 0) return null;
  return { csrfName: normalized.slice(0, slash), csrfValue: normalized.slice(slash + 1) };
}

/** @param {string} html */
function parseCsrfFromMeta(html) {
  const m =
    html.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']csrf-token["']/i);
  return splitCsrfToken(m?.[1]);
}

/** @param {string} html */
function parseCsrfFromWorkanaScript(html) {
  const m = html.match(/"ajaxCSRFToken"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!m) return null;
  const raw = m[1].replace(/\\\//g, '/').replace(/\\"/g, '"');
  return splitCsrfToken(raw);
}

/** @param {string} html */
function parseFormAction(html, projectSlug) {
  const actions = [];
  const re = /action=["']([^"']*(?:\/messages\/index\/|\/inbox\/)[^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    actions.push(m[1]);
  }
  if (!actions.length) return '';

  const slug = projectSlug?.toLowerCase();
  const match = slug
    ? actions.find((a) => {
        const lower = a.toLowerCase();
        return (
          lower.includes(`/messages/index/${slug}/`) || lower.includes(`/inbox/${slug}/`)
        );
      })
    : null;
  let action = match || actions[0];

  if (!action.startsWith('http')) {
    action = `https://www.workana.com${action.startsWith('/') ? '' : '/'}${action}`;
  }
  return action;
}

/** @param {string} html */
export function detectBidPageIssue(html) {
  if (/Inicia sesión|Log into your Workana|login-form|sign-in/i.test(html)) {
    return 'not_logged_in';
  }
  if (html.length < 2000) return 'empty_response';
  const hasFormMarkers =
    html.includes('bidForm') ||
    html.includes('bid-form') ||
    html.includes('BidContent') ||
    html.includes('add-message') ||
    html.includes('dcst-input') ||
    html.includes('ajaxCSRFToken');
  if (!hasFormMarkers) {
    if (html.includes('id="app"') || html.includes('data-v-app')) return 'spa_shell';
  }
  return null;
}

/** @param {string} html */
function parseBidFormAction(html, projectSlug) {
  const byId = html.match(
    /<form[^>]*id=["']bidForm["'][^>]*action=["']([^"']+)["']/i
  );
  if (byId?.[1]) {
    let action = byId[1];
    if (!action.startsWith('http')) {
      action = `https://www.workana.com${action.startsWith('/') ? '' : '/'}${action}`;
    }
    return action;
  }

  if (projectSlug) {
    const slug = projectSlug.toLowerCase();
    const re = /action=["']([^"']*\/messages\/bid\/[^"']+)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      if (m[1].toLowerCase().includes(`/messages/bid/${slug}`)) {
        let action = m[1];
        if (!action.startsWith('http')) {
          action = `https://www.workana.com${action.startsWith('/') ? '' : '/'}${action}`;
        }
        return action;
      }
    }
  }
  return '';
}

/** Pre-selected skill checkboxes on the place-bid form. */
export function parsePlaceBidSkills(html) {
  const skills = [];
  const re = /<input[^>]*name=["'](skill-[^"']+)["'][^>]*value=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    if (/\bselected\b|checked/i.test(tag)) {
      skills.push({ name: m[1], value: m[2] });
    }
  }
  return skills;
}

/** Minimum bid amount enforced by Workana on this project. */
export function parseMinBidAmount(html) {
  const fromInput = html.match(/name=["']bid\[amount\]["'][^>]*\bmin=["']([\d.]+)/i);
  if (fromInput) return Number(fromInput[1]) || 60;
  const fromLabel = html.match(/Minimum bid[^<]*USD\s*([\d,.]+)/i);
  if (fromLabel) return Number(fromLabel[1].replace(/,/g, '')) || 60;
  return 60;
}

/**
 * Parse the "Make bid" tab form (place bid), not the question tab.
 * @param {string} html
 * @param {{ projectSlug?: string }} [opts]
 */
export function parsePlaceBidForm(html, opts = {}) {
  const { projectSlug } = opts;

  const metaCsrf = parseCsrfFromMeta(html);
  const scriptCsrf = parseCsrfFromWorkanaScript(html);
  const csrfName =
    inputValue(html, 'csrf_name') || metaCsrf?.csrfName || scriptCsrf?.csrfName || '';
  const csrfValue =
    inputValue(html, 'csrf_value') || metaCsrf?.csrfValue || scriptCsrf?.csrfValue || '';
  const dcstInput = inputValue(html, 'dcst-input');

  let action = parseBidFormAction(html, projectSlug);
  if (!action && projectSlug) {
    action = `https://www.workana.com/messages/bid/${projectSlug}`;
  }

  if (!csrfName || !dcstInput) return null;

  let freelancerSlug = '';
  const workanaScript = html.match(/var Workana\s*=\s*(\{[\s\S]*?\});\s*(?:<\/script>|$)/m);
  if (workanaScript) {
    try {
      const w = JSON.parse(workanaScript[1]);
      freelancerSlug = w?.me?.info?.slug || '';
    } catch {
      /* ignore */
    }
  }

  return {
    action,
    csrfName,
    csrfValue,
    dcstInput,
    freelancerSlug,
    skills: parsePlaceBidSkills(html),
    minAmount: parseMinBidAmount(html),
    formType: 'place_bid',
  };
}

/**
 * @param {string} html
 * @param {{ projectSlug?: string, freelancerSlug?: string }} [opts]
 */
export function parseQuestionForm(html, opts = {}) {
  const { projectSlug, freelancerSlug } = opts;

  let action = parseFormAction(html, projectSlug);
  let freelancerFromAction = '';
  const actionMatch = action.match(/\/(?:messages\/index|inbox)\/[^/]+\/([^/?#]+)/);
  if (actionMatch) freelancerFromAction = actionMatch[1];

  let workanaUserSlug = freelancerFromAction;
  const workanaScript = html.match(/var Workana\s*=\s*(\{[\s\S]*?\});\s*(?:<\/script>|$)/m);
  if (workanaScript) {
    try {
      const w = JSON.parse(workanaScript[1]);
      workanaUserSlug = w?.me?.info?.slug || freelancerFromAction;
    } catch {
      /* ignore */
    }
  }
  if (!workanaUserSlug) {
    const slugM = html.match(/"slug"\s*:\s*"([a-z0-9-]+)"/i);
    if (slugM && !/^[a-f0-9]{32}$/i.test(slugM[1])) workanaUserSlug = slugM[1];
  }

  const metaCsrf = parseCsrfFromMeta(html);
  const scriptCsrf = parseCsrfFromWorkanaScript(html);

  const csrfName =
    inputValue(html, 'csrf_name') || metaCsrf?.csrfName || scriptCsrf?.csrfName || '';
  const csrfValue =
    inputValue(html, 'csrf_value') || metaCsrf?.csrfValue || scriptCsrf?.csrfValue || '';
  const dcstInput = inputValue(html, 'dcst-input');

  const flSlug = freelancerSlug || workanaUserSlug || freelancerFromAction;
  if (!action && projectSlug && flSlug) {
    action = `https://www.workana.com/inbox/${projectSlug}/${flSlug}`;
  }

  if (!action && !csrfName) return null;

  return {
    action,
    csrfName,
    csrfValue,
    dcstInput,
    freelancerSlug: workanaUserSlug || freelancerFromAction || flSlug,
  };
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

/** Client display name from job page sidebar (after Place a bid block). */
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

  const clientStats = parseClientProjectStats(html);

  return {
    title: stripTags(titleMatch?.[1] || ''),
    budget: stripTags(budgetMatch?.[1] || '').replace(/\s+/g, ' '),
    description: stripTags(descMatch?.[1] || ''),
    skills,
    country: stripTags(countryMatch?.[1] || countryMatch?.[2] || ''),
    clientName: parseClientName(html),
    ...clientStats,
  };
}
