// Vercel function behind "send it for me". This prototype does not send
// anything: it checks the form fields the same way a real sender would, then
// says the email was sent. Nothing is logged, stored or passed on.

import { looksLikeEmail, looksLikePhone } from '../src/app/contact.js';
import { EVIDENCE, POLICE_EVENTS, COURT_EVENTS } from '../src/app/evidence.js';

const FIELDS = ['key', 'event', 'applicant', 'other', 'reference', 'profName', 'profEmail', 'replyTo',
  'solicitorName', 'solicitorEmail', 'note', 'contactBy', 'altEmail', 'phone', 'callTimes', 'voicemail'];
const MAX = { note: 500, default: 200 };

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

// Returns [details, null] or [null, problem].
export function readDetails(body) {
  const d = {};
  for (const f of FIELDS) {
    const v = body?.[f];
    if (v == null) continue;
    if (f === 'voicemail') { d.voicemail = v === true || v === 'on' || v === 'true'; continue; }
    d[f] = String(v).slice(0, MAX[f] || MAX.default);
  }
  if (body?.website) return [null, 'bad request']; // hidden field only bots fill in
  if (!EVIDENCE[d.key]) return [null, 'Unknown kind of evidence'];
  if (d.key === 'police' && !POLICE_EVENTS[d.event]) return [null, 'Unknown police outcome'];
  if (d.key === 'court' && !COURT_EVENTS[d.event]) return [null, 'Unknown court outcome'];
  if (!d.applicant?.trim()) return [null, 'Enter your full name'];
  if (!looksLikeEmail(d.profEmail)) return [null, 'Enter their email address'];
  if (d.replyTo === 'solicitor') {
    if (!looksLikeEmail(d.solicitorEmail)) return [null, 'Enter your solicitor’s email address'];
  } else if (d.contactBy === 'phone') {
    if (!looksLikePhone(d.phone)) return [null, 'Enter a phone number, like 07700 900 982'];
  } else if (!looksLikeEmail(d.altEmail)) {
    return [null, 'Enter an email address for them to reply to'];
  }
  d.sentForMe = true;
  return [d, null];
}

// "Send it for me" is always offered, because sending is pretend.
export function GET() {
  return json({ enabled: true });
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const [, problem] = readDetails(body);
  if (problem) return json({ error: problem }, 400);
  return json({ sent: true });
}
