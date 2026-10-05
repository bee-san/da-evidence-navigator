// "Find a solicitor" flow for someone who has experienced domestic abuse.
// Facts checked on 5 October 2026:
// - Find a Legal Aid Adviser search: https://find-legal-advice.justice.gov.uk/
//   accepts GET /search?postcode=…&categories=mat (mat = Family).
// - Civil Legal Advice: 0345 345 4 345, Monday to Friday 9am to 8pm,
//   Saturday 9am to 12:30pm (https://www.gov.uk/civil-legal-advice).

const FINDER = 'https://find-legal-advice.justice.gov.uk/search';

const CAN_LOCATE = typeof navigator !== 'undefined' && 'geolocation' in navigator;

// "Find location": device location, rounded to about 1km, to a postcode
// district (for example SW1H) through postcodes.io. Only the district goes
// in the box, so the search does not show the home postcode.
async function locate(button) {
  const input = document.getElementById(button.dataset.locate);
  const status = document.getElementById(`${button.dataset.locate}-locate-status`);
  const say = (msg) => { status.textContent = msg; };
  button.disabled = true;
  say('Finding your location…');
  try {
    const pos = await new Promise((ok, fail) => navigator.geolocation.getCurrentPosition(ok, fail,
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 }));
    const r2 = (n) => n.toFixed(2);
    const res = await fetch(`https://api.postcodes.io/postcodes?lon=${r2(pos.coords.longitude)}&lat=${r2(pos.coords.latitude)}&radius=2000&limit=1`);
    const outcode = res.ok && (await res.json()).result?.[0]?.outcode;
    if (!outcode) { say('We could not find a postcode for your location. Type a postcode instead.'); return; }
    input.value = outcode;
    say(`Found ${outcode}. Select Search for a legal aid solicitor.`);
  } catch (e) {
    say(e && e.code === 1 ? 'Location was not shared. Type a postcode instead.' : 'We could not find your location. Type a postcode instead.');
  } finally {
    button.disabled = false;
  }
}
if (CAN_LOCATE && typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-locate]');
    if (b) locate(b);
  });
}

// A postcode search that opens the GOV.UK finder with "Family" selected.
// It is a plain form, so it works without JavaScript.
export const finderForm = (id = 'postcode') => `
<form action="${FINDER}" method="get" class="govuk-!-margin-bottom-6">
  <input type="hidden" name="categories" value="mat">
  <div class="govuk-form-group">
    <label class="govuk-label govuk-label--s" for="${id}">Your postcode</label>
    <div class="govuk-hint" id="${id}-hint">You can use a postcode near you, for example where you work, if you do not want to use your home postcode.</div>
    <input class="govuk-input govuk-input--width-10" id="${id}" name="postcode" type="text" autocomplete="postal-code" spellcheck="false" aria-describedby="${id}-hint">
  </div>${CAN_LOCATE ? `
  <div class="govuk-form-group">
    <button type="button" class="govuk-button govuk-button--secondary govuk-!-margin-bottom-2" data-locate="${id}">Find location</button>
    <p class="govuk-body-s govuk-!-margin-bottom-0" id="${id}-locate-status" role="status"></p>
    <p class="govuk-body-s">This uses your device's location to fill in the first part of your postcode, for example SW1H. Your approximate location is sent to postcodes.io to look this up. Your browser may remember that you allowed this.</p>
  </div>` : ''}
  <button type="submit" class="govuk-button" data-module="govuk-button">Search for a legal aid solicitor</button>
  <p class="govuk-body-s">This opens Find a Legal Aid Adviser on GOV.UK in this tab, with family law already chosen. Your postcode goes to GOV.UK, not to this website. The search will show in your browser history.</p>
</form>`;

const CLA = `<p class="govuk-body">Call Civil Legal Advice on <strong>0345 345 4 345</strong>. Say you are at risk of harm and they will deal with your call quickly. They can check if you can get legal aid and help you find a solicitor.</p>
<p class="govuk-body">Monday to Friday, 9am to 8pm<br>Saturday, 9am to 12:30pm<br><a class="govuk-link" href="https://www.gov.uk/call-charges" rel="noreferrer">Find out about call charges</a></p>`;

const WHAT_TO_SAY = `<div class="govuk-inset-text">
  <p class="govuk-body">“I have experienced domestic abuse and I need help with a family matter. Do you do legal aid family work, and can you take on my case?”</p>
</div>
<p class="govuk-body">You do not have to describe what happened on the first call. Some solicitors are busy – if they cannot help, ask them if they know someone who can, or try the next one.</p>`;

