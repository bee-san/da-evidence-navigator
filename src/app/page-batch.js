import { checkLetter, LETTER_TYPES } from './rules.js';
import { SAMPLES } from './samples.js';
import { SYNTHETIC } from './synthetic.js';
import { escapeHtml } from './chat.js';
import { OUTCOME, confidenceText } from './render.js';
import { extractText } from './ocr.js';

const text = document.getElementById('batch-text');
const files = document.getElementById('batch-files');
const status = document.getElementById('batch-status');
const result = document.getElementById('batch-result');

document.getElementById('batch-examples').addEventListener('click', () => {
  text.value = [...SAMPLES, ...SYNTHETIC].map((s) => s.text).join('\n---\n');
});

document.getElementById('batch-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const letters = text.value.split(/^\s*---\s*$/m).map((t, i) => ({ name: `Pasted letter ${i + 1}`, text: t.trim() })).filter((l) => l.text);
  for (const [i, f] of [...files.files].entries()) {
    status.textContent = `Reading file ${i + 1} of ${files.files.length}: ${f.name}`;
    try { letters.push({ name: f.name, text: await extractText(f, (m) => { status.textContent = `${f.name}: ${m}`; }) }); } catch { letters.push({ name: f.name, text: '' }); }
  }
  if (!letters.length) { status.textContent = 'Add or paste at least one letter.'; return; }
  const rows = letters.map((l) => ({ ...l, r: checkLetter(l.text) }));
  const count = (o) => rows.filter((x) => x.r.outcome === o).length;
  status.textContent = `Checked ${rows.length} letters.`;
  result.innerHTML = `<h2 class="govuk-heading-m">Results</h2>
<p class="govuk-body">${count('ready')} look ready, ${count('check')} need checking, ${count('changes')} need changes, ${count('unknown')} could not be read.</p>
<table class="govuk-table">
  <thead class="govuk-table__head"><tr class="govuk-table__row">
    <th scope="col" class="govuk-table__header">Letter</th><th scope="col" class="govuk-table__header">Type</th><th scope="col" class="govuk-table__header">Result</th><th scope="col" class="govuk-table__header">What to change</th>
  </tr></thead>
  <tbody class="govuk-table__body">${rows.map(({ name, text: t, r }) => `<tr class="govuk-table__row">
    <th scope="row" class="govuk-table__header">${escapeHtml(name)}<br><span class="govuk-body-s">${escapeHtml(t.slice(0, 60))}${t.length > 60 ? '…' : ''}</span></th>
    <td class="govuk-table__cell">${r.type ? escapeHtml(LETTER_TYPES[r.type]) : 'Not recognised'}</td>
    <td class="govuk-table__cell">${r.outcome === 'unknown' ? '<strong class="govuk-tag govuk-tag--grey">Not checked</strong>' : `${OUTCOME[r.outcome].tag}<br><span class="govuk-body-s">Confidence ${confidenceText(r)}</span>`}</td>
    <td class="govuk-table__cell">${r.outcome === 'unknown' ? 'Check this letter on its own and choose its type.' : `<ul class="govuk-list govuk-list--bullet govuk-!-margin-bottom-0">${r.checks.filter((c) => c.status !== 'pass').map((c) => `<li>${escapeHtml(c.fix)}</li>`).join('') || '<li>Nothing</li>'}</ul>`}</td>
  </tr>`).join('')}</tbody>
</table>`;
  files.value = '';
  result.focus();
});
