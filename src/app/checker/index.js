// Checks one piece of evidence against the requirements for its category, on the device.
// A JavaScript port of laa-evidence-checker (MoJ Team 1, Future States hackathon), which is the source of
// truth: scripts/checker-golden.py regenerates lexicon.js and the parity cases in
// test/fixtures/checker-golden.json, and test/checker.test.mjs checks this port gives the same results.
//
// No language model and no network: every result comes from the rules in this folder. The rules follow
// the Civil Legal Aid (Procedure) Regulations 2012, regulations 33 and 34 and Schedules 1 and 2, as
// explained in the LAA guidance "Evidence Requirements for Private Family Law Matters", version 15.
//
//   import { check } from './checker/index.js';
//   const result = check(letterText, 'sch1-para11', { client: 'Lena Orwick' });
//   result.label  // "Appears complete", "Incomplete" or "Needs human review"

import { CATEGORIES, getCategory, Label } from './categories.js';
import { Status } from './rules.js';
import { Doc, detectClientName, findDates, iso } from './text.js';

export { CATEGORIES, getCategory, Label, Status };
export const GUIDANCE_VERSION = '15 (15 June 2026)';

const RANK = { [Label.COMPLETE]: 0, [Label.REVIEW]: 1, [Label.INCOMPLETE]: 2 };

function parseDate(value) {
  if (value == null || value === '') return null;
  const found = findDates(String(value)).filter((d) => d.precision === 'day');
  if (!found.length) throw new Error(`Could not read the date '${value}'. Use a form like 2026-10-05 or 5 October 2026.`);
  return found[0].value;
}

export function outcome(criteria, cap = null) {
  const statuses = new Set(criteria.map((c) => c.status));
  let label = statuses.has(Status.MISSING) ? Label.INCOMPLETE : statuses.has(Status.UNCLEAR) ? Label.REVIEW : Label.COMPLETE;
  if (cap && RANK[label] < RANK[cap]) label = cap;
  return label;
}

// options: client (A), other_party (B), child (Schedule 2), application_date.
export function check(text, categoryId, options = {}) {
  const cat = getCategory(categoryId);
  const doc = new Doc(text);
  const client = options.client || null;
  const ctx = {
    client,
    other_party: options.other_party || null,
    child: options.child || null,
    application_date: parseDate(options.application_date),
    detected: {},
  };
  if (!client) ctx.detected.client = detectClientName(doc);

  const criteria = cat.criteria.map((cr) => {
    const [status, note, evidence] = cr.verify(doc, ctx);
    return {
      id: cr.id, label: cr.label, status, note, evidence, ref: cr.ref,
      ask_for: status === Status.MISSING || status === Status.UNCLEAR ? cr.askFor : '',
    };
  });

  const detected = {
    client: client || ctx.detected.client || null,
    client_source: client ? 'entered' : ctx.detected.client ? 'found in the text' : 'not found',
    letter_date: doc.letterDate ? iso(doc.letterDate.value) : null,
    is_email: doc.isEmail,
  };
  for (const [k, v] of Object.entries(ctx.detected)) if (k !== 'client' && v != null) detected[k] = v;

  const warnings = ["Authenticity, the author's registration and the organisation's status are not checked. "
    + 'The LAA may verify them (guidance 1.11).', ...cat.notes];
  if (cat.examples === 0) warnings.push('These rules are built from the guidance checklist and have not been tested against example letters.');
  else if (cat.examples < 8) warnings.push(`These rules have been tested against only ${cat.examples} example letters.`);
  if (doc.text.length < 200) warnings.push('Very little text was provided. Check the whole document was included.');
  if (cat.maxLabel === Label.REVIEW) warnings.push('This category always needs a human decision.');

  return {
    category: cat.id,
    category_name: cat.name,
    label: outcome(criteria, cat.maxLabel),
    tested_against_examples: cat.tested,
    detected,
    criteria,
    warnings,
  };
}
