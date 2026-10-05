import { reply, localReply, textToHtml, WELCOME, escapeHtml } from './chat.js';

const log = document.getElementById('log');
const quick = document.getElementById('quick');
const form = document.getElementById('chat-form');
const input = document.getElementById('msg');
const button = form.querySelector('button[type=submit]');
// Conversation sent to the AI helper. Held in memory only.
let history = [];

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

async function ask(t) {
  history.push({ role: 'user', content: t });
  try {
    const res = await fetch('api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const { text } = await res.json();
    history.push({ role: 'assistant', content: text });
    return { html: textToHtml(text), quick: [] };
  } catch {
    history.pop();
    return reply(t);
  }
}

async function send(text) {
  const t = text.trim();
  if (!t || button.disabled) return;
  add('user', `<p>${escapeHtml(t.length > 400 ? `${t.slice(0, 400)}…` : t)}</p>`);
  setQuick([]);
  let r = localReply(t);
  if (!r) {
    button.disabled = true;
    log.setAttribute('aria-busy', 'true');
    r = await ask(t);
    button.disabled = false;
    log.removeAttribute('aria-busy');
  }
  add('bot', r.html);
  setQuick(r.quick);
}

function start() {
  history = [];
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