// Every result ends with a way into the find evidence flow, past its
// "Do you have a solicitor?" question.
const EVIDENCE = (hasSolicitor) => `<h2 class="govuk-heading-m">Next: find evidence</h2>
<p class="govuk-body">To get legal aid, you will usually need evidence of domestic abuse, such as a letter from a doctor or a support service. We can help you work out what you could get, and ask for it.</p>
<p class="govuk-body"><a class="govuk-link" href="check.html?solicitor=${hasSolicitor}#solicitor/police">Find evidence you can use</a></p>`;

const NEXT = `<h2 class="govuk-heading-m">What happens next</h2>
<p class="govuk-body">The solicitor will check if you can get legal aid. They will tell you which evidence of domestic abuse they need, for example a letter from a doctor or support worker. You do not need to get the evidence before you contact them.</p>`;

export default {
  start: 'have',
  steps: {
    have: {
      title: 'Do you have a solicitor for your family case?',
      hint: 'A solicitor is a type of lawyer. Your family case might be about your children, divorce, or protecting yourself or your children from a partner, ex-partner or family member who abused you.',
      options: [
        { label: 'Yes', next: 'legalAid' },
        { label: 'No', next: 'risk' },
        { label: 'I’m not sure', next: 'risk' },
      ],
    },
    legalAid: {
      title: 'Is your solicitor doing your case on legal aid?',
      hint: 'Legal aid means the government pays some or all of your legal costs. Not every solicitor does legal aid work.',
      options: [
        { label: 'Yes', next: 'sorted' },
        { label: 'No', next: 'notLegalAid' },
        { label: 'I’m not sure', next: 'ask' },
      ],
    },
    risk: {
      title: 'Are you at risk of harm now?',
      hint: 'For example, you are scared the person who abused you will hurt you or your children, or they know where you live.',
      options: [
        { label: 'Yes', next: 'urgent' },
        { label: 'No', next: 'find' },
      ],
    },
    sorted: {
      title: 'Your solicitor can help you with the next steps',
      body: `<p class="govuk-body">Ask your solicitor which evidence of domestic abuse they need for your legal aid application. They can often get police and court records themselves.</p>
<p class="govuk-body">If you are not happy with your solicitor, you can choose a different legal aid solicitor.</p>
${finderForm()}
${EVIDENCE('yes')}`,
    },
    ask: {
      title: 'Ask your solicitor if they can do your case on legal aid',
      body: `<p class="govuk-body">You can ask them:</p>
<div class="govuk-inset-text"><p class="govuk-body">“Are you doing my case on legal aid? If not, could I get legal aid because I have experienced domestic abuse?”</p></div>
<p class="govuk-body">If they do not do legal aid work, you can find a solicitor who does. You can usually move your case to them.</p>
${finderForm()}
${EVIDENCE('yes')}`,
    },
    notLegalAid: {
      title: 'You might be able to get legal aid',
      body: `<p class="govuk-body">If you have experienced domestic abuse, you might be able to get legal aid for your family case. Ask your solicitor if they can apply for it. If they do not do legal aid work, find a solicitor who does.</p>
${finderForm()}
${NEXT}
${EVIDENCE('yes')}`,
    },
    urgent: {
      title: 'Get help now',
      body: `<div class="govuk-warning-text">
  <span class="govuk-warning-text__icon" aria-hidden="true">!</span>
  <strong class="govuk-warning-text__text"><span class="govuk-visually-hidden">Warning</span>If you are in immediate danger, call 999. If you cannot speak, call 999 and press 55 when asked.</strong>
</div>
<h2 class="govuk-heading-m">Talk to someone about legal aid</h2>
${CLA}
<h2 class="govuk-heading-m">Talk to a domestic abuse helpline</h2>
<p class="govuk-body">These are free and open 24 hours:</p>
<ul class="govuk-list govuk-list--bullet">
  <li>National Domestic Abuse Helpline: <strong>0808 2000 247</strong></li>
  <li>Live Fear Free (Wales): <strong>0808 80 10 800</strong></li>
</ul>
<p class="govuk-body">Men can also call the Men's Advice Line on <strong>0808 801 0327</strong>.</p>
<h2 class="govuk-heading-m">Search for a solicitor yourself</h2>
${finderForm()}
${WHAT_TO_SAY}
${EVIDENCE('no')}`,
    },
    find: {
      title: 'Find a legal aid solicitor',
      body: `<ol class="govuk-list govuk-list--number govuk-list--spaced">
  <li>Search for solicitors near you who do legal aid family work.</li>
  <li>Call 2 or 3 of them.</li>
  <li>Tell them you have experienced domestic abuse and need help with a family matter.</li>
</ol>
${finderForm()}
<h2 class="govuk-heading-m">What to say when you call</h2>
${WHAT_TO_SAY}
${NEXT}
<h2 class="govuk-heading-m">If you cannot find a solicitor, or would rather talk to someone</h2>
${CLA}
${EVIDENCE('no')}`,
    },
  },
};
