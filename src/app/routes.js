// Evidence routes a victim may already have, and the request note to hand
// to each professional. Wording follows the accepted examples in the
// hackathon evidence pack.

export const ROUTES = {
  p11: {
    title: 'A letter from a health professional',
    para: 'Schedule 1, paragraph 11',
    who: 'For example a doctor, nurse, midwife, psychologist or health visitor who has examined you.',
    musts: [
      'say they examined, assessed or treated you',
      'refer to your injuries or condition',
      'say the injuries or condition are "consistent with domestic abuse" – not "might be" or "may be"',
    ],
    template: `I understand that [your name] wishes to access legal aid for a family dispute as a victim of domestic abuse. For this reason I have been asked to provide a letter in accordance with regulation 33 of the Civil Legal Aid (Procedure) Regulations 2012.

I can confirm that I have examined [your name] and in my reasonable professional judgement, the [injuries / condition] that [your name] has [is / are] consistent with domestic abuse.

I understand that this evidence is only required for a decision on whether or not to grant legal aid – it is not designed to provide evidence of domestic abuse for use in court.`,
  },
  p14: {
    title: 'A letter from an IDVA or ISVA',
    para: 'Schedule 1, paragraph 14',
    who: 'An Independent Domestic Violence Adviser (IDVA) or Independent Sexual Violence Adviser (ISVA) who is supporting you or has supported you.',
    musts: [
      'say they are an IDVA or ISVA',
      'say "I am providing" or "I have provided" you with support – not "we provided"',
    ],
    template: `I understand that [your name] wishes to access legal aid for a family dispute as a victim of domestic abuse. For this reason, I have been asked to confirm that I am providing / have provided support to [your name] in accordance with regulation 33 and schedule 1 of the Civil Legal Aid (Procedure) Regulations 2012 (as amended).

I can confirm that I [am providing / have provided] [your name] with support.

[Name], [IDVA / ISVA], [organisation]`,
  },
  p17: {
    title: 'A letter from a domestic abuse support service',
    para: 'Schedule 1, paragraph 17',
    who: 'For example a helpline, outreach service or local domestic abuse charity that has supported you.',
    musts: [
      'confirm the organisation is in England and Wales and has operated for an uninterrupted six months or more',
      'give their reasonable professional judgement that you are, or are at risk of being, a victim of domestic abuse',
      'list the specific matters they relied on – a general phrase like "victim testimony" is not enough',
      'describe the support they gave you and why you needed it',
    ],
    template: `I understand that [your name] wishes to access legal aid for a family dispute as a victim of domestic abuse. For this reason, I have been asked to provide a letter in accordance with regulation 33 and schedule 1 of the Civil Legal Aid (Procedure) Regulations 2012 (as amended).

I can confirm that our organisation is situated in England and Wales and has been operating for an uninterrupted period of six months or more.

I can confirm that we have provided [your name] with support in relation to their needs as a victim, or a person at risk, of domestic abuse.

In my reasonable professional judgement, [your name] is, or is at risk of being, a victim of domestic abuse.

The matters I have relied upon to support that judgement are: [specific matters, for example the types of abuse disclosed, risk assessment results, refuge referral or police involvement].

We have provided [your name] with the following support: [support provided].

[Your name] needed this support because: [reason].`,
  },
  p18: {
    title: 'A letter from a refuge that refused you a place',
    para: 'Schedule 1, paragraph 18',
    who: 'A refuge you asked to stay in that could not give you a place.',
    musts: [
      'name the person who abused you',
      'confirm you are or were in a family relationship with them',
      'confirm you were refused admission to a refuge, and the date',
      'say you sought a place because of domestic abuse by that person',
    ],
    template: `Name of perpetrator: [name]
Name of applicant: [your name]

I understand that [your name] wishes to access legal aid for a family dispute as a victim of domestic abuse. For this reason, I have been asked to provide a letter in accordance with regulation 33 and schedule 1 of the Civil Legal Aid (Procedure) Regulations 2012 (as amended).

I can confirm that [your name], with whom [perpetrator] is or was in a family relationship, was refused admission to a refuge on [date].

I can confirm that [your name] sought admission to a refuge because of allegations of domestic abuse by [perpetrator].`,
  },
  p19: {
    title: 'A letter from your council or housing provider',
    para: 'Schedule 1, paragraph 19',
    who: 'A local authority or housing association that assessed you, for example when you made a homeless application.',
    musts: [
      'name the person who abused you',
      'confirm you are or were in a family relationship with them',
      'say you "were assessed as being, or at risk of being, a victim" – not "might be a victim"',
    ],
    template: `Name of perpetrator: [name]
Name of applicant: [your name]

I understand that [your name] wishes to access legal aid for a family dispute as a victim of domestic abuse. For this reason, I have been asked to provide a letter in accordance with regulation 33 and schedule 1 of the Civil Legal Aid (Procedure) Regulations 2012 (as amended).

Accordingly, I can confirm that [your name], a person with whom [perpetrator] is or was in a family relationship, was assessed as being, or at risk of being, a victim of domestic abuse by [perpetrator].`,
  },
};

