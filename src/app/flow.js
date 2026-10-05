// A small GOV.UK-style question flow: one question per page, a back link,
// an error message if nothing is chosen, and a result page at the end.
//
// To make a new flow, copy src/app/flows/find-solicitor.js, change the
// steps, and add a page containing:
//   <div id="flow" data-flow="your-flow-name"></div>
// with <!-- script: app/flow-page.js -->.
//
// A flow is { start, steps }. Each step is either
//   { title, hint?, options: [{ label, hint?, next }] }   – a question
//   { title, body }                                        – a result (HTML)
// Answers are not stored. The step path is kept in the address (#a/b/c) so
// the browser back button works.
//
// A flow can also export onRender(root, step, path), called after each step is
// shown, to add interactive parts to a result page.
//
// An option can have remember: { … }. Choosing it copies those values into
// flow.answers, in memory only, so later pages can use them (for example,
// whether someone has a solicitor). Nothing is saved.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Lists problems with a flow definition: missing steps, dead ends and steps
// that can never be reached. Used by the tests.
export function validateFlow(flow) {
  const problems = [];
  if (!flow.steps[flow.start]) problems.push(`start step "${flow.start}" does not exist`);
  const seen = new Set();
  const visit = (id) => {
    if (seen.has(id) || !flow.steps[id]) return;
    seen.add(id);
    for (const o of flow.steps[id].options || []) {
      if (!flow.steps[o.next]) problems.push(`"${id}" option "${o.label}" goes to missing step "${o.next}"`);
      visit(o.next);
    }
  };
  visit(flow.start);
  for (const [id, s] of Object.entries(flow.steps)) {
    if (!seen.has(id)) problems.push(`"${id}" cannot be reached`);
    if (!s.options && !s.body) problems.push(`"${id}" has no options and no body`);
    if (s.options && !s.options.length) problems.push(`"${id}" has an empty options list`);
  }
  return problems;
}

// Turns the address hash into a valid path of step ids. Anything that does
// not follow the flow is dropped, so a hand-edited address cannot skip steps.
export function readPath(flow, hash) {
  const ids = String(hash).replace(/^#/, '').split('/').filter(Boolean);
  const path = [flow.start];
  if (ids[0] !== flow.start) return path;
  for (const id of ids.slice(1)) {
    const current = flow.steps[path[path.length - 1]];
    if (!current.options || !current.options.some((o) => o.next === id)) break;
    path.push(id);
  }
  return path;
}

export function stepHtml(flow, path, { error = false } = {}) {
  const id = path[path.length - 1];
  const step = flow.steps[id];
  const back = path.length > 1
    ? `<a href="#${path.slice(0, -1).join('/')}" class="govuk-back-link">Back</a>` : '';
  if (!step.options) {
    return `${back}
<div class="govuk-grid-row"><div class="govuk-grid-column-two-thirds">
  <h1 class="govuk-heading-l" tabindex="-1">${esc(step.title)}</h1>
  ${step.body}
  <p class="govuk-body govuk-!-margin-top-6"><a class="govuk-link" href="#${flow.start}">Start again</a></p>
</div></div>`;
  }
  const name = `${id}-answer`;
  const errorId = `${id}-error`;
  const hintId = step.hint ? `${id}-hint` : '';
  const describedBy = [hintId, error ? errorId : ''].filter(Boolean).join(' ');
  return `${back}
<div class="govuk-grid-row"><div class="govuk-grid-column-two-thirds">
  ${error ? `<div class="govuk-error-summary" data-module="govuk-error-summary" tabindex="-1">
    <div role="alert"><h2 class="govuk-error-summary__title">There is a problem</h2>
    <div class="govuk-error-summary__body"><ul class="govuk-list govuk-error-summary__list">
      <li><a href="#${id}-0">Select an answer</a></li></ul></div></div></div>` : ''}
  <form novalidate data-step="${esc(id)}">
    <div class="govuk-form-group${error ? ' govuk-form-group--error' : ''}">
      <fieldset class="govuk-fieldset"${describedBy ? ` aria-describedby="${describedBy}"` : ''}>
        <legend class="govuk-fieldset__legend govuk-fieldset__legend--l">
          <h1 class="govuk-fieldset__heading" tabindex="-1">${esc(step.title)}</h1>
        </legend>
        ${step.hint ? `<div id="${hintId}" class="govuk-hint">${esc(step.hint)}</div>` : ''}
        ${error ? `<p id="${errorId}" class="govuk-error-message"><span class="govuk-visually-hidden">Error:</span> Select an answer</p>` : ''}
        <div class="govuk-radios" data-module="govuk-radios">
          ${step.options.map((o, i) => `<div class="govuk-radios__item">
            <input class="govuk-radios__input" id="${id}-${i}" name="${name}" type="radio" value="${esc(o.next)}"${o.hint ? ` aria-describedby="${id}-${i}-hint"` : ''}>
            <label class="govuk-label govuk-radios__label" for="${id}-${i}">${esc(o.label)}</label>
            ${o.hint ? `<div id="${id}-${i}-hint" class="govuk-hint govuk-radios__hint">${esc(o.hint)}</div>` : ''}
          </div>`).join('')}
        </div>
      </fieldset>
    </div>
    <button type="submit" class="govuk-button" data-module="govuk-button">Continue</button>
  </form>
</div></div>`;
}

// Runs a flow inside `root`. `pageTitle` is the service name used in the
// browser tab title.
export function runFlow(root, flow, pageTitle = document.title, { onRender } = {}) {
  const render = (error = false) => {
    const path = readPath(flow, location.hash);
    const step = flow.steps[path[path.length - 1]];
    root.innerHTML = stepHtml(flow, path, { error });
    document.title = `${error ? 'Error: ' : ''}${step.title} – ${pageTitle}`;
    const focus = root.querySelector(error ? '.govuk-error-summary' : 'h1');
    if (focus) focus.focus();
    // The error summary links to the first radio. Focus it rather than
    // following the link, which would change the step path.
    for (const a of root.querySelectorAll('.govuk-error-summary a')) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const input = root.querySelector(a.getAttribute('href'));
        if (input) { input.focus(); input.closest('fieldset').scrollIntoView(); }
      });
    }
    if (onRender) onRender(root, step, path);
    const form = root.querySelector('form[data-step]');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const picked = form.querySelector('input[type=radio]:checked');
        if (!picked) { render(true); return; }
        const option = step.options[Number(picked.id.slice(picked.id.lastIndexOf('-') + 1))];
        if (option?.remember) flow.answers = { ...flow.answers, ...option.remember };
        location.hash = [...path, picked.value].join('/');
      });
    }
  };
  addEventListener('hashchange', () => render());
  render();
}
