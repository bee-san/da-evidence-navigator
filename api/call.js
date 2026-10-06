// Vercel function: an AI assistant phones a GP practice, a court or a local
// domestic abuse service for someone and asks where to send a request for
// evidence, so they do not have to make the call themselves. The assistant
// says it is an AI calling on someone's behalf, and never gives their name or
// says why the evidence is needed.
//
// Only the organisation's code and phone number are sent here – never anything
// about the person. The number must be the one listed for that organisation
// (the NHS website for a GP practice, HMCTS Find a Court or Tribunal for a court,
// the bundled directory for a service), so this cannot be used to call anyone
// else. Calls go through ElevenLabs (ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID,
// ELEVENLABS_PHONE_NUMBER_ID, and CALL_VOICE_SPEED for how fast the voice
// talks). ELEVENLABS_AGENT_ID's script is for GP practices
// ("on behalf of a patient"); courts and services are only called when
// ELEVENLABS_GENERAL_AGENT_ID is set to an agent whose script uses the
// organisation_type and on_behalf_of variables.
//
// CALL_DEMO_NUMBER sends every call to that test phone instead of the
// practice, for demos. The page says so before anyone presses the button.
//
// GET  /api/call            -> { enabled, demo, kinds }
// POST /api/call {kind: 'gp', code, phone} | {kind: 'court', slug, phone} | {kind: 'service', id, phone}
//                            -> { id, demo, script, speed }
// GET  /api/call?id=conv_…  -> { status, email, name, reason, seconds, turns }

import { practiceDetails } from './gp.js';
import { SERVICES } from '../src/app/services.js';

const API = 'https://api.elevenlabs.io/v1/convai';

// Best effort per server instance: a few calls per person per hour.
const WINDOW_MS = 60 * 60 * 1000;
const PER_WINDOW = 3;
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

const env = () => ({
  key: process.env.ELEVENLABS_API_KEY,
  agent: process.env.ELEVENLABS_AGENT_ID,
  number: process.env.ELEVENLABS_PHONE_NUMBER_ID,
  general: process.env.ELEVENLABS_GENERAL_AGENT_ID || '',
  demo: process.env.CALL_DEMO_NUMBER || '',
});
const configured = () => { const e = env(); return !!(e.key && e.agent && e.number); };
// Which kinds of organisation can be called with the agents that are set up.
const kinds = () => (configured() ? (env().general ? ['gp', 'court', 'service'] : ['gp']) : []);

const FACT = 'https://www.find-court-tribunal.service.gov.uk';

// Never call a helpline: they are for people who need support, often in crisis,
// and an assistant must not tie them up. Freephone 0800/0808 numbers are how
// helplines are usually reached.
export const isHelpline = (name, phone) => /helpline/i.test(name || '') || /^\+44(800|808)/.test(ukE164(phone));
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; legal aid evidence prototype)' };

// The organisation to call, checked against its public listing. Returns
// { name, phones: [E.164...] } or { error }.
async function listed(kind, body) {
  if (kind === 'gp') {
    const code = String(body?.code || '');
    if (!/^[A-Z]\d{5}$/.test(code)) return { error: 'Choose your GP practice first' };
    const page = await fetch(`https://www.nhs.uk/services/gp-surgery/practice/${code}`, { headers: UA, redirect: 'follow' });
    if (!page.ok) return { error: 'We could not check the practice’s phone number. Call them yourself instead.', status: 502 };
    const p = practiceDetails(await page.text());
    return { name: p.name, phones: [ukE164(p.telephone)].filter(Boolean) };
  }
  if (kind === 'court') {
    const slug = String(body?.slug || '');
    if (!/^[a-z0-9-]{3,120}$/.test(slug)) return { error: 'Choose the court first' };
    const res = await fetch(`${FACT}/courts/${slug}.json`, { headers: { ...UA, accept: 'application/json' } });
    if (!res.ok) return { error: 'We could not check the court’s phone number. Call them yourself instead.', status: 502 };
    const c = await res.json();
    return { name: c.name, phones: (c.contacts || []).map((x) => ukE164(x.number)).filter(Boolean) };
  }
  const id = String(body?.id || '');
  const sv = /^[0-9a-f-]{36}$/.test(id) ? SERVICES[id] : null;
  if (!sv) return { error: 'Choose the service first' };
  if (isHelpline(sv.name, sv.phone)) return { error: 'We do not call helplines. Call them yourself if you want to.' };
  return { name: sv.name, phones: [ukE164(sv.phone)].filter(Boolean) };
}