// Routes the solicitor usually obtains directly from official records.
export const OTHER_ROUTES = {
  police: { title: 'Police or criminal court records', text: 'For example a conviction, caution or ongoing criminal proceedings for a domestic abuse offence. Your solicitor can usually request these.' },
  court: { title: 'Family or civil court orders', text: 'For example a non-molestation order or other protective injunction. Give your solicitor a copy if you have one.' },
  marac: { title: 'A MARAC referral', text: 'If you were discussed at a multi-agency risk assessment conference (MARAC), your solicitor can ask for confirmation.' },
  social: { title: 'Social services', text: 'Social services can confirm their assessment. Your solicitor can advise on what to ask for.' },
  refugeAdmitted: { title: 'A refuge that gave you a place', text: 'A refuge manager can confirm your stay. Your solicitor can advise on the wording needed.' },
  financial: { title: 'Financial abuse evidence', text: 'If you were financially controlled, documents from your bank – for example credit card accounts, loan documents and statements – can be evidence.' },
  employer: { title: 'Your employer, or education or training provider', text: 'They can provide evidence of financial abuse, for example if your pay was controlled.' },
  benefits: { title: 'Your benefits provider', text: 'The provider of benefits you have received can provide evidence of financial abuse.' },
};

export const QUESTIONS = [
  { value: 'p11', label: 'A doctor, nurse, midwife, health visitor or other health professional', hint: 'About injuries or a condition caused by the abuse' },
  { value: 'p14', label: 'An IDVA or ISVA', hint: 'Independent domestic or sexual violence adviser' },
  { value: 'p17', label: 'A domestic abuse support service', hint: 'For example a helpline, outreach worker or local charity' },
  { value: 'p18', label: 'A refuge that could not give me a place' },
  { value: 'refugeAdmitted', label: 'A refuge that gave me a place' },
  { value: 'p19', label: 'My council or a housing association', hint: 'For example a homeless application' },
  { value: 'police', label: 'The police' },
  { value: 'court', label: 'A court', hint: 'For example a non-molestation order' },
  { value: 'social', label: 'Social services' },
  { value: 'marac', label: 'A MARAC meeting', hint: 'You may not know if this happened – that is fine' },
  { value: 'financial', label: 'My bank', hint: 'If someone controlled your money or took out debt in your name' },
  { value: 'employer', label: 'My employer, or an education or training provider' },
  { value: 'benefits', label: 'A benefits provider' },
];

export function requestNote(key) {
  const r = ROUTES[key];
  return `Dear [name],

I am applying for legal aid for a family matter. To qualify, I need a letter from you as evidence for the Legal Aid Agency (${r.para}, Civil Legal Aid (Procedure) Regulations 2012).

The Agency often returns letters that use slightly different wording, so please could the letter:
${r.musts.map((m) => `- ${m}`).join('\n')}
- be signed, dated and on your organisation's letterhead

Suggested wording:

${r.template}

Thank you.`;
}
