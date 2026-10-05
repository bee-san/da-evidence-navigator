// Fictional letters written for this prototype, for letter types the
// hackathon pack has no examples of. They follow the GOV.UK guidance, not
// real Legal Aid Agency decisions, so they test the rules but do not prove
// the rules match how assessors decide.

const INTRO = 'I understand that Jane Doe wishes to access legal aid for a family dispute as a victim of domestic abuse. For this reason, I have been asked to provide a letter in accordance with regulation 33 and schedule 1 of the Civil Legal Aid (Procedure) Regulations 2012 (as amended).';

export const SYNTHETIC = [
  {
    id: 'marac-ok', type: 'marac', expected: 'accepted', source: 'synthetic',
    label: 'MARAC letter – written for testing (should pass)',
    text: `To whom it may concern
Name of perpetrator: John Doe
Name of applicant: Jane Doe
${INTRO}
I am a member of the Exampleshire multi-agency risk assessment conference (MARAC).
I can confirm that Jane Doe was referred to the MARAC on 12th March 2026 as a victim of domestic abuse by John Doe.
I can confirm that Jane Doe is or has been at risk of harm from domestic abuse by John Doe.
John Smith
MARAC Coordinator`,
  },
  {
    id: 'marac-bad', type: 'marac', expected: 'rejected', failId: 'risk', source: 'synthetic',
    label: 'MARAC letter – written for testing (should fail)',
    text: `To whom it may concern
Name of perpetrator: John Doe
Name of applicant: Jane Doe
${INTRO}
I am a member of the Exampleshire multi-agency risk assessment conference (MARAC).
I can confirm that Jane Doe was referred to the MARAC on 12th March 2026.
I can confirm that Jane Doe may be at risk of harm from domestic abuse by John Doe.
John Smith
MARAC Coordinator`,
  },
  {
    id: 'refuge-stay-ok', type: 'refugeStay', expected: 'accepted', source: 'synthetic',
    label: 'Refuge admission letter – written for testing (should pass)',
    text: `To whom it may concern
Name of perpetrator: John Doe
Name of applicant: Jane Doe
${INTRO}
I can confirm that Jane Doe, with whom John Doe is or was in a family relationship, was admitted to our refuge on 2nd February 2026 and stayed until 30th April 2026.
I can confirm that Jane Doe was admitted because of allegations of domestic abuse by John Doe.
John Smith
Refuge Manager`,
  },
  {
    id: 'refuge-stay-bad', type: 'refugeStay', expected: 'rejected', failId: 'perpetrator', source: 'synthetic',
    label: 'Refuge admission letter – written for testing (should fail)',
    text: `To whom it may concern
Name of applicant: Jane Doe
${INTRO}
I can confirm that Jane Doe stayed in our refuge from 2nd February 2026.
John Smith
Refuge Manager`,
  },
  {
    id: 'social-ok', type: 'social', expected: 'accepted', source: 'synthetic',
    label: 'Social services letter – written for testing (should pass)',
    text: `To whom it may concern
Name of perpetrator: John Doe
Name of applicant: Jane Doe
${INTRO}
I am a social worker in the Children's Services department of Exampleshire Council.
I can confirm that Jane Doe, with whom John Doe is or was in a family relationship, was assessed by children's services on 4th May 2026 as being, or at risk of being, a victim of domestic abuse by John Doe.
John Smith
Senior Social Worker`,
  },
  {
    id: 'social-bad', type: 'social', expected: 'rejected', failId: 'assessment', source: 'synthetic',
    label: 'Social services letter – written for testing (should fail)',
    text: `To whom it may concern
Name of perpetrator: John Doe
Name of applicant: Jane Doe
${INTRO}
I am a social worker in the Children's Services department of Exampleshire Council.
I can confirm that Jane Doe may have been at risk of domestic abuse by John Doe.
John Smith
Senior Social Worker`,
  },
  {
    id: 'financial-ok', type: 'financial', expected: 'accepted', source: 'synthetic',
    label: 'Financial abuse letter – written for testing (should pass)',
    text: `To whom it may concern
Name of applicant: Jane Doe
${INTRO}
I am a fraud investigator at Example Bank plc.
I can confirm that our records show that between January 2025 and March 2026 John Doe took out two loans and a credit card in Jane Doe's name without her consent, and controlled the account into which her wages were paid.
John Smith
Example Bank plc`,
  },
  {
    id: 'financial-bad', type: 'financial', expected: 'rejected', failId: 'abuse', source: 'synthetic',
    label: 'Financial abuse letter – written for testing (should fail)',
    text: `To whom it may concern
Name of applicant: Jane Doe
${INTRO}
I am a fraud investigator at Example Bank plc.
I can confirm that our records may indicate that John Doe controlled the account into which Jane Doe's wages were paid.
John Smith
Example Bank plc`,
  },
];
