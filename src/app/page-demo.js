import { checkLetter, changeRequest } from './rules.js';
import { SAMPLES } from './samples.js';
import { evaluate } from './evaluate.js';
import { escapeHtml } from './chat.js';
import { checksList, confidenceText, OUTCOME } from './render.js';

const before = SAMPLES.find((s) => s.id === 'p11-bad-5').text;
const after = before.replace('might be consistent', 'is consistent');
const rb = checkLetter(before);
const ra = checkLetter(after);
const mark = (t, w) => escapeHtml(t).replace(w, `<mark>${w}</mark>`);
document.getElementById('demo-before').innerHTML = mark(before, 'might be consistent');
document.getElementById('demo-before-result').innerHTML = `<p class="govuk-body">Result: ${OUTCOME[rb.outcome].tag} Confidence ${confidenceText(rb)}</p>${checksList({ checks: rb.checks.filter((c) => c.status !== 'pass') })}`;
document.getElementById('demo-message').textContent = changeRequest(rb);
document.getElementById('demo-after').innerHTML = mark(after, 'is consistent');
document.getElementById('demo-after-result').innerHTML = `<p class="govuk-body">Result: ${OUTCOME[ra.outcome].tag} Confidence ${confidenceText(ra)}</p>`;

const { rows, summary } = evaluate();
const names = { pack: 'Hackathon evidence pack', synthetic: 'Fictional letters for other types', variation: 'Variations of the pack letters', all: 'All letters' };
document.getElementById('demo-accuracy').innerHTML = `<table class="govuk-table">
<caption class="govuk-table__caption govuk-table__caption--m">Results by source</caption>
<thead class="govuk-table__head"><tr class="govuk-table__row"><th scope="col" class="govuk-table__header">Letters</th><th scope="col" class="govuk-table__header govuk-table__header--numeric">Number</th><th scope="col" class="govuk-table__header govuk-table__header--numeric">Correct</th></tr></thead>
<tbody class="govuk-table__body">${Object.entries(summary).map(([k, v]) => `<tr class="govuk-table__row"><th scope="row" class="govuk-table__header">${names[k]}</th><td class="govuk-table__cell govuk-table__cell--numeric">${v.total}</td><td class="govuk-table__cell govuk-table__cell--numeric">${v.correct} (${Math.round((100 * v.correct) / v.total)}%)</td></tr>`).join('')}</tbody>
</table>
<details class="govuk-details"><summary class="govuk-details__summary"><span class="govuk-details__summary-text">See every letter</span></summary><div class="govuk-details__text">
<table class="govuk-table"><thead class="govuk-table__head"><tr class="govuk-table__row"><th scope="col" class="govuk-table__header">Letter</th><th scope="col" class="govuk-table__header">Expected</th><th scope="col" class="govuk-table__header">Checker</th></tr></thead>
<tbody class="govuk-table__body">${rows.map((r) => `<tr class="govuk-table__row"><td class="govuk-table__cell">${escapeHtml(r.label)}</td><td class="govuk-table__cell">${r.expected}${r.failId ? ` (${r.failId})` : ''}</td><td class="govuk-table__cell">${r.correct ? 'Correct' : `<strong>Wrong</strong> – ${r.predicted} (${r.failed.join(', ') || 'no failures'})`}</td></tr>`).join('')}</tbody></table>
</div></details>`;

const num = (id) => Math.max(0, Number(String(document.getElementById(id).value).replace(/[^\d.]/g, '')) || 0);
function impact() {
  const returns = num('i-apps') * (num('i-returned') / 100);
  const avoided = Math.round(returns * (num('i-caught') / 100));
  const fmt = (n) => n.toLocaleString('en-GB');
  document.getElementById('impact-result').innerHTML = `<div class="govuk-panel govuk-panel--confirmation app-panel-left">
  <h3 class="govuk-panel__title govuk-!-font-size-36">${fmt(avoided)} returned applications avoided a year</h3>
  <div class="govuk-panel__body govuk-!-font-size-24">${fmt(avoided * num('i-days'))} days of waiting saved for victims<br>${fmt(Math.round((avoided * num('i-mins')) / 60))} staff hours saved</div>
</div>`;
}
document.getElementById('impact-form').addEventListener('input', impact);
document.getElementById('impact-form').addEventListener('submit', (e) => e.preventDefault());
impact();
