// Generates a synthetic dataset of 1,000 legal aid evidence submissions for
// private family law matters: 500 that meet the Legal Aid Agency's evidence
// requirements and 500 that do not, each failing one named requirement.
//
// Written from "LASPO 2012 – Evidence Requirements for Private Family Law
// Matters" (guidance version 15, 15 June 2026) and modelled on the accepted and
// rejected letters in the hackathon pack (src/app/samples.js). Every person,
// organisation and place is fictional. Labels follow the guidance as written,
// not real LAA decisions.
//
//   node scripts/generate-dataset.mjs [--seed 2026] [--out data]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join as pathJoin } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((a) => a.trim().split(/\s+/)));
const SEED = Number(args.seed ?? 2026);
const OUT = args.out ?? 'data';
const TOTAL_PER_CLASS = 500;

// ---------------------------------------------------------------- randomness
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const maybe = (p) => rand() < p;
function pickN(xs, n) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}
function shuffle(xs) { return pickN(xs, xs.length); }

// ---------------------------------------------------------------- people and places
const FEMALE = ['Amira', 'Bethany', 'Chloe', 'Danielle', 'Ebony', 'Farah', 'Grace', 'Hannah', 'Imani', 'Jasmine', 'Kirsty', 'Leanne', 'Maria', 'Nadia', 'Olivia', 'Priya', 'Rachel', 'Sadia', 'Tanya', 'Una', 'Veronica', 'Wiktoria', 'Yasmin', 'Zara', 'Aisha', 'Bronwen', 'Ceri', 'Siobhan', 'Agnieszka', 'Fatima', 'Kelly', 'Natalie', 'Rhiannon', 'Shanice', 'Lucy', 'Mei', 'Ioana', 'Roxanne', 'Emma', 'Gemma'];
const MALE = ['Aaron', 'Ben', 'Callum', 'Daniel', 'Ethan', 'Faisal', 'Gareth', 'Harvey', 'Imran', 'Jamal', 'Kieran', 'Liam', 'Marcus', 'Nathan', 'Owen', 'Piotr', 'Rhys', 'Sanjay', 'Tom', 'Wayne', 'Adeel', 'Connor', 'Dylan', 'Kwame', 'Luca', 'Mohammed', 'Ryan', 'Stuart', 'Tariq', 'Victor'];
const NEUTRAL = ['Alex', 'Charlie', 'Jordan', 'Robin', 'Sam', 'Jamie', 'Rowan', 'Kai'];
const SURNAMES = ['Ahmed', 'Bailey', 'Begum', 'Clarke', 'Davies', 'Evans', 'Fletcher', 'Green', 'Hughes', 'Iqbal', 'Jones', 'Khan', 'Lewis', 'Morgan', 'Nowak', 'Okafor', 'Patel', 'Quinn', 'Roberts', 'Singh', 'Thomas', 'Usman', 'Walsh', 'Williams', 'Young', 'Mensah', 'Kowalski', 'Hussain', 'Murphy', "O'Brien", 'Campbell', 'Shah', 'Taylor', 'Wright', 'Price', 'Rahman', 'Adeyemi', 'Popescu', 'Chen', 'Doyle', 'Ellis', 'Fraser', 'Grant', 'Holt', 'Jenkins', 'Kaur', 'Lowe', 'Marsh', 'Nash', 'Owusu'];
const PLACES = ['Ashvale', 'Brookmere', 'Calderwick', 'Dunmoor', 'Eastholme', 'Fernleigh', 'Glenthorpe', 'Harrowmere', 'Kestonbury', 'Lowerby', 'Millbrook', 'Netherford', 'Oakhurst', 'Pellingham', 'Queensmere', 'Ravensby', 'Stanmoor', 'Thornvale', 'Upperton', 'Westcombe', 'Exampleshire'];
const COUNTRIES = [['Poland', 'Polish'], ['Romania', 'Romanian'], ['Pakistan', 'Urdu'], ['Nigeria', null], ['Ireland', null], ['Spain', 'Spanish'], ['India', null], ['Portugal', 'Portuguese']];

const PRONOUNS = {
  f: { sub: 'she', obj: 'her', pos: 'her', is: 'is', was: 'was', has: 'has', title: ['Ms', 'Mrs', 'Miss'] },
  m: { sub: 'he', obj: 'him', pos: 'his', is: 'is', was: 'was', has: 'has', title: ['Mr'] },
  n: { sub: 'they', obj: 'them', pos: 'their', is: 'are', was: 'were', has: 'have', title: ['Mx'] },
};
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function person(g) {
  const first = pick(g === 'f' ? FEMALE : g === 'm' ? MALE : NEUTRAL);
  const last = pick(SURNAMES);
  const p = PRONOUNS[g];
  return { first, last, full: `${first} ${last}`, formal: `${pick(p.title)} ${last}`, g, ...p };
}

// The applicant (A) and the other party (B). Most applicants in the pack are
// women abused by men, but not all.
function parties() {
  const r = rand();
  const ag = r < 0.72 ? 'f' : r < 0.94 ? 'm' : 'n';
  const bg = ag === 'f' ? (maybe(0.93) ? 'm' : 'f') : ag === 'm' ? (maybe(0.85) ? 'f' : 'm') : pick(['f', 'm']);
  const A = person(ag);
  let B = person(bg);
  while (B.last === A.last && maybe(0.6)) B = person(bg);
  // relB is what B is to A ("her former husband"); relA is what A is to B.
  const rel = pick(['former partner', 'ex-partner', 'spouse', 'former spouse', 'civil partner', 'former civil partner', 'former cohabitant', 'partner', 'former fiancé']);
  return { A, B, relB: relFor(rel, bg), relA: relFor(rel, ag) };
}
function relFor(rel, g) {
  if (g === 'f') return rel.replace('spouse', 'wife').replace('fiancé', 'fiancée');
  if (g === 'm') return rel.replace('spouse', 'husband');
  return rel.replace('fiancé', 'partner');
}

// ---------------------------------------------------------------- dates
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ord = (d) => d + ([, 'st', 'nd', 'rd'][d % 100 >> 3 ^ 1 && d % 10] || 'th');
function fmt(d, style = pick(['ord', 'plain', 'plain', 'slash'])) {
  const day = d.getUTCDate(), m = d.getUTCMonth(), y = d.getUTCFullYear();
  if (style === 'slash') return `${String(day).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`;
  return `${style === 'ord' ? ord(day) : day} ${MONTHS[m]} ${y}`;
}
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const START = Date.UTC(2025, 9, 1), END = Date.UTC(2026, 8, 30);
const randDate = () => new Date(START + Math.floor(rand() * (END - START) / 86400000) * 86400000);

// ---------------------------------------------------------------- shared wording
const intro = (c, abuse = 'domestic abuse') => pick([
  `I understand that ${c.A.full} wishes to access legal aid for a family dispute as a victim of ${abuse}. For this reason, I have been asked to provide a letter in accordance with regulation 33 and schedule 1 of the Civil Legal Aid (Procedure) Regulations 2012 (as amended).`,
  `I understand ${c.A.full} wishes to apply for legal aid for a family dispute as a victim of ${abuse}. I have been asked to provide this letter in accordance with regulation 33 and Schedule 1 of the Civil Legal Aid (Procedure) Regulations 2012 (as amended).`,
  `I write at the request of ${c.A.full}, who wishes to access legal aid for a family matter as a victim of ${abuse}. This letter is provided in accordance with regulation 33 and Schedule 1 of the Civil Legal Aid (Procedure) Regulations 2012.`,
]);
const salutation = () => pick(['To whom it may concern', 'To whom it may concern,', 'Dear Sir or Madam,', 'Dear Sir/Madam']);
const signoff = () => pick(['Yours sincerely,', 'Yours faithfully,', 'Kind regards,', 'Yours sincerely']);
function header(c, { perp = true, applicant = true, date = true } = {}) {
  const lines = [];
  if (date && c.letterDate) lines.push(`Date: ${fmt(c.letterDate)}`);
  lines.push(salutation());
  if (perp) lines.push(`Name of perpetrator: ${c.B.full}`);
  if (applicant) lines.push(`Name of applicant: ${c.A.full}`);
  return lines;
}
const join = (...xs) => xs.flat().filter((x) => x !== null && x !== undefined && x !== '').join('\n');
const familyRel = (c) => pick([
  `${c.A.full}, with whom ${c.B.full} is or was in a family relationship,`,
  `${c.A.full}, a person with whom ${c.B.full} is or was in a family relationship,`,
  `${c.A.full}, who is or was in a family relationship with ${c.B.full},`,
  `${c.A.full}, ${c.B.full}'s ${c.relA},`,
]);

const DA_OFFENCES = [
  'assault occasioning actual bodily harm (section 47, Offences Against the Person Act 1861)',
  'common assault (section 39, Criminal Justice Act 1988)',
  'controlling or coercive behaviour in an intimate or family relationship (section 76, Serious Crime Act 2015)',
  'harassment (section 2, Protection from Harassment Act 1997)',
  'stalking (section 2A, Protection from Harassment Act 1997)',
  'putting people in fear of violence (section 4, Protection from Harassment Act 1997)',
  'threats to kill (section 16, Offences Against the Person Act 1861)',
  'intentional strangulation (section 75A, Serious Crime Act 2015)',
  'breach of a non-molestation order (section 42A, Family Law Act 1996)',
  'criminal damage (section 1, Criminal Damage Act 1971)',
  'false imprisonment',
  'sexual assault (section 3, Sexual Offences Act 2003)',
  'rape (section 1, Sexual Offences Act 2003)',
  'wounding with intent (section 18, Offences Against the Person Act 1861)',
];
const NON_DA_OFFENCES = ['driving with excess alcohol (section 5, Road Traffic Act 1988)', 'theft from a shop', 'possession of a class B drug', 'driving while disqualified', 'fraud by false representation against an employer', 'failing to provide a specimen for analysis', 'handling stolen goods', 'speeding'];
const CHILD_OFFENCES = ['cruelty to a person under 16 (section 1, Children and Young Persons Act 1933)', 'sexual activity with a child (section 9, Sexual Offences Act 2003)', 'making indecent photographs of children (section 1, Protection of Children Act 1978)', 'causing or allowing a child to suffer serious physical harm (section 5, Domestic Violence, Crime and Victims Act 2004)', 'sexual assault of a child under 13 (section 7, Sexual Offences Act 2003)', 'child abduction (section 2, Child Abduction Act 1984)', 'assault occasioning actual bodily harm on a child'];

const police = (c) => `${c.place} Police`;
const pnn = (c, name) => `${name.first[0].toLowerCase()}${name.last.toLowerCase().replace(/[^a-z]/g, '')}@${c.place.toLowerCase()}.pnn.police.uk`;
const officer = () => person(pick(['f', 'm']));
const policeRank = () => pick(['PC', 'DC', 'DS', 'Sgt', 'PS']);
const court = (c) => pick([`Family Court at ${c.place}`, `${c.place} Magistrates' Court`, `${c.place} Crown Court`, `County Court at ${c.place}`]);

