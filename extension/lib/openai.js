/** First given name from a Workana display name, e.g. "Roberto B. A." -> "Roberto". */
export function clientFirstName(displayName) {
  const trimmed = (displayName || '').trim();
  if (!trimmed || /^unknown$/i.test(trimmed)) return 'Unknown';
  const match = trimmed.match(/^([\p{L}][\p{L}'’-]*)/u);
  const first = match ? match[1] : trimmed.split(/\s+/)[0];
  return first.replace(/[,;:.]+$/g, '') || 'Unknown';
}

/** Replace the full Workana display name if the model still used it. */
export function enforceClientFirstName(text, displayName, firstName) {
  if (!text || !firstName || firstName === 'Unknown') return text;
  let out = text;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  if (displayName && displayName !== firstName) {
    out = out.replace(new RegExp(esc(displayName), 'gi'), firstName);
    const parts = displayName.trim().split(/\s+/).map(esc);
    if (parts.length > 1) {
      out = out.replace(new RegExp(parts.join('\\s+'), 'gi'), firstName);
    }
  }
  return out;
}

/** Normalize whitespace while keeping paragraph breaks. */
export function normalizeMessageText(text) {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Write the short clarifying question for one project.
 * @param {{ apiKey: string, model: string, systemPrompt: string, portfolioUrl?: string, project: object }} opts
 * @returns {Promise<string>}
 */
export async function generateQuestion({ apiKey, model, systemPrompt, portfolioUrl, project }) {
  if (!apiKey) throw new Error('No OpenAI API key set — add one in AskBot settings.');

  const displayName = (project.clientName || '').trim();
  const firstName = clientFirstName(displayName);
  const userContent = [
    `Client first name (the ONLY name you may use for the client): ${firstName}`,
    `Project title: ${project.title}`,
    `Budget: ${project.budget}`,
    `Country: ${project.country}`,
    `Skills: ${(project.skills || []).join(', ')}`,
    portfolioUrl
      ? `Portfolio link you may reference at most once, only if it fits naturally: ${portfolioUrl}`
      : 'No portfolio link provided — do not invent or mention one.',
    'IMPORTANT: never reveal, invent, or sign your own name. Never mention price or budget.',
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
        temperature: 0.7,
        max_tokens: 600,
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
  const raw = normalizeMessageText(data.choices?.[0]?.message?.content?.trim());
  if (!raw) throw new Error('Empty response from OpenAI');
  return enforceClientFirstName(raw, displayName, firstName);
}
