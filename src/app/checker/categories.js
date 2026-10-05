// Evidence categories from the Civil Legal Aid (Procedure) Regulations 2012, regulations 33 and 34,
// Schedules 1 and 2, as explained in the LAA guidance "Evidence Requirements for Private Family Law
// Matters", version 15 (15 June 2026). Paragraph references (2.xx, 3.xx) are to that guidance.
// A port of laa-evidence-checker (Python) categories.py: keep the two in step.

import * as L from './lexicon.js';
import * as R from './rules.js';

export const Label = { COMPLETE: 'Appears complete', INCOMPLETE: 'Incomplete', REVIEW: 'Needs human review' };

const DA_OR_ABUSE = `${L.DA}|\\babuse\\b|\\babusive\\b|\\bviolen\\w+`;

const crit = (id, label, verify, ref = '', askFor = '') => ({ id, label, verify, ref, askFor });
const category = (id, schedule, para, name, criteria, { tested = false, maxLabel = null, examples = 0, inputs = ['client'], notes = [] } = {}) => ({
  id, schedule, para, name, criteria, tested, maxLabel, examples, inputs, notes,
});
const capitalize = (s) => s[0].toUpperCase() + s.slice(1).toLowerCase();

// ------------------------------------------------------------------ shared sources

const POLICE_SOURCE = R.anyOf(
  R.present(L.POLICE_SRC, 'a police, CPS or Witness Care Unit source'),
  R.allOf(R.present(L.PROVIDER_POLICE_CALL, "a provider's note of a call to the police"),
    R.present(L.POLICE_STATION, 'the police station'),
    R.present(L.OFFICER_NAME, "the officer's name", { flags: '' })),
  R.present(L.NEWSPAPER, 'a newspaper report'),
  R.present(L.COURT_DOC, 'a court document'),
);
const COURT_SOURCE = R.present(L.COURT_DOC, 'a court document', {
  missingNote: 'This does not look like a court document (no court name, case number, judge or order wording).',
});
const COURT_OR_POLICE = R.anyOf(COURT_SOURCE, R.present(L.POLICE_SRC, 'a police, CPS or Witness Care Unit source'));

const offence = (eventRx, eventName, offenceRx = L.DA_OFFENCE, kind = 'domestic abuse') => R.together(eventRx, offenceRx, `${eventName} for a ${kind} offence`, {
  window: 1,
  partialNote: `The ${eventName} is mentioned, but the offence is not one the checker recognises. Check it against the gov.uk list of ${kind} offences.`,
});

const victim = (mayBeOther = true, wherePossible = false) => R.named('client', { mayBeOther, wherePossible });

const B = R.named('other_party');
const CHILD = R.named('child', { wherePossible: true });
const NOT_NFA = R.absent(L.NFA, 'The police have taken no further action. Funding can be withdrawn if no charge will be brought (guidance 2.10).');
const NOT_CONCLUDED = R.absent(L.CONCLUDED, 'The proceedings appear to have ended without a conviction, so this evidence no longer applies (guidance 2.22).', { status: R.Status.MISSING });
const SOURCE_ASK = 'Ask for a bail or charge sheet, written or email confirmation from the police, CPS or Witness Care Unit, or a pnn.police.uk email.';

function crim(cid, para, name, eventRx, eventName, ref, extra = [], victimWhereNamed = true) {
  return category(cid, 1, para, name, [
    crit('R1', 'Other party (B) named as the perpetrator', B, ref, 'Ask for a document that names the other party.'),
    crit('R2', 'Victim named (your client, or someone in a family relationship with B)', victim(true, victimWhereNamed), ref, 'Ask for a version that names the victim.'),
    crit('R3', `${capitalize(eventName)} for a relevant domestic abuse offence`, offence(eventRx, eventName), ref, 'Ask for confirmation of the offence.'),
    crit('R4', 'From an accepted source', POLICE_SOURCE, ref, SOURCE_ASK),
    ...extra,
  ], { inputs: ['client', 'other_party'] });
}

