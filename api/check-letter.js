// Vercel function for comparing the on-device rules with a large language
// model. The page only calls it when the person switches to the comparison
// and agrees to send the letter. It asks the model to assess each Schedule 1
// requirement and returns structured JSON. Nothing is logged or stored here.
//
// Uses the Vercel AI Gateway: AI_GATEWAY_API_KEY, or the project's OIDC token.
// LETTER_MODEL picks the model (default openai/gpt-6-sol).

const GATEWAY = 'https://ai-gateway.vercel.sh/v1/chat/completions';
export const DEFAULT_MODEL = 'openai/gpt-6-sol';
// The endpoint is public and spends the project's AI Gateway credit.
const MAX_CHARS = 12000;

// What each type of evidence must show, from Schedule 1 of the Civil Legal Aid
// (Procedure) Regulations 2012 and the LAA guidance (version 15, June 2026).
// Keys match LETTER_TYPES in src/app/rules.js.
export const REQUIREMENTS = {
  p11: `Letter or report from an appropriate health professional (Schedule 1 para 11; guidance 2.52–2.60).
- The author is an appropriate health professional: registered medical practitioner, nurse, midwife, dentist, paramedic, practitioner psychologist, radiographer or social worker (or registered and licensed overseas equivalent).
- An appropriate health professional examined the applicant in person, by telephone or by video. If the author did not examine them, the author has access to the medical records and the examiner is unavailable.
- The professional's own reasonable professional judgement that the applicant has, or has had, injuries or a condition consistent with being a victim of domestic abuse. Only the patient's own belief is not enough.`,
  p14: `Letter from an independent domestic violence advisor (para 14) or independent sexual violence advisor (para 15) (guidance 2.68–2.69).
- The author is an IDVA or ISVA, not another role at the same organisation.
- The IDVA or ISVA personally is providing or has provided support to the applicant, who is named. "We provided" does not confirm this; support that is only planned does not count.
- For an ISVA: the support relates to sexual violence by the other party, who is named.`,
  p17: `Letter from an organisation providing domestic abuse support services (Schedule 1 para 17; guidance 2.74–2.77).
- The organisation is situated in the United Kingdom.
- The organisation has been operating for an uninterrupted period of six months or more.
- It provided the applicant with support in relation to their needs as a victim, or person at risk, of domestic abuse.
- A statement that, in the author's reasonable professional judgement, the applicant is, or is at risk of being, a victim of domestic abuse.
- A description of the specific matters relied on to support that judgement (not only generic sources such as "referral and testimony").
- A description of the support actually provided (not only planned).
- A statement of the reasons why the applicant needed that support.`,
  p18: `Letter from a domestic abuse support organisation about refusal of admission to a refuge (Schedule 1 para 18; guidance 2.78–2.82).
- The other party (perpetrator) is named.
- The person refused is or was in a family relationship with the perpetrator (s62 Family Law Act 1996).
- The person was refused admission to a refuge.
- The date of the refusal.
- They sought admission because of allegations of domestic abuse by the perpetrator.`,
  p19: `Letter from a public authority (Schedule 1 para 19; guidance 2.83–2.85).
- From a public authority within section 6 of the Human Rights Act 1998 (council, police, NHS, probation, Cafcass and so on), not a private company or charity.
- Confirms that a person in a family relationship with the perpetrator was assessed as being, or at risk of being, a victim of domestic abuse by the perpetrator (or is a copy of that assessment). A hedged or unconfirmed assessment does not count.
- The perpetrator is named.`,
  marac: `Letter from a member of a multi-agency risk assessment conference or other suitable local safeguarding forum (Schedule 1 para 13; guidance 2.66–2.67).
- The author is a member of a MARAC or another local forum involving more than one agency.
- Confirms that the applicant, or a person they are in a family relationship with, is or has been at risk of harm from domestic abuse by the other party. A hedged statement does not count.
- The other party (perpetrator) is named.`,
  refugeStay: `Letter from a refuge confirming the applicant was admitted (guidance 2.74: refuge admission letters follow the Schedule 1 para 17 requirements).
- Apply the paragraph 17 requirements: UK, six months' uninterrupted operation, support provided, reasonable professional judgement, specific matters, support described, reasons for support.`,
  social: `Letter from social services, as a public authority (Schedule 1 para 19; guidance 2.83–2.85).
- From a social services department or local authority.
- Confirms that the applicant was assessed as being, or at risk of being, a victim of domestic abuse by the other party. A hedged statement does not count.
- The other party (perpetrator) is named.`,
  financial: `Evidence of economic abuse (Schedule 1 para 21; guidance 2.87–2.93).
- Evidence that the applicant has been, or is at risk of being, a victim of domestic abuse by the other party in the form of economic abuse: behaviour with a substantial adverse effect on their ability to acquire, use or maintain money or property, or obtain goods or services.
- The behaviour is aimed at power and control, not an ordinary dispute about money after separation or a reasonable shared budget.
- Specific instances or records, not only a general statement.`,
};

