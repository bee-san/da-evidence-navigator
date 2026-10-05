// Runs the rules over every test letter and summarises the results.
// Used by the tests and the demo page, so both report the same numbers.
import { checkLetter, detectType } from './rules.js';
import { SAMPLES } from './samples.js';
import { SYNTHETIC } from './synthetic.js';
import { variations } from './variations.js';

const REASONS = { 'p11-bad-5': 'judgement', 'p14-bad-11': 'support', 'p17-bad-3': 'matters', 'p18-bad-9': 'perpetrator', 'p19-bad-7': 'assessment' };

export function allLetters() {
  return [
    ...SAMPLES.map((s) => ({ ...s, source: 'pack', failId: REASONS[s.id] || null })),
    ...SYNTHETIC,
    ...variations().map((v) => ({ ...v, source: 'variation' })),
  ];
}

export function evaluate(today = new Date('2026-10-05T00:00:00Z')) {
  const rows = allLetters().map((l) => {
    const detected = detectType(l.text);
    const r = checkLetter(l.text, undefined, { today });
    const failed = r.checks.filter((c) => c.status === 'fail').map((c) => c.id);
    // Accepted means the checker is confident (high level) the letter meets the requirements.
    const predicted = r.outcome === 'ready' ? 'accepted' : 'rejected';
    const correct = detected === l.type && predicted === l.expected && (!l.failId || failed.includes(l.failId));
    return { id: l.id, label: l.label, source: l.source, type: l.type, detected, expected: l.expected, predicted, confidence: r.confidence, failId: l.failId, failed, correct };
  });
  const by = (src) => rows.filter((r) => !src || r.source === src);
  const summary = Object.fromEntries(['pack', 'synthetic', 'variation', ''].map((src) => {
    const rs = by(src);
    return [src || 'all', { total: rs.length, correct: rs.filter((r) => r.correct).length }];
  }));
  return { rows, summary };
}
