// Scripted part of the chatbot. Danger, privacy and pasted letters are always
// answered here, in the browser, so those answers stay predictable and a
// pasted letter never leaves the device. Other questions go to the AI helper
// (api/chat.js); these scripted answers are the fallback when it is
// unavailable. It never asks the user to describe the abuse.

import { ROUTES } from './routes.js';
import { checkLetter, changeRequest, LETTER_TYPES } from './rules.js';

export const LINKS = {
  guide: 'https://www.gov.uk/legal-aid/domestic-abuse',
  check: 'https://www.gov.uk/legal-aid/check-legal-aid',
  samples: 'https://www.gov.uk/government/collections/sample-letters-to-get-evidence-of-domestic-violence',
  childSamples: 'https://www.gov.uk/government/collections/sample-letters-to-get-evidence-of-child-abuse',
  help: 'https://www.gov.uk/guidance/domestic-abuse-how-to-get-help',
};

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const a = (href, text) => `<a class="govuk-link" href="${href}"${href.startsWith('http') ? ' rel="noreferrer noopener" target="_blank"' : ''}>${text}${href.startsWith('http') ? ' (opens in new tab)' : ''}</a>`;

function routeAnswer(key) {
  const r = ROUTES[key];
  return `<p class="govuk-body"><strong>${r.title}</strong> (${r.para}). ${r.who}</p>
<p class="govuk-body">The letter must:</p>
<ul class="govuk-list govuk-list--bullet">${r.musts.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>
<p class="govuk-body">${a(`request.html#${key}`, 'Get a request note to give them')}</p>`;
}

