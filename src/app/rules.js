// Rule checks for Domestic Abuse Gateway evidence letters.
// Derived from the accepted and rejected examples in the 10DS hackathon
// evidence pack (Schedule 1, Civil Legal Aid (Procedure) Regulations 2012).
// These are screening heuristics, not a legal test: the Legal Aid Agency
// makes every decision.

export const LETTER_TYPES = {
  p11: 'Health professional letter (Schedule 1, paragraph 11)',
  p14: 'IDVA or ISVA letter (Schedule 1, paragraph 14)',
  p17: 'Domestic abuse support organisation letter (Schedule 1, paragraph 17)',
  p18: 'Refuge refusal letter (Schedule 1, paragraph 18)',
  p19: 'Local authority or housing letter (Schedule 1, paragraph 19)',
  marac: 'MARAC letter (Schedule 1)',
  refugeStay: 'Refuge admission letter (Schedule 1)',
  social: 'Social services letter (Schedule 1)',
  financial: 'Financial abuse evidence (Schedule 1)',
};

// Types built from the hackathon examples, and types written from the
// GOV.UK guidance without real accepted or rejected examples to learn from.
export const TYPE_SOURCE = {
  p11: 'examples', p14: 'examples', p17: 'examples', p18: 'examples', p19: 'examples',
  marac: 'guidance', refugeStay: 'guidance', social: 'guidance', financial: 'guidance',
};

const HEDGE_WORDS = /\b(might|may|could|possibly|perhaps|potentially|appears? to|seems? to)\b/;

// Returns the hedging word in a sentence, ignoring the month of May and
// "to whom it may concern".
function hedge(sentence) {
  const s = sentence
    .replace(/\b\d{1,2}(st|nd|rd|th)? (of )?may,? \d{4}\b/g, ' ')
    .replace(/\bmay,? \d{4}\b/g, ' ')
    .replace(/to whom it may concern/g, ' ');
  const m = s.match(HEDGE_WORDS);
  return m ? m[0] : null;
}

const ABUSE_INDICATORS = /\b(physical|emotional|psychological|coerci\w*|controll\w*|sexual|financial|economic|threat\w*|dash|refuge|police|injur\w*|isolat\w*|stalk\w*|harass\w*|assault\w*|violen\w*|fled|fear|belittl\w*|shout\w*|smash\w*|strangl\w*|hit|punch\w*|kick\w*)\b/;