const SCHEDULE_1 = [
  crim('sch1-para1', '1', 'Arrest for a relevant domestic abuse offence', L.ARREST, 'arrest', 'Sch 1(1); guidance 2.8-2.13',
    [crit('R5', 'Still under investigation or charged (no NFA)', NOT_NFA, 'guidance 2.8, 2.10')], false),
  crim('sch1-para2', '2', 'Relevant police caution for a domestic abuse offence', L.CAUTION, 'caution', 'Sch 1(2); guidance 2.14-2.17'),
  crim('sch1-para3', '3', 'Relevant criminal proceedings for a domestic abuse offence which have not concluded', L.CHARGED, 'charge',
    'Sch 1(3); guidance 2.18-2.25',
    [crit('R5', 'Proceedings have not concluded', NOT_CONCLUDED, 'guidance 2.19, 2.22', 'Ask for confirmation that the case is still ongoing.')]),
  crim('sch1-para4', '4', 'Relevant conviction for a domestic abuse offence', L.CONVICTION, 'conviction', 'Sch 1(4); guidance 2.26-2.30'),
  crim('sch1-para5', '5', 'Court order binding over B in connection with a domestic abuse offence', L.BINDOVER, 'bind over', 'Sch 1(5); guidance 2.31-2.33'),
  category('sch1-para6', 1, '6', 'Domestic violence protection notice (DVPN)', [
    crit('R1', 'Protected party named (your client, or someone in a family relationship with B)', victim(), 'guidance 2.34'),
    crit('R2', 'Other party (B) named as the person the DVPN was given to', B, 'guidance 2.34'),
    crit('R3', 'The document is a DVPN', R.present(L.DVPN, 'a domestic violence protection notice'), 'Sch 1(6)'),
    crit('R4', 'From the police, CPS or a court', COURT_OR_POLICE, 'guidance 2.34 checklist', SOURCE_ASK),
  ], { inputs: ['client', 'other_party'] }),
  category('sch1-para6a', 1, '6A', 'Domestic abuse protection notice (DAPN)', [
    crit('R1', 'Protected party named (your client, or someone in a family relationship with B)', victim(), 'guidance 2.37'),
    crit('R2', 'Other party (B) named as the person the DAPN was given to', B, 'guidance 2.37'),
    crit('R3', 'The document is a DAPN', R.present(L.DAPN, 'a domestic abuse protection notice'), 'Sch 1(6A)'),
    crit('R4', 'From the police, CPS or a court', COURT_OR_POLICE, 'guidance 2.37 checklist', SOURCE_ASK),
    crit('R5', 'Issued in a pilot area', R.anyOf(R.present(L.DAPN_PILOT, 'a pilot area'),
      R.advisory('DAPNs are only given in the pilot areas listed in guidance 2.36. Check the issuing force.')), 'guidance 2.36'),
  ], { inputs: ['client', 'other_party'] }),
  category('sch1-para7', 1, '7', 'Relevant protective injunction', [
    crit('R1', 'Protected party named (your client, or someone in a family relationship with B)', victim(), 'guidance 2.38'),
    crit('R2', 'Other party (B) named as the person the injunction was made against', B, 'guidance 2.38'),
    crit('R3', 'A relevant protective injunction', R.present(L.INJUNCTION, 'a protective injunction'), 'guidance 2.39'),
    crit('R4', 'A court document (or police document for a restraining order)', COURT_OR_POLICE, 'guidance 2.38', 'Ask for the sealed order.'),
    crit('R5', 'Not set aside or discharged', R.absent(L.SET_ASIDE, 'The order may have been set aside or discharged. '
      + 'Funding can be withdrawn in that case (guidance 2.41).'), 'guidance 2.41'),
  ], { inputs: ['client', 'other_party'] }),
  category('sch1-para8', 1, '8', 'Undertaking given by B (Family Law Act 1996, s46 or s63E)', [
    crit('R1', 'Other party (B) gave the undertaking', R.allOf(B, R.present(L.UNDERTAKING, 'an undertaking')), 'guidance 2.43'),
    crit('R2', 'Person given the undertaking named (your client, or someone in a family relationship with B)', victim(), 'guidance 2.43'),
    crit('R3', 'Given under s46 or s63E Family Law Act 1996 (or in Scotland or Northern Ireland in place of an injunction)',
      R.present(L.FLA_SECTION, 'the statutory basis', { unclearRx: L.UNDERTAKING, unclearNote: 'An undertaking is mentioned but not the section it was given under.' }), 'Sch 1(8)'),
    crit('R4', 'No relevant cross-undertaking given by your client', R.anyOf(
      R.present(L.NO_CROSS, 'a statement that no cross-undertaking was given'),
      R.absent(L.CROSS_UNDERTAKING, 'A cross-undertaking is mentioned. If your client gave one relating to domestic abuse, '
        + 'this evidence does not qualify (guidance 2.44).'),
    ), 'guidance 2.44'),
  ], { inputs: ['client', 'other_party'] }),
  category('sch1-para9', 1, '9', 'Finding of fact of domestic abuse by B', [
    crit('R1', 'A court (or tribunal) document', COURT_SOURCE, 'guidance 2.45', 'Ask for the judgment or order recording the finding.'),
    crit('R2', 'Victim named (your client, or someone in a family relationship with B)', victim(), 'guidance 2.45'),
    crit('R3', 'Other party (B) named as the perpetrator', B, 'guidance 2.45'),
    crit('R4', 'A specific finding of fact that there has been domestic abuse by B', R.allOf(
      R.present(L.FINDING, 'a finding of fact', {
        missingNote: 'No finding of fact is recorded. Allegations, including those in an undefended divorce petition, are not enough (guidance 2.48).',
      }),
      R.together(L.FINDING, DA_OR_ABUSE, 'a finding of fact of domestic abuse', { window: 2, partialNote: 'A finding is mentioned, but not clearly a finding of domestic abuse.' }),
    ), 'guidance 2.47-2.48'),
    crit('R5', 'Finding made before the legal aid application', R.eventBeforeApplication(L.FINDING, 'the finding'), 'guidance 2.47'),
  ], { inputs: ['client', 'other_party'] }),
  category('sch1-para10', 1, '10', 'Expert report for UK court or tribunal proceedings', [
    crit('R1', 'An expert report produced for UK court or tribunal proceedings',
      R.together(L.EXPERT, `\\bcourt\\b|\\btribunal\\b|\\bproceedings\\b|${L.COURT_DOC}`, 'an expert report for proceedings', { window: 3 }), 'guidance 2.49-2.50'),
    crit('R2', 'Expert named, with relevant experience or qualifications', R.present(L.EXPERT_QUAL, "the expert's qualifications"), 'guidance 2.51'),
    crit('R3', 'Victim named (your client, or someone in a family relationship with B)', victim(), 'guidance 2.49'),
    crit('R4', 'Other party (B) named as the perpetrator', B, 'guidance 2.49'),
    crit('R5', 'Assessed as being, or at risk of being, a victim of domestic abuse by B',
      R.present(L.ASSESSED_VICTIM, 'an assessment that the person is or is at risk of being a victim'), 'Sch 1(10)'),
  ], { inputs: ['client', 'other_party'] }),
  category('sch1-para11', 1, '11', 'Letter or report from an appropriate health professional', [
    crit('GP1', 'Written by (or reports an examination by) an appropriate health professional', R.healthProfessional,
      'Sch 1(11), (22); guidance 2.52-2.53', 'Ask the author to state their profession and registering body (for example GMC or NMC).'),
    crit('GP2', 'Your client is named', R.named('client'), 'guidance 2.60 checklist', "Ask for the client's name to be included."),
    crit('GP3', 'Client examined in person, by telephone or by video', R.examination, 'Sch 1(11)(a); guidance 2.55',
      'Ask the author to confirm the client was examined (in person, by telephone or by video) and when.'),
    crit('GP4', 'Professional judgement that the injuries or condition are consistent with domestic abuse',
      R.consistencyJudgement, 'Sch 1(11)(b); guidance 2.55-2.56',
      'Ask the author to state that, in their reasonable professional judgement, the client has or has had injuries or a '
      + 'condition consistent with being a victim of domestic abuse.'),
    crit('GP5', 'If the author did not examine the client: access to the medical records, and the examiner is unavailable',
      R.differentAuthor, 'guidance 2.55',
      "Ask the author to confirm they have access to the client's medical records and that the examining professional is unavailable."),
    crit('GP6', "If sent by email: includes the professional's registration number", R.emailRegistrationNumber,
      'guidance 2.60 checklist', "Ask for the author's GMC, NMC, GDC or HCPC number."),
    crit('GP7', 'Registration at the time of the examination and of the letter', R.registrationAtTime, 'guidance 2.54'),
  ], {
    tested: true,
    examples: 29,
    notes: ['The evidence does not need to name the perpetrator (guidance 2.57).',
      'No specific form of words is required, but the meaning must be clear (guidance 2.56).'],
  }),
  category('sch1-para12', 1, '12', 'Appropriate health professional referral to a domestic abuse support service', [
    crit('R1', 'Your client is named', R.named('client'), 'guidance 2.61 checklist'),
    crit('R2', 'Referral made by an appropriate health professional',
      R.together('\\brefer(?:red|ral|ring)\\b', L.HEALTH_PROF, 'a referral by a health professional', { window: 2 }), 'guidance 2.61'),
    crit('R3', 'Referral was to an organisation giving specialist domestic abuse support',
      R.together('\\brefer(?:red|ral|ring)\\b', `${L.DA_ORG}|${L.IDVA}|${L.DA}`, 'a referral to a domestic abuse service', { window: 1 }), 'guidance 2.63'),
    crit('R4', 'Written by the referrer, a professional with access to the records, or the receiving organisation',
      R.anyOf(R.present(L.HEALTH_PROF, 'a health professional'), R.present(L.DA_ORG, 'a domestic abuse support organisation')), 'Sch 1(12); guidance 2.62'),
    crit('R5', 'If sent by email: identifies the organisation and comes from an official address', R.letterOrOfficialEmail, 'guidance 2.65 checklist'),
  ]),
  category('sch1-para13', 1, '13', 'Letter from a member of a MARAC or other local safeguarding forum', [
    crit('R1', 'From a member of a MARAC or other multi-agency safeguarding forum',
      R.together(L.MARAC, L.MARAC_MEMBER, 'membership of a MARAC or safeguarding forum', {
        window: 2, partialNote: 'A MARAC or forum is mentioned, but not that the author is a member of it.',
      }), 'guidance 2.66-2.67'),
    crit('R2', 'Victim named (your client, or a person in a family relationship with your client)', victim(), 'guidance 2.66'),
    crit('R3', 'Other party (B) named as the perpetrator', B, 'guidance 2.66'),
    crit('R4', 'Is or has been at risk of harm from domestic abuse by B', R.together(L.RISK_OF_HARM, DA_OR_ABUSE, 'risk of harm from domestic abuse', { window: 1 }), 'Sch 1(13)'),
  ], { inputs: ['client', 'other_party'], examples: 3 }),
  category('sch1-para14', 1, '14', 'Letter from an independent domestic violence advisor (IDVA)', [
    crit('R1', 'From an IDVA', R.present(L.IDVA, 'an independent domestic violence advisor'), 'guidance 2.68'),
    crit('R2', 'Your client is named as the victim', R.named('client'), 'guidance 2.68'),
    crit('R3', 'Confirms they are providing, or have provided, support', R.supportConfirmed, 'Sch 1(14)'),
  ], { examples: 3 }),
  category('sch1-para15', 1, '15', 'Letter from an independent sexual violence advisor (ISVA)', [
    crit('R1', 'From an ISVA', R.present(L.ISVA, 'an independent sexual violence advisor'), 'guidance 2.69'),
    crit('R2', 'Your client is named as the victim (where possible)', victim(false, true), 'guidance 2.69'),
    crit('R3', 'Other party (B) named as the perpetrator', B, 'guidance 2.69 checklist'),
    crit('R4', 'Support provided relating to sexual violence by B',
      R.together(L.SUPPORTING, L.SEXUAL_VIOLENCE, 'support relating to sexual violence', { window: 3 }), 'Sch 1(15)'),
  ], { inputs: ['client', 'other_party'] }),
  category('sch1-para16', 1, '16', 'Letter from a local authority or housing association officer', [
    crit('R1', 'From an officer of a local authority or housing association', R.present(L.HOUSING_BODY, 'a local authority or housing association'), 'guidance 2.70'),
    crit('R2', "Officer's name and department", R.present(L.OFFICER_DEPT, "the officer's department", { flags: '' }), 'guidance 2.73 checklist'),
    crit('R3', 'Victim named (your client, or someone in a family relationship with B)', victim(), 'guidance 2.71'),
    crit('R4', 'Other party (B) named as the perpetrator', B, 'guidance 2.71'),
    crit('R5', 'Professional judgement that the person is, or is at risk of being, a victim of domestic abuse by B', R.authorJudgement(), 'Sch 1(16)(1); guidance 2.71'),
    crit('R6', 'Description of the specific matters relied on', R.specificMatters, 'Sch 1(16)(2); guidance 2.72'),
    crit('R7', 'Description of the support provided, or the decision reached',
      R.anyOf(R.supportDelivered, R.present(L.SUPPORT_OR_DECISION, 'a housing decision')), 'Sch 1(16)(3); guidance 2.73'),
    crit('R8', 'Letter, or email from an official address', R.letterOrOfficialEmail, 'guidance 2.73'),
  ], { inputs: ['client', 'other_party'], examples: 2 }),
  category('sch1-para17', 1, '17', 'Letter from an organisation providing domestic abuse support services', [
    crit('S1', 'From a named organisation providing domestic abuse support services', R.daSupportOrg, 'Sch 1(17)(1); guidance 2.75',
      "Ask for the letter to be on the organisation's letterhead, naming it and describing its domestic abuse support work."),
    crit('S2', 'Confirms the organisation is situated in the United Kingdom', R.ukSituated, 'Sch 1(17)(2)(a)',
      'Ask the author to confirm the organisation is situated in the United Kingdom.'),
    crit('S3', 'Organisation has operated for an uninterrupted period of six months or more', R.operatingSixMonths,
      'Sch 1(17)(2)(b); guidance 2.75', 'Ask the author to confirm the organisation has operated without interruption for at least six months, and since when.'),
    crit('S4', 'Your client is named as the victim', R.named('client'), 'guidance 2.77', "Ask for the client's name to be included."),
    crit('S5', "Author's reasonable professional judgement that the client is, or is at risk of being, a victim of domestic abuse",
      R.authorJudgement(), 'Sch 1(17)(3)(a); guidance 2.76',
      'Ask the author to state that, in their reasonable professional judgement, the client is or is at risk of being a victim of domestic abuse.'),
    crit('S6', 'Description of the specific matters relied on to support that judgement', R.specificMatters,
      'Sch 1(17)(3)(b); guidance 2.76', 'Ask the author to describe the specific conduct, incidents or material they relied on.'),
    crit('S7', 'Description of the support actually provided to the client', R.supportDelivered,
      'Sch 1(17)(2)(c), (3)(c); guidance 2.76', 'Ask the author to describe the support the organisation has already provided, not only what is planned.'),
    crit('S8', 'Statement of why the client needed that support', R.reasonsNeeded, 'Sch 1(17)(3)(d); guidance 2.76',
      'Ask the author to explain why the client needed the support.'),
    crit('S9', "Sent as a letter, or as an email from the organisation's official address", R.letterOrOfficialEmail,
      'guidance 2.77 checklist', "Ask for the letter on letterhead, or an email from the organisation's official address."),
  ], { tested: true, examples: 29 }),
  category('sch1-para18', 1, '18', 'Domestic abuse support organisation: refusal of admission to a refuge', [
    crit('R1', 'Names the domestic abuse support organisation', R.daSupportOrg, 'guidance 2.78'),
    crit('R2', 'Other party (B) named as the perpetrator', B, 'guidance 2.82 checklist'),
    crit('R3', 'Victim named (your client, or someone in a family relationship with B)', victim(), 'guidance 2.80'),
    crit('R4', 'Sought admission to a refuge because of allegations of domestic abuse by B',
      R.together(L.REFUGE, `${L.SOUGHT_BECAUSE}[^.]{0,40}(?:${DA_OR_ABUSE})`, 'the reason for seeking refuge', { window: 1 }), 'Sch 1(18)(3); guidance 2.81'),
    crit('R5', 'Refused admission, with the date of refusal', R.allOf(
      R.together(L.REFUSED, L.REFUGE, 'a refusal of admission', { window: 1 }),
      R.together(L.REFUSED, '\\b\\d{1,2}(?:st|nd|rd|th)? (?:of )?(?:January|February|March|April|May|June|July|August|September|October|November|December)\\b|\\b\\d{1,2}/\\d{1,2}/\\d{4}\\b',
        'the date of refusal', { window: 1, partialNote: 'The refusal is mentioned, but not the date it happened.' }),
    ), 'Sch 1(18)(1)-(2); guidance 2.80'),
    crit('R6', 'Letter, or email identifying the organisation', R.letterOrOfficialEmail, 'guidance 2.82 checklist'),
  ], { inputs: ['client', 'other_party'] }),
  category('sch1-para19', 1, '19', 'Letter from a public authority', [
    crit('R1', 'Names the public authority', R.present(L.PUBLIC_AUTHORITY, 'a public authority'), 'guidance 2.83, 2.85'),
    crit('R2', 'Victim named (your client, or someone in a family relationship with B)', victim(), 'guidance 2.84'),
    crit('R3', 'Other party (B) named as the perpetrator', B, 'guidance 2.84'),
    crit('R4', 'Assessed as being, or at risk of being, a victim of domestic abuse by B', R.assessmentConcluded(L.ASSESSED_VICTIM, 'domestic abuse'), 'Sch 1(19)'),
  ], { inputs: ['client', 'other_party'] }),
  category('sch1-para20', 1, '20', 'Home Office grant of leave to enter or remain as a victim of domestic abuse', [
    crit('R1', 'From the Home Office (Secretary of State for the Home Department)', R.present(L.HOME_OFFICE, 'the Home Office'), 'guidance 2.86'),
    crit('R2', 'Your client is named', R.named('client'), 'guidance 2.86 checklist'),
    crit('R3', 'Granted leave to enter or remain as a victim of domestic abuse',
      R.together(L.LEAVE_GRANTED, L.DA_LEAVE_BASIS, 'a grant of leave as a victim of domestic abuse', { window: 2 }), 'Sch 1(20)'),
    crit('R4', 'Granted on or before the legal aid application', R.eventBeforeApplication(L.LEAVE_GRANTED, 'the grant of leave'), 'guidance 2.86'),
  ]),
  category('sch1-para21', 1, '21', 'Economic abuse', [
    crit('R1', 'Your client is named', R.named('client'), 'Sch 1(21)'),
    crit('R2', 'Other party (B) named as the person responsible', B, 'Sch 1(21)'),
    crit('R3', 'Describes economic or financial conduct', R.economicConduct, 'guidance 2.88-2.91'),
    crit('R4', 'Shows the behaviour was aimed at power or control', R.present(L.CONTROL_INTENT, 'control or power', {
      missingNote: 'Nothing shows the behaviour was done to gain power or control (guidance 2.90).',
    }), 'guidance 2.89-2.90'),
    crit('R5', 'Narrative statement elements', R.narrativeElements, 'guidance 2.93'),
    crit('R6', 'Decision', R.advisory('The Director (or, for controlled work, the provider) decides whether this evidence is '
      + 'enough. The checker cannot make that decision (guidance 1.12-1.13, 2.92).'), 'guidance 1.12'),
  ], { maxLabel: Label.REVIEW, inputs: ['client', 'other_party'] }),
];

