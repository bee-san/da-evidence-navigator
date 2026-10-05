// Vercel function for the AI demo of Check a letter (letter-checker-ai.html): instead of the
// rules in src/app/checker/, GPT-6 Sol reads the letter against the LAA guidance "Evidence
// Requirements for Private Family Law Matters" (version 15, which quotes Schedules 1 and 2) and
// judges each requirement for the evidence type. It returns the same shape as the rules checker,
// so the page shows it the same way. Unlike the rules, this sends the letter to OpenAI.
// Nothing is logged or stored here.
//
// GET  /api/check-ai                      -> { enabled, model }
// POST /api/check-ai { text, category? }  -> a checker result (see src/app/checker/index.js)

import { readFileSync } from 'node:fs';
import { CATEGORIES, getCategory, outcome, Label } from '../src/app/checker/index.js';

const MODEL = () => process.env.CHECK_AI_MODEL || 'gpt-6-sol';
const MAX_CHARS = 20000;
const GUIDANCE = readFileSync(new URL('../reference/evidence-guidance-v15.txt', import.meta.url), 'utf8');

// Best effort per server instance.
const WINDOW_MS = 60 * 60 * 1000;
const PER_WINDOW = 30;
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > PER_WINDOW;
}

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

// Each evidence type and the requirements to judge, so the AI's answer lines up with the rules version.
const CHECKLIST = CATEGORIES.map((c) => `${c.id} – Schedule ${c.schedule}, paragraph ${c.para.toUpperCase()}: ${c.name}\n${
  c.criteria.map((r) => `  ${r.id}: ${r.label} (${r.ref})`).join('\n')}`).join('\n\n');

const SYSTEM = `You check evidence letters for civil legal aid in private family cases in England and Wales, under regulations 33 and 34 and Schedules 1 and 2 of the Civil Legal Aid (Procedure) Regulations 2012.

Use only the LAA guidance below, which quotes the Schedules, and the checklist of evidence types and requirements. You are a screening aid for the person who received the letter; the Legal Aid Agency makes the decision.

Do this:
1. Decide which evidence type the document is (unless one is given). Use its id from the checklist.
2. Judge every requirement listed for that type, in order, using its id:
   - "pass": the document clearly meets it.
   - "missing": the document does not meet it, or says nothing about it.
   - "unclear": something relevant is there but a person needs to decide, or it depends on a name you were not given.
   - "n/a": it does not apply to this document (for example email-only rules for a letter).
   - "advisory": information only (for example checks the LAA makes itself).
   Be strict about wording the LAA rejects: hedged judgements ("might", "may be", "could be consistent"), the organisation rather than the adviser confirming support ("we provided" for an IDVA), standard template text that was not filled in, the client's own account presented as the professional's view, and generic labels instead of specific matters.
3. For each requirement, quote the sentence or sentences you relied on in "evidence", copied exactly from the document, word for word. Use an empty list if nothing applies.
4. "note": one or two plain-English sentences on why. "ask_for": for missing or unclear only, what to ask the letter writer for; otherwise an empty string.
5. "client": the name of the person the letter supports, if the document gives it; otherwise an empty string.

Write for someone without legal training. Never invent facts that are not in the document.

<checklist>
${CHECKLIST}
</checklist>

<guidance>
${GUIDANCE}
</guidance>`;

const SCHEMA = {
  name: 'evidence_check',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['category', 'client', 'criteria'],
    properties: {
      category: { type: 'string', enum: CATEGORIES.map((c) => c.id) },
      client: { type: 'string' },
      criteria: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'status', 'note', 'evidence', 'ask_for'],
          properties: {
            id: { type: 'string' },
            status: { type: 'string', enum: ['pass', 'missing', 'unclear', 'n/a', 'advisory'] },
            note: { type: 'string' },
            evidence: { type: 'array', items: { type: 'string' } },
            ask_for: { type: 'string' },
          },
        },
      },
    },
  },
};

// Turns the model's answer into the same result shape as the rules checker, using the
// checklist's own labels and references, and the same rule for the outcome.
export function toResult(answer, model) {
  const cat = getCategory(answer.category);
  const byId = new Map((answer.criteria || []).map((c) => [c.id, c]));
  const criteria = cat.criteria.map((cr) => {
    const a = byId.get(cr.id);
    const status = a?.status || 'unclear';
    return {
      id: cr.id,
      label: cr.label,
      status,
      note: a ? a.note : 'The AI did not give an answer for this requirement.',
      evidence: (a?.evidence || []).filter((e) => typeof e === 'string' && e.trim()).slice(0, 4),
      ref: cr.ref,
      ask_for: status === 'missing' || status === 'unclear' ? (a?.ask_for || cr.askFor || '') : '',
    };
  });
  return {
    category: cat.id,
    category_name: cat.name,
    label: outcome(criteria, cat.maxLabel),
    tested_against_examples: false,
    detected: { client: answer.client || null, client_source: answer.client ? 'found in the text' : 'not found' },
    criteria,
    warnings: [
      `Checked by an AI model (${model}) reading the LAA guidance, not by fixed rules. It can make mistakes, and may give a different answer if you check again.`,
      "Authenticity, the author's registration and the organisation's status are not checked. The LAA may verify them (guidance 1.11).",
      ...(cat.maxLabel === Label.REVIEW ? ['This category always needs a human decision.'] : []),
    ],
  };
}

export function GET() {
  return json({ enabled: !!process.env.OPENAI_API_KEY, model: MODEL() });
}

export async function POST(request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: 'The AI check is not set up (OPENAI_API_KEY is missing on the server).' }, 503);
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  if (limited(ip)) return json({ error: 'Too many checks in the last hour. Try again later.' }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const text = String(body?.text || '').trim();
  if (!text) return json({ error: 'Paste the text of the letter' }, 400);
  if (text.length > MAX_CHARS) return json({ error: `Letters can be up to ${MAX_CHARS.toLocaleString()} characters.` }, 400);
  let given = '';
  if (body?.category) {
    try { given = getCategory(String(body.category)).id; } catch { return json({ error: 'Unknown type of evidence' }, 400); }
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL(),
      response_format: { type: 'json_schema', json_schema: SCHEMA },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `${given ? `The evidence type is ${given}.\n\n` : ''}<document>\n${text}\n</document>` },
      ],
    }),
  });
  if (!res.ok) return json({ error: `OpenAI returned ${res.status}. Try again.` }, 502);
  const content = (await res.json()).choices?.[0]?.message?.content;
  let answer;
  try { answer = JSON.parse(content); } catch { return json({ error: 'The AI gave an answer we could not read. Try again.' }, 502); }
  if (given) answer.category = given;
  try {
    return json(toResult(answer, MODEL()));
  } catch {
    return json({ error: 'The AI gave an answer we could not read. Try again.' }, 502);
  }
}
