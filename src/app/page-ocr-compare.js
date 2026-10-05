// Runs several text readers (OCR) on the same letter and compares them.
import { ENGINES, wordAccuracy } from './ocr-engines.js';
import { SAMPLES } from './samples.js';
import { SYNTHETIC } from './synthetic.js';
import { checkLetter } from './rules.js';
import { OUTCOME } from './render.js';
import { escapeHtml } from './chat.js';

const form = document.getElementById('compare-form');
const status = document.getElementById('compare-status');
const results = document.getElementById('results');
const examples = [...SAMPLES, ...SYNTHETIC];

document.getElementById('example').innerHTML = examples.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.label)}</option>`).join('');
document.getElementById('engines').innerHTML = ENGINES.filter((e) => e.available()).map((e) => `<div class="govuk-checkboxes__item">
  <input class="govuk-checkboxes__input" id="engine-${e.id}" name="engine" type="checkbox" value="${e.id}" checked aria-describedby="engine-${e.id}-hint">
  <label class="govuk-label govuk-checkboxes__label" for="engine-${e.id}">${escapeHtml(e.name)}</label>
  <div class="govuk-hint govuk-checkboxes__hint" id="engine-${e.id}-hint">${escapeHtml(e.source)} Download: ${escapeHtml(e.download)}.</div>
</div>`).join('');
const unavailable = ENGINES.filter((e) => !e.available());
document.getElementById('engines-unavailable').textContent = unavailable.length
  ? `Not available in this browser: ${unavailable.map((e) => `${e.name} (${e.source})`).join('; ')}` : '';
for (const r of form.querySelectorAll('input[name=source]')) {
  r.addEventListener('change', () => {
    document.getElementById('source-example-details').classList.toggle('govuk-radios__conditional--hidden', form.source.value !== 'example');
    document.getElementById('source-photo-details').classList.toggle('govuk-radios__conditional--hidden', form.source.value !== 'photo');
  });
}

// Draws a letter's text as an image, optionally made to look like a phone photo.
function drawLetter(text, photoLike) {
  const lines = text.split('\n').flatMap((l) => l.match(/.{1,70}(\s|$)/g) || ['']);
  const page = Object.assign(document.createElement('canvas'), { width: 1400, height: 80 + lines.length * 40 });
  const p = page.getContext('2d');
  p.fillStyle = '#fff'; p.fillRect(0, 0, page.width, page.height);
  p.fillStyle = '#111'; p.font = '28px Arial';
  lines.forEach((l, i) => p.fillText(l, 40, 60 + i * 40));
  if (!photoLike) return page;
  const out = Object.assign(document.createElement('canvas'), { width: page.width + 120, height: page.height + 120 });
  const o = out.getContext('2d');
  o.fillStyle = '#6b6259'; o.fillRect(0, 0, out.width, out.height); // table
  o.save();
  o.translate(out.width / 2, out.height / 2);
  o.rotate((2.5 * Math.PI) / 180);
  o.filter = 'blur(0.9px)';
  o.drawImage(page, -page.width / 2, -page.height / 2);
  o.restore();
  const light = o.createLinearGradient(0, 0, out.width, out.height); // uneven light
  light.addColorStop(0, 'rgba(255,255,255,0.15)');
  light.addColorStop(1, 'rgba(0,0,0,0.28)');
  o.fillStyle = light; o.fillRect(0, 0, out.width, out.height);
  const img = o.getImageData(0, 0, out.width, out.height); // sensor noise
  for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 24; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  o.putImageData(img, 0, 0);
  return out;
}

async function photoCanvas(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
  c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
  return c;
}

const toFile = (canvas) => new Promise((resolve) => canvas.toBlob((b) => resolve(new File([b], 'letter.png', { type: 'image/png' })), 'image/png'));

function row(r) {
  const outcome = r.check ? `${OUTCOME[r.check]?.tag || '<strong class="govuk-tag govuk-tag--grey">Unknown type</strong>'}` : '–';
  return `<tr class="govuk-table__row">
  <th scope="row" class="govuk-table__header">${escapeHtml(r.name)}</th>
  <td class="govuk-table__cell">${r.error ? '<strong class="govuk-tag govuk-tag--red">Failed</strong>' : `${(r.ms / 1000).toFixed(1)} s`}</td>
  <td class="govuk-table__cell govuk-table__cell--numeric">${r.accuracy == null ? '–' : `${Math.round(r.accuracy * 100)}%`}</td>
  <td class="govuk-table__cell">${r.error ? '–' : outcome}</td>
</tr>`;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = document.getElementById('compare-error');
  const chosen = ENGINES.filter((x) => form.querySelector(`#engine-${x.id}`)?.checked);
  const needsDownload = chosen.some((x) => !x.local);
  const problem = !chosen.length ? 'Choose at least one reader'
    : needsDownload && !form.consent.checked ? 'Tick the box to say you understand some readers download from other sites'
      : form.source.value === 'photo' && !form.photo.files[0] ? 'Take or choose a photo' : '';
  error.hidden = !problem;
  error.textContent = problem;
  if (problem) return;

  const example = form.source.value === 'example' ? examples.find((s) => s.id === form.example.value) : null;
  const canvas = example ? drawLetter(example.text, form['photo-like'].checked) : await photoCanvas(form.photo.files[0]);
  const file = await toFile(canvas);
  document.getElementById('preview').innerHTML = `<h2 class="govuk-heading-m">The image being read</h2><img src="${canvas.toDataURL('image/jpeg', 0.7)}" alt="The letter being read" class="app-camera__preview">`;
  const button = form.querySelector('button[type=submit]');
  button.disabled = true;
  const out = [];
  const render = () => {
    results.innerHTML = `<h2 class="govuk-heading-m">Results</h2>
<table class="govuk-table">
  <thead class="govuk-table__head"><tr class="govuk-table__row">
    <th scope="col" class="govuk-table__header">Reader</th><th scope="col" class="govuk-table__header">Time</th>
    <th scope="col" class="govuk-table__header govuk-table__header--numeric">Words right</th><th scope="col" class="govuk-table__header">Letter check</th>
  </tr></thead>
  <tbody class="govuk-table__body">${out.map(row).join('')}</tbody>
</table>
<p class="govuk-body-s">Time includes downloading the reader the first time. “Words right” compares the text with the example letter, so it only shows for examples.${example ? ` The example is expected to get: ${escapeHtml(OUTCOME[checkLetter(example.text).outcome]?.title || 'unknown')}.` : ''}</p>
${out.map((r) => `<details class="govuk-details"><summary class="govuk-details__summary"><span class="govuk-details__summary-text">What ${escapeHtml(r.name)} read</span></summary>
<div class="govuk-details__text"><pre class="app-note">${escapeHtml(r.error ? `Error: ${r.error}` : r.text || '(no text)')}</pre></div></details>`).join('')}`;
  };
  for (const engine of chosen) {
    status.textContent = `Reading with ${engine.name}…`;
    const t0 = performance.now();
    try {
      const text = (await engine.read({ canvas, file })).trim();
      out.push({ name: engine.name, ms: performance.now() - t0, text, accuracy: example ? wordAccuracy(example.text, text) : null, check: text ? checkLetter(text).outcome : null });
    } catch (err) {
      out.push({ name: engine.name, error: String(err?.message || err) });
    }
    render();
  }
  status.textContent = 'Done.';
  button.disabled = false;
  results.focus();
});
