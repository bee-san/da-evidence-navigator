// Runs the AI model comparison (api/check-letter.js) over a JSONL dataset and
// sets its verdicts beside the on-device rules. Spends AI Gateway credit: one
// call per letter. Needs AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN.
//
//   node scripts/compare-model.mjs data/demo16.jsonl [--limit 20]
import { readFileSync } from 'node:fs';
import { POST } from '../api/check-letter.js';
import { checkLetter } from '../src/app/rules.js';

const file = process.argv[2] ?? 'data/demo16.jsonl';
const limit = Number(process.argv[process.argv.indexOf('--limit') + 1]) || Infinity;
const rows = readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse).filter((r) => r.appType).slice(0, limit);
const today = new Date('2026-10-05T00:00:00Z');
const tally = { rules: 0, model: 0, scored: 0 };
for (const r of rows) {
  const rules = checkLetter(r.text, undefined, { today });
  const res = await POST(new Request('http://local/api/check-letter', { method: 'POST', body: JSON.stringify({ text: r.text }) }));
  const m = await res.json();
  if (m.error) { console.log(r.id, 'model error', m); continue; }
  const rulesSays = rules.outcome === 'ready' ? 'accepted' : 'rejected';
  const modelSays = m.meets === 'yes' ? 'accepted' : m.meets === 'no' ? 'rejected' : 'review';
  if (r.expected !== 'review') {
    tally.scored++;
    if (rules.type === r.appType && rulesSays === r.expected) tally.rules++;
    if (m.type === r.appType && modelSays === r.expected) tally.model++;
  }
  console.log([r.id, `label ${r.expected}`, `rules ${rules.type ?? '–'} ${rulesSays} ${rules.confidence?.score ?? '–'}%`, `model ${m.type ?? '–'} ${modelSays} ${m.confidence}%`].join(' | '));
}
console.log(`Correct (type and outcome), excluding "review" labels: rules ${tally.rules}/${tally.scored}, model ${tally.model}/${tally.scored}`);
