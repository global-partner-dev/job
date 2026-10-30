// Greeting openers across the three languages Workana posts in. Note the
// lookahead instead of \b: word boundaries don't fire after an accented letter
// like the "á" in "Olá", so \b would silently skip half the Portuguese cases.
const GREETING_OPENERS =
  '(?:olá|ola|oi|hola|buenos días|buenos dias|buenas tardes|buenas|bom dia|boa tarde|boa noite|hi|hello|hey|dear|prezad[oa]|estimad[oa]|car[oa])';
const GREETING_RE = new RegExp(
  `^([ \t]*${GREETING_OPENERS})((?:[ \t]+[^\n,:!]*)?)([,:!]?)`,
  'i',
);

// Words that follow a greeting without being anyone's name.
const NEUTRAL_TRAILER_RE =
  /^(there|all|everyone|team|folks|sir|madam|pessoal|equipe|time|todos|a todos|equipo|gente)$/i;

/**
 * Remove the client's name from the greeting.
 *
 * The model is never given the client's name, but a brief often contains it
 * ("Olá, sou a Leticia e preciso...") and the model can pick it up from there.
 * This normalizes "Hola Leticia," back to "Hola," while leaving genuinely
 * name-free openers ("Hi there,") and the whole body untouched.
 */
export function stripNameFromGreeting(text) {
  if (!text) return text;
  const newlineAt = text.indexOf('\n');
  const firstLine = newlineAt === -1 ? text : text.slice(0, newlineAt);
  const rest = newlineAt === -1 ? '' : text.slice(newlineAt);

  const cleaned = firstLine.replace(GREETING_RE, (match, opener, trailing, punct) => {
    const name = (trailing || '').trim();
    if (!name || !/\p{L}/u.test(name) || NEUTRAL_TRAILER_RE.test(name)) return match;
    return `${opener}${punct || ','}`;
  });
  return cleaned + rest;
}

// Short words that only (or mostly) occur in one of the three languages.
const LANGUAGE_MARKERS = {
  English: new Set(['the', 'and', 'with', 'is', 'are', 'of', 'to', 'we', 'you', 'that', 'this', 'will', 'for', 'need']),
  Portuguese: new Set(['os', 'do', 'da', 'dos', 'das', 'e', 'com', 'uma', 'um', 'em', 'é', 'não', 'você', 'ao', 'seu', 'sua']),
  Spanish: new Set(['el', 'los', 'las', 'del', 'y', 'con', 'una', 'un', 'en', 'es', 'lo', 'su', 'sus', 'al']),
};

/**
 * The language the client wrote the brief in. The model is told this outright:
 * left to itself it sometimes answers an English brief in Portuguese (most
 * clients are Brazilian, and the prompts quote Portuguese examples).
 */
export function briefLanguage(text) {
  const counts = { English: 0, Portuguese: 0, Spanish: 0 };
  for (const word of String(text || '').toLowerCase().match(/\p{L}+/gu) || []) {
    for (const [lang, words] of Object.entries(LANGUAGE_MARKERS)) if (words.has(word)) counts[lang] += 1;
  }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? best : 'Portuguese';
}

/**
 * The client's first name from Workana's display name, or '' when there isn't a
 * usable one. Workana mostly shows "Bruno H." but often only initials
 * ("J. A. P.") or a cut-off word ("Profes."); those give no name.
 */
export function firstNameOf(displayName) {
  const first = String(displayName || '').trim().split(/\s+/)[0] || '';
  if (!/^\p{L}{2,}$/u.test(first)) return '';
  const same = first === first.toLowerCase() || first === first.toUpperCase();
  return same ? first[0].toUpperCase() + first.slice(1).toLowerCase() : first;
}

/**
 * Letters and digits as Unicode "mathematical sans-serif bold", which shows as
 * bold in a plain-text box such as Workana's. Accents are kept as combining
 * marks on the bold letter ("ã" → bold a + U+0303); anything else is unchanged.
 */
export function toBoldSans(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[A-Za-z0-9]/g, (c) => {
      const code = c.charCodeAt(0);
      if (c >= 'a') return String.fromCodePoint(0x1d5ee + code - 97);
      if (c >= 'A') return String.fromCodePoint(0x1d5d4 + code - 65);
      return String.fromCodePoint(0x1d7ec + code - 48);
    })
    .normalize('NFC');
}

/**
 * The second bidder's greeting line: "Olá Bruno 🖐" in bold, or "Olá 🖐"
 * without a usable name. The model writes the greeting word in the project's
 * language; the name, emoji and bold are set here so they are always right.
 * A first line that isn't a short greeting is left alone.
 */
export function formatHandGreeting(text, firstName) {
  const newlineAt = text.indexOf('\n');
  const firstLine = newlineAt === -1 ? text : text.slice(0, newlineAt);
  const m = firstLine.match(GREETING_RE);
  if (!m || firstLine.length > 60) return text;
  const opener = m[1].trim();
  const word = opener[0].toUpperCase() + opener.slice(1);
  const greeting = `${toBoldSans(firstName ? `${word} ${firstName}` : word)} 🖐`;
  return greeting + (newlineAt === -1 ? '' : text.slice(newlineAt));
}