const ABOUT = {
  gp: { type: 'GP practice', onBehalfOf: 'a patient', default: 'your GP practice' },
  court: { type: 'court', onBehalfOf: 'someone who needs a copy of a court document', default: 'the court' },
  service: { type: 'domestic abuse support service', onBehalfOf: 'someone the service has supported', default: 'the service' },
};

// One question, the email address, so the assistant talks for about four
// seconds. Returned in the shape ElevenLabs wants for an agent override:
// the system prompt goes in prompt.prompt, not prompt (a bare string is a
// 422 and the whole override is dropped).
export function script(kind, name) {
  const about = ABOUT[kind] || ABOUT.gp;
  const who = { gp: 'a patient', court: 'a court user', service: 'someone you support' }[kind] || 'a patient';
  return {
    first_message: `Hi, I'm an AI calling for ${who}. What's your email address?`,
    prompt: {
      prompt: `You are an AI assistant on a phone call to ${name}, a ${about.type}, calling on behalf of ${about.onBehalfOf}.
You need one thing only: the email address to send a request for a letter or records to. Do not ask who to address it to, or anything else.
Rules:
- Always start by asking the question. Never end the call before they have answered: not on the first turn, not while waiting for them to speak.
- Talk fast and keep it short. One short sentence per turn. No small talk, no explanations, no repeating yourself.
- Never give the person's name or say why they need it. If asked, say: "I'm not able to share that, sorry. They'll explain in the email."
- If they spell the email, read it back once to confirm.
- If they cannot give an email, ask once if there is another way to send it, then stop.
- Once you have the email, and only then, say "Thanks, bye." and end the call.`,
    },
  };
}

// How fast the voice talks. ElevenLabs allows 0.7 to 1.2, and anything outside
// that is a 422 that would lose the override, so CALL_VOICE_SPEED is clamped.
// CALL_VOICE_SPEED=off sends no voice override at all, to rule it out if a
// call misbehaves.
export const MAX_SPEED = 1.2;
const off = (v) => /^(off|no|false)$/i.test(String(v || ''));
export const voice = () => (off(process.env.CALL_VOICE_SPEED) ? null
  : { speed: Math.min(MAX_SPEED, Math.max(0.7, Number(process.env.CALL_VOICE_SPEED) || MAX_SPEED)) });

// What the agent allows us to override, from its Security tab.
//
// This has to be asked for, because sending a field the agent has not enabled
// is not refused: the outbound-call request returns 200 and a conversation id,
// and then the conversation is killed the moment it starts, with
// 1008 "Override for field 'first_message' is not allowed by config". The
// phone rings once and hangs up, and nothing in the HTTP response says why.
const NOTHING = { first_message: false, prompt: false, speed: false };
const allowCache = new Map();
const ALLOW_TTL = 5 * 60 * 1000;
export const forgetAgents = () => allowCache.clear();

export async function allowed(agentId, key) {
  const hit = allowCache.get(agentId);
  if (hit && Date.now() - hit.at < ALLOW_TTL) return hit.allow;
  let allow = null;
  try {
    const res = await fetch(`${API}/agents/${agentId}`, { headers: { 'xi-api-key': key } });
    if (res.ok) {
      const o = (await res.json())?.platform_settings?.overrides?.conversation_config_override || {};
      allow = {
        first_message: o.agent?.first_message === true,
        prompt: o.agent?.prompt?.prompt === true,
        speed: o.tts?.speed === true,
      };
      for (const [field, ok] of Object.entries(allow)) {
        if (!ok) console.warn(`api/call: agent ${agentId} does not allow the ${field} override; enable it under the agent's Security tab`);
      }
    } else {
      // Without the agent's settings, anything we send risks killing the call,
      // so send nothing: a call with the agent's own script still gets there.
      console.warn(`api/call: could not read agent ${agentId} (${res.status}); calling with no override`);
    }
  } catch (err) {
    console.warn(`api/call: could not read agent ${agentId} (${err}); calling with no override`);
  }
  allow = allow || NOTHING;
  allowCache.set(agentId, { at: Date.now(), allow });
  return allow;
}

// The override to send: the short script and the faster voice, minus anything
// the agent does not allow. CALL_SCRIPT=off keeps the agent's own system prompt
// and only replaces the opening question; CALL_FIRST_MESSAGE=off leaves the
// script alone altogether.
export function override(kind, name, allow = NOTHING) {
  const s = script(kind, name);
  const agent = {};
  if (allow.first_message && !off(process.env.CALL_FIRST_MESSAGE)) agent.first_message = s.first_message;
  if (allow.prompt && !off(process.env.CALL_SCRIPT) && !off(process.env.CALL_FIRST_MESSAGE)) agent.prompt = s.prompt;
  const tts = allow.speed ? voice() : null;
  const out = { ...(Object.keys(agent).length ? { agent } : {}), ...(tts ? { tts } : {}) };
  return Object.keys(out).length ? out : null;
}

