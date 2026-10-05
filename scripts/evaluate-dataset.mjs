// Scores the letter rules (src/app/rules.js) against a generated dataset
// (scripts/generate-dataset.mjs). The labels come from the LAA evidence
// guidance, not from caseworker decisions, so these numbers measure agreement
// with the guidance as we read it, not real-world accuracy.
//
//   node scripts/evaluate-dataset.mjs [data/laa-synthetic-1000.jsonl] [--json] [--errors]
import { readFileSync } from 'node:fs';
import { checkLetter, detectType } from '../src/app/rules.js';

// Dataset failure reasons and the rule check that should catch each. Missing
// entries can't be judged from the letter alone (for example, evidence dated
// after the determination needs the application date).
export const FAIL_TO_CHECK = {
  p11: { judgement: 'judgement', 'not-consistent': 'judgement', 'not-examined': 'examined', 'not-appropriate-hp': 'author', 'overseas-no-registration': 'author' },
  p14: { support: 'support', 'future-support': 'support', 'not-idva': 'role', 'client-not-named': 'named', perpetrator: 'perpetrator', 'not-sexual-violence': 'sexual', 'not-isva': 'role' },
  p17: { matters: 'matters', operating: 'operating', 'new-org': 'operating', location: 'location', judgement: 'judgement', reason: 'reason', 'support-desc': 'support' },
  p18: { perpetrator: 'perpetrator', relationship: 'relationship', date: 'date', reason: 'reason', refused: 'refused' },
  p19: { assessment: 'assessment', 'no-assessment': 'assessment', perpetrator: 'perpetrator', relationship: 'relationship', 'not-public-authority': 'org' },
  marac: { perpetrator: 'perpetrator', risk: 'risk', 'single-agency': 'forum' },
};

export function score(rows, today = new Date('2026-10-05T00:00:00Z')) {
  const out = rows.map((r) => {
    const detected = detectType(r.text);
    const res = checkLetter(r.text, undefined, { today });
    const failed = res.checks.filter((c) => c.status === 'fail').map((c) => c.id);
    // Accepted means the checker is confident (high level) the letter meets the requirements.
    const predicted = res.outcome === 'unknown' ? 'unknown' : res.outcome === 'ready' ? 'accepted' : 'rejected';
    const want = r.appType ? FAIL_TO_CHECK[r.appType]?.[r.failId] : null;
    return { ...r, detected, predicted, failed, want, confidence: res.confidence, textCheckable: !r.failId || !!want };
  });
  const inScope = out.filter((r) => r.appType);
  const outScope = out.filter((r) => !r.appType);
  // Letters labelled "needs human review" have no right answer, so they are
  // reported but not scored.
  const judged = inScope.filter((r) => r.textCheckable && r.expected !== 'review');
  const correct = (r) => r.detected === r.appType && r.predicted === r.expected;
  const tp = judged.filter((r) => r.expected === 'rejected' && r.predicted === 'rejected').length;
  const fn = judged.filter((r) => r.expected === 'rejected' && r.predicted !== 'rejected').length;
  const fp = judged.filter((r) => r.expected === 'accepted' && r.predicted === 'rejected').length;
  const tn = judged.filter((r) => r.expected === 'accepted' && r.predicted === 'accepted').length;
  const byType = {};
  for (const r of judged) {
    const s = (byType[r.appType] ??= { total: 0, detected: 0, correct: 0, rightReason: 0, rejected: 0 });
    s.total++;
    if (r.detected === r.appType) s.detected++;
    if (correct(r)) s.correct++;
    if (r.expected === 'rejected') { s.rejected++; if (correct(r) && r.failed.includes(r.want)) s.rightReason++; }
  }
  // For each confidence level: how many letters landed there, and how many of
  // those actually meet the requirements.
  const levels = {};
  for (const r of judged.filter((x) => x.confidence)) {
    const l = (levels[r.confidence.level] ??= { letters: 0, meetRequirements: 0 });
    l.letters++;
    if (r.expected === 'accepted') l.meetRequirements++;
  }
  return {
    rows: out,
    summary: {
      levels,
      inScope: inScope.length,
      textCheckable: judged.length,
      correct: judged.filter(correct).length,
      accuracy: judged.filter(correct).length / judged.length,
      denied: { tp, fn, fp, tn, recall: tp / (tp + fn), precision: tp / (tp + fp) },
      outOfScope: {
        total: outScope.length,
        unknown: outScope.filter((r) => r.predicted === 'unknown').length,
        // Out-of-scope evidence the checker mistakes for a supported letter
        // and passes: the dangerous case.
        wronglyPassed: outScope.filter((r) => r.predicted === 'accepted').length,
      },
      byType,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'data/laa-synthetic-1000.jsonl';
  const rows = readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
  const { rows: scored, summary } = score(rows);
  if (process.argv.includes('--json')) { console.log(JSON.stringify(summary, null, 2)); process.exit(0); }
  const pct = (x) => `${(100 * x).toFixed(1)}%`;
  console.log(`${file}`);
  console.log(`In scope (types the checker supports): ${summary.inScope}; judgeable from the letter text: ${summary.textCheckable}`);
  const review = scored.filter((r) => r.expected === 'review');
  if (review.length) console.log(`Needs human review (not scored): ${review.map((r) => `${r.id} ${r.predicted}${r.confidence ? ` ${r.confidence.score}%` : ''}`).join(', ')}`);
  console.log(`Accuracy: ${summary.correct}/${summary.textCheckable} = ${pct(summary.accuracy)}`);
  const d = summary.denied;
  console.log(`Denied letters caught: ${d.tp}/${d.tp + d.fn} (recall ${pct(d.recall)}); good letters wrongly flagged: ${d.fp}/${d.fp + d.tn}; precision ${pct(d.precision)}`);
  console.log(`Out of scope: ${summary.outOfScope.total} – returned "not recognised" ${summary.outOfScope.unknown}, wrongly passed ${summary.outOfScope.wronglyPassed}`);
  console.log('Confidence levels (share of letters at each level that meet the requirements):');
  console.table(Object.fromEntries(['high', 'medium', 'low'].map((k) => [k, { ...(summary.levels[k] ?? { letters: 0, meetRequirements: 0 }), share: summary.levels[k] ? pct(summary.levels[k].meetRequirements / summary.levels[k].letters) : '–' }])));
  console.table(Object.fromEntries(Object.entries(summary.byType).map(([k, s]) => [k, { ...s, rightReason: `${s.rightReason}/${s.rejected}` }])));
  if (process.argv.includes('--errors')) {
    const groups = {};
    for (const r of scored.filter((x) => x.appType && x.textCheckable && !(x.detected === x.appType && x.predicted === x.expected))) {
      const k = `${r.appType} ${r.expected}${r.failId ? `(${r.failId})` : ''} → detected ${r.detected}, ${r.predicted}${r.failed.length ? ` [${r.failed.join(',')}]` : ''}`;
      (groups[k] ??= []).push(r.id);
    }
    for (const [k, v] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) console.log(String(v.length).padStart(3), k, v.slice(0, 3).join(' '));
    const passed = {};
    for (const r of scored.filter((x) => !x.appType && x.predicted === 'accepted')) {
      const k = `S${r.schedule} para ${r.paragraph} ${r.expected} → passed as ${r.detected}`;
      (passed[k] ??= []).push(r.id);
    }
    console.log('\nOut-of-scope evidence passed as a supported letter:');
    for (const [k, v] of Object.entries(passed).sort((a, b) => b[1].length - a[1].length)) console.log(String(v.length).padStart(3), k, v.slice(0, 3).join(' '));
  }
}
