// Builds an evidence letter from a few answers, using the wording the
// checker expects. Used by professionals on write-letter.html.

const INTRO = (v) => `I understand that ${v.applicant} wishes to access legal aid for a family dispute as a victim of domestic abuse. For this reason, I have been asked to provide a letter in accordance with regulation 33 and schedule 1 of the Civil Legal Aid (Procedure) Regulations 2012 (as amended).`;

const sign = (v) => `Yours faithfully,\n${v.author}\n${v.role}\n${v.org}\n${v.today}`;
const header = (v, withPerpetrator = true) => `To whom it may concern\n${withPerpetrator ? `Name of perpetrator: ${v.perpetrator}\n` : ''}Name of applicant: ${v.applicant}`;

const COMMON = [
  { id: 'applicant', label: 'Name of the person applying for legal aid' },
  { id: 'author', label: 'Your name' },
  { id: 'role', label: 'Your job title' },
  { id: 'org', label: 'Your organisation' },
];
const PERP = { id: 'perpetrator', label: 'Name of the person who carried out the abuse' };
const date = (id, label) => ({ id, label, hint: 'For example, 28 September 2026', width: 'govuk-input--width-20' });

export const BUILDER = {
  p11: {
    fields: [...COMMON, { id: 'seen', label: 'What you saw', kind: 'radios', options: [['injuries', 'Injuries'], ['condition', 'A condition']] }],
    build: (v) => `${INTRO(v)}\n\nI can confirm that I have examined ${v.applicant} and in my reasonable professional judgement, the ${v.seen} that ${v.applicant} has ${v.seen === 'injuries' ? 'are' : 'is'} consistent with domestic abuse.\n\nI understand that this evidence is only required for a decision on whether or not to grant legal aid – it is not designed to provide evidence of domestic abuse for use in court.\n\n${sign(v)}`,
  },
  p14: {
    fields: [...COMMON, { id: 'adviser', label: 'Your role', kind: 'radios', options: [['Independent Domestic Violence Adviser (IDVA)', 'IDVA'], ['Independent Sexual Violence Adviser (ISVA)', 'ISVA']] },
      { id: 'when', label: 'Support', kind: 'radios', options: [['am providing', 'I am providing support now'], ['have provided', 'I have provided support in the past']] }],
    build: (v) => `${header(v, false)}\n\n${INTRO(v)}\n\nI am an ${v.adviser}.\n\nI can confirm that I ${v.when} ${v.applicant} with support.\n\n${sign(v)}`,
  },
  p17: {
    fields: [...COMMON,
      { id: 'matters', label: 'The matters you relied on', hint: 'Be specific, for example the types of abuse disclosed, DASH risk assessment score, refuge referral or police involvement. "Victim testimony" is not enough.', kind: 'textarea' },
      { id: 'support', label: 'The support you provided', kind: 'textarea' },
      { id: 'reason', label: 'Why they needed this support', kind: 'textarea' }],
    build: (v) => `${INTRO(v)}\n\nI can confirm that our organisation is situated in England and Wales and has been operating for an uninterrupted period of six months or more.\n\nI can confirm that we have provided ${v.applicant} with support in relation to their needs as a victim, or a person at risk, of domestic abuse.\n\nIn my reasonable professional judgement, ${v.applicant} is, or is at risk of being, a victim of domestic abuse.\n\nThe matters I have relied upon to support that judgement are: ${v.matters}\n\nWe have provided ${v.applicant} with the following support: ${v.support}\n\n${v.applicant} needed this support because: ${v.reason}\n\n${sign(v)}`,
  },
  p18: {
    fields: [...COMMON, PERP, date('refused', 'Date they were refused a place')],
    build: (v) => `${header(v)}\n\n${INTRO(v)}\n\nI can confirm that ${v.applicant}, with whom ${v.perpetrator} is or was in a family relationship, was refused admission to a refuge on ${v.refused}.\n\nI can confirm that ${v.applicant} sought admission to a refuge because of allegations of domestic abuse by ${v.perpetrator}.\n\n${sign(v)}`,
  },
  p19: {
    fields: [...COMMON, PERP],
    build: (v) => `${header(v)}\n\n${INTRO(v)}\n\nAccordingly, I can confirm that ${v.applicant}, a person with whom ${v.perpetrator} is or was in a family relationship, was assessed as being, or at risk of being, a victim of domestic abuse by ${v.perpetrator}.\n\n${sign(v)}`,
  },
  marac: {
    fields: [...COMMON, PERP, { id: 'area', label: 'MARAC area', hint: 'For example, Exampleshire' }, date('referred', 'Date of the referral')],
    build: (v) => `${header(v)}\n\n${INTRO(v)}\n\nI am a member of the ${v.area} multi-agency risk assessment conference (MARAC).\n\nI can confirm that ${v.applicant} was referred to the MARAC on ${v.referred} as a victim of domestic abuse by ${v.perpetrator}.\n\nI can confirm that ${v.applicant} is or has been at risk of harm from domestic abuse by ${v.perpetrator}.\n\n${sign(v)}`,
  },
  refugeStay: {
    fields: [...COMMON, PERP, date('admitted', 'Date they were admitted'), { ...date('left', 'Date they left (if they have)'), optional: true }],
    build: (v) => `${header(v)}\n\n${INTRO(v)}\n\nI can confirm that ${v.applicant}, with whom ${v.perpetrator} is or was in a family relationship, was admitted to our refuge on ${v.admitted}${v.left ? ` and stayed until ${v.left}` : ''}.\n\nI can confirm that ${v.applicant} was admitted because of allegations of domestic abuse by ${v.perpetrator}.\n\n${sign(v)}`,
  },
  social: {
    fields: [...COMMON, PERP, { id: 'department', label: 'Department', hint: "For example, Children's Services, Exampleshire Council" }, date('assessed', 'Date of the assessment')],
    build: (v) => `${header(v)}\n\n${INTRO(v)}\n\nI am a ${v.role} in ${v.department}.\n\nI can confirm that ${v.applicant}, with whom ${v.perpetrator} is or was in a family relationship, was assessed by ${v.department} on ${v.assessed} as being, or at risk of being, a victim of domestic abuse by ${v.perpetrator}.\n\n${sign(v)}`,
  },
  financial: {
    fields: [...COMMON, { id: 'shows', label: 'What your records show', hint: 'For example, loans or credit taken out in their name, or control of the account their pay went into', kind: 'textarea' },
      { id: 'period', label: 'Period the records cover', hint: 'For example, January 2025 to March 2026' }],
    build: (v) => `${header(v, false)}\n\n${INTRO(v)}\n\nI am a ${v.role} at ${v.org}.\n\nI can confirm that our records show that ${v.shows.replace(/\.$/, '')}, in the period ${v.period}.\n\n${sign(v)}`,
  },
};

