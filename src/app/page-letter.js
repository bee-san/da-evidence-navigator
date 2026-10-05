import { checkLetter, LETTER_TYPES } from './rules.js';
import { SAMPLES } from './samples.js';
import { SYNTHETIC } from './synthetic.js';
import { escapeHtml } from './chat.js';
import { resultHtml } from './render.js';
import { extractText } from './ocr.js';
import { secondOpinion, MODEL, MEASURED } from './model.js';
import { modelCheck, compareHtml, COMPARE_MODEL } from './compare.js';

const type = document.getElementById('type');
const sample = document.getElementById('sample');
const letter = document.getElementById('letter');
const result = document.getElementById('result');
const file = document.getElementById('file');
const fileStatus = document.getElementById('file-status');
const examples = [...SAMPLES, ...SYNTHETIC];

type.insertAdjacentHTML('beforeend', Object.entries(LETTER_TYPES).map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`).join(''));
sample.insertAdjacentHTML('beforeend', `<optgroup label="From the hackathon evidence pack">${SAMPLES.map((s) => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('')}</optgroup>
<optgroup label="Written for this prototype">${SYNTHETIC.map((s) => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('')}</optgroup>`);

sample.addEventListener('change', () => {
  const s = examples.find((x) => x.id === sample.value);
  if (!s) return;
  letter.value = s.text;
  type.value = '';
  result.innerHTML = '';
});

file.addEventListener('change', async () => {
  const f = file.files[0];
  if (!f) return;
  fileStatus.textContent = 'Getting the text from your file. This can take up to a minute for a photo.';
  try {
    const text = await extractText(f, (m) => { fileStatus.textContent = m; });
    letter.value = text.trim();
    fileStatus.textContent = text.trim()
      ? 'Text added below. Check it matches the letter, then select "Check the letter".'
      : 'No text was found. Try a clearer photo, or type the letter in.';
  } catch (e) {
    fileStatus.textContent = e.message === 'Choose a photo, PDF or text file' ? e.message : 'The file could not be read. Try a clearer photo, or type the letter in.';
  }
  file.value = '';
});

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
  // Comparison with the AI model: checks letters the rules do not recognise too.
  if (document.getElementById('checker-model').checked) return compare(text, r);
  if (r.outcome === 'unknown') return setError('We could not tell what type of letter this is. Choose the type of letter');
  setError('');
  result.innerHTML = `${resultHtml(r)}
<details class="govuk-details app-no-print" id="opinion">
  <summary class="govuk-details__summary"><span class="govuk-details__summary-text">Get a second opinion from an AI model (optional)</span></summary>
  <div class="govuk-details__text">
    <p class="govuk-body">A small AI model can read the key sentences and say whether each one sounds definite or uncertain. It is a general model, not trained on legal aid letters. In our tests it spotted ${MEASURED.hedgedCaught} of ${MEASURED.hedged} letters with uncertain wording, and did not wrongly flag any of ${MEASURED.firm} letters with firm wording. The check above spotted all of them.</p>
    <p class="govuk-body">It runs on your device. Your letter is not sent anywhere. To start, your browser downloads the model (${MODEL.size}) from Hugging Face and jsDelivr. Those sites will see that a download happened, but not your letter. This may use your mobile data.</p>
    <div class="govuk-checkboxes govuk-checkboxes--small govuk-!-margin-bottom-4" data-module="govuk-checkboxes">
      <div class="govuk-checkboxes__item">
        <input class="govuk-checkboxes__input" id="consent" type="checkbox">
        <label class="govuk-label govuk-checkboxes__label" for="consent">I understand and want to download the model</label>
      </div>
    </div>
    <button type="button" class="govuk-button govuk-button--secondary" id="run-model" data-module="govuk-button" disabled aria-disabled="true">Get a second opinion</button>
    <p class="govuk-body" id="model-status" aria-live="polite"></p>
    <div id="model-result"></div>
  </div>
</details>
<div class="govuk-inset-text">This is a screening check based on example letters. It does not decide whether you get legal aid.</div>`;
  wireModel(text, r);
  result.focus();
});

async function compare(text, r) {
  setError('');
  result.innerHTML = `<p class="govuk-body" aria-live="polite">Asking ${COMPARE_MODEL}. This can take up to a minute.</p>`;
  result.focus();
  try {
    const m = await modelCheck(text, type.value);
    result.innerHTML = `${compareHtml(m, r)}${r.outcome === 'unknown' ? '' : `<h2 class="govuk-heading-m">The rules' checks in full</h2>${resultHtml(r, { headingLevel: 3 })}`}`;
  } catch (e) {
    result.innerHTML = `<div class="govuk-inset-text">${e.message === 'not configured' ? `The comparison with ${COMPARE_MODEL} is not set up on this site.` : `${COMPARE_MODEL} could not be reached. Try again, or check with the rules on this device.`}</div>`;
  }
  result.focus();
}

function wireModel(text, r) {
  const consent = document.getElementById('consent');
  const run = document.getElementById('run-model');
  const status = document.getElementById('model-status');
  const out = document.getElementById('model-result');
  consent.addEventListener('change', () => { run.disabled = !consent.checked; run.setAttribute('aria-disabled', String(!consent.checked)); });
  run.addEventListener('click', async () => {
    run.disabled = true;
    status.textContent = 'Starting the model';
    try {
      const opinions = await secondOpinion(text, (m) => { status.textContent = m; });
      const rulesFail = r.checks.some((c) => c.status === 'fail' && /hedged/.test(c.detail));
      const modelUnsure = opinions.some((o) => o.label === 'uncertain');
      status.textContent = !opinions.length ? 'The model did not find any key sentences to read.'
        : rulesFail === modelUnsure ? 'The model agrees with the check above.'
          : 'The model and the check above disagree. Ask your solicitor to look at this letter.';
      out.innerHTML = `<table class="govuk-table"><caption class="govuk-table__caption govuk-table__caption--s">What the model thinks of each key sentence</caption>
<thead class="govuk-table__head"><tr class="govuk-table__row"><th scope="col" class="govuk-table__header">Sentence</th><th scope="col" class="govuk-table__header">Model view</th></tr></thead>
<tbody class="govuk-table__body">${opinions.map((o) => `<tr class="govuk-table__row"><td class="govuk-table__cell">${escapeHtml(o.sentence)}</td><td class="govuk-table__cell">${{ definite: 'Sounds definite', uncertain: 'Sounds uncertain', unclear: 'No clear view' }[o.label]} (${Math.round(o.score * 100)}%)</td></tr>`).join('')}</tbody></table>`;
    } catch {
      status.textContent = 'The model could not be downloaded. The check above still works without it.';
      run.disabled = false;
    }
  });
}

if (new URLSearchParams(location.search).get('sample')) {
  sample.value = new URLSearchParams(location.search).get('sample');
  sample.dispatchEvent(new Event('change'));
}

// Links in evidence request emails choose the letter type: ?type=p11
const typeParam = new URLSearchParams(location.search).get('type');
if (typeParam && LETTER_TYPES[typeParam]) type.value = typeParam;