// ---------------------------------------------------------------- specific matters (para 16, 17)
const MATTERS = (c) => [
  `${c.A.first} disclosed repeated physical assaults by ${c.B.first}, including being pushed down the stairs in ${pick(MONTHS)} ${int(2023, 2026)}.`,
  `${c.A.first} told me ${c.B.first} would check ${c.A.pos} phone every day, read ${c.A.pos} messages and question ${c.A.obj} about who ${c.A.sub} had spoken to.`,
  `A DASH risk assessment completed on ${fmt(addDays(c.letterDate, -int(20, 200)), 'plain')} scored ${int(11, 22)}, indicating ${pick(['medium', 'high'])} risk.`,
  `${c.A.first} described ${c.B.first} controlling all of the household money and giving ${c.A.obj} a small weekly allowance that ${c.A.sub} had to account for.`,
  `${c.A.first} disclosed that ${c.B.first} threatened to kill ${c.A.obj} if ${c.A.sub} left, and on one occasion put his hands around ${c.A.pos} neck.`.replace('his hands', `${c.B.pos} hands`),
  `${c.A.first} reported that ${c.B.first} smashed household items during arguments, which was witnessed by their children.`,
  `${c.A.first} was isolated from friends and family; ${c.B.first} would become angry if ${c.A.sub} made plans without his permission.`.replace('his permission', `${c.B.pos} permission`),
  `${c.A.first} told me ${c.B.first} called ${c.A.obj} worthless, belittled ${c.A.obj} in front of the children and blamed ${c.A.obj} for the abuse.`,
  `Police attended the family home on ${fmt(addDays(c.letterDate, -int(30, 300)), 'plain')} following a 999 call and the incident was recorded as domestic abuse.`,
  `${c.A.first} disclosed sexual abuse, including ${c.B.first} pressuring ${c.A.obj} into sex when ${c.A.sub} had said no.`,
  `${c.A.first} fled the home with the children and was referred to us by ${pick(['the police', 'their GP', 'children\'s services', 'the local hospital'])}.`,
  `After separation ${c.B.first} turned up uninvited at ${c.A.pos} workplace and sent over ${int(30, 200)} messages in a week, some threatening.`,
  `${c.A.first} described being prevented from working and having ${c.A.pos} bank card taken from ${c.A.obj}.`,
  `${c.A.first} has visible bruising on ${c.A.pos} arms that ${c.A.sub} told us was caused by ${c.B.first} grabbing ${c.A.obj}.`,
  `${c.A.first}'s case was referred to the local MARAC because of the level of risk identified.`,
  `${c.A.first} described ${c.B.first} tracking ${c.A.pos} location using an app installed on ${c.A.pos} phone without consent.`,
];
const GENERIC_MATTERS = ['Victim testimony and referral.', 'Her account.', 'Client disclosure.', 'Information on our referral form.', 'Conversations with the client.', 'Self-referral and disclosure.', 'What we were told.', 'The referral and our records.'];
const SUPPORT = ['risk assessment', 'safety planning', 'emotional support', 'one-to-one outreach sessions', 'help to apply for a non-molestation order', 'advocacy with housing services', 'referral to a counselling service', 'support to report to the police', 'a place on our 12-week Freedom Programme', 'help registering with a GP', 'support at child protection meetings', 'target hardening of the home', 'help applying for emergency housing', 'welfare benefits advice', 'support attending court', 'helpline support', 'referral to a children\'s worker'];
const REASONS = (c) => [
  `${c.A.full} needed this support because ${c.A.sub} ${c.A.is} a victim of domestic abuse from ${c.A.pos} ${c.relB}.`,
  `${c.A.full} needed this support because ${c.A.sub} fled the family home in fear for ${c.A.pos} safety and that of the children.`,
  `${c.A.full} needed this support because of the high level of risk identified and the ongoing contact from ${c.B.first} after separation.`,
  `${c.A.full} needed this support because ${c.A.sub} ${c.A.was} identified as a victim of domestic abuse and needed help to stay safe.`,
  `${c.A.full} needed this support because ${c.A.sub} had been isolated by ${c.B.first} and had no other support network.`,
];


// ---------------------------------------------------------------- evidence types
// Each type has: schedule, para, title, ref (guidance paragraphs), appType (the
// key in src/app/rules.js, if any), weight, build(c, defect) and defects. A
// defect is { id, reason } and build() writes a letter that fails only that.
const TYPES = [];
const T = (t) => TYPES.push(t);

// Schedule 1 para 1 – arrest
T({
  schedule: 1, para: '1', title: 'Arrest for a relevant domestic abuse offence', ref: 'Guidance 2.8–2.13', weight: 18,
  defects: [
    { id: 'not-da-offence', reason: 'The arrest is not for a relevant domestic abuse offence on the published list (guidance 2.8).' },
    { id: 'no-arrest', reason: 'The police attended but no arrest was made. A report with no police action does not meet the requirement (guidance 2.8, 2.15).' },
    { id: 'nfa', reason: 'B was released with no further action and is no longer under investigation or charged at the point of submission (guidance 2.8, 2.10).' },
    { id: 'wrong-person', reason: 'The person arrested is not the other party to the proceedings (B) (guidance 2.8).' },
    { id: 'provider-email-incomplete', reason: 'The provider\'s email does not give the police station or the name of the officer spoken to (guidance checklist, para 1).' },
  ],
  build(c, d) {
    const off = officer();
    const offence = d === 'not-da-offence' ? pick(NON_DA_OFFENCES) : pick(DA_OFFENCES);
    const arrested = d === 'wrong-person' ? `${pick(MALE)} ${c.B.last} (${c.B.first} ${c.B.last}'s ${pick(['brother', 'cousin', 'friend'])})` : c.B.full;
    const when = fmt(addDays(c.letterDate, -int(5, 120)));
    const station = `${pick(PLACES)} Police Station`;
    let status = pick([`${c.B.first} has been released on bail with conditions not to contact ${c.A.full} while the investigation continues.`, `${c.B.first} remains under investigation.`, `${c.B.first} has been released on police bail pending further enquiries.`]);
    if (d === 'wrong-person') status = 'He has been released on bail pending further enquiries.';
    if (d === 'nfa') status = `Following review, ${c.B.first} was released with no further action and no charge will be brought.`;
    const style = d === 'provider-email-incomplete' ? 'provider' : pick(['police', 'police', 'provider', 'bail']);
    if (d === 'no-arrest') {
      return join(`From: ${policeRank()} ${off.full} <${pnn(c, off)}>`, `Subject: Incident reference ${c.ref}`, salutation(),
        `I can confirm that officers from ${police(c)} attended an address in ${c.place} on ${when} following a call from ${c.A.full} about ${c.A.pos} ${c.relB}, ${c.B.full}.`,
        `Words of advice were given to both parties. No arrest was made and no further police action was taken.`, signoff(), `${policeRank()} ${off.full}`, police(c));
    }
    if (style === 'provider') {
      const sol = person(pick(['f', 'm']));
      const spoke = d === 'provider-email-incomplete'
        ? `I have spoken to the police, who confirmed that ${arrested} was arrested on ${when} for ${offence} against ${c.A.full}, ${c.B.first}'s ${c.relA}.`
        : `On ${fmt(addDays(c.letterDate, -1))} I spoke to ${policeRank()} ${off.full} at ${station}, who confirmed that ${arrested} was arrested on ${when} for ${offence} against ${c.A.full}, ${c.B.first}'s ${c.relA}.`;
      return join(`From: ${sol.full} <${sol.first.toLowerCase()}.${sol.last.toLowerCase().replace(/[^a-z]/g, '')}@${c.place.toLowerCase()}familylaw.co.uk>`, `Subject: ${c.A.full} – evidence of arrest (Schedule 1, paragraph 1)`, `Date: ${fmt(c.letterDate)}`,
        spoke, status, `${sol.full}`, 'Solicitor', `${c.place} Family Law LLP`);
    }
    if (style === 'bail') {
      return join(`${police(c).toUpperCase()} – PRE-CHARGE BAIL NOTICE`, `Custody reference: ${c.ref}`, `Person arrested: ${arrested}`, `Date of arrest: ${when}`, `Offence: ${offence}`,
        `Victim: ${c.A.full} (${c.relA} of the person arrested)`, `Bail conditions: not to contact ${c.A.full} directly or indirectly; not to attend ${pick(['Elm Road', 'Station Street', 'Mill Lane', 'Church Close'])}, ${c.place}.`,
        d === 'nfa' ? status : `Return date: ${fmt(addDays(c.letterDate, int(14, 60)))}`, `Custody officer: ${policeRank()} ${off.full}`);
    }
    return join(`From: ${policeRank()} ${off.full} <${pnn(c, off)}>`, `Subject: ${c.A.full} – confirmation of arrest`, salutation(),
      `I can confirm that ${arrested} was arrested on ${when} for ${offence}. The victim is ${c.A.full}, ${c.B.first}'s ${c.relA}.`, status, signoff(), `${policeRank()} ${off.full}`, `${police(c)}, ${station}`);
  },
});

// Schedule 1 para 2 – caution
T({
  schedule: 1, para: '2', title: 'Relevant police caution for a domestic abuse offence', ref: 'Guidance 2.14–2.17', weight: 14,
  defects: [
    { id: 'no-action', reason: 'This is a police record of a complaint where the police took no action. It is not a caution (guidance 2.15).' },
    { id: 'not-da-offence', reason: 'The caution is not for a relevant domestic abuse offence (guidance 2.15).' },
    { id: 'applicant-cautioned', reason: 'The person cautioned is the applicant, not the other party (B) (guidance 2.14).' },
  ],
  build(c, d) {
    const off = officer();
    const when = fmt(addDays(c.letterDate, -int(20, 600)));
    if (d === 'no-action') {
      return join(`${police(c)} – Incident record`, `Reference: ${c.ref}`, `Date: ${when}`, `Caller: ${c.A.full}`,
        `Details: Caller reported that ${c.A.pos} ${c.relB}, ${c.B.full}, had been shouting at ${c.A.obj} and sending abusive messages. Officers spoke to both parties by telephone.`,
        `Outcome: No offences disclosed. No further action.`, `Officer: ${policeRank()} ${off.full}`);
    }
    const who = d === 'applicant-cautioned' ? c.A.full : c.B.full;
    const victim = d === 'applicant-cautioned' ? c.B.full : c.A.full;
    const offence = d === 'not-da-offence' ? pick(NON_DA_OFFENCES) : pick(DA_OFFENCES.slice(0, 10));
    return pick([
      () => join(`${police(c).toUpperCase()} – SIMPLE CAUTION`, `Name of person cautioned: ${who}`, `Date of caution: ${when}`, `Offence: ${offence}`,
        d === 'not-da-offence' ? null : `Victim: ${victim}`, `Administered by: ${policeRank()} ${off.full}`,
        `I admit the offence above and I accept this caution.`, `Signed: ${who}`),
      () => join(`From: ${policeRank()} ${off.full} <${pnn(c, off)}>`, salutation(),
        `I can confirm that ${who} received a simple caution on ${when} for ${offence}${d === 'not-da-offence' ? '' : ` against ${victim}, with whom ${who.split(' ')[0]} was in an intimate relationship`}.`,
        signoff(), `${policeRank()} ${off.full}`, police(c)),
    ])();
  },
});

// Schedule 1 para 3 – ongoing criminal proceedings
T({
  schedule: 1, para: '3', title: 'Relevant ongoing criminal proceedings for a domestic abuse offence', ref: 'Guidance 2.18–2.25', weight: 14,
  defects: [
    { id: 'concluded-acquittal', reason: 'The proceedings have concluded without a conviction, so they are not ongoing (guidance 2.18–2.22).' },
    { id: 'discontinued', reason: 'The CPS discontinued the case, so there are no ongoing proceedings (guidance 2.19).' },
    { id: 'not-da-offence', reason: 'The charge is not a relevant domestic abuse offence (guidance 2.20).' },
  ],
  build(c, d) {
    const offence = d === 'not-da-offence' ? pick(NON_DA_OFFENCES) : pick(DA_OFFENCES);
    const charged = fmt(addDays(c.letterDate, -int(20, 200)));
    const hearing = fmt(addDays(c.letterDate, int(10, 150)));
    const wcu = person(pick(['f', 'm']));
    let status = `The case is listed for ${pick(['trial', 'a plea and trial preparation hearing', 'a first hearing'])} at ${c.place} ${pick(['Magistrates\' Court', 'Crown Court'])} on ${hearing}.`;
    if (d === 'concluded-acquittal') status = `The case was heard at ${c.place} Magistrates' Court on ${fmt(addDays(c.letterDate, -int(3, 30)))} and ${c.B.first} was found not guilty.`;
    if (d === 'discontinued') status = `On ${fmt(addDays(c.letterDate, -int(3, 30)))} the Crown Prosecution Service discontinued the case and no further proceedings will take place.`;
    return join(`${c.place} Witness Care Unit`, `Date: ${fmt(c.letterDate)}`, `Dear ${c.A.formal},`, `Re: R v ${c.B.full}`,
      `I am writing to confirm that ${c.B.full} was charged on ${charged} with ${offence}${d === 'not-da-offence' ? '.' : `, in which you, ${c.B.first}'s ${c.relA}, are named as the victim.`}`,
      status, signoff(), wcu.full, 'Witness Care Officer');
  },
});

