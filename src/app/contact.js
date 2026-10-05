// Builds the email someone sends to ask a professional for evidence. Runs on
// the device only: names and email addresses are never sent to this website
// or to an AI model. The email is opened in the person's own email app.

import { EVIDENCE, POLICE_EVENTS, COURT_EVENTS } from './evidence.js';
import { BUILDER } from './builder.js';
import { LETTER_TYPES } from './rules.js';

// Links in the emails go to the live site, wherever the email was written.
export const SITE_URL = 'https://da-evidence-navigator-rho.vercel.app/';

const clean = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

// Fills the parts of a template the applicant knows. Placeholders the
// professional must complete, like [date] or [specific matters], stay as they are.
export function personalise(template, { applicant, other }) {
  let t = template;
  if (clean(applicant)) t = t.replace(/\[your name\]/gi, clean(applicant));
  if (clean(other)) t = t.replace(/\[perpetrator\]/g, clean(other)).replace(/^Name of perpetrator: \[name\]$/m, `Name of perpetrator: ${clean(other)}`);
  return t;
}

const list = (items) => items.map((m) => `- ${m}`).join('\n');

function recordsRequest(key, d) {
  const events = key === 'police' ? POLICE_EVENTS : COURT_EVENTS;
  const e = events[d.event] || Object.values(events)[0];
  const other = clean(d.other) || '[name of the person who abused me]';
  const ref = clean(d.reference) ? `\nThe reference number is ${clean(d.reference)}.\n` : '';
  if (key === 'police') {
    return {
      para: e.para,
      subject: 'Request for written confirmation for my legal aid application',
      ask: `${other} ${e.label}, and I was the victim.${ref}

Please could you confirm in writing, from your records:
- the name of the person, ${other}
- that I was the victim
- ${e.record}
- the date

The confirmation can be a letter, or an email from a police email address.`,
    };
  }
  return {
    para: e.para,
    subject: 'Request for a copy of a court document for my legal aid application',
    ask: `The court dealt with ${e.label} involving ${other}.${ref}

Please could you send me a copy of ${e.record}. It needs to name ${other} and me.`,
  };
}

// The suggested wording for a letter, personalised, or null for a records request.
// When this website sends the email, it is also attached as a Word document (api/send.js).
export function suggestedLetter(key, details) {
  const ev = EVIDENCE[key];
  return ev && ev.ask !== 'records' && ev.template ? personalise(ev.template, details) : null;
}

// Returns { to, cc, subject, body } for a request email.
export function buildRequest(key, details, { baseUrl = SITE_URL } = {}) {
  const ev = EVIDENCE[key];
  const d = details;
  const applicant = clean(d.applicant) || '[your name]';
  const greeting = clean(d.profName) ? `Dear ${clean(d.profName)},` : 'Dear Sir or Madam,';
  const toSolicitor = d.replyTo === 'solicitor' && clean(d.solicitorEmail);
  // When this website sends the email, replies cannot come back to the sender,
  // so the person gives another address or a phone number instead.
  const sentForMe = !!d.sentForMe;
  let sendTo;
  if (toSolicitor) {
    sendTo = `Please send it to my solicitor${clean(d.solicitorName) ? `, ${clean(d.solicitorName)},` : ''} at ${clean(d.solicitorEmail)}${sentForMe ? '.' : ', and copy me in. I have copied them into this email.'}`;
  } else if (sentForMe && d.contactBy === 'phone' && clean(d.phone)) {
    sendTo = `Please call me on ${clean(d.phone)} to arrange how I can get the letter.${clean(d.callTimes) ? ` The best time to call is ${clean(d.callTimes)}.` : ''} ${d.voicemail ? 'You can leave a voicemail.' : 'Please do not leave a voicemail.'}`;
  } else if (sentForMe && clean(d.altEmail)) {
    sendTo = `Please send it to me at ${clean(d.altEmail)}.`;
  } else {
    sendTo = 'Please send it to me by replying to this email.';
  }
  const footer = sentForMe
    ? `\n\n---\nThis email was sent for ${applicant} by a prototype service that helps people ask for evidence for legal aid. Replies to the sending address are not read, so please use the contact details above.`
    : '';
  const note = clean(d.note) ? `\n${clean(d.note)}\n` : '';

  let subject;
  let middle;
  if (ev.ask === 'records') {
    const r = recordsRequest(key, d);
    subject = r.subject;
    middle = `I am applying for legal aid for a family case. To qualify, I need evidence for the Legal Aid Agency under ${r.para} of the Civil Legal Aid (Procedure) Regulations 2012.

${r.ask}
${note}`;
  } else {
    subject = 'Request for a letter for my legal aid application';
    const links = [];
    if (BUILDER[key]) links.push(`Write the letter with the right wording: ${baseUrl}write-letter.html?type=${key}`);
    if (LETTER_TYPES[key]) links.push(`Check a letter before you send it: ${baseUrl}letter-checker.html?type=${key}`);
    middle = `I am applying for legal aid for a family case. To qualify, I need a letter from you as evidence for the Legal Aid Agency, under ${ev.para} of the Civil Legal Aid (Procedure) Regulations 2012.
${note}
The Legal Aid Agency often returns letters because of a few words, so please could the letter:
${list(ev.musts)}
- be signed and dated, on headed paper or sent from an official email address

Suggested wording you can copy and change${sentForMe ? ' (it is also attached as a Word document, with the parts to fill in highlighted)' : ''}:

${suggestedLetter(key, d)}
${links.length ? `\nThese free tools can help:\n${links.map((l) => `- ${l}`).join('\n')}\n` : ''}`;
  }

  const body = `${greeting}

${middle.trim()}

${sendTo}

Thank you,
${applicant}${footer}`;

  const replyTo = sentForMe ? (toSolicitor ? clean(d.solicitorEmail) : (d.contactBy !== 'phone' && clean(d.altEmail)) || '') : '';
  return { to: clean(d.profEmail), cc: toSolicitor ? clean(d.solicitorEmail) : '', replyTo, subject, body };
}

const enc = encodeURIComponent;

export function mailtoUrl({ to, cc, subject, body }) {
  const q = [cc && `cc=${enc(cc)}`, `subject=${enc(subject)}`, `body=${enc(body)}`].filter(Boolean).join('&');
  return `mailto:${to.split(',').map((a) => enc(a.trim())).join(',')}?${q}`;
}

// Some desktop email apps cut off mailto links longer than about 2,000 characters.
export const MAILTO_SAFE_LENGTH = 2000;

// A UK phone number, loosely: digits, spaces and an optional leading +.
export const looksLikePhone = (s) => /^\+?[\d\s()-]{10,16}$/.test(clean(s)) && clean(s).replace(/\D/g, '').length >= 10;

export const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(s));
