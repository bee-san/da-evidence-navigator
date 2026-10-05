// Comparison with a large language model, for the prototype only. Sends the
// letter to /api/check-letter (which calls the model through the Vercel AI
// Gateway) and shows the model's view beside the on-device rules.
import { escapeHtml } from './chat.js';
import { LETTER_TYPES, CONFIDENCE } from './rules.js';
import { confidenceText } from './render.js';

export const COMPARE_MODEL = 'gpt-6-sol';

export async function modelCheck(text, type) {
  const res = await fetch('/api/check-letter', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, type: type || undefined }),
  });
  if (!res.ok) throw new Error(res.status === 503 ? 'not configured' : 'unavailable');
  return res.json();
}

const STATUS = {
  met: '<strong class="govuk-tag govuk-tag--green">Met</strong>',
  not_met: '<strong class="govuk-tag govuk-tag--red">Not met</strong>',
  unclear: '<strong class="govuk-tag govuk-tag--yellow">Unclear</strong>',
};
const MEETS = { yes: 'Meets the requirements', no: 'Does not meet the requirements', unclear: 'Unclear – a person should decide' };
const level = (n) => (n >= CONFIDENCE.high ? 'high' : n >= CONFIDENCE.medium ? 'medium' : 'low');
const rulesVerdict = (r) => (r.outcome === 'unknown' ? 'Did not recognise the letter type'
  : { ready: 'Looks ready', check: 'May need a change', changes: 'Needs changes' }[r.outcome]);

export function compareHtml(m, rules) {
  const type = m.type ? LETTER_TYPES[m.type] : 'Not a type the checker covers';
  const agree = rules.outcome !== 'unknown' && ((rules.outcome === 'ready') === (m.meets === 'yes'));
  return `<h2 class="govuk-heading-m">Comparison with ${escapeHtml(m.model || COMPARE_MODEL)}</h2>
<table class="govuk-table">
  <thead class="govuk-table__head"><tr class="govuk-table__row"><th scope="col" class="govuk-table__header"></th><th scope="col" class="govuk-table__header">Rules on this device</th><th scope="col" class="govuk-table__header">${escapeHtml(m.model || COMPARE_MODEL)}</th></tr></thead>
  <tbody class="govuk-table__body">
    <tr class="govuk-table__row"><th scope="row" class="govuk-table__header">Letter type</th><td class="govuk-table__cell">${rules.type ? escapeHtml(LETTER_TYPES[rules.type]) : 'Not recognised'}</td><td class="govuk-table__cell">${escapeHtml(type)}</td></tr>
    <tr class="govuk-table__row"><th scope="row" class="govuk-table__header">Result</th><td class="govuk-table__cell">${rulesVerdict(rules)}</td><td class="govuk-table__cell">${MEETS[m.meets]}</td></tr>
    <tr class="govuk-table__row"><th scope="row" class="govuk-table__header">Confidence</th><td class="govuk-table__cell">${rules.confidence ? confidenceText(rules) : '–'}</td><td class="govuk-table__cell">${m.confidence}% (${level(m.confidence)})</td></tr>
  </tbody>
</table>
<p class="govuk-body"><strong>${rules.outcome === 'unknown' ? 'The rules could not check this letter.' : agree ? 'The rules and the model agree.' : 'The rules and the model disagree.'}</strong> ${escapeHtml(m.summary || '')}</p>
<dl class="govuk-summary-list app-check-result">
${(m.requirements || []).map((q) => `  <div class="govuk-summary-list__row">
    <dt class="govuk-summary-list__key">${escapeHtml(q.requirement)}</dt>
    <dd class="govuk-summary-list__value"><p class="govuk-body">${escapeHtml(q.note)}</p>${q.evidence ? `<p class="govuk-body govuk-body-s">“${escapeHtml(q.evidence)}”</p>` : ''}</dd>
    <dd class="govuk-summary-list__actions">${STATUS[q.status] || ''}</dd>
  </div>`).join('\n')}
</dl>
<div class="govuk-inset-text">The model's confidence is its own estimate, not a measured probability. This comparison is for testing the prototype.</div>`;
}
