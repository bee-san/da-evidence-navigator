// Vercel function: an AI assistant phones a GP practice for someone and asks
// where to send a request for an evidence letter, so they do not have to make
// the call themselves. The assistant says it is an AI calling on behalf of a
// patient, and never gives the patient's name or says why the letter is needed.
//
// Only the practice code and its phone number are sent here – never anything
// about the person. The number must be the one the NHS website lists for that
// practice, so this cannot be used to call anyone else. Calls go through
// ElevenLabs (ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, ELEVENLABS_PHONE_NUMBER_ID).
//
// CALL_DEMO_NUMBER sends every call to that test phone instead of the
// practice, for demos. The page says so before anyone presses the button.
//
// GET  /api/call            -> { enabled, demo }
// POST /api/call {code, phone} -> { id, demo }
// GET  /api/call?id=conv_…  -> { status, email, name }

import { practiceDetails } from './gp.js';

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
  demo: process.env.CALL_DEMO_NUMBER || '',
});
const configured = () => { const e = env(); return !!(e.key && e.agent && e.number); };

// "01865 240501", "+44 1865 240501" -> "+441865240501". Returns '' if it is
// not a UK number.
export function ukE164(phone) {
  let d = String(phone || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+44')) d = `0${d.slice(3)}`;
  else if (d.startsWith('0044')) d = `0${d.slice(4)}`;
  return /^0\d{9,10}$/.test(d) ? `+44${d.slice(1)}` : '';
}

// Pulls what the assistant was told out of a finished ElevenLabs conversation.
export function callResult(conv) {
  const status = conv?.status === 'done' ? 'done' : conv?.status === 'failed' ? 'failed' : 'calling';
  const data = conv?.analysis?.data_collection_results || {};
  const value = (k) => { const v = data[k]?.value; return typeof v === 'string' ? v.trim() : ''; };
  const email = value('request_email');
  return {
    status,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
    name: value('addressee'),
  };
}

export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (id == null) return json({ enabled: configured(), demo: !!env().demo });
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
  const code = String(body?.code || '');
  if (!/^[A-Z]\d{5}$/.test(code)) return json({ error: 'Choose your GP practice first' }, 400);
  const asked = ukE164(body?.phone);
  if (!asked) return json({ error: 'Enter the practice’s phone number, like 01865 240501' }, 400);

  const e = env();
  let to = ukE164(e.demo);
  // In a demo the test phone plays the practice, so use the name the page chose.
  let practice = (to && String(body?.name || '').trim().slice(0, 100)) || 'your GP practice';
  if (!to) {
    // Only ever call the number the NHS lists for this practice.
    const page = await fetch(`https://www.nhs.uk/services/gp-surgery/practice/${code}`, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; legal aid evidence prototype)' },
      redirect: 'follow',
    });
    if (!page.ok) return json({ error: 'We could not check the practice’s phone number. Call them yourself instead.' }, 502);
    const p = practiceDetails(await page.text());
    if (!p.telephone || ukE164(p.telephone) !== asked) {
      return json({ error: 'We can only call the phone number the NHS website lists for this practice.' }, 400);
    }
    to = asked;
    practice = p.name || practice;
  }

  const res = await fetch(`${API}/twilio/outbound-call`, {
    method: 'POST',
    headers: { 'xi-api-key': e.key, 'content-type': 'application/json' },
    body: JSON.stringify({
      agent_id: e.agent,
      agent_phone_number_id: e.number,
      to_number: to,
      conversation_initiation_client_data: { dynamic_variables: { practice_name: practice } },
    }),
  });
  const r = await res.json().catch(() => ({}));
  if (!res.ok || !r.conversation_id) return json({ error: 'The call could not be started. Try again, or call them yourself.' }, 502);
  return json({ id: r.conversation_id, demo: !!e.demo });
}