// "01865 240501", "+44 1865 240501" -> "+441865240501". Returns '' if it is
// not a UK number.
export function ukE164(phone) {
  let d = String(phone || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+44')) d = `0${d.slice(3)}`;
  else if (d.startsWith('0044')) d = `0${d.slice(4)}`;
  return /^0\d{9,10}$/.test(d) ? `+44${d.slice(1)}` : '';
}

// Pulls what the assistant was told out of a finished ElevenLabs conversation,
// and why the call ended, so a call that hangs up on its own can be diagnosed.
export function callResult(conv) {
  const status = conv?.status === 'done' ? 'done' : conv?.status === 'failed' ? 'failed' : 'calling';
  const data = conv?.analysis?.data_collection_results || {};
  const value = (k) => { const v = data[k]?.value; return typeof v === 'string' ? v.trim() : ''; };
  const email = value('request_email');
  const meta = conv?.metadata || {};
  const reason = [meta.termination_reason, meta.error?.reason].filter(Boolean).join(' – ').slice(0, 300);
  return {
    status,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
    name: value('addressee'),
    reason,
    seconds: Number(meta.call_duration_secs ?? conv?.call_duration_secs) || 0,
    turns: Array.isArray(conv?.transcript) ? conv.transcript.length : 0,
  };
}

export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (id == null) return json({ enabled: configured(), demo: !!env().demo, kinds: kinds() });
  if (!configured()) return json({ error: 'not configured' }, 503);
  if (!/^conv_[A-Za-z0-9]+$/.test(id)) return json({ error: 'bad id' }, 400);
  const res = await fetch(`${API}/conversations/${id}`, { headers: { 'xi-api-key': env().key } });
  if (!res.ok) return json({ error: 'upstream' }, 502);
  return json(callResult(await res.json()));
}

export async function POST(request) {
  if (!configured()) return json({ error: 'not configured' }, 503);
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  if (limited(ip)) return json({ error: 'You have asked for several calls in the last hour. Try again later, or call them yourself.' }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const kind = ['gp', 'court', 'service'].includes(body?.kind) ? body.kind : 'gp';
  if (!kinds().includes(kind)) return json({ error: 'Calls to this kind of organisation are not set up yet. Call them yourself instead.' }, 400);
  const asked = ukE164(body?.phone);
  if (!asked) return json({ error: 'Enter their phone number, like 01865 240501' }, 400);
  if (isHelpline('', asked)) return json({ error: 'We do not call helplines or freephone numbers. Call them yourself if you want to.' }, 400);

  const e = env();
  const about = ABOUT[kind];
  let to = ukE164(e.demo);
  // In a demo the test phone plays the organisation, so use the name the page chose.
  let name = (to && String(body?.name || '').trim().slice(0, 100)) || about.default;
  if (!to) {
    const org = await listed(kind, body);
    if (org.error) return json({ error: org.error }, org.status || 400);
    // Only ever call a number listed for this organisation.
    if (!org.phones.includes(asked)) return json({ error: 'We can only call the phone number listed for them.' }, 400);
    to = asked;
    name = org.name || name;
  } else if (kind === 'gp' && !/^[A-Z]\d{5}$/.test(String(body?.code || ''))) {
    return json({ error: 'Choose your GP practice first' }, 400);
  }

  const agentId = kind === 'gp' ? e.agent : e.general;
  const start = (chosen) => fetch(`${API}/twilio/outbound-call`, {
    method: 'POST',
    headers: { 'xi-api-key': e.key, 'content-type': 'application/json' },
    body: JSON.stringify({
      agent_id: agentId,
      agent_phone_number_id: e.number,
      to_number: to,
      conversation_initiation_client_data: {
        dynamic_variables: { practice_name: name, organisation_name: name, organisation_type: about.type, on_behalf_of: about.onBehalfOf },
        ...(chosen ? { conversation_config_override: chosen } : {}),
      },
    }),
  });
  // Only ever send what this agent allows, or the call is killed as it starts.
  const chosen = override(kind, name, await allowed(agentId, e.key));
  let res = await start(chosen);
  if (!res.ok) {
    console.warn(`api/call: ElevenLabs refused the call with ${res.status}: ${(await res.clone().text()).slice(0, 300)}`);
    if (chosen) res = await start(null);
  }
  const r = await res.json().catch(() => ({}));
  if (!res.ok || !r.conversation_id) return json({ error: 'The call could not be started. Try again, or call them yourself.' }, 502);
  return json({ id: r.conversation_id, demo: !!e.demo, script: !!chosen?.agent?.first_message, speed: chosen?.tts?.speed || null });
}
