// The "ask for it" part of an evidence result page: a short form, a preview of
// the email, and buttons that open it in the person's own email app.
// Nothing typed here is sent to this website or saved.
//
// Mount on <div data-contact="p11"> (or data-contact="police" data-event="arrested").

import { EVIDENCE, needsOtherParty } from './evidence.js';
import { buildRequest, mailtoUrl, gmailUrl, outlookUrl, looksLikeEmail, MAILTO_SAFE_LENGTH } from './contact.js';
import { LETTER_TYPES } from './rules.js';
import { escapeHtml } from './chat.js';

const input = (id, label, hint, { type = 'text', width = '', autocomplete = 'off' } = {}) => `
<div class="govuk-form-group" id="${id}-group">
  <label class="govuk-label govuk-label--s" for="${id}">${label}</label>
  ${hint ? `<div class="govuk-hint" id="${id}-hint">${hint}</div>` : ''}
  <p class="govuk-error-message" id="${id}-error" hidden><span class="govuk-visually-hidden">Error:</span> <span></span></p>
  <input class="govuk-input ${width}" id="${id}" name="${id}" type="${type}" autocomplete="${autocomplete}" spellcheck="false"${hint ? ` aria-describedby="${id}-hint"` : ''}>
</div>`;

function formHtml(key) {
  const ev = EVIDENCE[key];
  const records = ev.ask === 'records';
  return `
<h2 class="govuk-heading-m">Ask for it by email</h2>
<p class="govuk-body">Fill this in and we will write the email for you. It opens in your own email app, so you can check it before you send it.</p>
<div class="govuk-inset-text">What you type here stays on your device. It is not sent to this website or saved, and it is cleared when you leave the page.</div>
<div class="govuk-error-summary" data-module="govuk-error-summary" id="contact-errors" hidden tabindex="-1">
  <div role="alert"><h3 class="govuk-error-summary__title">There is a problem</h3>
  <div class="govuk-error-summary__body"><ul class="govuk-list govuk-error-summary__list"></ul></div></div>
</div>
<form id="contact-form" novalidate>
  ${input('applicant', 'Your full name', 'Use the name on your legal aid application.', { autocomplete: 'name' })}
  ${needsOtherParty(key) ? input('other', 'Full name of the person who abused you', 'The evidence must name them.') : ''}
  ${records ? input('reference', 'Crime reference or case number (optional)', 'This helps them find the records. It is on any letter they sent you.', { width: 'govuk-input--width-20' }) : ''}
  ${input('profName', `Name of the ${records ? 'team or person' : 'person'} you are asking (optional)`, '')}
  ${input('profEmail', 'Their email address (optional)', 'Ask their reception or check their website. You can leave this blank and add it in your email app.', { type: 'email' })}
  <div class="govuk-form-group">
    <fieldset class="govuk-fieldset">
      <legend class="govuk-fieldset__legend govuk-fieldset__legend--s">Where should they send it?</legend>
      <div class="govuk-radios govuk-radios--small">
        <div class="govuk-radios__item">
          <input class="govuk-radios__input" id="replyTo-me" name="replyTo" type="radio" value="me" checked>
          <label class="govuk-label govuk-radios__label" for="replyTo-me">To me</label>
        </div>
        <div class="govuk-radios__item">
          <input class="govuk-radios__input" id="replyTo-solicitor" name="replyTo" type="radio" value="solicitor" aria-controls="solicitor-details">
          <label class="govuk-label govuk-radios__label" for="replyTo-solicitor">Straight to my solicitor</label>
          <div class="govuk-hint govuk-radios__hint">Choose this if you do not want it sent to an address someone else can see.</div>
        </div>
      </div>
      <div class="govuk-radios__conditional" id="solicitor-details" hidden>
        ${input('solicitorName', 'Your solicitor’s name (optional)', '')}
        ${input('solicitorEmail', 'Your solicitor’s email address', '', { type: 'email' })}
      </div>
    </fieldset>
  </div>
  <div class="govuk-form-group">
    <label class="govuk-label govuk-label--s" for="note">Anything that will help them find your records (optional)</label>
    <div class="govuk-hint" id="note-hint">For example, the date of your appointment, or your date of birth. You do not need to say what happened.</div>
    <textarea class="govuk-textarea" id="note" name="note" rows="2" aria-describedby="note-hint"></textarea>
  </div>
  <button type="submit" class="govuk-button" data-module="govuk-button">Write my email</button>
</form>
<div id="contact-preview" tabindex="-1"></div>`;
}

