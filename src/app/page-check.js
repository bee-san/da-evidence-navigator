import { QUESTIONS, ROUTES, OTHER_ROUTES } from './routes.js';
import { escapeHtml, LINKS } from './chat.js';
import { Checkboxes } from '../assets/govuk/govuk-frontend.min.js';

const options = document.getElementById('routes-options');
options.innerHTML = QUESTIONS.map((q, i) => `
  <div class="govuk-checkboxes__item">
    <input class="govuk-checkboxes__input" id="route-${i}" name="route" type="checkbox" value="${q.value}"${q.hint ? ` aria-describedby="route-${i}-hint"` : ''}>
    <label class="govuk-label govuk-checkboxes__label" for="route-${i}">${escapeHtml(q.label)}</label>
    ${q.hint ? `<div id="route-${i}-hint" class="govuk-hint govuk-checkboxes__hint">${escapeHtml(q.hint)}</div>` : ''}
  </div>`).join('') + `
  <div class="govuk-checkboxes__divider">or</div>
  <div class="govuk-checkboxes__item">
    <input class="govuk-checkboxes__input" id="route-none" name="route" type="checkbox" value="none" data-behaviour="exclusive">
    <label class="govuk-label govuk-checkboxes__label" for="route-none">None of these</label>
  </div>`;
new Checkboxes(options);

const form = document.getElementById('routes-form');
const results = document.getElementById('results');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const picked = [...form.querySelectorAll('input[name=route]:checked')].map((i) => i.value);
  const group = document.getElementById('routes-group');
  const error = document.getElementById('routes-error');
  if (!picked.length) {
    group.classList.add('govuk-form-group--error');
    error.hidden = false;
    document.getElementById('route-0').focus();
    return;
  }
  group.classList.remove('govuk-form-group--error');
  error.hidden = true;
  render(picked);
});

function render(picked) {
  const letters = picked.filter((p) => ROUTES[p]);
  const other = picked.filter((p) => OTHER_ROUTES[p]);
  let html = '<h1 class="govuk-heading-l">Evidence you may be able to get</h1>';

  if (picked.includes('none')) {
    html += `<p class="govuk-body">You can still talk to a legal adviser – you do not need evidence before that conversation.</p>
<p class="govuk-body">A domestic abuse support service can support you and may be able to write a letter afterwards. Call the National Domestic Abuse Helpline on 0808 2000 247 (free, 24 hours).</p>
<p class="govuk-body">If you are at risk of harm, Civil Legal Advice can fast-track you: call 0345 345 4 345.</p>
<p class="govuk-body"><a class="govuk-link" href="${LINKS.help}" rel="noreferrer">Find out how to get help with domestic abuse</a>.</p>`;
  }

  if (letters.length) {
    html += `<h2 class="govuk-heading-m">Letters you can ask for</h2>
<p class="govuk-body">Give each professional a request note. It tells them exactly what the letter needs to say.</p>`;
    for (const key of letters) {
      const r = ROUTES[key];
      html += `<div class="govuk-summary-card">
  <div class="govuk-summary-card__title-wrapper"><h3 class="govuk-summary-card__title">${escapeHtml(r.title)}</h3></div>
  <div class="govuk-summary-card__content">
    <p class="govuk-body">${escapeHtml(r.who)}</p>
    <p class="govuk-body">The letter must:</p>
    <ul class="govuk-list govuk-list--bullet">${r.musts.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>
    <p class="govuk-body govuk-!-margin-bottom-0"><a class="govuk-link" href="request.html#${key}">Get the request note<span class="govuk-visually-hidden"> for ${escapeHtml(r.title.toLowerCase())}</span></a></p>
  </div>
</div>`;
    }
  }

  if (other.length) {
    html += `<h2 class="govuk-heading-m">Evidence your solicitor can help with</h2>
<dl class="govuk-summary-list">${other.map((k) => `<div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">${escapeHtml(OTHER_ROUTES[k].title)}</dt><dd class="govuk-summary-list__value">${escapeHtml(OTHER_ROUTES[k].text)}</dd></div>`).join('')}</dl>
<p class="govuk-body">GOV.UK has <a class="govuk-link" href="${LINKS.samples}" rel="noreferrer">sample letters you can send to get this evidence</a>.</p>`;
  }

  html += `<h2 class="govuk-heading-m">When you get a letter back</h2>
<p class="govuk-body">Check it before you give it to your solicitor, so any changes can be made straight away.</p>
<a href="letter-checker.html" role="button" draggable="false" class="govuk-button" data-module="govuk-button">Check a letter</a>
<p class="govuk-body"><a class="govuk-link" href="check.html">Change your answers</a></p>`;

  results.innerHTML = html;
  document.getElementById('question').hidden = true;
  results.hidden = false;
  results.focus();
  document.title = 'Evidence you may be able to get – Domestic abuse evidence for legal aid';
}
