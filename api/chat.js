// Vercel function behind the helper. Forwards the conversation to an OpenAI
// model and returns plain text. Uses the OpenAI API when OPENAI_API_KEY is
// set, otherwise the Vercel AI Gateway. Nothing is logged or stored here.

const PROVIDERS = {
  openai: { url: 'https://api.openai.com/v1/chat/completions', env: 'OPENAI_API_KEY', model: 'gpt-5-mini' },
  gateway: { url: 'https://ai-gateway.vercel.sh/v1/chat/completions', env: 'AI_GATEWAY_API_KEY', model: 'openai/gpt-5-mini' },
};
// The endpoint is public and spends the project's AI Gateway credit, so keep
// each request to a short process question plus a little context.
const MAX_MESSAGES = 12;
const MAX_CHARS = 4000;

export const SYSTEM = `You are the helper in a prototype that helps victims of domestic abuse in England and Wales get evidence for civil legal aid in a private family matter (Schedule 1, Civil Legal Aid (Procedure) Regulations 2012, regulation 33).

Rules:
- If the person may be in immediate danger, tell them to call 999 first. If they cannot speak, call 999 and press 55 (Silent Solution). National Domestic Abuse Helpline: 0808 2000 247, 24 hours.
- Never ask what happened. If they start describing abuse, gently say you do not need the details, only which services they have been in contact with.
- Answer process questions only: which evidence routes may apply (courts, police, MARAC, social services, health professional, IDVA/ISVA, refuge, domestic abuse support organisation, local authority or housing, bank, employer or education provider, benefits provider), what a letter must say, and how to ask for one.
- Evidence letters are often returned for hedged wording ("might be consistent", "may be a victim"), a missing perpetrator or relationship, or reasons that are too general.
- You cannot give legal advice or say whether someone qualifies. Say a solicitor and the Legal Aid Agency decide. Civil Legal Advice: 0345 345 4 345.
- Point to the site's own pages when useful: check.html (find evidence), request.html (request notes), letter-checker.html (check a letter), safety.html (stay safe online).
- Use plain English for a reading age of about 9. Be brief: at most 4 short paragraphs. Plain text only, no markdown.`;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

function clean(messages) {
  if (!Array.isArray(messages) || !messages.length) return null;
  const out = messages.slice(-MAX_MESSAGES).map((m) => ({
    role: m && m.role === 'assistant' ? 'assistant' : 'user',
    content: String((m && m.content) || '').slice(0, MAX_CHARS),
  }));
  return out.at(-1).role === 'user' && out.at(-1).content.trim() ? out : null;
}

export async function POST(request) {
  const provider = process.env.OPENAI_API_KEY ? PROVIDERS.openai : PROVIDERS.gateway;
  const key = process.env[provider.env];
  if (!key) return json({ error: 'not configured' }, 503);

  let messages;
  try {
    messages = clean((await request.json()).messages);
  } catch {
    messages = null;
  }
  if (!messages) return json({ error: 'bad request' }, 400);

  const res = await fetch(provider.url, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.CHAT_MODEL || provider.model, messages: [{ role: 'system', content: SYSTEM }, ...messages] }),
  });
  if (!res.ok) return json({ error: 'upstream' }, 502);
  const text = (await res.json()).choices?.[0]?.message?.content?.trim();
  return text ? json({ text }) : json({ error: 'empty' }, 502);
}
