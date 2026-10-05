// "Who to ask near you": asks for the first half of a postcode and shows the
// council (and for a MARAC, the police force) for that area.
//
// Mount on <div data-local="marac"> (also p14, p17, p19, social).

import { findPlace, rememberedPlace, socialServicesCouncil } from './location.js';
import { forceForPlace, FORCES } from './police.js';
import { escapeHtml } from './chat.js';

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
  p14: (c) => `<p class="govuk-body">If you are no longer in touch with your IDVA, ${escapeHtml(socialServicesCouncil(c).name)} can tell you who runs the IDVA service in ${area(c)} (${link(socialServicesCouncil(c).url, 'website')}). You can also call the National Domestic Abuse Helpline on 0808 2000 247.</p>`,
  p17: (c) => `<p class="govuk-body">Local services in ${area(c)} are listed by ${escapeHtml(socialServicesCouncil(c).name)} (${link(socialServicesCouncil(c).url, 'website')}). ${DIRECTORY}.</p>`,
  p19: (c) => `<p class="govuk-body">Your council is <strong>${escapeHtml(c.name)}</strong>. Ask the officer who dealt with you, or the housing or homeless team.</p>
<p class="govuk-body">${link(`https://www.gov.uk/homelessness-help-from-council/${c.slug}`, `Contact ${c.name} about housing on GOV.UK`)}</p>
<p class="govuk-body">If it was a housing association, ask your housing officer there instead.</p>`,
  social: (c) => {
    const s = socialServicesCouncil(c);
    return `<p class="govuk-body">Social services and children’s services in ${area(c)} are run by <strong>${escapeHtml(s.name)}</strong>. Ask the social worker who worked with you, or contact children’s services (${link(s.url, 'website')}).</p>`;
  },
};

// Name to put in the email, when the council is who they are writing to.
const PREFILL = { p19: (c) => c.name, social: (c) => socialServicesCouncil(c).name };

export function mountLocal(el, root) {
  const key = el.dataset.local;
  if (!LOCAL[key]) return;
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
      result.querySelector('#localDetail').innerHTML = LOCAL[key](c, force);
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
