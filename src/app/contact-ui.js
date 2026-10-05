// The "ask for it" part of an evidence result page: a short form, a preview of
// the email, and buttons that open it in the person's own email app.
// Nothing typed here is sent to this website or saved.
//
// Mount on <div data-contact="p11"> (or data-contact="police" data-event="arrested").

import { EVIDENCE, needsOtherParty } from './evidence.js';
import { buildRequest, mailtoUrl, gmailUrl, outlookUrl, looksLikeEmail, looksLikePhone, MAILTO_SAFE_LENGTH } from './contact.js';
import { LETTER_TYPES } from './rules.js';
import { escapeHtml } from './chat.js';
import { FORCES, findForce } from './police.js';
import { rememberedPlace } from './location.js';

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
  ${key === 'police' ? forceFinderHtml() : ''}
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

function forceFinderHtml() {
  const options = Object.entries(FORCES).map(([id, f]) => `<option value="${id}">${escapeHtml(f.name)}</option>`).join('');
  return `
<div class="govuk-form-group app-force-finder">
  <fieldset class="govuk-fieldset">
    <legend class="govuk-fieldset__legend govuk-fieldset__legend--s">Which police force dealt with it?</legend>
    <div class="govuk-form-group">
      <label class="govuk-label" for="forcePostcode">Postcode where it happened</label>
      <div class="govuk-hint" id="forcePostcode-hint">Only the first half is used, for example M1. It is sent to postcodes.io and police.uk to find the force.</div>
      <input class="govuk-input govuk-input--width-10" id="forcePostcode" type="text" autocomplete="off" spellcheck="false" aria-describedby="forcePostcode-hint">
      <button type="button" class="govuk-button govuk-button--secondary govuk-!-margin-bottom-0 app-inline-button" data-module="govuk-button" id="forceFind">Find the police force</button>
    </div>
    <div class="govuk-form-group govuk-!-margin-bottom-0">
      <label class="govuk-label" for="forceId">Or choose the police force</label>
      <select class="govuk-select" id="forceId"><option value="">Choose a police force</option>${options}</select>
    </div>
  </fieldset>
  <div id="forceResult" aria-live="polite"></div>
</div>`;
}

function forceHtml(f) {
  const source = f.sourceUrl ? `<a class="govuk-link" href="${escapeHtml(f.sourceUrl)}" target="_blank" rel="noreferrer noopener">their website (opens in new tab)</a>` : 'their website';
  if (f.email) {
    return `<div class="govuk-inset-text"><p class="govuk-body"><strong>${escapeHtml(f.name)}</strong></p>
<p class="govuk-body">We have added their address for these requests: <strong>${escapeHtml(f.email)}</strong>. We found it on ${source} in ${escapeHtml(f.checked)}. Check it is still right before you send.</p>
${f.formUrl ? `<p class="govuk-body">They also have an <a class="govuk-link" href="${escapeHtml(f.formUrl)}" target="_blank" rel="noreferrer noopener">online form (opens in new tab)</a> you can use instead.</p>` : ''}</div>`;
  }
  if (f.formUrl) {
    return `<div class="govuk-inset-text"><p class="govuk-body"><strong>${escapeHtml(f.name)}</strong></p>
<p class="govuk-body">They ask for these requests through an <a class="govuk-link" href="${escapeHtml(f.formUrl)}" target="_blank" rel="noreferrer noopener">online form (opens in new tab)</a>, not by email. Write your email here, then copy it into their form.</p></div>`;
  }
  return `<div class="govuk-inset-text"><p class="govuk-body"><strong>${escapeHtml(f.name)}</strong></p>
<p class="govuk-body">We could not find an email address for these requests. Call 101 and ask how to request information from police records, or ask your solicitor.</p></div>`;
}

