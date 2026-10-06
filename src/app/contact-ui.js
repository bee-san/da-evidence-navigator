// The "ask for it" part of an evidence result page: a short form, a preview
// of the email, then either "send it for me" (api/send.js, so it is not in the
// person's Sent folder) or their own email app.
// Nothing typed here leaves the device unless the person chooses "send it for me".
//
// Mount on <div data-contact="p11"> (or data-contact="police" data-event="arrested").

import { EVIDENCE, needsOtherParty } from './evidence.js';
import { buildRequest, mailtoUrl, looksLikeEmail, looksLikePhone, MAILTO_SAFE_LENGTH } from './contact.js';
import { LETTER_TYPES } from './rules.js';
import { escapeHtml } from './chat.js';
import { FORCES, findForce } from './police.js';
import { rememberedPlace } from './location.js';
import { searchPractices, practiceContact } from './gp.js';
import { findCourts, courtDetails } from './court.js';

const input = (id, label, hint, { type = 'text', width = '', autocomplete = 'off' } = {}) => `
<div class="govuk-form-group" id="${id}-group">
  <label class="govuk-label govuk-label--s" for="${id}">${label}</label>
  ${hint ? `<div class="govuk-hint" id="${id}-hint">${hint}</div>` : ''}
  <p class="govuk-error-message" id="${id}-error" hidden><span class="govuk-visually-hidden">Error:</span> <span></span></p>
  <input class="govuk-input ${width}" id="${id}" name="${id}" type="${type}" autocomplete="${autocomplete}" spellcheck="false"${hint ? ` aria-describedby="${id}-hint"` : ''}>
</div>`;

const radio = (name, value, label, { checked = false, controls = '', hint = '' } = {}) => `<div class="govuk-radios__item">
  <input class="govuk-radios__input" id="${name}-${value}" name="${name}" type="radio" value="${value}"${checked ? ' checked' : ''}${controls ? ` aria-controls="${controls}"` : ''}>
  <label class="govuk-label govuk-radios__label" for="${name}-${value}">${label}</label>
  ${hint ? `<div class="govuk-hint govuk-radios__hint">${hint}</div>` : ''}
</div>`;

const SOLICITOR_FIELDS = `<div class="govuk-radios__conditional" id="solicitor-details">
  ${input('solicitorName', 'Your solicitor’s name (optional)', '')}
  ${input('solicitorEmail', 'Your solicitor’s email address', '', { type: 'email' })}
</div>`;

// Where the letter should go. Uses the answer to "Do you have a solicitor?"
// from the start of the flow, so people are not asked twice.
function replyToHtml(hasSolicitor) {
  if (hasSolicitor === 'no' || hasSolicitor === 'unsure') return '<input type="hidden" name="replyTo" value="me">';
  const yes = hasSolicitor === 'yes';
  return `<div class="govuk-form-group"><fieldset class="govuk-fieldset">
  <legend class="govuk-fieldset__legend govuk-fieldset__legend--s">Where should they send the letter?</legend>
  <div class="govuk-radios govuk-radios--small">
    ${yes ? radio('replyTo', 'solicitor', 'To my solicitor', { checked: true, controls: 'solicitor-details' }) + SOLICITOR_FIELDS : ''}
    ${radio('replyTo', 'me', 'To me', { checked: !yes })}
    ${yes ? '' : radio('replyTo', 'solicitor', 'Straight to my solicitor', { controls: 'solicitor-details' }) + SOLICITOR_FIELDS.replace('id="solicitor-details"', 'id="solicitor-details" hidden')}
  </div>
</fieldset></div>`;
}

