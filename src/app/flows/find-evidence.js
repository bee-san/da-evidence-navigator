// "Find evidence" flow: asks whether someone has a solicitor, then, one
// question at a time, which services already know about the abuse, in the
// order of Schedule 1 of the Civil Legal Aid (Procedure) Regulations 2012 –
// police (paragraphs 1 to 6A), courts (7 to 10), health (11 and 12), support
// services (13 to 19), immigration (20) and money (21). The first answer that
// applies leads to a page explaining that evidence, with a form that writes
// the request email.
//
// We never ask what happened, only who already knows.

import { EVIDENCE, POLICE_EVENTS, COURT_EVENTS } from '../evidence.js';
import { ROUTES } from '../routes.js';
import { mountAll } from '../contact-ui.js';
import { mountLocal } from '../local-ui.js';

// Evidence where knowing the person's area helps them find who to ask.
const LOCAL = new Set(['marac', 'p14', 'p17', 'p19', 'social']);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Paths that answer "No" up to each section, used by "look for more evidence".
const NEXT_SECTION = {
  police: 'solicitor/police/court',
  court: 'solicitor/police/court/health',
  health: 'solicitor/police/court/health/services',
  services: 'solicitor/police/court/health/services/immigration',
  immigration: 'solicitor/police/court/health/services/immigration/money',
  money: null,
};

const more = (section) => (NEXT_SECTION[section]
  ? `<h2 class="govuk-heading-m">Look for more evidence</h2>
<p class="govuk-body">One piece of evidence is usually enough. Getting a second one can help if there is a problem with the first.</p>
<p class="govuk-body"><a class="govuk-link" href="#${NEXT_SECTION[section]}">Carry on answering questions</a></p>` : '');

const SOLICITOR = `<p class="govuk-body">If you have a legal aid solicitor, they can usually ask for this for you. You do not need to get the evidence before you talk to them. <a class="govuk-link" href="find-solicitor.html">Find a legal aid solicitor</a>.</p>`;

function mustsHtml(ev) {
  return `<h2 class="govuk-heading-m">What it must show</h2>
<p class="govuk-body">The Legal Aid Agency will only accept it if it:</p>
<ul class="govuk-list govuk-list--bullet">${ev.musts.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`;
}

const PHONE = (key) => `<details class="govuk-details">
  <summary class="govuk-details__summary"><span class="govuk-details__summary-text">If you would rather phone or ask in person</span></summary>
  <div class="govuk-details__text">
    <p class="govuk-body">You could say:</p>
    <div class="govuk-inset-text"><p class="govuk-body">“I am applying for legal aid for a family case, and I need a letter from you as evidence. Can I email you what it needs to say?”</p></div>
    <p class="govuk-body">Ask for their email address, then fill in the form below.${ROUTES[key] ? ` Or <a class="govuk-link" href="request.html#${key}">print a note to give them</a>.` : ''}</p>
    <p class="govuk-body">Some professionals, such as GPs, may charge a fee for a letter. Ask before they write it.</p>
  </div>
</details>`;

// A result page for a letter from a professional.
const letterStep = (key, section, title, intro) => ({
  title,
  body: `<p class="govuk-body-l">${intro}</p>
<p class="govuk-body">This can be evidence under ${esc(EVIDENCE[key].para)} of the legal aid rules.</p>
<h2 class="govuk-heading-m">Who to ask</h2>
<p class="govuk-body">${esc(EVIDENCE[key].who)}</p>
${LOCAL.has(key) ? `<div data-local="${key}"></div>` : ''}
${mustsHtml(EVIDENCE[key])}
${PHONE(key)}
<div data-contact="${key}"></div>
${more(section)}`,
});