function previewHtml(key, email) {
  const ev = EVIDENCE[key];
  const checkType = ev.checkType && LETTER_TYPES[ev.checkType] ? ev.checkType : null;
  return `
<h2 class="govuk-heading-m">Check and send your email</h2>
<dl class="govuk-summary-list">
  <div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">To</dt><dd class="govuk-summary-list__value">${email.to ? escapeHtml(email.to) : 'Add their address in your email app'}</dd></div>
  ${email.cc ? `<div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">Copy to</dt><dd class="govuk-summary-list__value">${escapeHtml(email.cc)}</dd></div>` : ''}
  <div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">Subject</dt><dd class="govuk-summary-list__value">${escapeHtml(email.subject)}</dd></div>
</dl>
<div class="govuk-form-group">
  <label class="govuk-label govuk-label--s" for="email-body">Email</label>
  <div class="govuk-hint" id="email-body-hint">You can change anything here before you send it. Words in [square brackets] are for them to fill in.</div>
  <textarea class="govuk-textarea app-email-body" id="email-body" rows="18" aria-describedby="email-body-hint">${escapeHtml(email.body)}</textarea>
</div>
<div class="govuk-warning-text">
  <span class="govuk-warning-text__icon" aria-hidden="true">!</span>
  <strong class="govuk-warning-text__text"><span class="govuk-visually-hidden">Warning</span>A copy will be kept in your Sent folder. If someone else can see your email, delete it from Sent and Deleted items after you send it, or use an email address only you can get into.</strong>
</div>
<div class="govuk-button-group">
  <a class="govuk-button" data-module="govuk-button" id="send-app" href="#">Open in my email app</a>
  <button type="button" class="govuk-button govuk-button--secondary" data-module="govuk-button" id="send-copy">Copy the email</button>
</div>
<p class="govuk-body">Or open it in <a class="govuk-link" id="send-gmail" href="#" target="_blank" rel="noreferrer noopener">Gmail (opens in new tab)</a> or <a class="govuk-link" id="send-outlook" href="#" target="_blank" rel="noreferrer noopener">Outlook (opens in new tab)</a>.</p>
<p class="govuk-body govuk-!-font-weight-bold" id="send-status" aria-live="polite"></p>
<h2 class="govuk-heading-m">When you get it back</h2>
${checkType
    ? `<p class="govuk-body">Check the letter before you give it to your solicitor. If anything needs changing, you can ask straight away.</p>
<a class="govuk-button govuk-button--secondary" data-module="govuk-button" href="letter-checker.html?type=${checkType}">Check the letter</a>`
    : '<p class="govuk-body">Give a copy to your solicitor. Make sure it names you and the person who abused you.</p>'}`;
}

function showErrors(root, errors) {
  const summary = root.querySelector('#contact-errors');
  for (const g of root.querySelectorAll('.govuk-form-group--error')) g.classList.remove('govuk-form-group--error');
  for (const p of root.querySelectorAll('.govuk-error-message')) p.hidden = true;
  summary.hidden = !errors.length;
  summary.querySelector('ul').innerHTML = errors.map(([id, msg]) => `<li><a href="#${id}">${escapeHtml(msg)}</a></li>`).join('');
  for (const [id, msg] of errors) {
    root.querySelector(`#${id}-group`).classList.add('govuk-form-group--error');
    const p = root.querySelector(`#${id}-error`);
    p.hidden = false;
    p.querySelector('span:last-child').textContent = msg;
  }
  for (const a of summary.querySelectorAll('a')) {
    a.addEventListener('click', (e) => { e.preventDefault(); root.querySelector(a.getAttribute('href')).focus(); });
  }
  if (errors.length) summary.focus();
}

export function mountContact(el) {
  const key = el.dataset.contact;
  if (!EVIDENCE[key]) return;
  el.innerHTML = formHtml(key);
  const form = el.querySelector('#contact-form');
  const solicitor = el.querySelector('#solicitor-details');
  for (const r of form.querySelectorAll('input[name=replyTo]')) {
    r.addEventListener('change', () => { solicitor.hidden = form.replyTo.value !== 'solicitor'; });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    d.event = el.dataset.event;
    const errors = [];
    if (!d.applicant?.trim()) errors.push(['applicant', 'Enter your full name']);
    if ('other' in d && !d.other.trim()) errors.push(['other', 'Enter the name of the person who abused you']);
    if (d.profEmail?.trim() && !looksLikeEmail(d.profEmail)) errors.push(['profEmail', 'Enter their email address in the correct format, like name@example.com']);
    if (d.replyTo === 'solicitor' && !looksLikeEmail(d.solicitorEmail)) errors.push(['solicitorEmail', 'Enter your solicitor’s email address, like name@example.com']);
    showErrors(el, errors);
    if (errors.length) return;

    const baseUrl = new URL('.', location.href).href;
    const email = buildRequest(key, d, { baseUrl });
    const preview = el.querySelector('#contact-preview');
    preview.innerHTML = previewHtml(key, email);
    const body = preview.querySelector('#email-body');
    const status = preview.querySelector('#send-status');
    const links = () => {
      const current = { ...email, body: body.value };
      const mailto = mailtoUrl(current);
      preview.querySelector('#send-app').href = mailto;
      preview.querySelector('#send-gmail').href = gmailUrl(current);
      preview.querySelector('#send-outlook').href = outlookUrl(current);
      status.textContent = mailto.length > MAILTO_SAFE_LENGTH
        ? 'This email is long. If your email app opens with it cut off, use Copy the email and paste it in.' : '';
    };
    body.addEventListener('input', links);
    links();
    preview.querySelector('#send-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${body.value}`);
        status.textContent = 'Email copied. Paste it into a new email.';
      } catch {
        body.select();
        status.textContent = 'Could not copy. The email is selected – copy it from there.';
      }
    });
    preview.focus();
  });
}

export function mountAll(root) {
  for (const el of root.querySelectorAll('[data-contact]')) mountContact(el);
}