// How it is sent, and how they get back to the person. Only shown when this
// site can send email; otherwise it goes from the person's own email.
function methodHtml(replyTo) {
  if (replyTo === 'solicitor') {
    return `<div class="govuk-form-group"><fieldset class="govuk-fieldset">
  <legend class="govuk-fieldset__legend govuk-fieldset__legend--s">How do you want to send it?</legend>
  <div class="govuk-radios govuk-radios--small">
    ${radio('method', 'forMe', 'Send it for me', { checked: true, hint: 'It will not come from your email account or be kept in your Sent folder.' })}
    ${radio('method', 'own', 'From my own email')}
  </div>
</fieldset></div>`;
  }
  return `<div class="govuk-form-group"><fieldset class="govuk-fieldset">
  <legend class="govuk-fieldset__legend govuk-fieldset__legend--s">How should they get back to you?</legend>
  <div class="govuk-hint">If someone else can see your email, choose a different address or a phone call. We will send the email for you, so it is not in your Sent folder.</div>
  <div class="govuk-radios govuk-radios--small">
    ${radio('method', 'altEmail', 'Reply to a different email address', { checked: true, controls: 'method-altEmail-details' })}
    <div class="govuk-radios__conditional" id="method-altEmail-details">
      ${input('altEmail', 'Email address for their reply', 'For example, a new address only you use, or the address of someone you trust.', { type: 'email' })}
    </div>
    ${radio('method', 'phone', 'Phone me', { controls: 'method-phone-details' })}
    <div class="govuk-radios__conditional" id="method-phone-details" hidden>
      ${input('phone', 'Phone number', 'They will call to arrange how you get the letter.', { type: 'tel', width: 'govuk-input--width-20', autocomplete: 'tel' })}
      ${input('callTimes', 'Best time to call (optional)', 'For example, weekdays between 10am and 2pm.')}
      <div class="govuk-checkboxes govuk-checkboxes--small">
        <div class="govuk-checkboxes__item">
          <input class="govuk-checkboxes__input" id="voicemail" name="voicemail" type="checkbox">
          <label class="govuk-label govuk-checkboxes__label" for="voicemail">It is safe to leave me a voicemail</label>
        </div>
      </div>
    </div>
    ${radio('method', 'own', 'Reply to my own email', { hint: 'You send it from your own email app.' })}
  </div>
</fieldset></div>`;
}