// A result page for confirmation from police or court records.
const recordsStep = (key, event, events, section, title, intro) => ({
  title,
  body: `<p class="govuk-body-l">${intro}</p>
<p class="govuk-body">This can be evidence under ${esc(events[event].para)} of the legal aid rules. It does not matter how long ago it happened.</p>
${SOLICITOR}
<h2 class="govuk-heading-m">Who to ask</h2>
<p class="govuk-body">${esc(EVIDENCE[key].who)}</p>
${mustsHtml(EVIDENCE[key])}
<div data-contact="${key}" data-event="${event}"></div>
${more(section)}`,
});

const POLICE_RESULTS = {
  evConvicted: ['convicted', 'Ask the police to confirm the conviction', 'A conviction for a domestic abuse offence is strong evidence.'],
  evCharged: ['charged', 'Ask the police to confirm the charge', 'A charge for a domestic abuse offence counts while the court case is still going on.'],
  evCautioned: ['cautioned', 'Ask the police to confirm the caution', 'A police caution for a domestic abuse offence counts as evidence.'],
  evBoundOver: ['boundOver', 'Ask for confirmation of the bind over', 'A court binding them over in connection with a domestic abuse offence counts as evidence.'],
  evArrested: ['arrested', 'Ask the police to confirm the arrest', 'An arrest for a domestic abuse offence counts as evidence, even if they were not charged.'],
  evNotice: ['notice', 'Ask the police to confirm the notice', 'A domestic violence protection notice (DVPN) or domestic abuse protection notice (DAPN) counts as evidence.'],
};

const COURT_RESULTS = {
  evInjunction: ['injunction', 'Get a copy of the court order', 'A protective order or injunction counts as evidence, even if it has ended.'],
  evUndertaking: ['undertaking', 'Get a copy of the undertaking', 'An undertaking they gave to a court counts as evidence, as long as you did not give one back to them about domestic abuse.'],
  evFinding: ['finding', 'Get a copy of the finding of fact', 'A court finding that there was domestic abuse counts as evidence.'],
  evExpert: ['expert', 'Get a copy of the expert report', 'An expert report written for a court or tribunal that says there were signs of domestic abuse counts as evidence.'],
};