// Schedule 1 para 4 – conviction
T({
  schedule: 1, para: '4', title: 'Relevant conviction for a domestic abuse offence', ref: 'Guidance 2.26–2.30', weight: 18,
  defects: [
    { id: 'not-da-offence', reason: 'The conviction is not for a relevant domestic abuse offence (guidance 2.27).' },
    { id: 'wrong-person', reason: 'The person convicted is not the other party to the proceedings (B) (guidance 2.26).' },
    { id: 'acquitted', reason: 'The document records an acquittal, not a conviction (guidance 2.26).' },
  ],
  build(c, d) {
    const offence = d === 'not-da-offence' ? pick(NON_DA_OFFENCES) : pick(DA_OFFENCES);
    const date = fmt(addDays(c.letterDate, -int(30, 1500)));
    const defendant = d === 'wrong-person' ? `${pick(MALE)} ${pick(SURNAMES)}` : c.B.full;
    const victimLine = d === 'not-da-offence' ? null : `Victim: ${d === 'wrong-person' ? `${pick(FEMALE)} ${pick(SURNAMES)} (a neighbour)` : `${c.A.full} (${c.B.first}'s ${c.relA})`}`;
    const outcome = d === 'acquitted' ? 'Plea: Not guilty. Verdict: Not guilty – defendant discharged.' : `Plea: ${pick(['Guilty', 'Not guilty – convicted after trial'])}. Sentence: ${pick(['12 month community order with a 30-day rehabilitation activity requirement', '18 weeks\' imprisonment suspended for 12 months', 'Restraining order for 2 years and a fine of £400', '14 months\' imprisonment'])}.`;
    return pick([
      () => join(`MEMORANDUM OF ENTRY IN THE REGISTER`, `${c.place} Magistrates' Court`, `Defendant: ${defendant}`, `Date of hearing: ${date}`, `Offence: ${offence}`, victimLine, outcome, `Legal Adviser: ${person(pick(['f', 'm'])).full}`),
      () => join(`CERTIFICATE OF CONVICTION`, `In the Crown Court at ${c.place}`, `R v ${defendant}`, `On ${date} the defendant was ${d === 'acquitted' ? 'acquitted' : 'convicted'} of ${offence}.`, victimLine, d === 'acquitted' ? null : outcome.replace(/^Plea: [^.]*\. /, ''), `Signed: Court Clerk`),
    ])();
  },
});

// Schedule 1 para 5 – bind over
T({
  schedule: 1, para: '5', title: 'Bind over connected with a domestic abuse offence', ref: 'Guidance 2.31–2.33', weight: 8,
  defects: [
    { id: 'not-da-offence', reason: 'The bind over is not connected with a relevant domestic abuse offence or a family member (guidance 2.31, 2.33).' },
    { id: 'applicant-bound', reason: 'The person bound over is the applicant, not the other party (B) (guidance 2.31).' },
  ],
  build(c, d) {
    const who = d === 'applicant-bound' ? c.A : c.B;
    const other = d === 'applicant-bound' ? c.B : c.A;
    const date = fmt(addDays(c.letterDate, -int(30, 400)));
    const related = d === 'not-da-offence'
      ? `in connection with a public order incident outside a football ground involving a member of the public`
      : `in connection with a charge of ${pick(DA_OFFENCES.slice(0, 7))} against ${other.full}, ${who.first}'s ${who === c.A ? c.relB : c.relA}, which the prosecution did not proceed with`;
    return join(`${c.place} Magistrates' Court`, `Order binding over`, `Date: ${date}`,
      `${who.full} was bound over in the sum of £${pick([200, 250, 500])} for ${pick([6, 12, 18])} months to keep the peace and be of good behaviour ${related}.`,
      `Legal Adviser: ${person(pick(['f', 'm'])).full}`);
  },
});

// Schedule 1 para 6 – DVPN
T({
  schedule: 1, para: '6', title: 'Domestic violence protection notice', ref: 'Guidance 2.34', weight: 10,
  defects: [
    { id: 'not-issued', reason: 'The police considered a DVPN but did not issue one (guidance 2.34).' },
    { id: 'no-protected-party', reason: 'The document does not name the protected party (guidance checklist, para 6).' },
  ],
  build(c, d) {
    const off = officer();
    const when = fmt(addDays(c.letterDate, -int(3, 200)));
    if (d === 'not-issued') {
      return join(`From: ${policeRank()} ${off.full} <${pnn(c, off)}>`, salutation(),
        `Officers attended following a report by ${c.A.full} on ${when}. A domestic violence protection notice against ${c.B.full} was considered but was not authorised, as ${c.B.first} had already moved out of the address.`,
        signoff(), `${policeRank()} ${off.full}`, police(c));
    }
    return join(`From: ${policeRank()} ${off.full} <${pnn(c, off)}>`, salutation(),
      `I can confirm that a domestic violence protection notice under section 24 of the Crime and Security Act 2010 was issued to and served on ${c.B.full} on ${when}${d === 'no-protected-party' ? '.' : `, for the protection of ${c.A.full}, ${c.B.first}'s ${c.relA}.`}`,
      `The notice prohibits ${c.B.first} from ${pick(['entering the family home', 'contacting the protected person', 'coming within 100 metres of the family home'])}.`, signoff(), `${policeRank()} ${off.full}`, police(c));
  },
});

// Schedule 1 para 6A – DAPN (pilot areas only)
const DAPN_FORCES = ['Greater Manchester Police', 'the Metropolitan Police (London Borough of Croydon)', 'the Metropolitan Police (London Borough of Bromley)', 'the Metropolitan Police (London Borough of Sutton)', 'Cleveland Police', 'North Wales Police', 'British Transport Police (Greater Manchester)'];
T({
  schedule: 1, para: '6A', title: 'Domestic abuse protection notice', ref: 'Guidance 2.35–2.37', weight: 8,
  defects: [
    { id: 'outside-pilot', reason: 'DAPNs are only given by police forces in the pilot areas; this notice is said to come from a force outside them (guidance 2.36).' },
    { id: 'no-respondent', reason: 'The document does not name the person against whom the DAPN was made (guidance checklist, para 6A).' },
  ],
  build(c, d) {
    const off = officer();
    const force = d === 'outside-pilot' ? police(c) : pick(DAPN_FORCES);
    const PILOT = Date.UTC(2024, 10, 27);
    const when = fmt(new Date(Math.max(PILOT + 86400000 * int(0, 30), addDays(c.letterDate, -int(3, 250)).getTime())));
    return join(salutation(),
      `I can confirm that on ${when} ${force} gave a domestic abuse protection notice under section 22 of the Domestic Abuse Act 2021${d === 'no-respondent' ? '' : ` to ${c.B.full}`}.`,
      `The notice protects ${c.A.full}, ${d === 'no-respondent' ? 'who was in an intimate relationship with the person given the notice' : `${c.B.first}'s ${c.relA}`}, and prohibits ${d === 'no-respondent' ? 'that person' : c.B.first} from being abusive towards ${c.A.obj} or contacting ${c.A.obj}.`,
      signoff(), `${policeRank()} ${off.full}`, cap(force.replace(/ \(.*\)/, '')));
  },
});

// Schedule 1 para 7 – protective injunction
T({
  schedule: 1, para: '7', title: 'Relevant protective injunction', ref: 'Guidance 2.38–2.42', weight: 22,
  defects: [
    { id: 'application-only', reason: 'An application has been made but no order has been granted yet. The order must be obtained before it can be relied on (guidance 2.40).' },
    { id: 'not-family', reason: 'The injunction is against a neighbour, not someone in a family relationship with the protected person (guidance 2.39).' },
    { id: 'set-aside', reason: 'The without-notice order was set aside by the court (guidance 2.41).' },
  ],
  build(c, d) {
    const order = pick(['non-molestation order under section 42 of the Family Law Act 1996', 'occupation order under section 33 of the Family Law Act 1996', 'forced marriage protection order under section 63A of the Family Law Act 1996', 'restraining order under section 360 of the Sentencing Act 2020', 'domestic abuse protection order under section 32 of the Domestic Abuse Act 2021']);
    const made = fmt(addDays(c.letterDate, -int(5, 900)));
    const caseNo = `${c.place.slice(0, 2).toUpperCase()}${int(10, 26)}F${int(10000, 99999)}`;
    const respondent = d === 'not-family' ? `${pick(MALE)} ${pick(SURNAMES)}` : c.B.full;
    if (d === 'application-only') {
      return join(`In the Family Court at ${c.place}`, `Case number: ${caseNo}`, `Notice of hearing`,
        `The application by ${c.A.full} (applicant) for a ${order} against ${c.B.full} (respondent) will be heard on ${fmt(addDays(c.letterDate, int(7, 40)))}.`,
        `No order has yet been made.`);
    }
    return join(`In the Family Court at ${c.place}`, `Case number: ${caseNo}`, `Applicant: ${c.A.full}`, `Respondent: ${respondent}`,
      d === 'not-family' ? `The respondent is the applicant's neighbour and is not related to the applicant.` : `The applicant and respondent ${pick(['were married', 'lived together as a couple', 'are the parents of a child', 'were in an intimate relationship for six years'])}.`,
      `On ${made} the court made a ${order}${maybe(0.4) ? ' without notice to the respondent' : ''}.`,
      `The respondent ${respondent} must not use or threaten violence against the applicant, and must not intimidate, harass or pester the applicant${maybe(0.5) ? ', or contact the applicant by any means' : ''}.`,
      d === 'set-aside' ? `At the return hearing on ${fmt(addDays(c.letterDate, -int(1, 4)))} the order made without notice was set aside.` : `This order lasts until ${fmt(addDays(c.letterDate, int(60, 365)))} unless varied or discharged.`,
      `District Judge ${pick(SURNAMES)}`);
  },
});

// Schedule 1 para 8 – undertaking
T({
  schedule: 1, para: '8', title: 'Undertaking under section 46 or 63E Family Law Act 1996', ref: 'Guidance 2.43–2.44', weight: 9,
  defects: [
    { id: 'cross-undertaking', reason: 'The applicant also gave a cross-undertaking relating to domestic abuse (guidance 2.44).' },
    { id: 'wrong-act', reason: 'The undertaking was given in civil debt proceedings, not under section 46 or 63E of the Family Law Act 1996 (guidance 2.43).' },
  ],
  build(c, d) {
    const when = fmt(addDays(c.letterDate, -int(10, 500)));
    const section = d === 'wrong-act' ? 'in county court proceedings for recovery of a loan' : `under section ${pick(['46', '46', '63E'])} of the Family Law Act 1996`;
    const promises = d === 'wrong-act' ? `to repay £${int(2, 9)},000 to the claimant by monthly instalments` : `not to use or threaten violence against ${c.A.full}, and not to contact ${c.A.obj} directly or indirectly except through solicitors`;
    return join(`General Form of Undertaking (N117)`, `In the ${d === 'wrong-act' ? 'County Court' : 'Family Court'} at ${c.place}`, `Date: ${when}`,
      `${c.B.full} gave an undertaking to the court ${section} promising ${promises}.`,
      d === 'wrong-act' ? `The claimant is ${c.A.full}.` : `${c.A.full} is ${c.B.first}'s ${c.relA}.`,
      d === 'cross-undertaking' ? `${c.A.full} gave a cross-undertaking not to use or threaten violence against ${c.B.full} and not to harass ${c.B.obj}.` : (maybe(0.3) ? `${c.A.full} gave a cross-undertaking about the children's schooling arrangements only.` : null),
      `District Judge ${pick(SURNAMES)}`);
  },
});

// Schedule 1 para 9 – finding of fact
T({
  schedule: 1, para: '9', title: 'Finding of fact of domestic abuse', ref: 'Guidance 2.45–2.48', weight: 13,
  defects: [
    { id: 'divorce-petition', reason: 'Allegations in an undefended divorce petition are not a finding of fact (guidance 2.48).' },
    { id: 'not-proven', reason: 'The court found the allegations not proven, so there is no finding of domestic abuse by B (guidance 2.47).' },
    { id: 'hearing-pending', reason: 'A fact-finding hearing has been listed but no finding has been made (guidance 2.47).' },
  ],
  build(c, d) {
    const when = fmt(addDays(c.letterDate, -int(20, 1200)));
    const caseNo = `${c.place.slice(0, 2).toUpperCase()}${int(10, 26)}P${int(10000, 99999)}`;
    if (d === 'divorce-petition') {
      return join(`Divorce application – statement of case`, `Applicant: ${c.A.full}`, `Respondent: ${c.B.full}`,
        `The applicant states that the respondent ${pick(['shouted at and belittled her', 'was controlling and verbally abusive', 'behaved aggressively during arguments'])}.`.replace('her', c.A.obj),
        `The respondent did not defend the application. A conditional order was made on ${when}.`);
    }
    if (d === 'hearing-pending') {
      return join(`In the Family Court at ${c.place}`, `Case number: ${caseNo}`, `Order`,
        `The court will hold a fact-finding hearing on ${fmt(addDays(c.letterDate, int(20, 120)))} to decide the allegations of domestic abuse made by ${c.A.full} against ${c.B.full}.`, `No findings have been made.`);
    }
    const findings = d === 'not-proven'
      ? `Having heard the evidence, the court finds that the allegations made by ${c.A.full} against ${c.B.full} are not proven on the balance of probabilities.`
      : `The court finds on the balance of probabilities that ${c.B.full} ${pickN([`assaulted ${c.A.full} on ${fmt(addDays(c.letterDate, -int(400, 1500)), 'plain')}`, `subjected ${c.A.full} to a pattern of coercive and controlling behaviour`, `damaged ${c.A.pos} property`, `threatened to take the children abroad to frighten ${c.A.obj}`, `sent ${c.A.obj} threatening messages after separation`], int(1, 3)).join(', and ')}.`;
    return join(`In the Family Court at ${c.place}`, `Case number: ${caseNo}`, `Fact-finding hearing – judgment`, `Date: ${when}`, `Applicant mother/father: ${c.A.full}`, `Respondent: ${c.B.full}`,
      `This hearing was held under Practice Direction 12J.`, findings, `${pick(['HHJ', 'District Judge', 'Recorder'])} ${pick(SURNAMES)}`);
  },
});

// Schedule 1 para 10 – expert report
T({
  schedule: 1, para: '10', title: 'Expert report produced as evidence for a court or tribunal', ref: 'Guidance 2.49–2.51', weight: 12,
  defects: [
    { id: 'not-for-court', reason: 'The report was written for private therapy, not as evidence in UK court or tribunal proceedings (guidance 2.49).' },
    { id: 'no-assessment', reason: 'The expert does not confirm that the person was assessed as being, or at risk of being, a victim of domestic abuse by B (guidance 2.49).' },
    { id: 'hedged', reason: 'The expert\'s conclusion is hedged ("may be") rather than confirming an assessment (guidance 2.49).' },
  ],
  build(c, d) {
    const exp = person(pick(['f', 'm']));
    const role = pick([['Family Court Adviser', 'Cafcass', 'section 7 report'], ['Consultant Clinical Psychologist', `${exp.last} Psychology Ltd`, 'psychological assessment'], ['Independent Social Worker', `${c.place} Independent Social Work`, 'parenting assessment'], ['Family Court Adviser', 'Cafcass Cymru', 'section 7 report']]);
    const quals = role[0] === 'Consultant Clinical Psychologist' ? 'DClinPsy, HCPC registered (PYL' + int(10000, 99999) + '), 15 years\' experience of family court assessments' : `qualified social worker, registered with Social Work England (SW${int(100000, 999999)}), ${int(5, 20)} years\' experience`;
    let conc = `In my professional opinion ${c.A.full} has been assessed as being a victim of domestic abuse by ${c.B.full}, and remains at risk of further abuse.`;
    if (d === 'no-assessment') conc = `I have not been asked to assess the allegations of domestic abuse and make no assessment of them. My recommendations concern the children's living arrangements only.`;
    if (d === 'hedged') conc = `${c.A.full} may be a victim of domestic abuse by ${c.B.full}, although I am unable to reach a view.`;
    const purpose = d === 'not-for-court' ? `This report was prepared at ${c.A.first}'s request for ${c.A.pos} private therapy and has not been filed in any proceedings.` : `This ${role[2]} was prepared for the Family Court at ${c.place} (case ${c.place.slice(0, 2).toUpperCase()}${int(10, 26)}P${int(10000, 99999)}) in proceedings between ${c.A.full} and ${c.B.full}.`;
    return join(`${role[2].toUpperCase()}`, `Author: ${exp.full}, ${role[0]}, ${role[1]}`, `Qualifications: ${quals}`, `Date: ${fmt(c.letterDate)}`, purpose,
      `Summary of findings`, `${c.A.first} and ${c.B.first} were ${pick(['married', 'in a relationship', 'cohabiting'])} for ${int(3, 15)} years and have ${pick(['one child', 'two children', 'three children'])}.`,
      `I interviewed both parents and reviewed police disclosure and school records.`, conc,
      `Declaration: I understand my duty to the court and have complied with it.`);
  },
});

// Schedule 1 para 11 – health professional
const HP = [
  { role: 'General Practitioner', org: (p) => `${p} Medical Practice`, reg: () => `GMC number: ${int(6000000, 7999999)}` },
  { role: 'Emergency Department Consultant', org: (p) => `${p} General Hospital`, reg: () => `GMC number: ${int(4000000, 7999999)}` },
  { role: 'Practice Nurse', org: (p) => `${p} Surgery`, reg: () => `NMC PIN: ${int(10, 99)}${pick(['A', 'B', 'C', 'E', 'H', 'J'])}${int(1000, 9999)}${pick(['E', 'S', 'W', 'N'])}` },
  { role: 'Health Visitor', org: (p) => `${p} Community Health Services`, reg: () => `NMC PIN: ${int(10, 99)}${pick(['A', 'B', 'I'])}${int(1000, 9999)}E` },
  { role: 'Community Midwife', org: (p) => `${p} Maternity Unit`, reg: () => `NMC PIN: ${int(10, 99)}${pick(['C', 'D'])}${int(1000, 9999)}E` },
  { role: 'Dentist', org: (p) => `${p} Dental Care`, reg: () => `GDC number: ${int(50000, 299999)}` },
  { role: 'Paramedic', org: (p) => `${p} Ambulance Service NHS Trust`, reg: () => `HCPC registration: PA${int(10000, 99999)}` },
  { role: 'Practitioner Psychologist', org: (p) => `${p} Psychological Therapies`, reg: () => `HCPC registration: PYL${int(10000, 99999)}` },
  { role: 'Mental Health Nurse', org: (p) => `${p} Community Mental Health Team`, reg: () => `NMC PIN: ${int(10, 99)}${pick(['G', 'K'])}${int(1000, 9999)}E` },
  { role: 'Radiographer', org: (p) => `${p} General Hospital Imaging Department`, reg: () => `HCPC registration: RA${int(10000, 99999)}` },
  { role: 'Social Worker', org: (p) => `${p} Hospital Social Work Team`, reg: () => `Social Work England registration: SW${int(100000, 999999)}` },
];
const NOT_HP = [
  { role: 'Counsellor', org: (p) => `${p} Wellbeing Centre`, reg: () => 'Member, BACP' },
  { role: 'Pharmacist', org: (p) => `${p} Pharmacy`, reg: () => `GPhC number: ${int(2000000, 2299999)}` },
  { role: 'Chiropractor', org: (p) => `${p} Spine Clinic`, reg: () => `GCC registration: ${int(1000, 9999)}` },
  { role: 'Receptionist', org: (p) => `${p} Medical Practice`, reg: () => null },
  { role: 'Holistic Therapist', org: (p) => `${p} Healing Rooms`, reg: () => null },
];
const CONDITIONS = (c) => [
  `bruising to ${c.A.pos} upper arms and neck`, 'a fractured wrist', 'anxiety and depression', 'post-traumatic stress symptoms', 'a laceration above the left eye',
  'bruising to the face and a burst lip', 'a cracked rib', 'low mood, poor sleep and panic attacks', 'a chipped front tooth and swelling to the jaw', 'bite marks on the forearm',
];
T({
  schedule: 1, para: '11', appType: 'p11', title: 'Letter or report from an appropriate health professional', ref: 'Guidance 2.52–2.60', weight: 34,
  defects: [
    { id: 'judgement', reason: 'The judgement is hedged: the condition "might be" or "may be" consistent with domestic abuse. It must be stated firmly (guidance 2.55–2.56; pack example p11-bad-5).' },
    { id: 'not-examined', reason: 'The letter does not confirm that a health professional examined the applicant in person, by phone or by video (guidance 2.55).' },
    { id: 'not-appropriate-hp', reason: 'The author is not an appropriate health professional as defined in Schedule 1 paragraph 22 (guidance 2.52).' },
    { id: 'not-consistent', reason: 'The letter does not say the injuries or condition are consistent with being a victim of domestic abuse (guidance 2.56).' },
    { id: 'overseas-no-registration', reason: 'The overseas health professional gives no registration with a professional body in their country (guidance 2.52, 2.59).' },
  ],
  build(c, d) {
    const overseas = d === 'overseas-no-registration' || maybe(0.06);
    const country = pick(COUNTRIES);
    const hp = d === 'not-appropriate-hp' ? pick(NOT_HP) : pick(HP);
    const author = person(pick(['f', 'm']));
    const title = /Practitioner|Consultant|Dentist/.test(hp.role) ? `Dr ${author.full}` : author.full;
    const org = overseas ? `${pick(['Szpital Miejski', 'Clinica Medicală', 'City Hospital', 'Centro de Saúde'])}, ${country[0]}` : hp.org(c.place);
    const reg = overseas ? (d === 'overseas-no-registration' ? null : `Registered with the ${country[0] === 'Poland' ? 'Naczelna Izba Lekarska' : 'national medical council'} of ${country[0]}, number ${int(100000, 999999)}`) : hp.reg();
    const cond = pick(CONDITIONS(c));
    const how = pick(['', '', ' in person', ' by telephone', ' by video call']);
    const examined = d === 'not-examined'
      ? `I have not seen ${c.A.full} myself. ${cap(c.A.sub)} told me over the telephone that ${c.A.sub} ${c.A.has} ${cond} caused by ${c.A.pos} ${c.relB}.`
      : pick([`I can confirm that I examined ${c.A.full}${how} on ${fmt(addDays(c.letterDate, -int(1, 300)))}.`, `I can confirm that I have examined ${c.A.full}${how}.`, `${c.A.full} was examined${how} by ${pick(['my colleague', 'a colleague in this practice'])}, ${pick(['Dr', 'Nurse'])} ${pick(SURNAMES)}, on ${fmt(addDays(c.letterDate, -int(1, 300)))}, and I have access to ${c.A.pos} medical records.`]);
    const psych = /anxiety|stress|mood/.test(cond);
    const what = psych ? 'condition' : 'injuries';
    const verb = psych ? 'is' : 'are';
    const firm = pick([`${verb} consistent with`, `${verb} consistent with being a victim of`]);
    const soft = pick(['might be consistent with', 'may be consistent with', 'could be consistent with', `${verb} possibly consistent with`, `appear${psych ? 's' : ''} to be consistent with`]);
    let judgement = pick([
      `In my reasonable professional judgement, the ${what} that ${c.A.full} has (${cond}) ${d === 'judgement' ? soft : firm} domestic abuse.`,
      `In my reasonable professional judgement, ${c.A.full} has ${cond}. The ${what} ${d === 'judgement' ? soft : firm} domestic abuse.`,
    ]);
    if (d === 'not-consistent') judgement = `${c.A.full} has ${cond}. I am not able to comment on the cause.`;
    if (d === 'not-examined' ) judgement = `In my reasonable professional judgement, the condition ${c.A.sub} described is consistent with domestic abuse.`;
    return join(org, `Date: ${fmt(c.letterDate)}`, salutation(), intro(c),
      maybe(0.6) ? `The applicant has confirmed that the ${cond.includes('anxiety') || cond.includes('stress') || cond.includes('mood') ? 'condition' : 'injuries'} ${c.A.sub} presented with ${maybe(0.5) ? 'today ' : ''}${cond.includes('anxiety') || cond.includes('stress') || cond.includes('mood') ? 'was' : 'were'} caused by domestic abuse.` : null,
      examined, judgement,
      maybe(0.7) ? 'I understand that this evidence is only required for a decision on whether or not to grant legal aid – it is not designed to provide evidence of domestic abuse for use in court.' : null,
      signoff(), title, hp.role, reg);
  },
});

// Schedule 1 para 12 – health professional referral
T({
  schedule: 1, para: '12', title: 'Appropriate health professional referral to a domestic abuse support service', ref: 'Guidance 2.61–2.65', weight: 16,
  defects: [
    { id: 'referrer-not-hp', reason: 'The referral was made by someone who is not an appropriate health professional (guidance 2.61).' },
    { id: 'not-specialist', reason: 'The referral was to a general service, not one that provides specialist support for victims of domestic abuse (guidance 2.63).' },
    { id: 'client-not-named', reason: 'The letter does not name the applicant as the person referred (guidance checklist, para 12).' },
  ],
  build(c, d) {
    const hp = pick(HP);
    const referrer = person(pick(['f', 'm']));
    const referrerRole = d === 'referrer-not-hp' ? pick([`${c.A.pos} child's class teacher`, `${c.A.pos} employer's HR manager`, 'a family friend', `${c.A.pos} housing officer`]) : `${hp.role} ${referrer.full} of ${hp.org(c.place)}`;
    const svc = d === 'not-specialist' ? pick([`${c.place} Citizens Advice debt service`, `NHS Talking Therapies ${c.place}`, `${c.place} Foodbank`, `${c.place} Adult Education Centre`]) : pick([`${c.place} Domestic Abuse Service`, `${c.place} IDVA Service`, `Safe Futures ${c.place}`, `${c.place} Women's Refuge outreach team`]);
    const author = person(pick(['f', 'm']));
    const fromSvc = maybe(0.5);
    const who = d === 'client-not-named' ? 'a patient' : c.A.full;
    return join(fromSvc ? svc : hp.org(c.place), `Date: ${fmt(c.letterDate)}`, salutation(), intro(c),
      `I can confirm that ${who} was referred to ${svc} by ${referrerRole} on ${fmt(addDays(c.letterDate, -int(5, 400)))}.`,
      d === 'not-specialist' ? `${svc} provides ${pick(['general advice', 'talking therapy for common mental health problems', 'emergency food parcels', 'adult learning courses'])} to the public.` : `${svc} provides specialist support to victims of, and those at risk of, domestic abuse.`,
      signoff(), author.full, fromSvc ? pick(['Service Manager', 'Referrals Coordinator', 'Outreach Lead']) : hp.role, fromSvc ? null : hp.reg());
  },
});

// Schedule 1 para 13 – MARAC
T({
  schedule: 1, para: '13', appType: 'marac', title: 'Multi-agency risk assessment conference (or other local safeguarding forum)', ref: 'Guidance 2.66–2.67', weight: 18,
  defects: [
    { id: 'perpetrator', reason: 'The letter does not name the person posing the risk (B) (guidance checklist, para 13).' },
    { id: 'risk', reason: 'The letter only says the applicant "may be" at risk; it must confirm the applicant is or has been at risk of harm from domestic abuse by B (guidance 2.66).' },
    { id: 'single-agency', reason: 'The forum is one organisation\'s internal panel, not a multi-agency forum (guidance 2.66).' },
  ],
  build(c, d) {
    const author = person(pick(['f', 'm']));
    const agency = pick([[`${police(c)}`, 'Detective Sergeant, Public Protection Unit'], [`${c.place} IDVA Service`, 'IDVA'], [`${c.place} Children's Services`, 'Team Manager'], [`${c.place} Council`, 'MARAC Coordinator'], [`${c.place} Probation Delivery Unit`, 'Probation Officer']]);
    const forum = d === 'single-agency' ? `${c.place} Housing Association's internal tenancy risk panel, which is made up of our own housing staff` : pick([`${c.place} multi-agency risk assessment conference (MARAC)`, `${c.place} MARAC`, `${c.place} Multi-Agency Safeguarding Hub domestic abuse forum`]);
    const by = d === 'perpetrator' ? '' : ` by ${c.B.full}`;
    const risk = d === 'risk' ? `I can confirm that ${c.A.full} may be at risk of harm from domestic abuse${by}.` : pick([`I can confirm that ${c.A.full} is or has been at risk of harm from domestic abuse${by}.`, `I can confirm that ${c.A.full}${maybe(0.3) ? ` and ${c.A.pos} children` : ''} ${c.A.is} at risk of harm from domestic abuse${by}.`]);
    return join(header(c, { perp: d !== 'perpetrator' }), intro(c),
      `I am a member of the ${forum}${d === 'single-agency' ? '' : `, representing ${agency[0]}`}.`,
      `I can confirm that ${c.A.full}'s case was ${pick(['referred to', 'discussed at', 'heard at'])} ${d === 'single-agency' ? 'the panel' : 'the MARAC'} on ${fmt(addDays(c.letterDate, -int(7, 300)))}.`,
      risk, signoff(), author.full, d === 'single-agency' ? 'Tenancy Sustainment Officer' : agency[1], d === 'single-agency' ? `${c.place} Housing Association` : agency[0]);
  },
});

// Schedule 1 para 14 – IDVA
T({
  schedule: 1, para: '14', appType: 'p14', title: 'Letter from an independent domestic violence advisor', ref: 'Guidance 2.68', weight: 28,
  defects: [
    { id: 'support', reason: 'The letter says "we provided" support, which does not confirm that the IDVA is providing or has provided support (pack example p14-bad-11; guidance 2.68).' },
    { id: 'not-idva', reason: 'The author is not an independent domestic violence advisor (guidance 2.68).' },
    { id: 'future-support', reason: 'The IDVA has not yet provided support; support is only planned (guidance 2.68).' },
    { id: 'client-not-named', reason: 'The letter does not name the applicant as the person supported (guidance 2.68).' },
  ],
  build(c, d) {
    const author = person(pick(['f', 'm']));
    const role = d === 'not-idva' ? pick(['Family Support Worker', 'Volunteer Befriender', 'Housing Support Officer', 'Parenting Practitioner']) : pick(['IDVA', 'Independent Domestic Violence Advisor', 'Senior IDVA', 'Independent Domestic Violence Advocate']);
    const org = pick([`${c.place} IDVA Service`, `${c.place} Domestic Abuse Service`, `Safe Futures ${c.place}`, `${c.place} Victim Support Hub`]);
    const name = d === 'client-not-named' ? 'the client' : c.A.full;
    let confirm = pick([`I can confirm that I am providing ${name} with support.`, `I can confirm that I have provided ${name} with support.`, `I can confirm that I am providing support to ${name}.`, `I can confirm that I have been providing ${name} with support since ${fmt(addDays(c.letterDate, -int(14, 300)))}.`]);
    if (d === 'support') confirm = pick([`I can confirm that we provided ${name} with support.`, `I can confirm that we have provided ${name} with support.`, `I can confirm that we are providing ${name} with support.`, `I can confirm that our service provided support to ${name}.`]);
    if (d === 'future-support') confirm = `I can confirm that ${name} has been allocated to me and I will begin providing support at our first appointment on ${fmt(addDays(c.letterDate, int(3, 20)))}.`;
    const asked = `I understand that ${d === 'client-not-named' ? 'my client' : c.A.full} wishes to access legal aid for a family dispute as a victim of domestic abuse. For this reason, I have been asked to confirm that I am providing / have provided support to ${d === 'client-not-named' ? 'them' : c.A.full} in accordance with regulation 33 and schedule 1 of the Civil Legal Aid (Procedure) Regulations 2012 (as amended).`;
    return join(header(c, { perp: false, applicant: d !== 'client-not-named' }), asked, confirm,
      maybe(0.5) ? 'More information and guidance about the evidential requirements for legal aid can be found at: https://www.gov.uk/legal-aid/domestic-abuse' : null,
      signoff(), author.full, role, org);
  },
});

// Schedule 1 para 15 – ISVA
T({
  schedule: 1, para: '15', appType: 'p14', title: 'Letter from an independent sexual violence advisor', ref: 'Guidance 2.69', weight: 12,
  defects: [
    { id: 'perpetrator', reason: 'The letter does not name the person who committed the sexual violence (B) (guidance checklist, para 15).' },
    { id: 'not-sexual-violence', reason: 'The support is not related to sexual violence by B (guidance 2.69).' },
    { id: 'not-isva', reason: 'The author is not an independent sexual violence advisor (guidance 2.69).' },
  ],
  build(c, d) {
    const author = person(pick(['f', 'm']));
    const role = d === 'not-isva' ? pick(['Wellbeing Coordinator', 'Support Worker', 'Peer Mentor']) : pick(['ISVA', 'Independent Sexual Violence Advisor', 'Children and Young People\'s ISVA']);
    const about = d === 'not-sexual-violence' ? `with ${c.A.pos} housing application and rent arrears` : `relating to sexual violence${d === 'perpetrator' ? '' : ` by ${c.B.full}`}`;
    return join(header(c, { perp: d !== 'perpetrator' }), intro(c, 'domestic abuse and sexual violence'),
      `I can confirm that I ${pick(['am providing', 'have provided', 'have been providing'])} ${c.A.full} with support ${about}.`,
      signoff(), author.full, role, `${c.place} ${pick(['Sexual Assault Referral Centre', 'Rape Crisis', 'ISVA Service'])}`);
  },
});

// Schedule 1 para 16 – local authority or housing association
T({
  schedule: 1, para: '16', title: 'Letter from a local authority or housing association officer', ref: 'Guidance 2.70–2.73', weight: 18,
  defects: [
    { id: 'matters', reason: 'The letter does not describe the specific matters relied on to support the judgement (guidance 2.72).' },
    { id: 'support', reason: 'The letter does not describe the support provided or decision reached (guidance 2.72–2.73).' },
    { id: 'perpetrator', reason: 'The letter does not name the perpetrator (B) (guidance checklist, para 16).' },
    { id: 'not-la-ha', reason: 'The author works for a private letting agent, not a local authority or housing association (guidance 2.70).' },
  ],
  build(c, d) {
    const author = person(pick(['f', 'm']));
    const org = d === 'not-la-ha' ? `${c.place} Lettings Ltd` : pick([`${c.place} Council Housing Options`, `${c.place} Borough Council Homelessness Team`, `${c.place} Homes (housing association)`, `${c.place} Community Housing Trust`]);
    const by = d === 'perpetrator' ? '' : ` by ${c.B.full}`;
    const matters = d === 'matters' ? null : `The specific matters I have relied upon are: ${pickN(MATTERS(c), int(2, 3)).join(' ')}`;
    const support = d === 'support' ? null : `The support provided is: ${pick([`we accepted that ${c.A.full} is homeless and in priority need because of domestic abuse and provided emergency accommodation`, `we granted a management transfer to a new tenancy away from ${c.B.first}`, `we exempted ${c.A.full} from local connection rules and placed ${c.A.obj} in band A on the housing register`, `we fitted additional security to ${c.A.pos} home through the sanctuary scheme`])}.`;
    return join(header(c, { perp: d !== 'perpetrator' }), intro(c),
      `I am a ${pick(['Housing Options Officer', 'Tenancy Support Officer', 'Domestic Abuse Housing Lead'])} in the ${pick(['Housing Needs', 'Tenancy Services', 'Homelessness Prevention'])} department${d === 'not-la-ha' ? ` of ${org}, a private letting agent` : ''}.`,
      `In my reasonable professional judgement, ${d === 'perpetrator' ? c.A.full : familyRel(c)} is, or is at risk of being, a victim of domestic abuse${by}.`.replace(',,', ','),
      matters, support, signoff(), author.full, org);
  },
});

// Schedule 1 para 17 – domestic abuse support organisation
const DA_ORGS = (p, g) => [`${p} Domestic Abuse Service`, `Safe Futures ${p}`, `${p} Survivors' Network`, `Harbour Outreach ${p}`, `Bridge to Safety ${p}`, `${p} Refuge and Outreach`, ...(g === 'f' ? [`${p} Women's Aid`] : g === 'm' ? [`${p} Men's Advice Project`] : [])];
T({
  schedule: 1, para: '17', appType: 'p17', title: 'Letter from an organisation providing domestic abuse support services', ref: 'Guidance 2.74–2.77', weight: 50,
  defects: [
    { id: 'matters', reason: 'The matters relied on are too general (for example "victim testimony and referral") to support the judgement (pack example p17-bad-3; guidance 2.76).' },
    { id: 'operating', reason: 'The letter does not confirm the organisation has been operating for an uninterrupted period of six months or more (Schedule 1 para 17(2)(b); guidance 2.75).' },
    { id: 'location', reason: 'The letter does not confirm the organisation is situated in the United Kingdom (Schedule 1 para 17(2)(a); guidance 2.75).' },
    { id: 'judgement', reason: 'The professional judgement is hedged ("might be"), not stated firmly (Schedule 1 para 17(3)(a); guidance 2.76).' },
    { id: 'reason', reason: 'The letter does not say why the applicant needed the support (Schedule 1 para 17(3)(d); guidance 2.76).' },
    { id: 'support-desc', reason: 'The letter does not describe the support provided (Schedule 1 para 17(3)(c); guidance 2.76).' },
    { id: 'new-org', reason: 'The organisation has been operating for less than six months (guidance 2.75).' },
  ],
  build(c, d) {
    const author = person(pick(['f', 'm']));
    const org = pick(DA_ORGS(c.place, c.A.g));
    const name = maybe(0.5) ? c.A.full : c.A.formal;
    const loc = pick(['situated in England and Wales', 'situated in the United Kingdom', 'based in England']).replace('based in England', 'situated in England and Wales');
    let orgLine = `I can confirm that our organisation is ${loc} and has been operating for an uninterrupted period of six months or more.`;
    if (d === 'operating') orgLine = `I can confirm that our organisation is ${loc}.`;
    if (d === 'location') orgLine = `I can confirm that our organisation has been operating for an uninterrupted period of six months or more.`;
    if (d === 'new-org') orgLine = `I can confirm that our organisation is ${loc}. We opened in ${MONTHS[(c.letterDate.getUTCMonth() + 9) % 12]} this year, so have been operating for ${int(2, 4)} months.`;
    const supported = `I can confirm that we have provided ${name} with support in relation to their needs as a victim, or person at risk, of domestic abuse.`;
    const judgement = d === 'judgement'
      ? `In my reasonable professional judgement, ${name} ${pick(['might be', 'may be', 'could be', 'is possibly'])} a victim, or a person at risk, of domestic abuse.`
      : pick([`In my reasonable professional judgement, ${name} is, or is at risk of being, a victim of domestic abuse.`, `In my reasonable professional judgement ${name} ${c.A.was} a victim, or a person at risk, of domestic abuse.`, `In my reasonable professional judgement, ${name} is a victim of domestic abuse.`]);
    const items = pickN(MATTERS(c), int(2, 6));
    const matters = d === 'matters'
      ? `The matters I have relied upon to support that judgement are: ${pick(GENERIC_MATTERS)}`
      : pick([`The matters I have relied upon to support that judgement are:\n${items.map((m) => `• ${m}`).join('\n')}`, `The matters I have relied upon to support that judgement are: ${items.join(' ')}`]);
    const support = d === 'support-desc' ? null : `We have provided ${name} with the following support: ${pickN(SUPPORT, int(2, 5)).join(', ')}.`;
    const reason = d === 'reason' ? null : pick(REASONS(c));
    return join(`Date: ${fmt(c.letterDate)}`, salutation(), intro(c), orgLine, supported, judgement, matters, support, reason,
      signoff(), author.full, pick(['Domestic Abuse Support Worker', 'Outreach Manager', 'Service Manager', 'Senior Practitioner', 'Refuge Manager', 'Helpline Coordinator']), org);
  },
});

// Schedule 1 para 18 – refuge refusal
T({
  schedule: 1, para: '18', appType: 'p18', title: 'Letter from a domestic abuse support organisation: refusal of admission to a refuge', ref: 'Guidance 2.78–2.82', weight: 24,
  defects: [
    { id: 'perpetrator', reason: 'The letter does not name the perpetrator (B) (pack example p18-bad-9; guidance checklist, para 18).' },
    { id: 'relationship', reason: 'The letter does not show the applicant is or was in a family relationship with B (Schedule 1 para 18(1); guidance 2.80).' },
    { id: 'date', reason: 'The letter does not give the date admission was refused (Schedule 1 para 18(2); guidance 2.80).' },
    { id: 'reason', reason: 'The letter does not say admission was sought because of allegations of domestic abuse by B (Schedule 1 para 18(3); guidance 2.81).' },
    { id: 'refused', reason: 'The applicant was offered a refuge place and declined it, so admission was not refused (guidance 2.80).' },
  ],
  build(c, d) {
    const author = person(pick(['f', 'm']));
    const org = pick([`${c.place} Women's Aid`, `${c.place} Refuge`, `Safe Haven ${c.place}`, `${c.place} Domestic Abuse Service`]);
    const when = d === 'date' ? '' : ` on ${fmt(addDays(c.letterDate, -int(1, 200)), pick(['ord', 'plain']))}`;
    const who = d === 'perpetrator' ? c.A.full : d === 'relationship' ? `${c.A.full}` : familyRel(c);
    const why = pick(['', '', ` because ${pick([`we could not meet ${c.A.pos} support needs`, 'we had no space that could accommodate the children', `our refuge is too close to ${c.B.first}'s workplace`, `of ${c.A.pos} immigration status`])}`]).replace(/^ because/, ' This was because').replace(/(.+)/, '$1');
    const refused = d === 'refused'
      ? `I can confirm that ${who} was offered a place at our refuge${when}, but chose not to take it up.`.replace(',,', ',')
      : `I can confirm that ${who} was refused admission to a refuge${when}.`.replace(',,', ',');
    const reason = d === 'reason'
      ? `I can confirm that ${c.A.full} sought admission to a refuge because ${c.A.sub} had been given notice by ${c.A.pos} landlord.`
      : `I can confirm that ${c.A.full} sought admission to a refuge because of allegations of domestic abuse${d === 'perpetrator' ? '' : ` by ${c.B.full}`}.`;
    return join(header(c, { perp: d !== 'perpetrator' }), intro(c), refused, why ? why.trim() + '.' : null, reason,
      'More information and guidance about the evidential requirements for legal aid can be found at: https://www.gov.uk/legal-aid/domestic-abuse',
      author.full, org, pick(['Domestic Abuse Support Officer', 'Refuge Manager', 'Referrals Coordinator']));
  },
});

// Schedule 1 para 19 – public authority
T({
  schedule: 1, para: '19', appType: 'p19', title: 'Letter from a public authority', ref: 'Guidance 2.83–2.85', weight: 28,
  defects: [
    { id: 'assessment', reason: 'The letter only says the applicant "might be" a victim; it must confirm they were assessed as being, or at risk of being, a victim (pack example p19-bad-7; guidance 2.83).' },
    { id: 'perpetrator', reason: 'The letter does not name the perpetrator (B) (guidance 2.84).' },
    { id: 'relationship', reason: 'The letter does not show the victim is or was in a family relationship with B (guidance 2.83).' },
    { id: 'not-public-authority', reason: 'The author is a private company, not a public authority within section 6 of the Human Rights Act 1998 (guidance 2.85).' },
    { id: 'no-assessment', reason: 'The letter records that concerns were reported but does not confirm any assessment was made (guidance 2.83).' },
  ],
  build(c, d) {
    const author = person(pick(['f', 'm']));
    const org = d === 'not-public-authority' ? pick([`${c.place} Private Nursery Ltd`, `${c.place} Lettings Ltd`, `${pick(SURNAMES)} & Co Accountants`]) : pick([`${c.place} Council`, `${c.place} Council Children's Services`, `${c.place} Borough Council`, `${c.place} NHS Foundation Trust`, `${police(c)}`, `${c.place} Probation Service`, 'Cafcass']);
    const by = d === 'perpetrator' ? '' : ` by ${c.B.full}`;
    const subj = d === 'relationship' ? c.A.full : d === 'perpetrator' ? c.A.full : pick([`${c.A.full}, a person with whom ${c.B.full} is or was in a family relationship${maybe(0.5) ? ' with' : ''}`, `${c.A.full}, who is or was in a family relationship with ${c.B.full}`, `${c.A.full}, who was married to ${c.B.full}`]);
    let line = `Accordingly, I can confirm that ${subj}, was assessed as being, or at risk of being, a victim of domestic abuse${by}.`;
    if (d === 'assessment') line = `Accordingly, I can confirm that ${subj}, ${pick(['might be', 'may be', 'could be', 'may have been'])} a victim of domestic abuse${by}.`;
    if (d === 'no-assessment') line = `I can confirm that ${subj}, reported concerns about ${c.B.first}'s behaviour to us on ${fmt(addDays(c.letterDate, -int(5, 200)))}. No assessment has been carried out.`;
    return join(header(c, { perp: d !== 'perpetrator' }), intro(c), line,
      maybe(0.4) && !d?.startsWith('no-') ? `This assessment was made as part of ${ASSESSMENT(org)} completed on ${fmt(addDays(c.letterDate, -int(5, 200)))}.` : null,
      'More information and guidance about the evidential requirements for legal aid can be found at: https://www.gov.uk/legal-aid/domestic-abuse',
      signoff(), author.full, org);
  },
});

function ASSESSMENT(org) {
  if (/Children's Services|Council$/.test(org)) return pick(['a child and family assessment', 'a pre-proceedings letter before care proceedings', 'a safeguarding assessment']);
  if (/Probation/.test(org)) return 'a probation risk assessment';
  if (/Police/.test(org)) return 'a DASH risk assessment';
  if (/NHS/.test(org)) return 'a safeguarding adults assessment';
  if (org === 'Cafcass') return 'a safeguarding letter to the court';
  return 'an internal review';
}

// Schedule 1 para 20 – leave to enter or remain
T({
  schedule: 1, para: '20', title: 'Leave to enter or remain in the UK as a victim of domestic abuse', ref: 'Guidance 2.86', weight: 10,
  defects: [
    { id: 'other-route', reason: 'Leave was granted on another basis, not as a victim of domestic abuse (guidance 2.86).' },
    { id: 'pending', reason: 'The application for leave has not been decided, so leave has not been granted (guidance 2.86).' },
    { id: 'not-home-office', reason: 'The letter is from the applicant\'s immigration adviser, not the Secretary of State for the Home Department (guidance 2.86).' },
  ],
  build(c, d) {
    const ref = `${pick(['A', 'B', 'K', 'M'])}${int(1000000, 9999999)}`;
    const when = fmt(addDays(c.letterDate, -int(5, 400)));
    if (d === 'not-home-office') {
      const adv = person(pick(['f', 'm']));
      return join(`${c.place} Immigration Advice Centre`, `Date: ${fmt(c.letterDate)}`, salutation(),
        `I can confirm that I have submitted an application on behalf of ${c.A.full} for indefinite leave to remain as a victim of domestic abuse, and in my view the application is very likely to succeed.`,
        signoff(), adv.full, 'OISC Level 3 Adviser');
    }
    const basis = d === 'other-route' ? pick(['as the partner of a British citizen (Appendix FM)', 'as a Skilled Worker', 'as a student']) : pick(['as a victim of domestic abuse under Appendix Victim of Domestic Abuse of the Immigration Rules', 'as a victim of domestic abuse']);
    const what = d === 'pending' ? `Your application for indefinite leave to remain ${basis}, received on ${when}, is still being considered. We will write to you when a decision has been made.` : `I am writing to confirm that you have been granted ${pick(['indefinite leave to remain', 'leave to remain', 'leave to enter'])} in the United Kingdom ${basis}. This decision was made on ${when}.`;
    return join('Home Office – UK Visas and Immigration', `Our reference: ${ref}`, `Date: ${fmt(c.letterDate)}`, `Dear ${c.A.full},`, what,
      'Yours sincerely,', 'On behalf of the Secretary of State for the Home Department');
  },
});

// Schedule 1 para 21 – economic abuse
const ECON = (c) => [
  `${c.B.first} controlled all of the family income and gave me £${int(10, 40)} a week, which I had to account for with receipts.`,
  `${c.B.first} took out ${int(2, 5)} credit cards and a £${int(3, 15)},000 loan in my name without my knowledge. I found out when debt collectors wrote to me.`,
  `${c.B.first} kept my bank card and PIN and would not let me open an account in my sole name.`,
  `${c.B.first} stopped me from claiming child benefit and claimed it ${c.B.g === 'f' ? 'herself' : c.B.g === 'n' ? 'themself' : 'himself'} while the children lived with me.`,
  `Since we separated ${c.B.first} has stopped paying the mortgage on our jointly owned home, despite paying it before, and refuses all viewings so the house cannot be sold.`,
  `${c.B.first} refuses to pay child maintenance unless I agree to ${c.B.obj} having more time with the children.`,
  `${c.B.first} made me leave my job and took the money from my final pay.`,
  `${c.B.first} gambled away my savings of £${int(2, 20)},000 without my knowledge.`,
  `${c.B.first} kept my passport and stopped me applying for a visa so that I stayed financially dependent on ${c.B.obj}.`,
];
T({
  schedule: 1, para: '21', title: 'Evidence of economic abuse', ref: 'Guidance 1.12–1.13, 2.87–2.93', weight: 18,
  defects: [
    { id: 'ordinary-dispute', reason: 'The evidence shows an ordinary dispute about dividing finances after separation, not behaviour intended to gain power and control (guidance 2.89–2.90).' },
    { id: 'no-explanation', reason: 'A short narrative statement with no detail of when the abuse started, how long it lasted or its impact, and no explanation why no documents are available (guidance 2.93).' },
    { id: 'reasonable-budget', reason: 'The behaviour described is a reasonable shared limit on spending, which the guidance says is not economic abuse (guidance 2.89).' },
  ],
  build(c, d) {
    const docs = pickN(['bank statements showing transfers to ' + c.B.first + "'s account", 'credit reference report showing accounts opened in the applicant\'s name', 'letter from the mortgage lender confirming missed payments', 'text messages from ' + c.B.first + ' demanding money', 'letter from the foodbank', 'Universal Credit split payment application', 'letter from a domestic abuse support organisation', 'diary kept by the applicant'], int(2, 4));
    if (d === 'ordinary-dispute') {
      return join(`Statement of ${c.A.full}`, `Date: ${fmt(c.letterDate)}`,
        `${c.B.first} and I separated in ${pick(MONTHS)} ${int(2024, 2026)}. We cannot agree how to divide our savings of £${int(10, 60)},000 and the equity in the house. ${c.B.first} thinks ${c.B.sub} should keep more because ${c.B.sub} paid the deposit. We are both paying our share of the mortgage while this is sorted out.`,
        `Documents enclosed: joint bank statements; mortgage statement.`, `Signed: ${c.A.full}`);
    }
    if (d === 'reasonable-budget') {
      return join(`Statement of ${c.A.full}`, `Date: ${fmt(c.letterDate)}`,
        `When we were together ${c.B.first} and I agreed a monthly budget and agreed that either of us would talk to the other before spending more than £200. ${c.B.first} sometimes reminded me of the budget. I had my own account and wages.`,
        `Documents enclosed: joint budget spreadsheet.`, `Signed: ${c.A.full}`);
    }
    if (d === 'no-explanation') {
      return join(`Statement of ${c.A.full}`, `Date: ${fmt(c.letterDate)}`, `${c.B.first} was bad with money and financially abusive.`, `Signed: ${c.A.full}`);
    }
    const items = pickN(ECON(c), int(2, 4));
    const noDocs = maybe(0.25);
    return join(`Statement of ${c.A.full} – economic abuse`, `Date: ${fmt(c.letterDate)}`,
      `I was in a relationship with ${c.B.full}, my ${c.relB}, for ${int(3, 18)} years. The economic abuse started in ${int(2012, 2023)} and ${pick(['continued until we separated', 'has continued since we separated', `lasted until ${int(2024, 2026)}`])}.`,
      ...items,
      `${c.B.first} did this to control me. ${pick(['I could not afford to leave.', 'I was left with debts I cannot pay and my credit rating is ruined.', 'I had to use a foodbank to feed the children.', 'I felt trapped and frightened of what would happen if I spent anything.'])}`,
      noDocs ? `I do not have bank statements because ${c.B.first} controlled all the accounts and changed the passwords when I left. I left the house with nothing.` : `Documents enclosed: ${docs.join('; ')}.`,
      `Signed: ${c.A.full}`);
  },
});

// ---------------------------------------------------------------- Schedule 2 (child protection)
const child = (c) => ({ first: pick([...FEMALE, ...MALE]).replace(/^/, ''), age: int(1, 15), last: maybe(0.6) ? c.A.last : c.B.last });
const childName = (k) => `${k.first} ${k.last}`;

T({
  schedule: 2, para: '1', title: 'Arrest for a child abuse offence', ref: 'Guidance 3.6–3.9', weight: 7,
  defects: [
    { id: 'not-child-offence', reason: 'The arrest is not for a child abuse offence on the published list (guidance 3.7).' },
    { id: 'not-named', reason: 'The evidence does not name the person arrested (guidance checklist, Schedule 2 para 1).' },
  ],
  build(c, d) {
    const off = officer();
    const offence = d === 'not-child-offence' ? pick(NON_DA_OFFENCES) : pick(CHILD_OFFENCES);
    return join(`From: ${policeRank()} ${off.full} <${pnn(c, off)}>`, salutation(),
      `I can confirm that ${d === 'not-named' ? 'a man' : c.B.full} was arrested on ${fmt(addDays(c.letterDate, -int(5, 90)))} on suspicion of ${offence} and remains on bail while enquiries continue.`,
      signoff(), `${policeRank()} ${off.full}`, `${police(c)} Child Abuse Investigation Team`);
  },
});
T({
  schedule: 2, para: '2', title: 'Police caution for a child abuse offence', ref: 'Guidance 3.10–3.13', weight: 6,
  defects: [
    { id: 'no-action', reason: 'The police record shows no caution was given and no action was taken (guidance 3.11).' },
    { id: 'not-child-offence', reason: 'The caution is not for a child abuse offence (guidance 3.11).' },
  ],
  build(c, d) {
    const off = officer();
    if (d === 'no-action') return join(`${police(c)} – Incident record`, `Reference: ${c.ref}`, `Caller ${c.A.full} reported concerns about ${c.B.full}'s care of their child during contact. Officers visited. No offences identified. No further action.`, `Officer: ${policeRank()} ${off.full}`);
    return join(`${police(c).toUpperCase()} – SIMPLE CAUTION`, `Name of person cautioned: ${c.B.full}`, `Date: ${fmt(addDays(c.letterDate, -int(30, 900)))}`, `Offence: ${d === 'not-child-offence' ? pick(NON_DA_OFFENCES) : pick(CHILD_OFFENCES)}`, `Administered by: ${policeRank()} ${off.full}`);
  },
});
T({
  schedule: 2, para: '3', title: 'Ongoing criminal proceedings for a child abuse offence', ref: 'Guidance 3.14–3.18', weight: 6,
  defects: [
    { id: 'concluded', reason: 'The proceedings have concluded with an acquittal, so they are not ongoing (guidance 3.14–3.15).' },
    { id: 'not-child-offence', reason: 'The charge is not a child abuse offence (guidance 3.16).' },
  ],
  build(c, d) {
    const status = d === 'concluded' ? `The trial concluded on ${fmt(addDays(c.letterDate, -int(3, 40)))} and the defendant was acquitted.` : `The case is listed for trial at ${c.place} Crown Court on ${fmt(addDays(c.letterDate, int(20, 200)))}.`;
    return join(`${c.place} Witness Care Unit`, `Date: ${fmt(c.letterDate)}`, `Re: R v ${c.B.full}`,
      `I confirm that ${c.B.full} was charged on ${fmt(addDays(c.letterDate, -int(30, 300)))} with ${d === 'not-child-offence' ? pick(NON_DA_OFFENCES) : pick(CHILD_OFFENCES)}.`, status, signoff(), person(pick(['f', 'm'])).full, 'Witness Care Officer');
  },
});
T({
  schedule: 2, para: '4', title: 'Conviction for a child abuse offence', ref: 'Guidance 3.19–3.22', weight: 8,
  defects: [
    { id: 'not-child-offence', reason: 'The conviction is not for a child abuse offence (guidance 3.20).' },
    { id: 'wrong-person', reason: 'The person convicted is not the person identified as the risk to the child (B) (guidance 3.19).' },
  ],
  build(c, d) {
    const who = d === 'wrong-person' ? `${pick(MALE)} ${pick(SURNAMES)}` : c.B.full;
    return join('CERTIFICATE OF CONVICTION', `In the Crown Court at ${c.place}`, `R v ${who}`,
      `On ${fmt(addDays(c.letterDate, -int(60, 2500)))} the defendant was convicted of ${d === 'not-child-offence' ? pick(NON_DA_OFFENCES) : pick(CHILD_OFFENCES)}.`,
      d === 'wrong-person' ? `The defendant is not related to and has no contact with the applicant's family.` : null, 'Signed: Court Clerk');
  },
});
T({
  schedule: 2, para: '5', title: 'Protective injunction protecting the child', ref: 'Guidance 3.23–3.25', weight: 8,
  defects: [
    { id: 'adult-only', reason: 'The injunction protects only the adult applicant, not the child the application is about (guidance 3.24).' },
    { id: 'against-client', reason: 'The injunction is against the applicant, not the person identified as the risk to the child (guidance 3.24).' },
  ],
  build(c, d) {
    const k = child(c);
    const resp = d === 'against-client' ? c.A.full : c.B.full;
    const app = d === 'against-client' ? c.B.full : c.A.full;
    return join(`In the Family Court at ${c.place}`, `Non-molestation order`, `Applicant: ${app}`, `Respondent: ${resp}`,
      `On ${fmt(addDays(c.letterDate, -int(2, 300)))} the court ordered that the respondent must not use or threaten violence against ${d === 'adult-only' ? 'the applicant' : `the relevant child, ${childName(k)} (aged ${k.age})`}, and must not go to ${d === 'adult-only' ? "the applicant's" : "the child's"} home or school.`,
      `District Judge ${pick(SURNAMES)}`);
  },
});
T({
  schedule: 2, para: '6', title: 'Finding of fact of abuse of a child', ref: 'Guidance 3.26–3.28', weight: 7,
  defects: [
    { id: 'against-client', reason: 'The findings were made against the applicant, not the person identified as the risk to the child (guidance 3.26).' },
    { id: 'no-finding', reason: 'The fact-finding hearing was adjourned and no finding has been made (guidance 3.28).' },
  ],
  build(c, d) {
    const k = child(c);
    if (d === 'no-finding') return join(`In the Family Court at ${c.place}`, 'Order', `The fact-finding hearing listed on ${fmt(addDays(c.letterDate, -int(3, 30)))} is adjourned to a date to be fixed. No findings have been made.`, `District Judge ${pick(SURNAMES)}`);
    const who = d === 'against-client' ? c.A.full : c.B.full;
    return join(`In the Family Court at ${c.place}`, 'Fact-finding judgment', `Date: ${fmt(addDays(c.letterDate, -int(20, 900)))}`,
      `The court finds on the balance of probabilities that ${who} ${pick(['physically harmed', 'neglected', 'emotionally abused'])} ${childName(k)}, aged ${k.age}.`, `HHJ ${pick(SURNAMES)}`);
  },
});
T({
  schedule: 2, para: '7', title: 'Social services letter: child assessed as at risk of abuse', ref: 'Guidance 3.29–3.30', weight: 12,
  defects: [
    { id: 'hedged', reason: 'The letter says the child "may be" at risk; it must confirm the child was assessed as being, or at risk of being, a victim of child abuse by B (guidance 3.30).' },
    { id: 'not-social-services', reason: 'The letter is from a school, not a social services department (guidance 3.29).' },
    { id: 'perpetrator', reason: 'The letter does not name the person identified as the risk to the child (guidance checklist, Schedule 2 para 7).' },
  ],
  build(c, d) {
    const k = child(c);
    const sw = person(pick(['f', 'm']));
    const org = d === 'not-social-services' ? `${c.place} Primary School` : pick([`${c.place} Council Children's Services`, `${c.place} Children's Social Care`, `${c.place} Council Social Services Department`]);
    const by = d === 'perpetrator' ? '' : ` by ${c.B.full}`;
    const line = d === 'hedged'
      ? `${childName(k)} may be at risk of harm${by}, but no assessment has yet been completed.`
      : `I can confirm that following a child and family assessment completed on ${fmt(addDays(c.letterDate, -int(10, 300)))}, ${childName(k)} (aged ${k.age}) was assessed as being at risk of ${pick(['physical abuse', 'emotional abuse', 'sexual abuse', 'neglect'])}${by}.`;
    return join(org, `Date: ${fmt(c.letterDate)}`, salutation(), `Re: ${childName(k)}`, line, signoff(), sw.full, d === 'not-social-services' ? 'Designated Safeguarding Lead' : pick(['Social Worker', 'Senior Social Worker', 'Team Manager']));
  },
});
T({
  schedule: 2, para: '8', title: 'Social services letter: child protection plan', ref: 'Guidance 3.31–3.33', weight: 12,
  defects: [
    { id: 'child-in-need', reason: 'The child is on a child in need plan, not a child protection plan (guidance 3.33).' },
    { id: 'risk-not-b', reason: 'The plan protects the child from a risk other than B (the applicant\'s own circumstances) (guidance 3.33).' },
    { id: 'perpetrator', reason: 'The letter does not name the person the plan protects the child from (guidance checklist, Schedule 2 para 8).' },
  ],
  build(c, d) {
    const k = child(c);
    const sw = person(pick(['f', 'm']));
    const plan = d === 'child-in-need' ? 'child in need plan' : 'child protection plan';
    const from = d === 'risk-not-b' ? `because of concerns about ${c.A.full}'s ${pick(['alcohol use', 'mental health', 'housing situation'])}` : d === 'perpetrator' ? 'under the category of emotional abuse' : `to protect ${k.first} from ${pick(['physical abuse', 'emotional abuse', 'sexual abuse', 'neglect'])} or the risk of abuse by ${c.B.full}`;
    return join(`${c.place} Council Children's Services`, `Date: ${fmt(c.letterDate)}`, salutation(), `Re: ${childName(k)} (aged ${k.age})`,
      `I can confirm that ${childName(k)} was made subject to a ${plan} on ${fmt(addDays(c.letterDate, -int(10, 500)))} ${from}.`, signoff(), sw.full, pick(['Social Worker', 'Child Protection Chair', 'Team Manager']));
  },
});
T({
  schedule: 2, para: '9', title: 'Application for a protective injunction with an application for a prohibited steps order', ref: 'Guidance 3.34–3.36', weight: 8,
  defects: [
    { id: 'pso-only', reason: 'Only a prohibited steps order application was made; both a protective injunction application and a PSO application are required (guidance 3.34).' },
    { id: 'decided', reason: 'The applications have already been decided by the court, so they are not undetermined (guidance 3.35).' },
  ],
  build(c, d) {
    const k = child(c);
    const ref = `${c.place.slice(0, 2).toUpperCase()}${int(10, 26)}P${int(10000, 99999)}`;
    const fl401 = `Form FL401 – application for a non-molestation order, issued on ${fmt(addDays(c.letterDate, -int(1, 14)))}. Applicant: ${c.A.full}. Respondent: ${c.B.full}. The order is sought to protect ${childName(k)} (aged ${k.age}) from the respondent.`;
    const c100 = `Form C100 – application for a prohibited steps order under section 8 of the Children Act 1989, issued on ${fmt(addDays(c.letterDate, -int(1, 14)))}. Respondent: ${c.B.full}. Child: ${childName(k)}.`;
    return join(`In the Family Court at ${c.place}`, `Case number: ${ref}`, 'Applications enclosed:', d === 'pso-only' ? null : `1. ${fl401}`, `${d === 'pso-only' ? '1' : '2'}. ${c100}`,
      d === 'decided' ? `Both applications were determined at a hearing on ${fmt(addDays(c.letterDate, -1))} and final orders were made.` : 'Both applications are listed for a first hearing and have not yet been decided.');
  },
});

// ---------------------------------------------------------------- dataset
const MATTERS_S1 = ['Child arrangements order', 'Specific issue order', 'Financial remedy on divorce', 'Divorce', 'Schedule 1 Children Act 1989 financial provision', 'Prohibited steps order', 'Dissolution of civil partnership'];
const MATTERS_S2 = ['Prohibited steps order (protection of child)', 'Child arrangements order (protection of child)', 'Specific issue order (protection of child)'];

// Share out n items by weight using the largest remainder method.
function allocate(weights, n) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / sum) * n);
  const out = raw.map(Math.floor);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; out.reduce((a, b) => a + b, 0) < n; k++) out[order[k][1]]++;
  return out;
}

