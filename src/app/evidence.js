// What each kind of evidence in Schedule 1 of the Civil Legal Aid (Procedure)
// Regulations 2012 must show, and who to ask for it. Requirements follow the
// "Required information" checklists in the LAA guidance, version 15 (June 2026).
//
// Letter routes reuse the wording in routes.js. Each entry has:
//   para      – the Schedule 1 paragraph
//   title     – plain-English name
//   who       – who to ask
//   musts     – what the evidence must show
//   ask       – 'letter' (ask a professional to write), 'records' (ask for a
//               copy of official records), or 'hold' (you probably have it)
//   template  – suggested wording for a letter route
//   checkType – letter type in rules.js / builder.js, if there is one

import { ROUTES } from './routes.js';

const LETTER_INTRO = 'I understand that [your name] wishes to access legal aid for a family dispute as a victim of domestic abuse. For this reason, I have been asked to provide a letter in accordance with regulation 33 and schedule 1 of the Civil Legal Aid (Procedure) Regulations 2012 (as amended).';

const fromRoute = (key, para, extra = {}) => ({
  para,
  title: ROUTES[key].title,
  who: ROUTES[key].who,
  musts: ROUTES[key].musts,
  template: ROUTES[key].template,
  ask: 'letter',
  checkType: key,
  ...extra,
});

// What the police or a court did. Each is its own paragraph, but the request
// is the same: confirmation from official records.
export const POLICE_EVENTS = {
  arrested: { para: 'Schedule 1, paragraph 1', label: 'was arrested', record: 'that they were arrested for a domestic abuse offence, and the offence' },
  cautioned: { para: 'Schedule 1, paragraph 2', label: 'was given a police caution', record: 'that they were cautioned for a domestic abuse offence, and the offence' },
  charged: { para: 'Schedule 1, paragraph 3', label: 'was charged, and the court case has not finished', record: 'that they have been charged with a domestic abuse offence, and the offence' },
  convicted: { para: 'Schedule 1, paragraph 4', label: 'was convicted', record: 'that they were convicted of a domestic abuse offence, and the offence' },
  boundOver: { para: 'Schedule 1, paragraph 5', label: 'was bound over by a court', record: 'that they were bound over in connection with a domestic abuse offence, and the offence' },
  notice: { para: 'Schedule 1, paragraphs 6 and 6A', label: 'was given a domestic violence protection notice (DVPN) or domestic abuse protection notice (DAPN)', record: 'that a DVPN or DAPN was given to them, and the date' },
};

export const COURT_EVENTS = {
  injunction: { para: 'Schedule 1, paragraph 7', label: 'a protective order or injunction', record: 'the protective order or injunction, for example a non-molestation order' },
  undertaking: { para: 'Schedule 1, paragraph 8', label: 'an undertaking', record: 'the undertaking they gave to the court' },
  finding: { para: 'Schedule 1, paragraph 9', label: 'a finding of fact', record: 'the judgment or order recording the finding of fact that there was domestic abuse' },
  expert: { para: 'Schedule 1, paragraph 10', label: 'an expert report', record: 'the expert report produced for the court or tribunal' },
};

export const EVIDENCE = {
  police: {
    para: 'Schedule 1, paragraphs 1 to 6A',
    title: 'Confirmation from the police',
    who: 'The police force that dealt with it. Below, we can find the force from your postcode and add their address for these requests.',
    musts: [
      'name the person who abused you',
      'name you, or a family member of theirs, as the victim',
      'say what the police did, for example that they were arrested or cautioned',
      'say it was for a domestic abuse offence, and which offence',
      'be in writing from the police, the Crown Prosecution Service or a Witness Care Unit, or from a police email address',
    ],
    ask: 'records',
    solicitorCanGet: true,
  },
  court: {
    para: 'Schedule 1, paragraphs 7 to 10',
    title: 'A copy of the court document',
    who: 'The court that dealt with it. If you were given a copy at the time, you can use that.',
    musts: [
      'name the person who abused you',
      'name you, or a family member of theirs, as the person the order protects or the finding is about',
      'be the court document itself, for example the sealed order or judgment',
    ],
    ask: 'records',
    solicitorCanGet: true,
  },
  p11: fromRoute('p11', 'Schedule 1, paragraph 11'),
  p12: {
    para: 'Schedule 1, paragraph 12',
    title: 'Confirmation that a health professional referred you to a support service',
    who: 'The health professional who referred you, the support service they referred you to, or another health professional who can see your medical records.',
    musts: [
      'say a health professional referred you, and give their profession',
      'name the domestic abuse support service you were referred to',
      'confirm the service gives specialist support to victims of domestic abuse',
      'name you',
    ],
    template: `Name of applicant: [your name]

${LETTER_INTRO}

I can confirm that [your name] was referred by [name and profession of the health professional] to [name of the service] on [date].

[Name of the service] provides specialist support and assistance for victims of, or those at risk of, domestic abuse.`,
    ask: 'letter',
  },
  marac: fromRoute('marac', 'Schedule 1, paragraph 13'),
  p14: fromRoute('p14', 'Schedule 1, paragraph 14'),
  p15: {
    para: 'Schedule 1, paragraph 15',
    title: 'A letter from an ISVA',
    who: 'An Independent Sexual Violence Adviser (ISVA) who is supporting you or has supported you.',
    musts: [
      'say they are an ISVA',
      'say "I am providing" or "I have provided" you with support – not "we provided"',
      'say the support relates to sexual violence by the person who abused you, and name them',
    ],
    template: `Name of perpetrator: [perpetrator]
Name of applicant: [your name]

${LETTER_INTRO}

I am an Independent Sexual Violence Adviser (ISVA).

I can confirm that I [am providing / have provided] [your name] with support relating to sexual violence by [perpetrator].`,
    ask: 'letter',
  },
  p17: fromRoute('p17', 'Schedule 1, paragraph 17'),
  refugeStay: fromRoute('refugeStay', 'Schedule 1, paragraph 17'),
  p18: fromRoute('p18', 'Schedule 1, paragraph 18'),
  p19: fromRoute('p19', 'Schedule 1, paragraphs 16 and 19'),
  social: fromRoute('social', 'Schedule 1, paragraph 19'),
  p20: {
    para: 'Schedule 1, paragraph 20',
    title: 'Your Home Office letter',
    who: 'You should already have this. If you have lost it, you can ask UK Visas and Immigration for a copy of your records.',
    musts: [
      'be from the Home Office',
      'name you',
      'say you were given leave to enter or leave to remain in the UK as a victim of domestic abuse',
    ],
    ask: 'hold',
  },
  financial: fromRoute('financial', 'Schedule 1, paragraph 21'),
};

// Whether the request needs the name of the person who abused you.
export const needsOtherParty = (key) => key === 'police' || key === 'court'
  || /\[perpetrator\]|perpetrator: \[name\]/.test(EVIDENCE[key].template || '');
