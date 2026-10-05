// Shared HTML for showing a letter check result.
import { LETTER_TYPES, TYPE_SOURCE, changeRequest } from './rules.js';
import { escapeHtml } from './chat.js';

export const TAGS = {
  pass: '<strong class="govuk-tag govuk-tag--green">OK</strong>',
  warn: '<strong class="govuk-tag govuk-tag--yellow">Check</strong>',
  fail: '<strong class="govuk-tag govuk-tag--red">Change needed</strong>',
};

export const OUTCOME = {
  ready: { tag: '<strong class="govuk-tag govuk-tag--green">Looks ready</strong>', title: 'This letter looks ready', text: 'Give it to your solicitor. They and the Legal Aid Agency will make the final decision.' },
  check: { tag: '<strong class="govuk-tag govuk-tag--yellow">Check</strong>', title: 'This letter may need a change', text: 'Ask your solicitor whether the points below matter for your application.' },
  changes: { tag: '<strong class="govuk-tag govuk-tag--red">Needs changes</strong>', title: 'This letter needs changes', text: 'Ask the person who wrote it to update it. You can send them the message below.' },
};

const LEVEL = { high: 'High', medium: 'Medium', low: 'Low' };
const CERTAINTY = { definite: 'Certain', likely: 'Probably', possible: 'Possibly' };

// "Confidence: 60% (medium)" – how sure the checker is that the letter meets the requirements.
export function confidenceText(r) {
  return r.confidence ? `${r.confidence.score}% (${LEVEL[r.confidence.level].toLowerCase()})` : '';
}

export function checksList(r) {
  return `<dl class="govuk-summary-list app-check-result">
${r.checks.map((c) => `  <div class="govuk-summary-list__row">
    <dt class="govuk-summary-list__key">${escapeHtml(c.label)}</dt>
    <dd class="govuk-summary-list__value"><p class="govuk-body">${escapeHtml(c.detail)}</p>${c.status === 'fail' ? `<p class="govuk-body"><strong>How sure:</strong> ${CERTAINTY[c.certainty]}</p>` : ''}${c.fix && c.status !== 'pass' ? `<p class="govuk-body"><strong>What to change:</strong> ${escapeHtml(c.fix)}</p>` : ''}</dd>
    <dd class="govuk-summary-list__actions">${TAGS[c.status]}</dd>
  </div>`).join('\n')}
</dl>`;
}

export function resultHtml(r, { headingLevel = 2 } = {}) {
  const o = OUTCOME[r.outcome];
  const h = `h${headingLevel}`;
  const req = changeRequest(r);
  const guidance = TYPE_SOURCE[r.type] === 'guidance'
    ? '<div class="govuk-inset-text">There were no real examples of this type of letter to test against, so this check is based on GOV.UK guidance only.</div>' : '';
  return `
<div class="govuk-notification-banner${r.outcome === 'ready' ? ' govuk-notification-banner--success' : ''}" role="region" aria-labelledby="result-title">
  <div class="govuk-notification-banner__header"><${h} class="govuk-notification-banner__title" id="result-title">Result</${h}></div>
  <div class="govuk-notification-banner__content">
    <p class="govuk-notification-banner__heading">${o.title}</p>
    <p class="govuk-body">Confidence that it meets the Legal Aid Agency's requirements: <strong>${confidenceText(r)}</strong>. <a class="govuk-link" href="rules.html">How the checks work</a></p>
    <p class="govuk-body">${o.text}</p>
  </div>
</div>
<${h} class="govuk-heading-m">${escapeHtml(LETTER_TYPES[r.type])}</${h}>
${guidance}
${checksList(r)}
${req ? `<${h} class="govuk-heading-m">Message to send back</${h}><pre class="app-note">${escapeHtml(req)}</pre>` : ''}`;
}