function childCrim(cid, para, name, eventRx, eventName, ref, extra = []) {
  return category(cid, 2, para, name, [
    crit('R1', 'Perpetrator (B, the person who is the risk to the child) named', B, ref),
    crit('R2', `${capitalize(eventName)} for a child abuse offence`, offence(eventRx, eventName, L.CHILD_OFFENCE, 'child abuse'), ref),
    crit('R3', 'The offence concerns a child (any child)', R.present(L.CHILD_CONTEXT, 'a child', { missingNote: 'Nothing shows the offence concerned a child.' }), ref),
    crit('R4', 'From an accepted source', POLICE_SOURCE, ref, SOURCE_ASK),
    ...extra,
  ], { inputs: ['client', 'other_party', 'child'] });
}

const SCHEDULE_2 = [
  childCrim('sch2-para1', '1', 'Arrest for a child abuse offence', L.ARREST, 'arrest', 'Sch 2(1); guidance 3.6-3.9',
    [crit('R5', 'Still under investigation or charged (no NFA)', NOT_NFA, 'guidance 3.6')]),
  childCrim('sch2-para2', '2', 'Relevant police caution for a child abuse offence', L.CAUTION, 'caution', 'Sch 2(2); guidance 3.10-3.13'),
  childCrim('sch2-para3', '3', 'Criminal proceedings for a child abuse offence which have not concluded', L.CHARGED, 'charge',
    'Sch 2(3); guidance 3.14-3.18', [crit('R5', 'Proceedings have not concluded', NOT_CONCLUDED, 'guidance 3.15')]),
  childCrim('sch2-para4', '4', 'Relevant conviction for a child abuse offence', L.CONVICTION, 'conviction', 'Sch 2(4); guidance 3.19-3.22'),
  category('sch2-para5', 2, '5', 'Protective injunction protecting the child', [
    crit('R1', 'A court document', COURT_SOURCE, 'guidance 3.23'),
    crit('R2', 'Child named (where named)', CHILD, 'guidance 3.24 checklist'),
    crit('R3', 'Other party (B) named as the person the injunction was made against', B, 'guidance 3.24'),
    crit('R4', 'Injunction is for the protection of the child', R.together(L.INJUNCTION, L.CHILD_CONTEXT, 'an injunction protecting the child', { window: 3 }),
      'Sch 2(10)(b)(ii); guidance 3.24'),
    crit('R5', 'The respondent is not your client', R.otherPartyIsNotClient(), 'guidance 3.24'),
  ], { inputs: ['client', 'other_party', 'child'] }),
  category('sch2-para6', 2, '6', 'Finding of fact of abuse of a child by B', [
    crit('R1', 'A court (or tribunal) document', COURT_SOURCE, 'guidance 3.26'),
    crit('R2', 'Perpetrator (B) named', B, 'guidance 3.26 checklist'),
    crit('R3', 'A finding of fact that a child was abused by B',
      R.together(L.FINDING, `${L.CHILD_CONTEXT}|\\babuse\\w*\\b|\\bharm\\b|\\bneglect\\w*\\b`, 'a finding of abuse of a child', { window: 2 }), 'Sch 2(6)'),
    crit('R4', 'Finding made before the legal aid application', R.eventBeforeApplication(L.FINDING, 'the finding'), 'guidance 3.28'),
  ], { inputs: ['client', 'other_party'] }),
  category('sch2-para7', 2, '7', 'Social services letter: child assessed as at risk of abuse by B', [
    crit('R1', 'From a social services department (or Scottish local authority or NI Health and Social Care Trust)',
      R.present(L.SOCIAL_SERVICES, 'social services'), 'guidance 3.29'),
    crit('R2', 'Child named', R.named('child'), 'guidance 3.30 checklist'),
    crit('R3', 'Perpetrator (B) named', B, 'guidance 3.30'),
    crit('R4', 'Child assessed as being, or at risk of being, a victim of child abuse', R.assessmentConcluded(L.CHILD_ASSESSED, 'abuse of the child'), 'Sch 2(7)'),
  ], { inputs: ['client', 'other_party', 'child'], examples: 2 }),
  category('sch2-para8', 2, '8', 'Social services letter: child protection plan', [
    crit('R1', 'From a social services department (or equivalent)', R.present(L.SOCIAL_SERVICES, 'social services'), 'guidance 3.31'),
    crit('R2', 'Child named', R.named('child'), 'guidance 3.33 checklist'),
    crit('R3', 'Perpetrator (B) named', B, 'guidance 3.33'),
    crit('R4', 'A child protection plan to protect the child from abuse or risk of abuse by B', R.present(L.CPP, 'a child protection plan'), 'Sch 2(8); guidance 3.33'),
  ], { inputs: ['client', 'other_party', 'child'] }),
  category('sch2-para9', 2, '9', 'Applications for a protective injunction and a prohibited steps order, not yet decided', [
    crit('R1', 'Application for a protective injunction', R.present(L.INJ_APPLICATION, 'an injunction application', {
      unclearRx: L.INJUNCTION, unclearNote: 'An injunction is mentioned, but not that an application has been made.',
    }), 'guidance 3.34'),
    crit('R2', 'Application for a prohibited steps order (Children Act 1989, s8)', R.together(L.PSO, L.APPLICATION_MADE, 'a PSO application', { window: 1 }), 'guidance 3.34'),
    crit('R3', 'Child named as the person your client is protecting', R.named('child'), 'guidance 3.36'),
    crit('R4', 'Other party (B) named as the respondent', B, 'guidance 3.36'),
    crit('R5', 'Both applications still undecided', R.absent(L.DETERMINED, 'The text suggests one application may have been decided. '
      + 'Both must be undetermined on the date of the legal aid application (guidance 3.35).'), 'guidance 3.35'),
  ], { inputs: ['client', 'other_party', 'child'] }),
];