function context(type) {
  const { A, B, relA, relB } = parties();
  const appDate = randDate();
  const letterDate = addDays(appDate, -int(1, 120));
  return { A, B, relA, relB, place: pick(PLACES), ref: `${int(10, 99)}/${int(100000, 999999)}/${String(appDate.getUTCFullYear()).slice(2)}`, appDate, letterDate, type };
}

const records = [];
const counts = allocate(TYPES.map((t) => t.weight), TOTAL_PER_CLASS);
// About 3% of rejections are timing failures: good evidence obtained after
// the Controlled Work determination (guidance 2.5, 3.4).
const LATE = Math.round(TOTAL_PER_CLASS * 0.03);
const rejectCounts = [...counts];
for (let k = 0, i = 0; k < LATE; i = (i + 7) % TYPES.length) { if (rejectCounts[i] > 2) { rejectCounts[i]--; k++; } }

function record(type, expected, defect, late = false) {
  const c = context(type);
  let workType = pick(['Controlled', 'Controlled', 'Licensed']);
  if (late) {
    workType = 'Controlled';
    c.letterDate = addDays(c.appDate, int(3, 60));
  }
  const text = type.build(c, defect?.id ?? null);
  return {
    expected, defect, late, c, workType, text, type,
  };
}

TYPES.forEach((type, i) => {
  for (let k = 0; k < counts[i]; k++) records.push(record(type, 'accepted', null));
  const defects = type.defects;
  for (let k = 0; k < rejectCounts[i]; k++) records.push(record(type, 'rejected', defects[k % defects.length]));
});
const lateTypes = TYPES.filter((t) => !['20', '21'].includes(t.para) && t.schedule === 1);
for (let k = 0; k < LATE; k++) records.push(record(pick(lateTypes), 'rejected', null, true));