// Fills any empty answer with a [placeholder] so the letter still reads.
export function exampleAnswers(type) {
  return { ...EXAMPLE_ANSWERS, org: EXAMPLE_ANSWERS.orgByType[type] };
}

export function buildLetter(type, answers, today = new Date()) {
  const b = BUILDER[type];
  const v = { today: today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) };
  const missing = [];
  for (const f of b.fields) {
    const val = String(answers[f.id] ?? '').trim();
    if (!val && !f.optional) missing.push(f.label);
    v[f.id] = val || (f.optional ? '' : `[${f.label.toLowerCase()}]`);
  }
  return { text: b.build(v), missing };
}

export const EXAMPLE_ANSWERS = {
  applicant: 'Jane Doe', author: 'John Smith', role: 'Senior Practitioner', org: 'Exampleshire Services', perpetrator: 'John Doe',
  seen: 'injuries', adviser: 'Independent Domestic Violence Adviser (IDVA)', when: 'am providing',
  matters: 'disclosures of physical and emotional abuse and coercive and controlling behaviour, and a DASH risk assessment score of 16.',
  support: 'risk assessment, safety planning and referral to a refuge.', reason: 'she fled her home in fear for her safety.',
  refused: '28 September 2026', area: 'Exampleshire', referred: '12 March 2026', admitted: '2 February 2026', left: '30 April 2026',
  department: "Children's Services, Exampleshire Council", assessed: '4 May 2026',
  orgByType: { p11: 'Example Surgery', p14: 'Exampleshire IDVA Service', p17: 'Exampleshire Domestic Abuse Service', p18: 'Example Refuge', p19: 'Exampleshire Council', marac: 'Exampleshire Police', refugeStay: 'Example Refuge', social: 'Exampleshire Council', financial: 'Example Bank plc' },
  shows: 'John Doe took out two loans and a credit card in her name without her consent', period: 'January 2025 to March 2026',
};
