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
    if (!name || NEUTRAL_TRAILER_RE.test(name)) return match;
    return `${opener}${punct || ','}`;
  });
  return cleaned + rest;
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
    return { temperature: 0.9, presence_penalty: 0.4, frequency_penalty: 0.3, max_tokens: 1200 };
  }
  return { reasoning_effort: 'low', max_completion_tokens: 3000 };
}

/**
 * Write the short clarifying question for one project.
 * @param {{ apiKey: string, model: string, systemPrompt: string, portfolioUrl?: string, project: object }} opts
 * @returns {Promise<string>}
 */
export async function generateQuestion({ apiKey, model, systemPrompt, portfolioUrl, project }) {
  if (!apiKey) throw new Error('No OpenAI API key set — add one in AskBot settings.');

  const userContent = [
    'The client is deliberately anonymous: you are NOT given their name, and you must ' +
      'not use one. Open with a neutral greeting and never address them by name, ' +
      'initial, or company — even if a name appears in the description below.',
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
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        ...samplingParams(model),
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
  const raw = normalizeMessageText(choice?.message?.content?.trim());
  if (!raw) {
    throw new Error(
      choice?.finish_reason === 'length'
        ? 'OpenAI used its whole token budget before writing the reply'
        : 'Empty response from OpenAI',
    );
  }
  return stripNameFromGreeting(raw);
}