function formHtml(key, answers) {
  const ev = EVIDENCE[key];
  const records = ev.ask === 'records';
  return `
<h2 class="govuk-heading-m">Ask for it by email</h2>
<p class="govuk-body">Fill this in and we will write the email for you. You can check it before it is sent.</p>
<div class="govuk-error-summary" data-module="govuk-error-summary" id="contact-errors" hidden tabindex="-1">
  <div role="alert"><h3 class="govuk-error-summary__title">There is a problem</h3>
  <div class="govuk-error-summary__body"><ul class="govuk-list govuk-error-summary__list"></ul></div></div>
</div>
<form id="contact-form" novalidate>
  ${input('applicant', 'Your full name', 'Use the name on your legal aid application.', { autocomplete: 'name' })}
  ${needsOtherParty(key) ? input('other', 'Full name of the person who abused you', 'The evidence must name them.') : ''}
  ${records ? input('reference', 'Crime reference or case number (optional)', 'This helps them find the records. It is on any letter they sent you.', { width: 'govuk-input--width-20' }) : ''}
  ${key === 'police' ? forceFinderHtml() : ''}
  ${key === 'court' ? courtFinderHtml() : ''}
  ${key === 'p11' || key === 'p12' ? gpFinderHtml() : ''}
  ${input('profName', `Name of the ${records ? 'team or person' : 'person'} you are asking (optional)`, '')}
  ${input('profEmail', 'Their email address', 'Ask their reception or check their website.', { type: 'email' })}
  ${replyToHtml(answers.hasSolicitor)}
  <div id="method-block"></div>
  <div class="govuk-form-group">
    <label class="govuk-label govuk-label--s" for="note">Anything that will help them find your records (optional)</label>
    <div class="govuk-hint" id="note-hint">For example, the date of your appointment, or your date of birth. You do not need to say what happened.</div>
    <textarea class="govuk-textarea" id="note" name="note" rows="2" aria-describedby="note-hint"></textarea>
  </div>
  <button type="submit" class="govuk-button" data-module="govuk-button">Preview the email</button>
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

function courtFinderHtml() {
  return `
<div class="govuk-form-group app-force-finder">
  <fieldset class="govuk-fieldset">
    <legend class="govuk-fieldset__legend govuk-fieldset__legend--s">Which court dealt with it?</legend>
    <div class="govuk-hint">The court’s name is on any order or letter it sent you. If you do not have one, it is usually one of the courts nearest to where you lived.</div>
    <div class="govuk-form-group">
      <fieldset class="govuk-fieldset">
        <legend class="govuk-fieldset__legend">What kind of court was it?</legend>
        <div class="govuk-radios govuk-radios--small govuk-radios--inline">
          ${radio('courtKind', 'family', 'Family or civil court', { checked: true, hint: 'Most protective orders, undertakings and findings of fact' })}
          ${radio('courtKind', 'crime', 'Criminal court', { hint: 'For example, a restraining order after a trial' })}
        </div>
      </fieldset>
    </div>
    <label class="govuk-label" for="courtSearch">First half of the postcode, or the court’s name</label>
    <div class="govuk-hint" id="courtSearch-hint">For example, M1 or Stockport. Only the area is used, never your full postcode. It is sent to postcodes.io and HM Courts and Tribunals Service to find the court.</div>
    <input class="govuk-input govuk-input--width-20" id="courtSearch" type="text" autocomplete="off" spellcheck="false" aria-describedby="courtSearch-hint">
    <button type="button" class="govuk-button govuk-button--secondary govuk-!-margin-bottom-0 app-inline-button" data-module="govuk-button" id="courtFind">Find the court</button>
  </fieldset>
  <div id="courtResults" aria-live="polite"></div>
</div>`;
}

function courtHtml(c) {
  const ext = (url, text) => `<a class="govuk-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">${text} (opens in new tab)</a>`;
  return `<div class="govuk-inset-text"><p class="govuk-body"><strong>${escapeHtml(c.name)}</strong>${c.address ? `<br>${escapeHtml(c.address)}` : ''}${c.phone ? `<br>Phone ${escapeHtml(c.phone)}` : ''}</p>
${c.email
    ? `<p class="govuk-body">We have added their email address, <strong>${escapeHtml(c.email)}</strong>${c.emailFor ? ` (${escapeHtml(c.emailFor)})` : ''}, below.</p>`
    : `<p class="govuk-body">We could not find an email address for copies of orders.${c.phone ? ` Call ${escapeHtml(c.phone)} and ask where to send your request, then add it below.` : ''}</p>`}
<p class="govuk-body-s">From ${ext(c.url, 'Find a Court or Tribunal')} on GOV.UK. Courts list several email addresses – check this is the right one before you send.</p>
<div id="courtCall"></div></div>`;
}

function mountCourtFinder(el) {
  const search = el.querySelector('#courtSearch');
  const button = el.querySelector('#courtFind');
  const results = el.querySelector('#courtResults');
  const kind = () => el.querySelector('input[name=courtKind]:checked')?.value || 'family';
  const set = (sel, value) => {
    const f = el.querySelector(sel);
    if (f && (!f.value || f.dataset.prefilled)) { f.value = value; f.dataset.prefilled = value ? 'true' : ''; }
  };
  const choose = async (slug) => {
    const detail = results.querySelector('#courtDetail');
    detail.innerHTML = '<p class="govuk-body">Getting the court’s contact details…</p>';
    try {
      const c = await courtDetails(slug, kind());
      if (!c) { detail.innerHTML = '<p class="govuk-error-message">We could not find that court’s details. Fill them in below instead.</p>'; return; }
      detail.innerHTML = courtHtml(c);
      set('#profName', c.name);
      set('#profEmail', c.email);
      if (!c.email) mountCall(detail.querySelector('#courtCall'), { kind: 'court', slug, phone: c.phone, name: c.name }, set);
    } catch {
      detail.innerHTML = '<p class="govuk-error-message">We could not get the court’s contact details just now. Fill them in below instead.</p>';
    }
  };
  const find = async () => {
    button.disabled = true;
    results.innerHTML = '<p class="govuk-body">Finding courts…</p>';
    try {
      const r = await findCourts(search.value, kind());
      if (r.problem) { results.innerHTML = `<p class="govuk-error-message">${escapeHtml(r.problem)}</p>`; return; }
      results.innerHTML = `<div class="govuk-form-group govuk-!-margin-top-4"><fieldset class="govuk-fieldset">
  <legend class="govuk-fieldset__legend govuk-fieldset__legend--s">Choose the court</legend>
  <div class="govuk-radios govuk-radios--small">${r.courts.map((c, i) => `<div class="govuk-radios__item">
    <input class="govuk-radios__input" id="court-${i}" name="court" type="radio" value="${escapeHtml(c.slug)}">
    <label class="govuk-label govuk-radios__label" for="court-${i}">${escapeHtml(c.name)}</label>
    ${c.distance !== null ? `<div class="govuk-hint govuk-radios__hint">${c.distance < 1 ? 'Less than 1 mile away' : `About ${Math.round(c.distance)} ${Math.round(c.distance) === 1 ? 'mile' : 'miles'} away`}</div>` : ''}
  </div>`).join('')}</div>
</fieldset></div>
<div id="courtDetail"></div>`;
      for (const r2 of results.querySelectorAll('input[name=court]')) r2.addEventListener('change', () => choose(r2.value));
    } catch {
      results.innerHTML = '<p class="govuk-error-message">We could not search for courts just now. Fill in the court’s details below instead.</p>';
    } finally {
      button.disabled = false;
    }
  };
  button.addEventListener('click', find);
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); find(); } });
  const known = rememberedPlace();
  if (known) search.value = known.outcode;
}

function gpFinderHtml() {
  return `
<div class="govuk-form-group app-force-finder">
  <fieldset class="govuk-fieldset">
    <legend class="govuk-fieldset__legend govuk-fieldset__legend--s">Find your GP practice</legend>
    <div class="govuk-hint">If it was a hospital, midwife or another health professional, fill in their details below instead.</div>
    <label class="govuk-label" for="gpSearch">First half of the practice’s postcode, or its name</label>
    <div class="govuk-hint" id="gpSearch-hint">For example, M13 or Ardwick. This is sent to the NHS to find the practice.</div>
    <input class="govuk-input govuk-input--width-20" id="gpSearch" type="text" autocomplete="off" spellcheck="false" aria-describedby="gpSearch-hint">
    <button type="button" class="govuk-button govuk-button--secondary govuk-!-margin-bottom-0 app-inline-button" data-module="govuk-button" id="gpFind">Find</button>
  </fieldset>
  <div id="gpResults" aria-live="polite"></div>
</div>`;
}

function gpHtml(p) {
  const tel = p.telephone ? `<a class="govuk-link" href="tel:${escapeHtml(p.telephone.replace(/\s/g, ''))}">${escapeHtml(p.telephone)}</a>` : '';
  const site = p.url ? ` · <a class="govuk-link" href="${escapeHtml(p.url)}" target="_blank" rel="noreferrer noopener">website (opens in new tab)</a>` : '';
  return `<div class="govuk-inset-text"><p class="govuk-body"><strong>${escapeHtml(p.name)}</strong>${tel ? `<br>Phone ${tel}` : ''}${site}</p>
${p.email
    ? `<p class="govuk-body">We have added their email address, <strong>${escapeHtml(p.email)}</strong>, below. It comes from the NHS website – check it is right before you send.</p>`
    : `<p class="govuk-body">They do not list an email address.${tel ? ` Call ${tel} and ask where to send a request for a letter, then add it below.` : ''}</p>`}
<p class="govuk-body-s">Some GPs charge a fee for a letter. You can ask when you contact them.</p>
<div id="gpCall"></div></div>`;
}

// "Call them for me": an AI assistant phones a GP practice, court or local
// service and asks where to send the request. Shown wherever there is a phone
// number but no email, when api/call.js is set up for that kind of organisation.
let callCheck;
const canCall = () => (callCheck ??= fetch('api/call', { credentials: 'same-origin' })
  .then((r) => (r.ok ? r.json() : { enabled: false })).catch(() => ({ enabled: false })));

const CALL_WORDS = {
  gp: { them: 'the practice', who: 'a patient', label: 'Practice phone number' },
  court: { them: 'the court', who: 'someone who needs a copy of a court document', label: 'Court phone number' },
  service: { them: 'the service', who: 'someone they have supported', label: 'Service phone number' },
};
// Never offer to call a helpline (they are for people in crisis) or a freephone number.
const isHelpline = (name, phone) => /helpline/i.test(name || '') || /^(?:\+44|0044|0)\s*80[08]/.test(String(phone || '').replace(/[\s()-]/g, ''));

function callHtml(target, demo) {
  const w = CALL_WORDS[target.kind];
  return `<div class="app-gp-call">
  <h3 class="govuk-heading-s">Call them for me</h3>
  <div>
    <p class="govuk-body">An AI assistant will phone ${w.them} and ask where to send your request, and who to address it to. It says it is an AI calling on behalf of ${w.who}. It does not give your name or say why you need the evidence.</p>
    ${demo ? `<div class="govuk-warning-text"><span class="govuk-warning-text__icon" aria-hidden="true">!</span><strong class="govuk-warning-text__text"><span class="govuk-visually-hidden">Warning</span>Demo: this calls a test phone, not ${w.them}.</strong></div>` : ''}
    <p class="govuk-body">Their phone number is sent to our calling provider. The call is recorded and transcribed so we can fill in what they say.</p>
    <div class="govuk-form-group" id="callPhone-group">
      <label class="govuk-label" for="callPhone">${w.label}</label>
      <p class="govuk-error-message" id="callPhone-error" hidden><span class="govuk-visually-hidden">Error:</span> <span></span></p>
      <input class="govuk-input govuk-input--width-20" id="callPhone" type="tel" autocomplete="off" value="${escapeHtml(target.phone || '')}">
    </div>
    <button type="button" class="govuk-button" data-module="govuk-button" id="callStart">Call ${w.them} for me</button>
    <p class="govuk-body govuk-!-font-weight-bold" id="callStatus" aria-live="polite"></p>
  </div>
</div>`;
}

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

// box: where to show it. target: { kind: 'gp'|'court'|'service', code|slug|id, phone, name }.
// set(selector, value) fills in the email form.
export async function mountCall(box, target, set) {
  if (!box || !target.phone || isHelpline(target.name, target.phone)) return;
  const { enabled, demo, kinds = ['gp'] } = await canCall();
  if (!enabled || !kinds.includes(target.kind)) return;
  const w = CALL_WORDS[target.kind];
  box.innerHTML = callHtml(target, demo);
  const button = box.querySelector('#callStart');
  const status = box.querySelector('#callStatus');
  const phone = box.querySelector('#callPhone');
  const error = box.querySelector('#callPhone-error');
  const fail = (msg) => {
    error.hidden = false;
    error.querySelector('span:last-child').textContent = msg;
    box.querySelector('#callPhone-group').classList.add('govuk-form-group--error');
    status.textContent = '';
    button.disabled = false;
  };
  button.addEventListener('click', async () => {
    button.disabled = true;
    error.hidden = true;
    box.querySelector('#callPhone-group').classList.remove('govuk-form-group--error');
    status.textContent = 'Starting the call…';
    let id;
    try {
      const { kind, code, slug, id: serviceId, name } = target;
      const res = await fetch('api/call', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ kind, code, slug, id: serviceId, name, phone: phone.value }) });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || !r.id) { fail(r.error || 'The call could not be started. Try again, or call them yourself.'); return; }
      id = r.id;
    } catch { fail('The call could not be started. Try again, or call them yourself.'); return; }
    status.textContent = `Calling ${w.them}. This usually takes a minute or two – you can keep filling in the form.`;
    for (let i = 0; i < 60; i++) {
      await sleep(5000);
      let r;
      try { r = await (await fetch(`api/call?id=${encodeURIComponent(id)}`, { credentials: 'same-origin' })).json(); } catch { continue; }
      if (r.status === 'calling') continue;
      if (r.status === 'done' && r.email) {
        set('#profEmail', r.email);
        if (r.name) set('#profName', r.name);
        status.textContent = `They said to send it to ${r.email}${r.name ? `, for ${r.name}` : ''}. We have added this below – check it before you send.`;
      } else {
        // A call that ends in a few seconds with nothing said is usually the
        // agent's own settings, so say what ElevenLabs gave as the reason.
        const why = [r.seconds ? `after ${r.seconds}s` : null, r.turns ? `${r.turns} turns` : 'nothing was said', r.reason].filter(Boolean).join(', ');
        status.textContent = `The call ended without an email address${why ? ` (${why})` : ''}. Try again later, or call them yourself.`;
      }
      button.disabled = false;
      return;
    }
    status.textContent = 'The call is taking longer than expected. Call them yourself if you do not hear back.';
    button.disabled = false;
  });
}

function mountGpFinder(el) {
  const search = el.querySelector('#gpSearch');
  const button = el.querySelector('#gpFind');
  const results = el.querySelector('#gpResults');
  const known = rememberedPlace();
  if (known) search.value = known.outcode;
  const set = (sel, value) => {
    const f = el.querySelector(sel);
    if (f && (!f.value || f.dataset.prefilled)) { f.value = value; f.dataset.prefilled = value ? 'true' : ''; }
  };
  const choose = async (code) => {
    const detail = results.querySelector('#gpDetail');
    detail.innerHTML = '<p class="govuk-body">Getting their contact details…</p>';
    try {
      const p = await practiceContact(code);
      detail.innerHTML = gpHtml(p);
      set('#profName', p.name);
      set('#profEmail', p.email);
      if (!p.email) mountCall(detail.querySelector('#gpCall'), { kind: 'gp', code, phone: p.telephone, name: p.name }, set);
    } catch {
      detail.innerHTML = '<p class="govuk-error-message">We could not get their contact details just now. Fill them in below instead.</p>';
    }
  };
  const find = async () => {
    button.disabled = true;
    results.innerHTML = '<p class="govuk-body">Finding GP practices…</p>';
    try {
      const list = await searchPractices(search.value);
      if (list.problem) { results.innerHTML = `<p class="govuk-error-message">${escapeHtml(list.problem)}</p>`; return; }
      results.innerHTML = `<div class="govuk-form-group govuk-!-margin-top-4"><fieldset class="govuk-fieldset">
  <legend class="govuk-fieldset__legend govuk-fieldset__legend--s">Choose your GP practice</legend>
  <div class="govuk-radios govuk-radios--small">${list.map((p, i) => `<div class="govuk-radios__item">
    <input class="govuk-radios__input" id="gp-${i}" name="gp" type="radio" value="${escapeHtml(p.code)}">
    <label class="govuk-label govuk-radios__label" for="gp-${i}">${escapeHtml(p.name)}, ${escapeHtml(p.postcode)}</label>
  </div>`).join('')}</div>
</fieldset></div>
<div id="gpDetail"></div>`;
      for (const r of results.querySelectorAll('input[name=gp]')) r.addEventListener('change', () => choose(r.value));
    } catch {
      results.innerHTML = '<p class="govuk-error-message">We could not search for GP practices just now. Fill in their details below instead.</p>';
    } finally {
      button.disabled = false;
    }
  };
  button.addEventListener('click', find);
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); find(); } });
}

function forceHtml(f) {
  const ext = (url, text) => `<a class="govuk-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">${text} (opens in new tab)</a>`;
  const checked = `We found these details ${f.sourceUrl ? `on ${ext(f.sourceUrl, 'their website')}` : 'on their website'} in ${escapeHtml(f.checked)}. Check them before you send.`;
  let how;
  if (f.route === 'legal-aid' && f.email) {
    how = `They have an email address for legal aid requests: <strong>${escapeHtml(f.email)}</strong>. We have added it below.`;
  } else if (f.route === 'legal-aid') {
    how = `They have a ${ext(f.formUrl, 'legal aid request form')}. Write your email here, then copy it into their form.`;
  } else if (f.formUrl && f.email) {
    how = `They ask for requests through their ${ext(f.formUrl, 'online form')}, and also accept them by email at <strong>${escapeHtml(f.email)}</strong>, which we have added below.`;
  } else if (f.email) {
    how = `Their address for these requests is <strong>${escapeHtml(f.email)}</strong>. We have added it below.`;
  } else {
    how = `They only take these requests through their ${ext(f.formUrl, 'online form')}, not by email. Write your email here, then copy it into their form.`;
  }
  return `<div class="govuk-inset-text"><p class="govuk-body"><strong>${escapeHtml(f.name)}</strong></p>
<p class="govuk-body">${how}</p>
<p class="govuk-body-s">${checked}</p></div>`;
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
const canSend = () => (sendCheck ??= fetch('api/send', { credentials: 'same-origin' })
  .then((r) => (r.ok ? r.json() : { enabled: false })).then((r) => !!r.enabled).catch(() => false));

function previewHtml(key, email, d) {
  const ev = EVIDENCE[key];
  const checkType = ev.checkType && LETTER_TYPES[ev.checkType] ? ev.checkType : null;
  const send = d.sentForMe
    ? `<div class="govuk-inset-text">To send it, your details pass through this website and our email provider. We do not keep a copy, and nothing is sent to your inbox.</div>
<button type="button" class="govuk-button" data-module="govuk-button" id="send-for-me">Send the email for me</button>`
    : `<div class="govuk-warning-text">
  <span class="govuk-warning-text__icon" aria-hidden="true">!</span>
  <strong class="govuk-warning-text__text"><span class="govuk-visually-hidden">Warning</span>A copy will be kept in your Sent folder, and their reply will come to your inbox. If someone else can see your email, delete it from Sent and Deleted items after you send it.</strong>
</div>
<div class="govuk-button-group">
  <a class="govuk-button" data-module="govuk-button" id="send-app" href="#">Open in my email app</a>
  <button type="button" class="govuk-button govuk-button--secondary" data-module="govuk-button" id="send-copy">Copy the email</button>
</div>`;
  return `
<h2 class="govuk-heading-m">Check your email</h2>
<dl class="govuk-summary-list">
  <div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">To</dt><dd class="govuk-summary-list__value">${email.to ? escapeHtml(email.to) : 'Add their address in your email app'}</dd></div>
  ${email.cc ? `<div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">Copy to</dt><dd class="govuk-summary-list__value">${escapeHtml(email.cc)}</dd></div>` : ''}
  ${email.replyTo ? `<div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">Replies go to</dt><dd class="govuk-summary-list__value">${escapeHtml(email.replyTo)}</dd></div>` : ''}
  <div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">Subject</dt><dd class="govuk-summary-list__value">${escapeHtml(email.subject)}</dd></div>
</dl>
<pre class="app-note app-email-body" id="email-body">${escapeHtml(email.body)}</pre>
<p class="govuk-body">To change anything, change your answers above and preview it again.</p>
${send}
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
  for (const p of root.querySelectorAll('#contact-form .govuk-error-message')) p.hidden = true;
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

function readForm(form, el) {
  const f = Object.fromEntries(new FormData(form));
  const method = f.method || 'own';
  return {
    ...f,
    event: el.dataset.event,
    sentForMe: method !== 'own',
    contactBy: method === 'phone' ? 'phone' : 'email',
    voicemail: f.voicemail === 'on',
  };
}

function check(d, key) {
  const errors = [];
  if (!d.applicant?.trim()) errors.push(['applicant', 'Enter your full name']);
  if ('other' in d && !d.other.trim()) errors.push(['other', 'Enter the name of the person who abused you']);
  if (d.profEmail?.trim() && !looksLikeEmail(d.profEmail)) errors.push(['profEmail', 'Enter their email address in the correct format, like name@example.com']);
  else if (!d.profEmail?.trim() && d.sentForMe) {
    errors.push(['profEmail', 'Enter their email address so we can send it for you. If they do not have one, use “Call them for me” if it is shown above, or choose “Reply to my own email” to copy the request into their form.']);
  }
  if (d.replyTo === 'solicitor' && !looksLikeEmail(d.solicitorEmail)) errors.push(['solicitorEmail', 'Enter your solicitor’s email address, like name@example.com']);
  if (d.sentForMe && d.replyTo !== 'solicitor') {
    if (d.method === 'phone' && !looksLikePhone(d.phone)) errors.push(['phone', 'Enter a phone number, like 07700 900 982']);
    if (d.method === 'altEmail' && !looksLikeEmail(d.altEmail)) errors.push(['altEmail', 'Enter an email address for their reply, like name@example.com']);
  }
  return errors;
}

async function sendForMe(preview, key, d) {
  const button = preview.querySelector('#send-for-me');
  const status = preview.querySelector('#send-status');
  button.disabled = true;
  status.textContent = 'Sending…';
  try {
    const res = await fetch('api/send', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ ...d, key }) });
    const r = await res.json().catch(() => ({}));
    if (!res.ok || !r.sent) throw new Error(r.error || 'The email could not be sent. Try again, or send it from your own email.');
    const how = d.replyTo === 'solicitor' ? `send the letter to your solicitor at ${d.solicitorEmail}`
      : d.contactBy === 'phone' ? `call you on ${d.phone}` : `reply to ${d.altEmail}`;
    button.outerHTML = `<div class="govuk-notification-banner govuk-notification-banner--success" role="alert" aria-labelledby="sfm-sent-title" tabindex="-1" id="sfm-sent">
  <div class="govuk-notification-banner__header"><h2 class="govuk-notification-banner__title" id="sfm-sent-title">Success</h2></div>
  <div class="govuk-notification-banner__content">
    <p class="govuk-notification-banner__heading">Your email has been sent${r.testTo ? '' : ` to ${escapeHtml(r.to)}`}</p>
    ${r.testTo ? `<p class="govuk-body"><strong>Test mode:</strong> it went to ${escapeHtml(r.testTo)}, not to ${escapeHtml(r.to)}.</p>` : ''}
    <p class="govuk-body">They have been asked to ${escapeHtml(how)}. We have not kept a copy, and nothing was sent to your inbox.</p>
  </div>
</div>`;
    status.textContent = '';
    preview.querySelector('#sfm-sent').focus();
  } catch (err) {
    status.textContent = err.message;
    button.disabled = false;
  }
}

