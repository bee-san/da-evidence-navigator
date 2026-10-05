// Vercel function: sends an evidence request email for someone, so it does not
// come from (or sit in) an inbox that may be monitored. Replies go to another
// address, their solicitor, or a phone call – never back to this website.
//
// The email is rebuilt here from the form fields with the same template as the
// page (src/app/contact.js), so this cannot be used to send any other text.
// Nothing is logged or stored. Sends with Resend (RESEND_API_KEY) from
// EMAIL_FROM, for example "Legal aid evidence requests <requests@example.org>".
// For a letter, the suggested wording is attached as a Word document with the
// parts to fill in highlighted. Links in the email go to the live site.
//
// This is a prototype, so emails go to a test inbox (EMAIL_TEST_TO), with the
// real recipient in the subject. They only go to the real police, GP or service
// when EMAIL_LIVE=1. Without either, sending is not offered.

import { buildRequest, suggestedLetter, looksLikeEmail, looksLikePhone, SITE_URL } from '../src/app/contact.js';
import { textToDocx } from '../src/app/docx-write.js';
import { EVIDENCE, POLICE_EVENTS, COURT_EVENTS } from '../src/app/evidence.js';

const FIELDS = ['key', 'event', 'applicant', 'other', 'reference', 'profName', 'profEmail', 'replyTo',
  'solicitorName', 'solicitorEmail', 'note', 'contactBy', 'altEmail', 'phone', 'callTimes', 'voicemail'];
const MAX = { note: 500, default: 200 };

// Best effort per server instance: a few emails per person per hour.
const WINDOW_MS = 60 * 60 * 1000;
const PER_WINDOW = 5;
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

// EMAIL_DRY_RUN=1 shows the option and pretends to send, for local demos.
const dryRun = () => process.env.EMAIL_DRY_RUN === '1';
const live = () => process.env.EMAIL_LIVE === '1';
const testTo = () => (live() ? '' : (process.env.EMAIL_TEST_TO || '').trim());
const configured = () => dryRun() || !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && (live() || testTo()));

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

// Lets the page show "send it for me" only when sending is set up.
export function GET() {
  return json({ enabled: configured() });
}

export async function POST(request) {
  if (!configured()) return json({ error: 'not configured' }, 503);
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  if (limited(ip)) return json({ error: 'You have sent several emails in the last hour. Try again later, or send it from your own email.' }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const [d, problem] = readDetails(body);
  if (problem) return json({ error: problem }, 400);

  const email = buildRequest(d.key, d, { baseUrl: process.env.SITE_URL || SITE_URL });
  const test = testTo();
  if (dryRun()) return json({ sent: true, to: email.to, ...(test && { testTo: test }), dryRun: true });
  const letter = suggestedLetter(d.key, d);
  const real = [`to ${email.to}`, email.cc && `cc ${email.cc}`].filter(Boolean).join(', ');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [test || email.to],
      ...(email.cc && !test && { cc: [email.cc] }),
      ...(email.replyTo && { reply_to: email.replyTo }),
      subject: test ? `[Test – would go ${real}] ${email.subject}` : email.subject,
      text: email.body,
      ...(letter && { attachments: [{ filename: 'suggested-letter.docx', content: Buffer.from(textToDocx(letter)).toString('base64') }] }),
    }),
  });
  if (!res.ok) return json({ error: 'The email could not be sent. Try again, or send it from your own email.' }, 502);
  return json({ sent: true, to: email.to, ...(test && { testTo: test }) });
}
