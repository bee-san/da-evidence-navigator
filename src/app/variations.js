// Variations of the hackathon example letters, to test that the rules catch
// other ways of writing the same mistake and are not tripped up by
// formatting. Each variation records the check that should fail, or none.
import { SAMPLES } from './samples.js';

const byId = Object.fromEntries(SAMPLES.map((s) => [s.id, s]));

// [base sample, find, replace, check that should fail, description]
const EDITS = [
  ...['may be', 'could be', 'is possibly', 'appears to be', 'seems to be', 'is potentially'].map((w) =>
    ['p11-ok-4', 'is consistent', `${w} consistent`, 'judgement', `"${w} consistent"`]),
  ['p11-ok-4', 'the condition that the applicant has is consistent', 'the injuries that the applicant has are consistent', null, 'injuries "are consistent"'],
  ['p11-ok-4', 'I have examined', 'I have treated', null, '"treated" instead of "examined"'],

  ...['may be', 'could be', 'is possibly'].map((w) =>
    ['p19-ok-6', 'was assessed as being, or at risk of being,', w, 'assessment', `"${w} a victim"`]),
  ['p19-ok-6', 'was assessed as being, or at risk of being,', 'may have been assessed as being', 'assessment', '"may have been assessed"'],

  ...['we have provided', 'we are providing', 'we provided'].map((w) =>
    ['p14-ok-10', 'I can confirm that I am providing', `I can confirm that ${w}`, 'support', `"${w}"`]),
  ['p14-ok-10', 'I can confirm that I am providing', 'I can confirm that I have provided', null, '"I have provided"'],
  ['p11-ok-4', 'condition that she presented', 'condition that she presented on 14th May 2026', null, 'dated in May (the month is not a hedge)'],

  ['p18-ok-8', 'Name of perpetrator: John Doe\n', '', null, 'perpetrator line removed but named later'],
  ['p18-ok-8', ', with whom John Doe is or was in a family relationship,', '', 'relationship', 'family relationship removed'],
  ['p18-ok-8', ' on 28th September 2026', '', 'date', 'date of refusal removed'],
  ['p18-ok-8', 'refused admission to a refuge', 'not given a place in a refuge', 'refused', '"not given a place" instead of "refused admission"'],

  ['p17-ok-0', 'disclosures surrounding emotional, physical and psychological abuse with coercive and controlling behaviour', 'victim disclosure', 'matters', 'matters relied on: "victim disclosure"'],
  ['p17-ok-0', 'disclosures surrounding emotional, physical and psychological abuse with coercive and controlling behaviour', 'her account and our referral', 'matters', 'matters relied on: "her account and our referral"'],
  ['p17-ok-0', ' and has been operating for an uninterrupted period of six months or more', '', 'operating', 'six months of operation removed'],
  ['p17-ok-0', 'Ms Doe was a victim', 'Ms Doe might be a victim', 'judgement', 'judgement "might be a victim"'],
];

const FORMATS = [
  ['upper', 'in capital letters', (t) => t.toUpperCase()],
  ['wrapped', 'with line breaks every 60 characters', (t) => t.replace(/\s+/g, ' ').replace(/(.{1,60})(\s|$)/g, '$1\n')],
  ['quotes', 'with curly quotes and extra spaces', (t) => t.replace(/'/g, '\u2019').replace(/ /g, '  ')],
];

export function variations() {
  const out = EDITS.map(([base, find, replace, failId, what], i) => {
    const s = byId[base];
    if (!s.text.includes(find)) throw new Error(`variation ${i}: "${find}" not in ${base}`);
    return {
      id: `${base}-v${i}`, type: s.type, base, failId,
      expected: failId ? 'rejected' : 'accepted',
      label: `${s.label.replace(/ – .*/, '')}: ${what}`,
      text: s.text.replace(find, replace),
    };
  });
  for (const s of SAMPLES.filter((x) => x.expected === 'accepted')) {
    for (const [key, what, fn] of FORMATS) {
      out.push({ id: `${s.id}-${key}`, type: s.type, base: s.id, failId: null, expected: 'accepted', label: `${s.label.replace(/ – .*/, '')}: ${what}`, text: fn(s.text) });
    }
  }
  return out;
}