// The person's own details, kept in memory for this visit so they do not
// retype them when they ask a second professional. Never saved, and gone when
// the page is closed. Who they are writing to is not kept.
const MINE = ['applicant', 'other', 'solicitorName', 'solicitorEmail', 'altEmail', 'phone', 'callTimes'];
const mine = {};
if (typeof addEventListener === 'function') addEventListener('pagehide', () => { for (const k of MINE) delete mine[k]; });

function restoreMine(form) {
  for (const k of MINE) {
    const el = form.querySelector(`#${k}`);
    if (el && mine[k] && !el.value) el.value = mine[k];
  }
}

export function mountContact(el, answers = {}) {
  const key = el.dataset.contact;
  if (!EVIDENCE[key]) return;
  el.innerHTML = formHtml(key, answers);
  if (key === 'police') mountForceFinder(el);
  if (key === 'court') mountCourtFinder(el);
  if (key === 'p11' || key === 'p12') mountGpFinder(el);
  const form = el.querySelector('#contact-form');
  const preview = el.querySelector('#contact-preview');
  const methodBlock = el.querySelector('#method-block');

  // Show the fields that go with the chosen radio, and swap the "how" question
  // when the letter is going to a solicitor.
  let sendEnabled = false;
  const sync = () => {
    const replyTo = form.replyTo?.value || 'me';
    const solicitor = el.querySelector('#solicitor-details');
    if (solicitor) solicitor.hidden = replyTo !== 'solicitor';
    if (sendEnabled && methodBlock.dataset.for !== replyTo) {
      methodBlock.innerHTML = methodHtml(replyTo);
      methodBlock.dataset.for = replyTo;
    }
    const method = form.method?.value;
    for (const id of ['altEmail', 'phone']) {
      const x = el.querySelector(`#method-${id}-details`);
      if (x) x.hidden = method !== id;
    }
  };
  form.addEventListener('change', sync);
  form.addEventListener('input', (e) => { if (MINE.includes(e.target.id)) mine[e.target.id] = e.target.value; });
  canSend().then((ok) => {
    sendEnabled = ok;
    sync();
    restoreMine(form);
    if (mine.phone && form.querySelector('#method-phone')) { form.querySelector('#method-phone').checked = true; sync(); }
  });
  sync();
  restoreMine(form);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = readForm(form, el);
    const errors = check(d, key);
    showErrors(el, errors);
    if (errors.length) return;

    const email = buildRequest(key, d);
    preview.innerHTML = previewHtml(key, email, d);
    const status = preview.querySelector('#send-status');
    if (d.sentForMe) {
      preview.querySelector('#send-for-me').addEventListener('click', () => sendForMe(preview, key, d));
    } else {
      const mailto = mailtoUrl(email);
      preview.querySelector('#send-app').href = mailto;
      if (mailto.length > MAILTO_SAFE_LENGTH) status.textContent = 'This email is long. If your email app opens with it cut off, use Copy the email and paste it in.';
      preview.querySelector('#send-copy').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`);
          status.textContent = 'Email copied. Paste it into a new email.';
        } catch {
          status.textContent = 'Could not copy. Select the email above and copy it.';
        }
      });
    }
    preview.focus();
  });
}

export function mountAll(root, answers = {}) {
  for (const el of root.querySelectorAll('[data-contact]')) mountContact(el, answers);
}
