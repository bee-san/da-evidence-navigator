import { checkLetter, changeRequest, LETTER_TYPES } from './rules.js';
import { SAMPLES } from './samples.js';
import { escapeHtml } from './chat.js';

const type = document.getElementById('type');
const sample = document.getElementById('sample');
const letter = document.getElementById('letter');
const result = document.getElementById('result');

type.insertAdjacentHTML('beforeend', Object.entries(LETTER_TYPES).map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`).join(''));
sample.insertAdjacentHTML('beforeend', SAMPLES.map((s) => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join(''));

sample.addEventListener('change', () => {
  const s = SAMPLES.find((x) => x.id === sample.value);
  if (!s) return;
  letter.value = s.text;
  type.value = '';
  result.innerHTML = '';
});

const TAGS = {
  pass: '<strong class="govuk-tag govuk-tag--green">OK</strong>',
  warn: '<strong class="govuk-tag govuk-tag--yellow">Check</strong>',
  fail: '<strong class="govuk-tag govuk-tag--red">Change needed</strong>',
};

function setError(msg) {
  const group = document.getElementById('letter-group');
  const err = document.getElementById('letter-error');
  group.classList.toggle('govuk-form-group--error', !!msg);
  letter.classList.toggle('govuk-textarea--error', !!msg);
  err.hidden = !msg;
  document.getElementById('letter-error-text').textContent = msg || '';
  if (msg) letter.focus();
}

document.getElementById('letter-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = letter.value.trim();
  if (!text) return setError('Paste the text of the letter');
  const r = checkLetter(text, type.value || undefined);
  if (r.outcome === 'unknown') return setError('We could not tell what type of letter this is. Choose the type of letter');
  setError('');

  const banner = {
    ready: ['govuk-notification-banner--success', 'This letter looks ready', 'Give it to your solicitor. They and the Legal Aid Agency will make the final decision.'],
    check: ['', 'This letter may need a small change', 'Ask your solicitor whether the points marked "Check" matter for your application.'],
    changes: ['', 'This letter needs changes', 'Ask the person who wrote it to update it. You can send them the message below.'],
  }[r.outcome];

  const req = changeRequest(r);
  result.innerHTML = `
<div class="govuk-notification-banner ${banner[0]}" role="region" aria-labelledby="result-title">
  <div class="govuk-notification-banner__header"><h2 class="govuk-notification-banner__title" id="result-title">Result</h2></div>
  <div class="govuk-notification-banner__content">
    <p class="govuk-notification-banner__heading">${banner[1]}</p>
    <p class="govuk-body">${banner[2]}</p>
  </div>
</div>
<h2 class="govuk-heading-m">${escapeHtml(LETTER_TYPES[r.type])}</h2>
<dl class="govuk-summary-list app-check-result">
${r.checks.map((c) => `  <div class="govuk-summary-list__row">
    <dt class="govuk-summary-list__key">${escapeHtml(c.label)}</dt>
    <dd class="govuk-summary-list__value"><p class="govuk-body">${escapeHtml(c.detail)}</p>${c.fix && c.status !== 'pass' ? `<p class="govuk-body"><strong>What to change:</strong> ${escapeHtml(c.fix)}</p>` : ''}</dd>
    <dd class="govuk-summary-list__actions">${TAGS[c.status]}</dd>
  </div>`).join('\n')}
</dl>
${req ? `<h2 class="govuk-heading-m">Message to send back</h2><pre class="app-note">${escapeHtml(req)}</pre>` : ''}
<div class="govuk-inset-text">This is a screening check based on example letters. It does not decide whether you get legal aid.</div>`;
  result.focus();
});