const rows = shuffle(records).map((r, n) => {
  const id = `LAA-SYN-${String(n + 1).padStart(4, '0')}`;
  const t = r.type;
  const reason = r.late
    ? `The evidence is dated after the Controlled Work determination was made. A claim will be nil assessed where the evidence was obtained after the determination (guidance 2.5).`
    : r.defect?.reason ?? null;
  return {
    id,
    schedule: t.schedule,
    paragraph: t.para,
    evidenceType: t.title,
    appType: t.appType ?? null,
    matter: pick(t.schedule === 1 ? MATTERS_S1 : MATTERS_S2),
    workType: r.workType,
    applicationDate: iso(r.c.appDate),
    evidenceDate: iso(r.c.letterDate),
    applicant: r.c.A.full,
    applicantPronouns: `${r.c.A.sub}/${r.c.A.obj}`,
    otherParty: r.c.B.full,
    decision: r.expected === 'accepted' ? 'approved' : 'denied',
    expected: r.expected,
    failId: r.late ? 'after-determination' : r.defect?.id ?? null,
    reason,
    guidanceRef: `Schedule ${t.schedule} para ${t.para}; ${t.ref}${r.late ? '; guidance 2.5' : ''}`,
    label: `Schedule ${t.schedule}, paragraph ${t.para} – ${r.expected === 'accepted' ? 'meets requirements' : `does not meet requirements (${r.late ? 'after-determination' : r.defect.id})`}`,
    text: r.text,
  };
});

