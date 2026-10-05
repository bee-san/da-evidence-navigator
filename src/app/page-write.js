import { BUILDER, buildLetter, exampleAnswers } from './builder.js';
import { ROUTES } from './routes.js';
import { checkLetter } from './rules.js';
import { escapeHtml } from './chat.js';
import { checksList, confidenceText, OUTCOME } from './render.js';

const select = document.getElementById('write-type');
const fields = document.getElementById('write-fields');
const result = document.getElementById('write-result');

select.innerHTML = Object.keys(BUILDER).map((k) => `<option value="${k}">${escapeHtml(ROUTES[k].title.replace(/^A letter from (an? )?/, '').replace(/^./, (c) => c.toUpperCase()))}</option>`).join('');

function field(f) {
  const hint = f.hint ? `<div id="w-${f.id}-hint" class="govuk-hint">${escapeHtml(f.hint)}</div>` : '';
  const desc = f.hint ? ` aria-describedby="w-${f.id}-hint"` : '';
  const label = escapeHtml(f.label) + (f.optional ? ' (optional)' : '');
  if (f.kind === 'radios') {
    return `<div class="govuk-form-group"><fieldset class="govuk-fieldset"><legend class="govuk-fieldset__legend govuk-fieldset__legend--s">${label}</legend>
<div class="govuk-radios govuk-radios--small" data-module="govuk-radios">${f.options.map(([v, l], i) => `<div class="govuk-radios__item"><input class="govuk-radios__input" id="w-${f.id}-${i}" name="${f.id}" type="radio" value="${escapeHtml(v)}"${i === 0 ? ' checked' : ''}><label class="govuk-label govuk-radios__label" for="w-${f.id}-${i}">${escapeHtml(l)}</label></div>`).join('')}</div></fieldset></div>`;
  }
  if (f.kind === 'textarea') {
    return `<div class="govuk-form-group"><label class="govuk-label govuk-label--s" for="w-${f.id}">${label}</label>${hint}<textarea class="govuk-textarea" id="w-${f.id}" name="${f.id}" rows="3"${desc}></textarea></div>`;
  }
  return `<div class="govuk-form-group"><label class="govuk-label govuk-label--s" for="w-${f.id}">${label}</label>${hint}<input class="govuk-input ${f.width || ''}" id="w-${f.id}" name="${f.id}" type="text" autocomplete="off" spellcheck="false"${desc}></div>`;
}

function render() {
  fields.innerHTML = BUILDER[select.value].fields.map(field).join('');
  result.innerHTML = '';
}

function answers() {
  const data = new FormData(document.getElementById('write-form'));
  return Object.fromEntries(BUILDER[select.value].fields.map((f) => [f.id, data.get(f.id) || '']));
}

select.addEventListener('change', render);
document.getElementById('write-example').addEventListener('click', () => {
  const ex = exampleAnswers(select.value);
  for (const f of BUILDER[select.value].fields) {
    if (f.kind === 'radios') continue;
    document.getElementById(`w-${f.id}`).value = ex[f.id] || '';
  }
});

document.getElementById('write-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const { text, missing } = buildLetter(select.value, answers());
  const r = checkLetter(text, select.value);
  result.innerHTML = `${missing.length ? `<div class="govuk-warning-text"><span class="govuk-warning-text__icon" aria-hidden="true">!</span><strong class="govuk-warning-text__text"><span class="govuk-visually-hidden">Warning</span> Fill in: ${missing.map(escapeHtml).join(', ')}.</strong></div>` : ''}
<h2 class="govuk-heading-m">Your letter</h2>
<pre class="app-note" id="written">${escapeHtml(text)}</pre>
<div class="govuk-button-group">
  <button type="button" class="govuk-button" id="copy-letter" data-module="govuk-button">Copy the letter</button>
</div>
<p class="govuk-body govuk-!-font-weight-bold" id="copy-letter-status" aria-live="polite"></p>
<h2 class="govuk-heading-m">Check of this letter ${OUTCOME[r.outcome].tag}</h2>
<p class="govuk-body">Confidence that it meets the requirements: <strong>${confidenceText(r)}</strong></p>
${checksList(r)}
<p class="govuk-body">Print it on your organisation's letterhead, then sign and date it.</p>`;
  document.getElementById('copy-letter').addEventListener('click', async () => {
    const status = document.getElementById('copy-letter-status');
    try { await navigator.clipboard.writeText(text); status.textContent = 'Letter copied.'; } catch { status.textContent = 'Could not copy. Select the text and copy it instead.'; }
  });
  result.focus();
});

render();