function mountForceFinder(el) {
  const postcode = el.querySelector('#forcePostcode');
  const select = el.querySelector('#forceId');
  const result = el.querySelector('#forceResult');
  const button = el.querySelector('#forceFind');
  const show = (id) => {
    const f = FORCES[id];
    if (!f) { result.innerHTML = ''; return; }
    select.value = id;
    result.innerHTML = forceHtml(f);
    el.querySelector('#profName').value = f.name;
    el.querySelector('#profEmail').value = f.email || '';
  };
  const find = async () => {
    button.disabled = true;
    result.innerHTML = '<p class="govuk-body">Finding the police force…</p>';
    try {
      const r = await findForce(postcode.value);
      if (r.problem) result.innerHTML = `<p class="govuk-error-message">${escapeHtml(r.problem)}</p>`;
      else show(r.id);
    } catch {
      result.innerHTML = '<p class="govuk-error-message">We could not look this up just now. Choose the police force from the list instead.</p>';
    }
    button.disabled = false;
  };
  button.addEventListener('click', find);
  const known = rememberedPlace();
  if (known) postcode.value = known.outcode;
  postcode.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); find(); } });
  select.addEventListener('change', () => show(select.value));
}

// Whether this site can send the email (api/send.js is set up). Checked once.
let sendCheck;
const canSend = () => (sendCheck ??= fetch('api/send', { credentials: 'omit' })
  .then((r) => (r.ok ? r.json() : { enabled: false })).then((r) => !!r.enabled).catch(() => false));

const radio = (name, value, label, { checked = false, controls = '' } = {}) => `<div class="govuk-radios__item">
  <input class="govuk-radios__input" id="${name}-${value}" name="${name}" type="radio" value="${value}"${checked ? ' checked' : ''}${controls ? ` aria-controls="${controls}"` : ''}>
  <label class="govuk-label govuk-radios__label" for="${name}-${value}">${label}</label>
</div>`;

function sendForMeHtml(d) {
  const reply = d.replyTo === 'solicitor'
    ? `<p class="govuk-body">They will be asked to send it to your solicitor at <strong>${escapeHtml(d.solicitorEmail)}</strong>, and your solicitor will be copied in.</p>`
    : `<div class="govuk-form-group" id="contactBy-group">
  <fieldset class="govuk-fieldset">
    <legend class="govuk-fieldset__legend govuk-fieldset__legend--s">How should they get back to you?</legend>
    <div class="govuk-radios govuk-radios--small">
      ${radio('contactBy', 'email', 'Email a different address', { checked: true, controls: 'contactBy-email-details' })}
      <div class="govuk-radios__conditional" id="contactBy-email-details">
        ${input('altEmail', 'Email address for their reply', 'For example, a new address only you use, or the address of someone you trust.', { type: 'email' })}
      </div>
      ${radio('contactBy', 'phone', 'Phone me', { controls: 'contactBy-phone-details' })}
      <div class="govuk-radios__conditional" id="contactBy-phone-details" hidden>
        ${input('phone', 'Phone number', 'They will call to arrange how you get the letter.', { type: 'tel', width: 'govuk-input--width-20', autocomplete: 'tel' })}
        ${input('callTimes', 'Best time to call (optional)', 'For example, weekdays between 10am and 2pm.')}
        <div class="govuk-checkboxes govuk-checkboxes--small">
          <div class="govuk-checkboxes__item">
            <input class="govuk-checkboxes__input" id="voicemail" name="voicemail" type="checkbox">
            <label class="govuk-label govuk-checkboxes__label" for="voicemail">It is safe to leave me a voicemail</label>
          </div>
        </div>
      </div>
    </div>
  </fieldset>
</div>`;
  return `
<h2 class="govuk-heading-m">Send it for me</h2>
<p class="govuk-body">We can send the email for you. It will not come from your email account or be kept in your Sent folder, and nothing will be sent to your inbox.</p>
<form id="send-for-me" novalidate>
  ${reply}
  <details class="govuk-details">
    <summary class="govuk-details__summary"><span class="govuk-details__summary-text">See the email we will send</span></summary>
    <div class="govuk-details__text"><pre class="app-note" id="sfm-preview"></pre></div>
  </details>
  <div class="govuk-inset-text">To send it, your details pass through this website and our email provider. We do not keep a copy.</div>
  <button type="submit" class="govuk-button" data-module="govuk-button">Send the email for me</button>
  <p class="govuk-body govuk-!-font-weight-bold" id="sfm-status" aria-live="polite"></p>
</form>`;
}