const steps = {
  solicitor: {
    title: 'Do you have a solicitor for your family case?',
    hint: 'If you do, we can ask for the evidence to be sent straight to them.',
    options: [
      { label: 'Yes', next: 'police', remember: { hasSolicitor: 'yes' } },
      { label: 'No', next: 'police', remember: { hasSolicitor: 'no' } },
      { label: 'I’m not sure', next: 'police', remember: { hasSolicitor: 'unsure' } },
    ],
  },
  police: {
    title: 'Have the police been involved?',
    hint: 'For example, you reported the abuse, the police came to your home, or the person who abused you was arrested. It does not matter how long ago.',
    options: [
      { label: 'Yes', next: 'policeWhat' },
      { label: 'No', next: 'court' },
      { label: 'I’m not sure', next: 'policeWhat' },
    ],
  },
  policeWhat: {
    title: 'What happened to the person who abused you?',
    hint: 'If more than one thing happened, choose the one nearest the top.',
    options: [
      { label: 'They were convicted (found guilty) in court', next: 'evConvicted' },
      { label: 'They were charged and the court case has not finished', next: 'evCharged' },
      { label: 'They were given a police caution', next: 'evCautioned' },
      { label: 'They were bound over by a court', next: 'evBoundOver' },
      { label: 'They were arrested', next: 'evArrested' },
      { label: 'The police gave them a notice to stay away from me', next: 'evNotice' },
      { label: 'None of these, or I do not know', hint: 'A solicitor can ask the police what happened', next: 'court' },
    ],
  },
  court: {
    title: 'Has a court made an order to protect you, or decided anything about the abuse?',
    hint: 'This could be a family, civil or criminal court in the UK.',
    options: [
      { label: 'Yes', next: 'courtWhat' },
      { label: 'No', next: 'health' },
      { label: 'I’m not sure', next: 'courtWhat' },
    ],
  },
  courtWhat: {
    title: 'What did the court do?',
    options: [
      { label: 'Made an order to protect me, such as a non-molestation order', next: 'evInjunction' },
      { label: 'Accepted a promise from them not to contact or harm me (an undertaking)', next: 'evUndertaking' },
      { label: 'Decided that the abuse happened (a finding of fact)', next: 'evFinding' },
      { label: 'Had an expert write a report for the case that says there were signs of abuse', next: 'evExpert' },
      { label: 'None of these, or I do not know', next: 'health' },
    ],
  },
  health: {
    title: 'Has a health professional seen you about an injury or health condition linked to the abuse?',
    hint: 'For example a GP, nurse, midwife, health visitor, psychologist, dentist or paramedic. It could have been in person, by phone or by video, and it does not matter how long ago.',
    options: [
      { label: 'Yes, they examined or treated me', next: 'evP11' },
      { label: 'Yes, and they referred me to a domestic abuse support service', next: 'evP12' },
      { label: 'No, or I’m not sure', next: 'services' },
    ],
  },
  services: {
    title: 'Have you had help from any of these?',
    hint: 'Choose the one you have had most contact with. You can come back and choose another.',
    options: [
      { label: 'An independent domestic violence adviser (IDVA), often from a local domestic abuse service', next: 'evP14' },
      { label: 'An independent sexual violence adviser (ISVA), often from a sexual assault referral centre or Rape Crisis', next: 'evP15' },
      { label: 'A domestic abuse support service or charity, such as Women’s Aid, Refuge, Victim Support or a local service', next: 'evP17' },
      { label: 'A MARAC (a meeting where services discussed my safety)', next: 'evMarac' },
      { label: 'A refuge that gave me a place', next: 'evRefugeStay' },
      { label: 'A refuge that could not give me a place', next: 'evP18' },
      { label: 'My council or a housing association, such as a housing officer or homeless team', next: 'evP19' },
      { label: 'Social services or children’s services, such as a social worker', next: 'evSocial' },
      { label: 'None of these', next: 'immigration' },
    ],
  },
  immigration: {
    title: 'Have you been given permission to stay in the UK because of domestic abuse?',
    hint: 'For example, leave to remain as a victim of domestic abuse. It will say this on your letter from the Home Office.',
    options: [
      { label: 'Yes', next: 'evP20' },
      { label: 'No, or this does not apply to me', next: 'money' },
    ],
  },
  money: {
    title: 'Has the person who abused you controlled your money or taken out debt in your name?',
    hint: 'For example, stopping you using your bank account, taking your wages or benefits, or running up loans or credit cards in your name.',
    options: [
      { label: 'Yes', next: 'evP21' },
      { label: 'No', next: 'none' },
    ],
  },

  evP11: letterStep('p11', 'health', 'Ask the health professional for a letter',
    'A letter from a health professional who has seen you counts as evidence. They need to say your injury or condition is consistent with domestic abuse.'),
  evP12: letterStep('p12', 'health', 'Ask for confirmation of your referral',
    'If a health professional referred you to a domestic abuse support service, confirmation of that referral counts as evidence.'),
  evP14: letterStep('p14', 'services', 'Ask your IDVA for a letter',
    'A letter from an independent domestic violence adviser (IDVA) who is supporting you, or has supported you, counts as evidence.'),
  evP15: letterStep('p15', 'services', 'Ask your ISVA for a letter',
    'A letter from an independent sexual violence adviser (ISVA) who is supporting you, or has supported you, counts as evidence.'),
  evP17: letterStep('p17', 'services', 'Ask the support service for a letter',
    'A letter from a domestic abuse support service that has helped you counts as evidence. It needs to give specific details, so it is worth asking them to read what it must show.'),
  evMarac: letterStep('marac', 'services', 'Ask a MARAC member for a letter',
    'If you were discussed at a MARAC, a letter from someone who sits on it counts as evidence. Your IDVA, if you have one, is often a member.'),
  evRefugeStay: letterStep('refugeStay', 'services', 'Ask the refuge for a letter',
    'A letter from a refuge that gave you a place counts as evidence.'),
  evP18: letterStep('p18', 'services', 'Ask the refuge for a letter',
    'A letter from a refuge that could not give you a place still counts as evidence.'),
  evP19: letterStep('p19', 'services', 'Ask your council or housing association for a letter',
    'A letter from your council or housing association saying they assessed you as a victim of domestic abuse counts as evidence. A housing officer can also write one describing the support they gave you.'),
  evSocial: letterStep('social', 'services', 'Ask social services for a letter',
    'A letter, or a copy of an assessment, from social services or children’s services saying you were assessed as a victim of domestic abuse counts as evidence.'),
  evP21: letterStep('financial', 'money', 'Ask for evidence of the financial abuse',
    'If someone controlled your money or put you in debt, records from your bank, employer or benefits provider can count as evidence. This is called economic abuse.'),

  evP20: {
    title: 'Give your Home Office letter to your solicitor',
    body: `<p class="govuk-body-l">If you were given permission to stay in the UK as a victim of domestic abuse, the letter from the Home Office counts as evidence.</p>
<p class="govuk-body">This is evidence under ${esc(EVIDENCE.p20.para)} of the legal aid rules.</p>
${mustsHtml(EVIDENCE.p20)}
<h2 class="govuk-heading-m">If you do not have the letter</h2>
<p class="govuk-body">You can <a class="govuk-link" href="https://www.gov.uk/government/publications/requests-for-personal-data-uk-visas-and-immigration" rel="noreferrer">ask UK Visas and Immigration for a copy of your records</a>. Your solicitor can help with this.</p>
${SOLICITOR}
${more('immigration')}`,
  },

  none: {
    title: 'You can still get help',
    body: `<p class="govuk-body-l">Lots of people have not told anyone yet. You can still get support, and talk to a solicitor before you have any evidence.</p>
<h2 class="govuk-heading-m">Talk to a support service</h2>
<p class="govuk-body">A domestic abuse support service can help you stay safe and plan what to do next. After they have supported you, they can write a letter that counts as evidence for legal aid.</p>
<ul class="govuk-list govuk-list--spaced">
  <li><strong>National Domestic Abuse Helpline</strong>: 0808 2000 247 (free, 24 hours)</li>
  <li><strong>Live Fear Free</strong> (Wales): 0808 80 10 800 (free, 24 hours)</li>
  <li><strong>Men’s Advice Line</strong>: 0808 801 0327</li>
  <li><strong>Galop</strong> (LGBT+ people): 0800 999 5428</li>
</ul>
<p class="govuk-body">You can also <a class="govuk-link" href="https://www.womensaid.org.uk/domestic-abuse-directory/" rel="noreferrer">find a local domestic abuse service</a>.</p>
<h2 class="govuk-heading-m">Talk to a health professional</h2>
<p class="govuk-body">If the abuse has affected your health, your GP or another health professional can help. Later, they may be able to write a letter that counts as evidence.</p>
<h2 class="govuk-heading-m">Talk to a solicitor</h2>
<p class="govuk-body">A legal aid solicitor can tell you what evidence you need, and can sometimes help you get it.</p>
<p class="govuk-body"><a class="govuk-link" href="find-solicitor.html">Find a legal aid solicitor</a>, or call Civil Legal Advice on <strong>0345 345 4 345</strong>. Say if you are at risk of harm and they will deal with your call quickly.</p>`,
  },
};

for (const [id, [event, title, intro]] of Object.entries(POLICE_RESULTS)) {
  steps[id] = recordsStep('police', event, POLICE_EVENTS, 'police', title, intro);
}
for (const [id, [event, title, intro]] of Object.entries(COURT_RESULTS)) {
  steps[id] = recordsStep('court', event, COURT_EVENTS, 'court', title, intro);
}

const flow = { start: 'solicitor', steps, answers: {} };
export default flow;

export function onRender(root) {
  mountAll(root, flow.answers);
  // After the contact form, so the council's name can be added to the email.
  for (const el of root.querySelectorAll('[data-local]')) mountLocal(el, root);
}