const BUDGET_HEAD_RE = /^((?:Orçamento|Presupuesto|Budget)\s*:\s*\$\s?)([\d.,]+)/i;
const BUDGET_ITEM_RE = /^- .*:\s*\$\s?([\d.,]+)\s*$/;
const parseAmount = (s) => Number(s.replace(/[.,](?=\d{3}\b)/g, ''));

/**
 * An itemised budget ("Orçamento: $ 1,400 …" then "- item: $ 200" lines) whose
 * lines don't add up to the total gets the total set to their sum. A client
 * checks that sum. Text without such a block is returned unchanged.
 */
export function settleBudgetTotal(text) {
  const lines = text.split('\n');
  const head = lines.findIndex((l) => BUDGET_HEAD_RE.test(l));
  if (head === -1) return text;
  let sum = 0;
  let items = 0;
  for (let i = head + 1; i < lines.length; i++) {
    const m = lines[i].match(BUDGET_ITEM_RE);
    if (!m) break;
    sum += parseAmount(m[1]);
    items++;
  }
  const [, label, total] = lines[head].match(BUDGET_HEAD_RE);
  if (!items || !Number.isFinite(sum) || sum === parseAmount(total)) return text;
  lines[head] = lines[head].replace(BUDGET_HEAD_RE, `${label}${sum.toLocaleString('en-US')}`);
  return lines.join('\n');
}

/**
 * Tidy whitespace without flattening the layout: paragraphs stay separated by a
 * single blank line (never more), trailing spaces and runs of spaces go.
 */
export function normalizeMessageText(text) {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Sampling parameters for the model.
 *
 * GPT-4 and older chat models take temperature, the two penalties and
 * max_tokens. Newer reasoning models (gpt-5/6…) reject all four with HTTP 400,
 * and spend part of the token budget on hidden reasoning: at the default effort
 * a small cap is used up by reasoning alone and the reply comes back empty.
 * So they get max_completion_tokens with room to spare and a low effort.
 */
const LEGACY_MODEL_RE = /^(?:ft:)?gpt-(?:3\.5|4)/i;
export function samplingParams(model) {
  if (LEGACY_MODEL_RE.test(model || '')) {
    // Higher temperature + presence_penalty push it off the one phrasing it
    // would otherwise settle into for every project.
    return { temperature: 0.9, presence_penalty: 0.4, frequency_penalty: 0.3, max_tokens: 2500 };
  }
  return { reasoning_effort: 'low', max_completion_tokens: 6000 };
}

/**
 * One chat completion. Returns the reply text, or throws with the API's error.
 * @param {{ apiKey: string, model: string, messages: object[], json?: boolean }} opts
 */
export async function chatCompletion({ apiKey, model, messages, json = false }) {
  if (!apiKey) throw new Error('No OpenAI API key set — add one in AskBot settings.');

  let res;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        ...samplingParams(model),
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
  } catch (e) {
    throw new Error(`OpenAI request failed (${e?.message || 'Failed to fetch'}). Check network/API key.`);
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content?.trim();
  if (!content) {
    throw new Error(
      choice?.finish_reason === 'length'
        ? 'OpenAI used its whole token budget before writing the reply'
        : 'Empty response from OpenAI',
    );
  }
  return content;
}

/**
 * Write the proposal for one project.
 *
 * By default the client stays anonymous. With `greetByName` (the second
 * bidder) the model is given the client's first name from Workana, when there
 * is a usable one, and the greeting line is set to "Olá <name> 🖐" in bold.
 * @param {{ apiKey: string, model: string, systemPrompt: string, portfolioUrl?: string, project: object, greetByName?: boolean }} opts
 * @returns {Promise<string>}
 */
export async function generateQuestion({ apiKey, model, systemPrompt, portfolioUrl, project, greetByName = false }) {
  const firstName = greetByName ? firstNameOf(project.clientName) : '';
  const nameRule = !greetByName
    ? 'The client is deliberately anonymous: you are NOT given their name, and you must ' +
      'not use one. Open with a neutral greeting and never address them by name, ' +
      'initial, or company — even if a name appears in the description below.'
    : firstName
      ? `The client's first name is ${firstName}. Use it in the greeting and nowhere else; ` +
        'never use any other name that appears in the description.'
      : 'The client\'s name is not known: greet without a name, and never use a name that ' +
        'appears in the description.';

  const language = briefLanguage(`${project.title}\n${project.description}`);
  const userContent = [
    `Write the whole proposal in ${language}, the language of the client's description — every word, including any section labels.`,
    nameRule,
    `Project title: ${project.title}`,
    `Country: ${project.country}`,
    `Skills: ${(project.skills || []).join(', ')}`,
    portfolioUrl
      ? `Portfolio link you may reference at most once, only if it fits naturally: ${portfolioUrl}`
      : 'No portfolio link provided — do not invent or mention one.',
    'IMPORTANT: never reveal, invent, or sign your own name.',
    '',
    'Description:',
    project.description,
  ].join('\n');

  const raw = normalizeMessageText(
    await chatCompletion({
      apiKey,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  );
  return settleBudgetTotal(greetByName ? formatHandGreeting(raw, firstName) : stripNameFromGreeting(raw));
}