// ---------------------------------------------------------------- sanity checks
const seen = new Set();
for (const r of rows) {
  if (/undefined|NaN|\[object/.test(r.text)) throw new Error(`${r.id}: bad interpolation\n${r.text}`);
  if (seen.has(r.text)) throw new Error(`${r.id}: duplicate text`);
  seen.add(r.text);
}
const approved = rows.filter((r) => r.decision === 'approved').length;
if (approved !== TOTAL_PER_CLASS || rows.length !== TOTAL_PER_CLASS * 2) throw new Error(`expected ${TOTAL_PER_CLASS}/${TOTAL_PER_CLASS}, got ${approved}/${rows.length - approved}`);

// ---------------------------------------------------------------- write
mkdirSync(OUT, { recursive: true });
writeFileSync(pathJoin(OUT, 'laa-synthetic-1000.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const COLS = Object.keys(rows[0]);
const csvCell = (v) => (v === null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
writeFileSync(pathJoin(OUT, 'laa-synthetic-1000.csv'), [COLS.join(','), ...rows.map((r) => COLS.map((k) => csvCell(r[k])).join(','))].join('\n') + '\n');

const summary = {};
for (const r of rows) {
  const k = `S${r.schedule} para ${r.paragraph}`;
  summary[k] ??= { approved: 0, denied: 0 };
  summary[k][r.decision]++;
}
console.log(`Wrote ${rows.length} records (${approved} approved, ${rows.length - approved} denied) to ${OUT}/ with seed ${SEED}`);
console.table(summary);