export const CATEGORIES = [...SCHEDULE_1, ...SCHEDULE_2];
const BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export const ALIASES = {
  gp: 'sch1-para11', health: 'sch1-para11', medical: 'sch1-para11', support: 'sch1-para17',
  'support-service': 'sch1-para17', 'da-support': 'sch1-para17', idva: 'sch1-para14', isva: 'sch1-para15',
  marac: 'sch1-para13', refuge: 'sch1-para18', economic: 'sch1-para21', financial: 'sch1-para21',
  'home-office': 'sch1-para20', housing: 'sch1-para16', dvpn: 'sch1-para6', dapn: 'sch1-para6a',
  injunction: 'sch1-para7', undertaking: 'sch1-para8', finding: 'sch1-para9', expert: 'sch1-para10',
};

export function getCategory(cid) {
  const key = cid.trim().toLowerCase().replace(/_/g, '-').replace(/ /g, '');
  if (BY_ID[key]) return BY_ID[key];
  if (ALIASES[key]) return BY_ID[ALIASES[key]];
  const m = /^(?:(?:s|sch|schedule)-?([12])-?(?:p|para|paragraph)?|([12])[-.:/](?:p|para|paragraph)?|(?:p|para|paragraph))?-?(\d{1,2}a?)$/.exec(key);
  if (m) {
    const cand = `sch${m[1] || m[2] || '1'}-para${m[3]}`;
    if (BY_ID[cand]) return BY_ID[cand];
  }
  throw new Error(`Unknown evidence category '${cid}'.`);
}