const INTENTS = [
  {
    id: 'danger',
    match: /\b(danger|unsafe|emergency|right now|kill|hurt me|hurting me|attack|outside my|scared)\b/,
    quick: [],
    html: () => `<div class="govuk-warning-text"><span class="govuk-warning-text__icon" aria-hidden="true">!</span><strong class="govuk-warning-text__text"><span class="govuk-visually-hidden">Warning</span>If you are in immediate danger, call 999.</strong></div>
<p class="govuk-body">If you cannot speak, call 999, listen to the questions, then press 55 when prompted. This is the Silent Solution.</p>
<p class="govuk-body">For free, confidential support 24 hours a day, call the National Domestic Abuse Helpline on 0808 2000 247. In Wales, call Live Fear Free on 0808 80 10 800. Men can call the Men's Advice Line on 0808 801 0327.</p>
<p class="govuk-body">For legal help, Civil Legal Advice fast-tracks people at risk of harm: call 0345 345 4 345 and tell them you are at risk.</p>`,
  },
  {
    id: 'privacy',
    match: /\b(saved?|stored?|store|private|privacy|track\w*|history|see what|find out|safe to use|record\w*)\b/,
    quick: ['What evidence can I use?'],
    html: () => `<p class="govuk-body">Nothing is saved. Questions are sent to an AI service to answer them, and are not stored. Letters you paste are checked on your device and are not sent anywhere. The chat disappears when you leave or refresh the page.</p>
<p class="govuk-body">To leave quickly, select <strong>Exit this page</strong> or press the Shift key 3 times. If someone checks your device, also clear your browser history, or use a private window. ${a('safety.html', 'Read how to stay safe online')}.</p>`,
  },
  {
    id: 'pastedLetter',
    match: (t, raw) => raw.length > 250 && /regulation 33|legal aid|schedule 1/.test(t),
    html: (raw) => {
      const r = checkLetter(raw);
      if (r.outcome === 'unknown') {
        return `<p class="govuk-body">That looks like a letter, but I could not tell which type it is. Try the ${a('letter-checker.html', 'letter checker')}, where you can choose the letter type.</p>`;
      }
      const verdict = `${{ ready: 'This letter looks ready to send to your solicitor.', check: 'This letter may need a change – check with your solicitor.', changes: 'This letter needs changes before it is likely to be accepted.' }[r.outcome]} Confidence: ${r.confidence.score}% (${r.confidence.level}).`;
      const issues = r.checks.filter((c) => c.status !== 'pass');
      const req = changeRequest(r);
      return `<p class="govuk-body">This looks like a <strong>${escapeHtml(LETTER_TYPES[r.type])}</strong>.</p>
<p class="govuk-body"><strong>${verdict}</strong></p>
${issues.length ? `<ul class="govuk-list govuk-list--bullet">${issues.map((c) => `<li>${escapeHtml(c.detail)}</li>`).join('')}</ul>` : ''}
${req ? `<p class="govuk-body">You could send this back to the person who wrote it:</p><pre class="app-note">${escapeHtml(req)}</pre>` : ''}
<p class="govuk-body govuk-!-font-size-16">This is a screening check. Your solicitor and the Legal Aid Agency make the decision.</p>`;
    },
  },
  { id: 'gp', match: /\b(gp|doctor|nurse|midwife|health|hospital|psycholog\w*|paramedic|a&e|injur\w*)\b/, quick: ['How do I check a letter?'], html: () => routeAnswer('p11') },
  { id: 'idva', match: /\b(idva|isva|independent (domestic|sexual) violence|adviser|advisor)\b/, quick: ['How do I check a letter?'], html: () => routeAnswer('p14') },
  { id: 'refuge', match: /\brefuge\b/, quick: ['What evidence can I use?'], html: () => `${routeAnswer('p18')}<p class="govuk-body">If a refuge gave you a place, a refuge manager can confirm this instead. Your solicitor can advise on the wording.</p>` },
  { id: 'council', match: /\b(council|housing|homeless\w*|local authority)\b/, quick: ['How do I check a letter?'], html: () => routeAnswer('p19') },
  { id: 'support', match: /\b(support (service|worker|organisation)|women'?s aid|charity|helpline|outreach|support)\b/, quick: ['How do I check a letter?'], html: () => routeAnswer('p17') },
  {
    id: 'official',
    match: /\b(police|court|injunction|non-molestation|marac|social (services|worker)|conviction|caution|bank|money|financ\w*|employer|benefits?)\b/,
    quick: ['What evidence can I use?'],
    html: () => `<p class="govuk-body">Evidence from the police, the courts, a MARAC, social services, your bank, your employer or a benefits provider can also count.</p>
<p class="govuk-body">Your solicitor can usually request court and police records directly. For the others, GOV.UK has ${a(LINKS.samples, 'sample letters you can send')}. If your children experienced abuse, use the ${a(LINKS.childSamples, 'child abuse sample letters')}.</p>`,
  },
  {
    id: 'fee',
    match: /\b(cost|fee|pay|charge|free)\b/,
    quick: ['What evidence can I use?'],
    html: () => `<p class="govuk-body">Some professionals may charge a fee to write an evidence letter. Ask them before they write it. If cost is a problem, tell your solicitor – they may be able to get other evidence.</p>`,
  },
  {
    id: 'check',
    match: /\b(check|letter came|got (a|the) letter|received|wrong|rejected|refused|returned|send back)\b/,
    quick: ['What evidence can I use?'],
    html: () => `<p class="govuk-body">Use the ${a('letter-checker.html', 'letter checker')} to see if a letter uses the wording the Legal Aid Agency needs. You can also paste the text of the letter here.</p>
<p class="govuk-body">Common problems are hedged wording like "might be consistent" or "may be a victim", a missing name for the person who abused you, or reasons that are too general.</p>`,
  },
  {
    id: 'none',
    match: /\b(no evidence|don'?t have|do not have|nothing|not told|haven'?t told|never told)\b/,
    quick: ['What evidence can I use?'],
    html: () => `<p class="govuk-body">That is common. You can still talk to a legal adviser first – you do not need evidence before that conversation.</p>
<p class="govuk-body">A domestic abuse support service can help you, and may be able to write a letter once they have supported you. Call the National Domestic Abuse Helpline on 0808 2000 247, or see ${a(LINKS.help, 'how to get help')}.</p>`,
  },
  {
    id: 'evidence',
    match: /\b(evidence|proof|prove|document\w*|which|options?|start|find)\b/,
    quick: ['Can my GP write a letter?', 'What about a support service?', 'I have not told anyone'],
    html: () => `<p class="govuk-body">You can ask for evidence from the courts, the police, a MARAC, social services, a health professional, a refuge manager, a domestic abuse support service, your bank, your employer or education provider, or a benefits provider.</p>
<p class="govuk-body">${a('check.html', 'Answer a few questions')} to see which routes you may already have and what each letter needs to say.</p>`,
  },
  {
    id: 'what',
    match: /\b(what is|what's|explain|gateway|how does|qualify|eligib\w*|legal aid)\b/,
    quick: ['What evidence can I use?', 'Is anything saved?'],
    html: () => `<p class="govuk-body">You might be able to get legal aid for a family matter, such as arrangements for children, if you have evidence that you or your children have experienced domestic abuse and you cannot afford legal costs.</p>
<p class="govuk-body">Domestic abuse includes controlling behaviour, emotional abuse, financial control, and someone harassing, threatening or hurting you or your child. It could be from a partner, ex-partner or family member.</p>
<p class="govuk-body">You do not have to get evidence before talking to a legal adviser, but they will need to see it before deciding. ${a(LINKS.check, 'Check if you can get legal aid')}.</p>`,
  },
  {
    id: 'hello',
    match: /\b(hi|hello|hey|help|thanks|thank you)\b/,
    quick: ['What evidence can I use?', 'How do I check a letter?', 'Is anything saved?'],
    html: () => `<p class="govuk-body">I can help you find evidence for legal aid and check letters you have been given. What would you like to know?</p>`,
  },
];

export const WELCOME = {
  html: `<p class="govuk-body">I can answer questions about getting evidence of domestic abuse for legal aid, and check a letter if you paste its text.</p>
<p class="govuk-body">Please do not describe what happened to you here – I only need to know which services you have been in contact with.</p>`,
  quick: ['What evidence can I use?', 'Can my GP write a letter?', 'How do I check a letter?', 'Is anything saved?'],
};

const LOCAL = new Set(['danger', 'privacy', 'pastedLetter']);

function findIntent(raw) {
  const t = raw.toLowerCase();
  return INTENTS.find((i) => (typeof i.match === 'function' ? i.match(t, raw) : i.match.test(t)));
}

// Answer that must not go to the AI helper, or null.
export function localReply(raw) {
  const intent = findIntent(raw);
  return intent && LOCAL.has(intent.id) ? { html: intent.html(raw), quick: intent.quick || [] } : null;
}

// Renders the AI helper's plain-text answer as escaped paragraphs.
export function textToHtml(text) {
  return String(text).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p class="govuk-body">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('\n');
}

export function reply(raw) {
  const intent = findIntent(raw);
  if (!intent) {
    return {
      html: `<p class="govuk-body">Sorry, I do not know about that yet. I can tell you which evidence you could use, explain what a letter needs to say, or check a letter.</p>`,
      quick: ['What evidence can I use?', 'How do I check a letter?'],
    };
  }
  return { html: intent.html(raw), quick: intent.quick || [] };
}