export function normalise(text) {
  return String(text)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function sentences(t) {
  return t.split(/(?<=[.!?])\s+|\s+•\s+/).filter(Boolean);
}

export function detectType(text) {
  const t = normalise(text);
  if (/refuge/.test(t) && /refused|not (given|offered) a (place|space)|could not (offer|give)|no (space|room|place)/.test(t)) return 'p18';
  if (/refuge/.test(t) && /\b(admitted|resident|stayed|staying|accommodated)\b/.test(t)) return 'refugeStay';
  if (/\bmarac\b|multi-agency risk assessment conference/.test(t)) return 'marac';
  if (/consistent with domestic (abuse|violence)/.test(t) || (/\bexamined\b/.test(t) && /\bcondition\b/.test(t))) return 'p11';
  if (/uninterrupted period|(six|6) months|situated in england and wales|matters? (that )?i have relied upon/.test(t)) return 'p17';
  if (/social services|children's services|social worker|safeguarding/.test(t)) return 'social';
  if (/financial(ly)? (abuse|control)|\b(bank|building society|credit card|loan)\b/.test(t)) return 'financial';
  if (/family relationship/.test(t) || /victim of domestic abuse by/.test(t)) return 'p19';
  if (/\b(idva|isva)\b|independent (domestic|sexual) violence advis/.test(t) || /(providing|provided) .{0,40}support/.test(t)) return 'p14';
  return null;
}

const pass = (id, label, detail) => ({ id, label, status: 'pass', detail });
const fail = (id, label, detail, fix) => ({ id, label, status: 'fail', detail, fix });
const warn = (id, label, detail, fix) => ({ id, label, status: 'warn', detail, fix });

function check(cond, id, label, okDetail, badDetail, fix, severity = 'fail') {
  if (cond) return pass(id, label, okDetail);
  return severity === 'warn' ? warn(id, label, badDetail, fix) : fail(id, label, badDetail, fix);
}

function judgementNotHedged(sentence, id, label, fix) {
  if (!sentence) return fail(id, label, 'The letter does not state the professional judgement.', fix);
  const h = hedge(sentence);
  if (h) return fail(id, label, `The judgement is hedged ("${h}"). The letter must state it as a firm professional view.`, fix);
  return pass(id, label, 'The professional judgement is stated firmly.');
}

const perpetratorCheck = (t) => check(
  /name of perpetrator:\s*\S+/.test(t) || /domestic abuse by [a-z]/.test(t),
  'perpetrator', 'Names the person who carried out the abuse',
  'The perpetrator is named.',
  'The letter does not name the person who carried out the abuse.',
  'Name the person who carried out the abuse (for example "Name of perpetrator: …" and "domestic abuse by …").');

const relationshipCheck = (t) => check(
  /family relationship/.test(t),
  'relationship', 'Confirms a family relationship',
  'The letter confirms the applicant is or was in a family relationship with the perpetrator.',
  'The letter does not confirm that the applicant is or was in a family relationship with the perpetrator.',
  'Add a sentence confirming the applicant "is or was in a family relationship" with the named perpetrator.');

// A sentence that confirms something about the abuse or risk must not be hedged.
function firmConfirmation(t, about, id, label, fix) {
  const s = sentences(t).filter((x) => /\bconfirm/.test(x) && about.test(x) && !/asked to (confirm|provide)/.test(x));
  if (!s.length) return fail(id, label, 'The letter does not clearly confirm this.', fix);
  const hedged = s.map(hedge).find(Boolean);
  if (hedged) return fail(id, label, `The confirmation is hedged ("${hedged}"). It must be stated firmly.`, fix);
  return pass(id, label, 'This is confirmed firmly.');
}

const RULES = {
  p11(t) {
    const judgement = sentences(t).find((s) => /consistent with domestic (abuse|violence)/.test(s));
    return [
      check(/\b(examined|assessed|treated)\b/.test(t), 'examined', 'Says the professional examined the applicant',
        'The professional confirms they examined the applicant.',
        'The letter does not say the professional examined, assessed or treated the applicant.',
        'State that you examined, assessed or treated the applicant.'),
      check(/\b(condition|injur\w*)\b/.test(t), 'condition', 'Refers to injuries or a condition',
        'The letter refers to the injuries or condition.',
        'The letter does not mention injuries or a condition.',
        'Refer to the injuries or condition you saw.'),
      judgementNotHedged(judgement, 'judgement', 'States the condition is consistent with domestic abuse',
        'Say the injuries or condition "are consistent with domestic abuse" – not "might be" or "may be".'),
    ];
  },
  p14(t) {
    const confirms = sentences(t).filter((s) => /\bconfirm\b/.test(s) && !/asked to confirm/.test(s));
    const ok = confirms.some((s) => /\bi (am|have been) providing\b|\bi have provided\b/.test(s));
    const usesWe = confirms.some((s) => /\bwe (provided|are providing|have provided)\b/.test(s));
    return [
      check(/\b(idva|isva)\b|independent (domestic|sexual) violence advis/.test(t), 'role', 'Written by an IDVA or ISVA',
        'The author identifies as an IDVA or ISVA.',
        'The letter does not say the author is an IDVA or ISVA.',
        'State your role as an Independent Domestic Violence Adviser (IDVA) or Independent Sexual Violence Adviser (ISVA).', 'warn'),
      ok ? pass('support', 'Confirms the IDVA is providing or has provided support', 'The IDVA personally confirms the support.')
        : fail('support', 'Confirms the IDVA is providing or has provided support',
          usesWe ? 'The letter says "we provided", which does not confirm that the IDVA personally is providing or has provided support.'
            : 'The letter does not confirm that the IDVA is providing or has provided support.',
          'Use the wording "I can confirm that I am providing [name] with support" or "I have provided [name] with support".'),
    ];
  },
  p17(t) {
    const judgement = sentences(t).find((s) => /reasonable professional judgement/.test(s));
    const matchesMatters = t.match(/matters? (that )?i have relied upon[^:]*:?(.*?)(we have provided|$)/);
    const matters = matchesMatters ? matchesMatters[2].trim() : '';
    const words = matters.split(/\s+/).filter(Boolean).length;
    const specific = words >= 6 && ABUSE_INDICATORS.test(matters);
    return [
      check(/situated in england and wales/.test(t), 'location', 'Organisation is in England and Wales',
        'The organisation confirms it is in England and Wales.',
        'The letter does not confirm the organisation is situated in England and Wales.',
        'Confirm the organisation is situated in England and Wales.'),
      check(/uninterrupted/.test(t) && /(six|6) months/.test(t), 'operating', 'Operating for six months or more',
        'The organisation confirms six months of uninterrupted operation.',
        'The letter does not confirm the organisation has operated for an uninterrupted six months or more.',
        'Confirm the organisation has been operating for an uninterrupted period of six months or more.'),
      judgementNotHedged(judgement, 'judgement', 'States the professional judgement',
        'State that "in my reasonable professional judgement" the applicant is, or is at risk of being, a victim of domestic abuse.'),
      matters
        ? (specific ? pass('matters', 'Explains the matters relied upon', 'The letter gives specific reasons for the judgement.')
          : fail('matters', 'Explains the matters relied upon',
            `The reasons given ("${matters.slice(0, 80)}") are too general to show why the judgement was reached.`,
            'List the specific matters relied on – for example the types of abuse disclosed, risk assessment (DASH) results, refuge referrals or police reports.'))
        : fail('matters', 'Explains the matters relied upon', 'The letter does not say what matters the judgement relies on.',
          'Add "The matters I have relied upon to support that judgement are: …" with specific details.'),
      check(/we have provided .{10,}/.test(t), 'support', 'Describes the support provided',
        'The letter describes the support provided.',
        'The letter does not describe the support provided.',
        'Describe the support you have provided.'),
      check(/needs? (this|the) support because|needed (this|the) support because/.test(t), 'reason', 'Explains why support was needed',
        'The letter explains why the support was needed.',
        'The letter does not explain why the support was needed.',
        'Add "[Name] needed this support because …".'),
    ];
  },
  p18(t) {
    return [
      perpetratorCheck(t),
      relationshipCheck(t),
      check(/refused admission to a refuge/.test(t), 'refused', 'Confirms refusal of a refuge place',
        'The letter confirms the applicant was refused admission to a refuge.',
        'The letter does not clearly confirm the applicant was refused admission to a refuge.',
        'State that the applicant "was refused admission to a refuge".'),
      check(/\b\d{1,2}(st|nd|rd|th)? (of )?[a-z]+ \d{4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(t), 'date', 'Gives the date of refusal',
        'The date of refusal is given.',
        'The letter does not give the date of the refusal.',
        'Give the date the applicant was refused admission.'),
      check(/because of (allegations of )?domestic abuse/.test(t), 'reason', 'Says the refuge was sought because of domestic abuse',
        'The letter says why the applicant sought refuge.',
        'The letter does not say the applicant sought refuge because of domestic abuse.',
        'State that the applicant sought admission "because of allegations of domestic abuse by [perpetrator]".'),
    ];
  },
  p19(t) {
    const assessed = sentences(t).find((s) => /victim of domestic abuse/.test(s) && /\bconfirm\b/.test(s));
    let assessment;
    if (assessed && hedge(assessed)) {
      assessment = fail('assessment', 'Confirms the applicant was assessed as a victim',
        `The assessment is hedged ("${hedge(assessed)}"). It must confirm the applicant was assessed as being, or at risk of being, a victim.`,
        'Use "was assessed as being, or at risk of being, a victim of domestic abuse by [perpetrator]".');
    } else if (/assessed as (being|a victim|at risk)/.test(t)) {
      assessment = pass('assessment', 'Confirms the applicant was assessed as a victim', 'The assessment is stated firmly.');
    } else {
      assessment = fail('assessment', 'Confirms the applicant was assessed as a victim',
        'The letter does not confirm an assessment was made.',
        'Use "was assessed as being, or at risk of being, a victim of domestic abuse by [perpetrator]".');
    }
    return [
      perpetratorCheck(t),
      relationshipCheck(t),
      assessment,
      check(/council|local authority|housing/.test(t), 'org', 'From a local authority or housing provider',
        'The letter appears to come from a local authority or housing provider.',
        'The letter does not show it comes from a local authority or housing provider.',
        'Include the local authority or housing provider name.', 'warn'),
    ];
  },
  marac(t) {
    return [
      check(/member of (the |a )?([a-z'-]+ ){0,3}(marac|multi-agency risk assessment conference)|marac (coordinator|chair|representative)/.test(t), 'role', 'Written by a MARAC member',
        'The author says they are a member of the MARAC.',
        'The letter does not say the author is a member of the MARAC.',
        'State that you are a member of the multi-agency risk assessment conference (MARAC).', 'warn'),
      check(/(referred to|discussed at|heard at) (a |the )?(marac|multi-agency risk assessment conference)/.test(t), 'referral', 'Confirms a MARAC referral',
        'The letter confirms the applicant was referred to or discussed at a MARAC.',
        'The letter does not confirm the applicant was referred to or discussed at a MARAC.',
        'Confirm the applicant was referred to a MARAC as a victim of domestic abuse.'),
      firmConfirmation(t, /\b(risk|victim)\b/, 'risk', 'Confirms the applicant is or was at risk',
        'Confirm firmly that the applicant "is or has been at risk of harm from domestic abuse" – not "may be".'),
      perpetratorCheck(t),
    ];
  },
  refugeStay(t) {
    return [
      perpetratorCheck(t),
      relationshipCheck(t),
      check(/\b(admitted to|resident (at|in)|stayed (at|in)|staying (at|in)|accommodated (at|in)) (a |the |our )?refuge/.test(t), 'admitted', 'Confirms a stay in a refuge',
        'The letter confirms the applicant stayed in a refuge.',
        'The letter does not clearly confirm the applicant stayed in a refuge.',
        'State that the applicant "was admitted to" or "stayed in" the refuge.'),
      check(/\b\d{1,2}(st|nd|rd|th)? (of )?[a-z]+ \d{4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(t), 'dates', 'Gives the dates of the stay',
        'Dates are given.',
        'The letter does not give the dates of the stay.',
        'Give the date the applicant was admitted, and the date they left if they have.'),
      check(/because of (allegations of )?domestic (abuse|violence)/.test(t), 'reason', 'Says the stay was because of domestic abuse',
        'The letter says why the applicant stayed in the refuge.',
        'The letter does not say the applicant stayed because of domestic abuse.',
        'State that the applicant was admitted "because of allegations of domestic abuse by [perpetrator]".'),
    ];
  },
  social(t) {
    return [
      check(/social services|children's services|social worker|local authority|council/.test(t), 'org', 'From social services',
        'The letter appears to come from social services.',
        'The letter does not show it comes from social services or a local authority.',
        'Include the social services department or local authority name.', 'warn'),
      firmConfirmation(t, /domestic (abuse|violence)|\b(risk|victim)\b/, 'assessment', 'Confirms the assessment about domestic abuse',
        'Confirm firmly that the applicant "was assessed as being, or at risk of being, a victim of domestic abuse" – not "may have been".'),
      perpetratorCheck(t),
    ];
  },
  financial(t) {
    return [
      check(/\b(bank|building society|employer|benefits?|education|training provider|college|university)\b/.test(t), 'org', 'From a bank, employer or benefits provider',
        'The letter appears to come from an organisation that can give financial abuse evidence.',
        'The letter does not show it comes from a bank, employer, education or training provider, or benefits provider.',
        'Include the organisation name and your role.', 'warn'),
      check(/\b(statements?|accounts?|loans?|credit|debts?|transactions?|payments?|wages|salary|pay)\b/.test(t), 'records', 'Refers to specific financial records',
        'The letter refers to specific records.',
        'The letter does not refer to specific accounts, statements, loans or payments.',
        'Refer to the specific accounts, statements, loans or payments that show the financial abuse.'),
      firmConfirmation(t, /financial(ly)?|control|abuse|debt|account|loan|transaction/, 'abuse', 'Confirms what the records show',
        'Confirm firmly what the records show – not "may indicate".'),
    ];
  },
};

// Flag old or future dates so the applicant can check with their solicitor.
// This is a prompt, not a rule about time limits.
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function findDates(text) {
  const t = normalise(text);
  const dates = [];
  const re = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? (?:of )?(${MONTHS.join('|')}|sept|${MONTHS.map((m) => m.slice(0, 3)).join('|')})\\.?,? (\\d{4})\\b`, 'g');
  for (const m of t.matchAll(re)) {
    const month = MONTHS.findIndex((x) => x.startsWith(m[2].slice(0, 3)));
    dates.push(new Date(Date.UTC(+m[3], month, +m[1])));
  }
  for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/g)) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    dates.push(new Date(Date.UTC(y, +m[2] - 1, +m[1])));
  }
  return dates.filter((d) => !Number.isNaN(d.getTime()));
}

function dateCheck(text, today) {
  const dates = findDates(text);
  if (!dates.length) return null;
  const latest = new Date(Math.max(...dates));
  const label = 'Dates in the letter';
  const fmt = latest.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (latest > today) {
    return warn('dates', label, `The latest date in the letter (${fmt}) is in the future.`, 'Check the dates in the letter are correct.');
  }
  const fiveYears = new Date(today); fiveYears.setUTCFullYear(today.getUTCFullYear() - 5);
  if (latest < fiveYears) {
    return warn('dates', label, `The latest date in the letter (${fmt}) is more than 5 years ago.`,
      'Older evidence can still be accepted, but ask your solicitor whether a more recent letter would help.');
  }
  return pass('dates', label, `The latest date in the letter is ${fmt}.`);
}

export function checkLetter(text, type = detectType(text), { today = new Date() } = {}) {
  if (!type || !RULES[type]) {
    return { type: null, outcome: 'unknown', checks: [] };
  }
  const t = normalise(text);
  const checks = [
    check(/regulation 33/.test(t), 'reg33', 'Refers to regulation 33',
      'The letter refers to regulation 33 of the Civil Legal Aid (Procedure) Regulations 2012.',
      'The letter does not refer to regulation 33 of the Civil Legal Aid (Procedure) Regulations 2012.',
      'Mention that the letter is provided in accordance with regulation 33 of the Civil Legal Aid (Procedure) Regulations 2012.', 'warn'),
    ...RULES[type](t),
  ];
  const dated = dateCheck(text, today);
  if (dated) checks.push(dated);
  const outcome = checks.some((c) => c.status === 'fail') ? 'changes'
    : checks.some((c) => c.status === 'warn') ? 'check' : 'ready';
  return { type, outcome, checks };
}

export function changeRequest(result) {
  const fixes = result.checks.filter((c) => c.fix && c.status !== 'pass').map((c) => `- ${c.fix}`);
  if (!fixes.length) return '';
  return [
    'Thank you for writing this letter. The Legal Aid Agency needs a few changes before it can accept it:',
    '',
    ...fixes,
    '',
    'Please could you send an updated letter, signed and dated on your organisation\'s letterhead?',
  ].join('\n');
}
