import { reply, WELCOME, escapeHtml } from './chat.js';

const log = document.getElementById('log');
const quick = document.getElementById('quick');
const form = document.getElementById('chat-form');
const input = document.getElementById('msg');

function add(who, html) {
  const div = document.createElement('div');
  div.className = `app-chat__msg app-chat__msg--${who}`;
  div.innerHTML = `<span class="app-chat__who">${who === 'bot' ? 'Helper' : 'You'}</span>${html}`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function setQuick(items) {
  quick.innerHTML = '';
  for (const q of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'govuk-button govuk-button--secondary';
    b.textContent = q;
    b.addEventListener('click', () => send(q));
    quick.appendChild(b);
  }
}

function send(text) {
  const t = text.trim();
  if (!t) return;
  add('user', `<p>${escapeHtml(t.length > 400 ? `${t.slice(0, 400)}…` : t)}</p>`);
  const r = reply(t);
  add('bot', r.html);
  setQuick(r.quick);
}

function start() {
  log.innerHTML = '';
  add('bot', WELCOME.html);
  setQuick(WELCOME.quick);
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  send(input.value);
  input.value = '';
  input.focus();
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});
document.getElementById('clear').addEventListener('click', start);

start();
