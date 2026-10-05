import { ROUTES, requestNote } from './routes.js';
import { escapeHtml } from './chat.js';
import qrcode from '../assets/vendor/qrcode/qrcode.mjs';

// The QR code links to this page for the chosen professional. It contains
// no personal details, so nothing about you is in it.
function qrSvg(url) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true, title: 'QR code for this request note' });
}

const select = document.getElementById('route-select');
const panel = document.getElementById('note-panel');
const status = document.getElementById('copy-status');

select.innerHTML = Object.entries(ROUTES).map(([k, r]) => `<option value="${k}">${escapeHtml(r.title)}</option>`).join('');

function show(key) {
  if (!ROUTES[key]) key = 'p11';
  select.value = key;
  const r = ROUTES[key];
  panel.innerHTML = `<h2 class="govuk-heading-m">${escapeHtml(r.title)}</h2>
<p class="govuk-body">${escapeHtml(r.who)}</p>
<pre class="app-note" id="note">${escapeHtml(requestNote(key))}</pre>
<details class="govuk-details app-no-print">
  <summary class="govuk-details__summary"><span class="govuk-details__summary-text">Show a QR code instead</span></summary>
  <div class="govuk-details__text">
    <p class="govuk-body">The professional can scan this with their phone to open this note. It does not contain your name or any details about you, so you do not need to keep a copy.</p>
    <div class="app-qr">${qrSvg(new URL(`request.html#${key}`, location.href).href)}</div>
  </div>
</details>`;
  status.textContent = '';
}

select.addEventListener('change', () => {
  history.replaceState(null, '', `#${select.value}`);
  show(select.value);
});
window.addEventListener('hashchange', () => show(location.hash.slice(1)));

document.getElementById('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(document.getElementById('note').textContent);
    status.textContent = 'Note copied.';
  } catch {
    status.textContent = 'Could not copy. Select the text and copy it instead.';
  }
});
document.getElementById('print').addEventListener('click', () => window.print());

show(location.hash.slice(1));
