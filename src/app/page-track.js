import { ROUTES } from './routes.js';
import { escapeHtml } from './chat.js';

// Stored only if the user ticks "Save my progress". The key is generic so
// it does not reveal what the site is about.
const KEY = 'app-progress';
const STEPS = [
  ['asked', 'Asked for the letter', 'request.html', 'Get a request note'],
  ['received', 'Received the letter'],
  ['checked', 'Checked the letter', 'letter-checker.html', 'Check a letter'],
  ['given', 'Given it to my solicitor'],
];

const list = document.getElementById('track-list');
const save = document.getElementById('track-save');
document.getElementById('track-type').innerHTML = Object.entries(ROUTES).map(([k, r]) => `<option value="${k}">${escapeHtml(r.title)}</option>`).join('');

let items = [];
try {
  const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (Array.isArray(stored)) { items = stored.filter((i) => ROUTES[i.type]); save.checked = true; }
} catch { /* storage unavailable */ }

function persist() {
  try {
    if (save.checked) localStorage.setItem(KEY, JSON.stringify(items));
    else localStorage.removeItem(KEY);
  } catch { /* storage unavailable */ }
}

function render() {
  if (!items.length) {
    list.innerHTML = '<p class="govuk-body">You have not added any letters yet.</p>';
    return;
  }
  list.innerHTML = items.map((it, n) => {
    const done = STEPS.filter(([id]) => it[id]).length;
    return `<div class="govuk-summary-card">
  <div class="govuk-summary-card__title-wrapper">
    <h2 class="govuk-summary-card__title">${escapeHtml(ROUTES[it.type].title)}</h2>
    <ul class="govuk-summary-card__actions app-no-print"><li class="govuk-summary-card__action"><button type="button" class="app-link-button govuk-link" data-remove="${n}">Remove<span class="govuk-visually-hidden"> ${escapeHtml(ROUTES[it.type].title.toLowerCase())}</span></button></li></ul>
  </div>
  <div class="govuk-summary-card__content">
    <p class="govuk-body">${done === STEPS.length ? '<strong class="govuk-tag govuk-tag--green">Done</strong>' : `<strong class="govuk-tag govuk-tag--blue">${done} of ${STEPS.length} steps</strong>`}</p>
    <div class="govuk-checkboxes govuk-checkboxes--small">
      ${STEPS.map(([id, label, href, linkText]) => `<div class="govuk-checkboxes__item">
        <input class="govuk-checkboxes__input" id="t-${n}-${id}" type="checkbox" data-item="${n}" data-step="${id}"${it[id] ? ' checked' : ''}>
        <label class="govuk-label govuk-checkboxes__label" for="t-${n}-${id}">${label}</label>
        ${href && !it[id] ? `<div class="govuk-hint govuk-checkboxes__hint"><a class="govuk-link" href="${href}${href === 'request.html' ? `#${it.type}` : ''}">${linkText}</a></div>` : ''}
      </div>`).join('')}
    </div>
  </div>
</div>`;
  }).join('');
}

document.getElementById('track-add').addEventListener('submit', (e) => {
  e.preventDefault();
  items.push({ type: document.getElementById('track-type').value });
  persist();
  render();
});
list.addEventListener('change', (e) => {
  const { item, step } = e.target.dataset;
  if (item === undefined) return;
  items[+item][step] = e.target.checked;
  persist();
  render();
  document.getElementById(`t-${item}-${step}`)?.focus();
});
list.addEventListener('click', (e) => {
  const n = e.target.closest('[data-remove]')?.dataset.remove;
  if (n === undefined) return;
  items.splice(+n, 1);
  persist();
  render();
});
save.addEventListener('change', persist);
document.getElementById('track-print').addEventListener('click', () => window.print());
document.getElementById('track-clear').addEventListener('click', () => {
  items = [];
  save.checked = false;
  persist();
  render();
});

render();