function previewHtml(key, email, d, sendEnabled) {
  const ev = EVIDENCE[key];
  const checkType = ev.checkType && LETTER_TYPES[ev.checkType] ? ev.checkType : null;
  const own = sendEnabled ? 'Or send it from your own email' : 'Send it from your own email';
  return `
${sendEnabled && email.to ? sendForMeHtml(d) : ''}
${sendEnabled && !email.to ? '<p class="govuk-body">To have us send it for you, go back and add their email address.</p>' : ''}
<h2 class="govuk-heading-m">${own}</h2>
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
  <strong class="govuk-warning-text__text"><span class="govuk-visually-hidden">Warning</span>A copy will be kept in your Sent folder, and their reply will come to your inbox. If someone else can see your email, delete it from Sent and Deleted items after you send it, or use an email address only you can get into.</strong>
</div>
<div class="govuk-button-group">
  <a class="govuk-button govuk-button--secondary" data-module="govuk-button" id="send-app" href="#">Open in my email app</a>
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

// Wires up "send it for me": live preview, checks, and the request to api/send.
function mountSendForMe(preview, key, d, baseUrl) {
  const form = preview.querySelector('#send-for-me');
  if (!form) return;
  const status = form.querySelector('#sfm-status');
  const details = () => {
    const f = Object.fromEntries(new FormData(form));
    return { ...d, key, contactBy: f.contactBy || 'email', altEmail: f.altEmail || '', phone: f.phone || '', callTimes: f.callTimes || '', voicemail: f.voicemail === 'on', sentForMe: true };
  };
  const update = () => {
    const contactBy = form.contactBy?.value;
    const show = (id, on) => { const x = form.querySelector(id); if (x) x.hidden = !on; };
    show('#contactBy-email-details', contactBy === 'email');
    show('#contactBy-phone-details', contactBy === 'phone');
    form.querySelector('#sfm-preview').textContent = buildRequest(key, details(), { baseUrl }).body;
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  update();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const x = details();
    const errors = [];
    if (x.replyTo !== 'solicitor') {
      if (x.contactBy === 'phone' && !looksLikePhone(x.phone)) errors.push(['phone', 'Enter a phone number, like 07700 900 982']);
      if (x.contactBy === 'email' && !looksLikeEmail(x.altEmail)) errors.push(['altEmail', 'Enter an email address for their reply, like name@example.com']);
    }
    for (const g of form.querySelectorAll('.govuk-form-group--error')) g.classList.remove('govuk-form-group--error');
    for (const p of form.querySelectorAll('.govuk-error-message')) p.hidden = true;
    for (const [id, msg] of errors) {
      form.querySelector(`#${id}-group`).classList.add('govuk-form-group--error');
      const p = form.querySelector(`#${id}-error`);
      p.hidden = false;
      p.querySelector('span:last-child').textContent = msg;
    }
    if (errors.length) { form.querySelector(`#${errors[0][0]}`).focus(); return; }

    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    status.textContent = 'Sending…';
    try {
      const res = await fetch('api/send', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit', body: JSON.stringify(x) });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || !r.sent) throw new Error(r.error || 'The email could not be sent. Try again, or send it from your own email.');
      const how = x.replyTo === 'solicitor' ? `send the letter to your solicitor at ${x.solicitorEmail}`
        : x.contactBy === 'phone' ? `call you on ${x.phone}` : `reply to ${x.altEmail}`;
      form.outerHTML = `<div class="govuk-notification-banner govuk-notification-banner--success" role="alert" aria-labelledby="sfm-sent-title" tabindex="-1" id="sfm-sent">
  <div class="govuk-notification-banner__header"><h2 class="govuk-notification-banner__title" id="sfm-sent-title">Success</h2></div>
  <div class="govuk-notification-banner__content">
    <p class="govuk-notification-banner__heading">Your email has been sent to ${escapeHtml(r.to)}</p>
    <p class="govuk-body">They have been asked to ${escapeHtml(how)}. We have not kept a copy, and nothing was sent to your inbox.</p>
  </div>
</div>`;
      preview.querySelector('#sfm-sent').focus();
    } catch (err) {
      status.textContent = err.message;
      button.disabled = false;
    }
  });
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
  if (key === 'police') mountForceFinder(el);
  const form = el.querySelector('#contact-form');
  const solicitor = el.querySelector('#solicitor-details');
  for (const r of form.querySelectorAll('input[name=replyTo]')) {
    r.addEventListener('change', () => { solicitor.hidden = form.replyTo.value !== 'solicitor'; });
  }

  form.addEventListener('submit', async (e) => {
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
    const sendEnabled = await canSend();
    preview.innerHTML = previewHtml(key, email, d, sendEnabled);
    mountSendForMe(preview, key, d, baseUrl);
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
