// "Who to ask near you": asks for the first half of a postcode and shows the
// council (and for a MARAC, the police force) for that area.
//
// Mount on <div data-local="marac"> (also p14, p17, p19, social).

import { findPlace, rememberedPlace, socialServicesCouncil } from './location.js';
import { forceForPlace, FORCES } from './police.js';
import { escapeHtml } from './chat.js';
import { servicesFor, hasServiceList } from './services-lookup.js';

const link = (url, text) => `<a class="govuk-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(text)} (opens in new tab)</a>`;
const DIRECTORY = link('https://www.womensaid.org.uk/domestic-abuse-directory/', 'Find a local domestic abuse service on Women’s Aid');
const area = (c) => escapeHtml(c.name.replace(/^The /, '').replace(/ (City|County|County Borough|Borough|District|Metropolitan Borough) Council$| Council$| Corporation$/, ''));

// What to show for each kind of evidence, given the council and police force.
const LOCAL = {
  marac: (c, force) => {
    const upper = socialServicesCouncil(c);
    return `<p class="govuk-body">Each area runs its own MARAC, with the council, police and local services. In ${area(c)}, you can ask:</p>
<ul class="govuk-list govuk-list--bullet">
  <li>your IDVA or domestic abuse support worker, if you have one – they are often MARAC members</li>
  ${force ? `<li>${escapeHtml(force.name)} – call 101 and ask for the domestic abuse team or MARAC coordinator</li>` : ''}
  <li>${escapeHtml(upper.name)} – ask for the domestic abuse or community safety team (${link(upper.url, 'website')})</li>
</ul>`;
  },


  p19: (c) => `<p class="govuk-body">Your council is <strong>${escapeHtml(c.name)}</strong>. Ask the officer who dealt with you, or the housing or homeless team.</p>
<p class="govuk-body">${link(`https://www.gov.uk/homelessness-help-from-council/${c.slug}`, `Contact ${c.name} about housing on GOV.UK`)}</p>
<p class="govuk-body">If it was a housing association, ask your housing officer there instead.</p>`,
  social: (c) => {
    const s = socialServicesCouncil(c);
    return `<p class="govuk-body">Social services and children’s services in ${area(c)} are run by <strong>${escapeHtml(s.name)}</strong>. Ask the social worker who worked with you, or contact children’s services (${link(s.url, 'website')}).</p>`;
  },
};

// Local services the person can choose, to fill in who the email goes to.
function servicesHtml(c, key) {
  const list = servicesFor(c, key);
  if (!list.length) return `<p class="govuk-body">We did not find services in ${area(c)} listed for this. ${DIRECTORY}.</p>`;
  const line = (s) => [s.phone && `Phone ${escapeHtml(s.phone)}`, s.email ? escapeHtml(s.email) : 'No email listed', s.for && `For ${escapeHtml(s.for.toLowerCase())}`].filter(Boolean).join(' · ');
  return `<div class="govuk-form-group govuk-!-margin-top-4"><fieldset class="govuk-fieldset" aria-describedby="service-hint">
  <legend class="govuk-fieldset__legend govuk-fieldset__legend--s">Services in ${area(c)}</legend>
  <div class="govuk-hint" id="service-hint">Choose the one you have been in contact with, and we will add their details to your email.</div>
  <div class="govuk-radios govuk-radios--small">
    ${list.map((sv, i) => `<div class="govuk-radios__item">
      <input class="govuk-radios__input" id="service-${i}" name="service" type="radio" value="${escapeHtml(sv.id)}" aria-describedby="service-${i}-hint">
      <label class="govuk-label govuk-radios__label" for="service-${i}">${escapeHtml(sv.name)}</label>
      <div class="govuk-hint govuk-radios__hint" id="service-${i}-hint">${line(sv)}${sv.website ? ` · ${link(sv.website, 'website')}` : ''}</div>
    </div>`).join('')}
    <div class="govuk-radios__divider">or</div>
    <div class="govuk-radios__item">
      <input class="govuk-radios__input" id="service-none" name="service" type="radio" value="">
      <label class="govuk-label govuk-radios__label" for="service-none">None of these</label>
    </div>
  </div>
</fieldset></div>
<p class="govuk-body-s">From the Women’s Aid directory, Routes to Support. Details can change, so check them on the service’s website.</p>
<p class="govuk-body govuk-!-font-weight-bold" id="service-status" aria-live="polite"></p>`;
}

// Fills in the email with the chosen service, without overwriting anything
// the person typed themselves.
function useService(root, c, key, id) {
  const sv = servicesFor(c, key).find((x) => x.id === id);
  const status = root.querySelector('#service-status');
  const set = (sel, value) => {
    const el = root.querySelector(sel);
    if (el && (!el.value || el.dataset.prefilled)) { el.value = value; el.dataset.prefilled = value ? 'true' : ''; }
  };
  set('#profName', sv ? sv.name : '');
  set('#profEmail', sv?.email || '');
  if (status) {
    status.textContent = !sv ? ''
      : sv.email ? `We have added ${sv.name} to your email below.`
        : `${sv.name} does not list an email address.${sv.phone ? ` Call them on ${sv.phone} and ask where to send your request.` : ''}`;
  }
}

// Name to put in the email, when the council is who they are writing to.
const PREFILL = { p19: (c) => c.name, social: (c) => socialServicesCouncil(c).name };

export function mountLocal(el, root) {
  const key = el.dataset.local;
  if (!LOCAL[key] && !hasServiceList(key)) return;
  el.innerHTML = `
<div class="govuk-form-group govuk-!-margin-bottom-2">
  <label class="govuk-label govuk-label--s" for="localPostcode">Find who to ask near you</label>
  <div class="govuk-hint" id="localPostcode-hint">Enter the first half of your postcode, for example M1. It is sent to postcodes.io${key === 'marac' ? ' and police.uk' : ''} to find your area, and is not saved.</div>
  <input class="govuk-input govuk-input--width-10" id="localPostcode" type="text" autocomplete="off" spellcheck="false" aria-describedby="localPostcode-hint">
  <button type="button" class="govuk-button govuk-button--secondary govuk-!-margin-bottom-0 app-inline-button" data-module="govuk-button" id="localFind">Find</button>
</div>
<div id="localResult" aria-live="polite"></div>`;
  const input = el.querySelector('#localPostcode');
  const button = el.querySelector('#localFind');
  const result = el.querySelector('#localResult');

  const render = async (place) => {
    if (!place.councils.length) {
      result.innerHTML = `<p class="govuk-body">We could not find the council for ${escapeHtml(place.outcode)}. ${DIRECTORY}.</p>`;
      return;
    }
    let force = null;
    if (key === 'marac') force = FORCES[await forceForPlace(place).catch(() => null)] || null;
    const choose = place.councils.length > 1 ? `<div class="govuk-form-group"><fieldset class="govuk-fieldset">
<legend class="govuk-fieldset__legend govuk-fieldset__legend--s">${escapeHtml(place.outcode)} covers more than one council area. Which is yours?</legend>
<div class="govuk-radios govuk-radios--small">${place.councils.map((c, i) => `<div class="govuk-radios__item"><input class="govuk-radios__input" id="council-${i}" name="council" type="radio" value="${i}"${i === 0 ? ' checked' : ''}><label class="govuk-label govuk-radios__label" for="council-${i}">${escapeHtml(c.name)}</label></div>`).join('')}</div>
</fieldset></div>` : '';
    const show = (i) => {
      const c = place.councils[i];
      result.querySelector('#localDetail').innerHTML = (LOCAL[key] ? LOCAL[key](c, force) : '') + (hasServiceList(key) ? servicesHtml(c, key) : '');
      for (const r of result.querySelectorAll('input[name=service]')) r.addEventListener('change', () => useService(root, c, key, r.value));
      const name = root.querySelector('#profName');
      if (PREFILL[key] && name && (!name.value || name.dataset.prefilled)) {
        name.value = PREFILL[key](c);
        name.dataset.prefilled = 'true';
      }
    };
    result.innerHTML = `<div class="govuk-inset-text">${choose}<div id="localDetail"></div></div>`;
    for (const r of result.querySelectorAll('input[name=council]')) r.addEventListener('change', () => show(Number(r.value)));
    show(0);
  };

  const find = async () => {
    button.disabled = true;
    result.innerHTML = '<p class="govuk-body">Finding your area…</p>';
    try {
      const place = await findPlace(input.value);
      if (place.problem) result.innerHTML = `<p class="govuk-error-message">${escapeHtml(place.problem)}</p>`;
      else await render(place);
    } catch {
      result.innerHTML = `<p class="govuk-error-message">We could not look this up just now. Try again, or ${DIRECTORY}.</p>`;
    }
    button.disabled = false;
  };
  button.addEventListener('click', find);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); find(); } });

  // Someone who already gave their postcode on this visit sees their area straight away.
  const known = rememberedPlace();
  if (known) { input.value = known.outcode; render(known); }
}
