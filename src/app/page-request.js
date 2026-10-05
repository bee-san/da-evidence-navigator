import { ROUTES, requestNote } from './routes.js';
import { escapeHtml } from './chat.js';

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
<pre class="app-note" id="note">${escapeHtml(requestNote(key))}</pre>`;
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