export const SYSTEM = `You check evidence letters for civil legal aid in private family matters in England and Wales (regulation 33 and Schedule 1, Civil Legal Aid (Procedure) Regulations 2012), for a prototype screening tool. You do not make the decision; the Legal Aid Agency does.

Assess whether the letter meets the requirements for its type of evidence. If the type is given, use it. Otherwise choose the best fitting type, or null if it is none of them.

Types and requirements:
${Object.entries(REQUIREMENTS).map(([k, v]) => `[${k}] ${v}`).join('\n\n')}

Rules:
- The guidance says no set form of words is needed, but the meaning must be clear (guidance 2.56). Judge meaning, not template wording.
- Hedged judgements or confirmations ("might be", "may be", "could be consistent") do not meet a requirement.
- For each requirement give status "met", "not_met" or "unclear" (genuinely ambiguous: a person should decide), a short quote from the letter as evidence (empty if none), and a one-sentence note.
- meets is "yes" only if every requirement is met, "no" if any is not met, otherwise "unclear".
- confidence is your estimate, 0 to 100, that the letter meets every requirement for its type.
- Use plain English.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'meets', 'confidence', 'requirements', 'summary'],
  properties: {
    type: { type: ['string', 'null'], enum: [...Object.keys(REQUIREMENTS), null] },
    meets: { type: 'string', enum: ['yes', 'no', 'unclear'] },
    confidence: { type: 'integer', minimum: 0, maximum: 100 },
    requirements: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['requirement', 'status', 'evidence', 'note'],
        properties: {
          requirement: { type: 'string' },
          status: { type: 'string', enum: ['met', 'not_met', 'unclear'] },
          evidence: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
    summary: { type: 'string' },
  },
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export async function POST(request) {
  const key = process.env.AI_GATEWAY_API_KEY || request.headers.get('x-vercel-oidc-token') || process.env.VERCEL_OIDC_TOKEN;
  if (!key) return json({ error: 'not configured' }, 503);

  let text;
  let type;
  try {
    const body = await request.json();
    text = String(body.text || '').trim().slice(0, MAX_CHARS);
    type = REQUIREMENTS[body.type] ? body.type : null;
  } catch {
    text = '';
  }
  if (!text) return json({ error: 'bad request' }, 400);

  const model = process.env.LETTER_MODEL || DEFAULT_MODEL;
  const res = await fetch(GATEWAY, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `${type ? `Type of evidence: ${type}\n\n` : ''}Letter:\n"""\n${text}\n"""` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'letter_check', strict: true, schema: SCHEMA } },
    }),
  });
  if (!res.ok) return json({ error: 'upstream', status: res.status }, 502);
  try {
    const out = JSON.parse((await res.json()).choices?.[0]?.message?.content);
    return json({ model, ...out });
  } catch {
    return json({ error: 'unreadable' }, 502);
  }
}
