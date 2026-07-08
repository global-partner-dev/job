/** First given name from Workana display, e.g. "Roberto B. A." -> "Roberto". */
export function clientFirstName(displayName) {
  const trimmed = (displayName || '').trim();
  if (!trimmed || /^unknown$/i.test(trimmed)) return 'Unknown';
  const match = trimmed.match(/^([\p{L}][\p{L}'’-]*)/u);
  const first = match ? match[1] : trimmed.split(/\s+/)[0];
  return first.replace(/[,;:.]+$/g, '') || 'Unknown';
}

/** Replace full Workana display name if the model still used it in the opening. */
export function enforceClientFirstNameInProposal(text, displayName, firstName) {
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

/** Normalize proposal whitespace while keeping section breaks and bullet lists. */
export function normalizeProposalText(text) {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** @param {{ apiKey: string, model: string, systemPrompt: string, freelancerName: string, project: object }} opts */
export async function generateProposal({ apiKey, model, systemPrompt, freelancerName, project }) {
  const displayName = (project.clientName || '').trim();
  const firstName = clientFirstName(displayName);
  const userContent = [
    `Your freelancer name: ${freelancerName || 'Unknown'}`,
    `Client first name (the ONLY name you may use for the client): ${firstName}`,
    `Project title: ${project.title}`,
    `Budget: ${project.budget}`,
    `Country: ${project.country}`,
    `Skills: ${(project.skills || []).join(', ')}`,
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
        max_tokens: 2500,
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
  const raw = normalizeProposalText(data.choices?.[0]?.message?.content?.trim());
  if (!raw) throw new Error('Empty response from OpenAI');
  return enforceClientFirstNameInProposal(raw, displayName, firstName);
}

/** @deprecated Use generateProposal */
export const generateQuestion = generateProposal;
