// GOV.UK rendering for results from the evidence checker (src/app/checker/).
import { CATEGORIES, Label, Status } from './checker/index.js';
import { Doc } from './checker/text.js';
import { detectType } from './rules.js';
import { escapeHtml } from './chat.js';

// The older letter types (rules.js, request emails' ?type= links) and the evidence category each means.
export const OLD_TYPES = {
  p11: 'sch1-para11', p14: 'sch1-para14', p17: 'sch1-para17', p18: 'sch1-para18', p19: 'sch1-para19',
  marac: 'sch1-para13', refugeStay: 'sch1-para17', social: 'sch1-para19', financial: 'sch1-para21',
};

// Evidence where the checker compares a date with the legal aid application.
export const NEEDS_DATE = new Set(['sch1-para9', 'sch1-para20', 'sch2-para6']);

// Guesses the category from the text, for the common letter types only.
export const guessCategory = (text) => OLD_TYPES[detectType(text)] || null;

const paraLabel = (c) => `Paragraph ${c.para.toUpperCase()}`;

export function categoryOptions(selected = '') {
  const group = (schedule, title) => `<optgroup label="${title}">${CATEGORIES.filter((c) => c.schedule === schedule)
    .map((c) => `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${paraLabel(c)}: ${escapeHtml(c.name)}</option>`).join('')}</optgroup>`;
  return group(1, 'Domestic abuse (Schedule 1)') + group(2, 'Child abuse (Schedule 2)');
}

// Confidence score: how much of what the checker looks for it could confirm. Met counts fully, "Check"
// counts half, "Missing" counts zero; notes and requirements that do not apply are left out. It says how
// complete the letter looks to these rules, not whether legal aid will be granted.
export function confidence(r) {
  const counted = r.criteria.filter((c) => [Status.PASS, Status.UNCLEAR, Status.MISSING].includes(c.status));
  const met = counted.filter((c) => c.status === Status.PASS).length;
  const check = counted.filter((c) => c.status === Status.UNCLEAR).length;
  const missing = counted.length - met - check;
  const score = counted.length ? Math.round((100 * (met + check / 2)) / counted.length) : 0;
  const cat = CATEGORIES.find((c) => c.id === r.category);
  const tested = cat?.examples >= 8 ? `high – these rules were tested on ${cat.examples} example letters`
    : cat?.examples > 0 ? `medium – these rules were tested on only ${cat.examples} example letters`
      : 'low – these rules come from the guidance and have not been tested on example letters';
  return { score, met, check, missing, total: counted.length, tested };
}

// Words worth a second look: hedged wording and template text that was never filled in.
const HEDGE = /\b(might|may|could|possibly|perhaps|potentially|probably|likely|appears? to|seems? to|suggests?)\b/gi;
const PLACEHOLDER = /\[[^\]\n]{1,60}\]|\b\w+(?: \w+)? \/ \w+(?: \w+)?\b/g;
const notMonthMay = (s, i) => !/^may\b/i.test(s.slice(i)) || !/^may,?\s+\d/i.test(s.slice(i)) && !/^may concern/i.test(s.slice(i));

function markWords(sentence) {
  const marks = [];
  for (const m of sentence.matchAll(HEDGE)) {
    if (notMonthMay(sentence, m.index)) marks.push([m.index, m.index + m[0].length, `“${m[0]}” sounds uncertain. Evidence usually needs a definite statement.`]);
  }
  for (const m of sentence.matchAll(PLACEHOLDER)) {
    if (/\//.test(m[0]) && /https?:|\d\/\d/.test(m[0])) continue;
    marks.push([m.index, m.index + m[0].length, /^\[/.test(m[0]) ? 'Template text that was not filled in.' : 'A choice from a template that was not made.']);
  }
  marks.sort((a, b) => a[0] - b[0]);
  let out = '';
  let at = 0;
  const notes = [];
  for (const [a, b, why] of marks) {
    if (a < at) continue;
    out += escapeHtml(sentence.slice(at, a));
    out += `<mark class="app-mark-word" title="${escapeHtml(why)}">${escapeHtml(sentence.slice(a, b))}</mark><span class="govuk-visually-hidden"> (${escapeHtml(why)})</span>`;
    notes.push([sentence.slice(a, b), why]);
    at = b;
  }
  return { html: out + escapeHtml(sentence.slice(at)), notes };
}

const RANK = { [Status.MISSING]: 3, [Status.UNCLEAR]: 2, [Status.PASS]: 1 };
const MARK_NAMES = { [Status.PASS]: 'meets', [Status.UNCLEAR]: 'needs checking for', [Status.MISSING]: 'is the problem for' };

// The letter, sentence by sentence, with the sentences each requirement relied on marked by status.
// Shown in place of the letter text, with a button to go back and edit it.
export function markupHtml(text, r) {
  const doc = new Doc(text);
  const bySentence = new Map();
  for (const c of r.criteria) {
    if (!RANK[c.status]) continue;
    for (const e of c.evidence) {
      for (const u of doc.units) {
        if (e === u.text || e.startsWith(`${u.text} `)) {
          const cur = bySentence.get(u.index) || { status: null, ids: [] };
          if (!cur.status || RANK[c.status] > RANK[cur.status]) cur.status = c.status;
          cur.ids.push(c.label);
          bySentence.set(u.index, cur);
        }
      }
    }
  }
  const words = [];
  const blocks = [];
  for (const u of doc.units) {
    const { html, notes } = markWords(u.text);
    words.push(...notes);
    const m = bySentence.get(u.index);
    const piece = m
      ? `<span class="app-mark app-mark--${m.status}" title="${escapeHtml(m.ids.join('; '))}">${html}</span><span class="govuk-visually-hidden"> (this sentence ${MARK_NAMES[m.status]}: ${escapeHtml(m.ids.join('; '))})</span>`
      : html;
    (blocks[u.block] ||= []).push(piece);
  }
  const uniqueWords = [...new Map(words.map(([w, why]) => [`${w.toLowerCase()}|${why}`, [w, why]])).values()];
  return `<h2 class="govuk-heading-m">Your letter</h2>
<ul class="govuk-list app-mark-key" aria-label="What the highlights mean">
  <li><span class="app-mark app-mark--pass">Meets a requirement</span></li>
  <li><span class="app-mark app-mark--unclear">Needs checking</span></li>
  <li><span class="app-mark app-mark--missing">Causes a requirement to fail</span></li>
  <li><mark class="app-mark-word">Word to look at</mark></li>
</ul>
<div class="app-markup" id="markup">${blocks.filter(Boolean).map((b) => `<p class="govuk-body">${b.join(' ')}</p>`).join('')}</div>
<button type="button" class="govuk-button govuk-button--secondary" data-module="govuk-button" id="edit-letter">Edit the letter</button>
${uniqueWords.length ? `<h3 class="govuk-heading-s">Words to look at</h3>
<ul class="govuk-list govuk-list--bullet">${uniqueWords.map(([w, why]) => `<li><strong>${escapeHtml(w)}</strong>: ${escapeHtml(why)}</li>`).join('')}</ul>` : ''}`;
}

const TAGS = {
  [Status.PASS]: '<strong class="govuk-tag govuk-tag--green">Met</strong>',
  [Status.MISSING]: '<strong class="govuk-tag govuk-tag--red">Missing</strong>',
  [Status.UNCLEAR]: '<strong class="govuk-tag govuk-tag--yellow">Check</strong>',
  [Status.ADVISORY]: '<strong class="govuk-tag govuk-tag--grey">Note</strong>',
};

const OUTCOMES = {
  [Label.COMPLETE]: { title: 'Nothing obviously missing', text: 'Every requirement the checker looks for appears to be met. Give it to your solicitor – they and the Legal Aid Agency make the decision.', success: true },
  [Label.REVIEW]: { title: 'A person needs to check this letter', text: 'Nothing is clearly missing, but some parts need a person to decide. Your solicitor can check the parts marked “Check”.' },
  [Label.INCOMPLETE]: { title: 'This letter is missing something it needs', text: 'Ask the person who wrote it to add what is marked “Missing”. You can show them what to ask for below.' },
};

function scoreHtml(r) {
  const c = confidence(r);
  return `<div class="app-score"><p class="govuk-body govuk-!-margin-bottom-1"><span class="govuk-!-font-size-48 govuk-!-font-weight-bold">${c.score}%</span> confidence score</p>
<p class="govuk-body">${c.met} of ${c.total} requirements met${c.check ? `, ${c.check} to check` : ''}${c.missing ? `, ${c.missing} missing` : ''}. How much to trust the rules for this type of evidence: ${escapeHtml(c.tested)}.</p>
<p class="govuk-body-s govuk-!-margin-bottom-0">The score shows how complete the letter looks to these rules. It does not predict whether legal aid will be granted.</p></div>`;
}

// Fields to check again as a different type, or with names the letter must contain. Collapsed.
function recheckHtml(r, guessed) {
  const cat = CATEGORIES.find((c) => c.id === r.category);
  const field = (id, label, hint, hidden = false) => `<div class="govuk-form-group" id="${id}-group"${hidden ? ' hidden' : ''}>
  <label class="govuk-label" for="${id}">${label}</label>${hint ? `<div class="govuk-hint" id="${id}-hint">${hint}</div>` : ''}
  <input class="govuk-input govuk-!-width-two-thirds" id="${id}" type="text" autocomplete="off" spellcheck="false"${hint ? ` aria-describedby="${id}-hint"` : ''}>
</div>`;
  return `<details class="govuk-details" id="recheck"${guessed ? '' : ' open'}>
  <summary class="govuk-details__summary"><span class="govuk-details__summary-text">Not the right type of evidence, or a name was missed?</span></summary>
  <div class="govuk-details__text">
    <form id="recheck-form" novalidate>
      <div class="govuk-form-group">
        <label class="govuk-label" for="recheck-type">Type of evidence</label>
        <select class="govuk-select" id="recheck-type">${categoryOptions(cat?.id)}</select>
      </div>
      ${field('client', 'Name of the person applying for legal aid', 'Leave blank and we will look for it in the letter.')}
      ${field('other', 'Name of the person who abused you or the child', '')}
      ${field('child', 'Name of the child', '', true)}
      ${field('appdate', 'Date of the legal aid application', 'For example, 5 October 2026. Used to check the evidence came first.', true)}
      <button type="submit" class="govuk-button govuk-!-margin-bottom-0" data-module="govuk-button">Check again</button>
    </form>
  </div>
</details>`;
}

export function reviewHtml(text, r, { guessed = false } = {}) {
  const o = OUTCOMES[r.label];
  const cat = CATEGORIES.find((c) => c.id === r.category);
  const rows = r.criteria.filter((c) => c.status !== Status.NOT_APPLICABLE);
  const asks = r.criteria.filter((c) => c.ask_for).map((c) => c.ask_for);
  const d = r.detected;
  const found = [
    d.client && `Name of the person applying: ${d.client}${d.client_source === 'found in the text' ? ' (found in the letter)' : ''}`,
    d.organisation && `Organisation: ${d.organisation}`,
    d.letter_date && `Letter dated: ${new Date(`${d.letter_date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
  ].filter(Boolean);
  return `
<h1 class="govuk-heading-l">Your letter, checked</h1>
<div class="govuk-notification-banner${o.success ? ' govuk-notification-banner--success' : ''}" role="region" aria-labelledby="result-title">
  <div class="govuk-notification-banner__header"><h2 class="govuk-notification-banner__title" id="result-title">Result</h2></div>
  <div class="govuk-notification-banner__content">
    <p class="govuk-notification-banner__heading">${o.title}</p>
    <p class="govuk-body">${o.text}</p>
  </div>
</div>
${scoreHtml(r)}
${markupHtml(text, r)}
<h2 class="govuk-heading-m">${escapeHtml(cat ? `${paraLabel(cat)}: ${cat.name}` : r.category_name)}</h2>
<p class="govuk-body-s">Checked as evidence under Schedule ${cat?.schedule ?? ''} of the Civil Legal Aid (Procedure) Regulations 2012.${guessed ? ' We worked out the type from the letter.' : ''}</p>
${found.length ? `<ul class="govuk-list govuk-body-s">${found.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>` : ''}
<dl class="govuk-summary-list app-check-result">
${rows.map((c) => `  <div class="govuk-summary-list__row">
    <dt class="govuk-summary-list__key">${escapeHtml(c.label)}</dt>
    <dd class="govuk-summary-list__value">
      ${c.note ? `<p class="govuk-body">${escapeHtml(c.note)}</p>` : ''}
      ${c.evidence.length && c.status !== Status.ADVISORY ? `<p class="govuk-body govuk-!-font-size-16 app-quote">“${escapeHtml(c.evidence[0])}”</p>` : ''}
      ${c.ask_for ? `<p class="govuk-body"><strong>What to ask for:</strong> ${escapeHtml(c.ask_for)}</p>` : ''}
      ${c.ref ? `<p class="govuk-body-s govuk-!-margin-bottom-0">${escapeHtml(c.ref)}</p>` : ''}
    </dd>
    <dd class="govuk-summary-list__actions">${TAGS[c.status] || ''}</dd>
  </div>`).join('\n')}
</dl>
${asks.length ? `<h2 class="govuk-heading-m">What to ask the writer for</h2>
<ul class="govuk-list govuk-list--bullet">${asks.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>` : ''}
${recheckHtml(r, guessed)}
<div class="govuk-inset-text"><ul class="govuk-list govuk-body-s govuk-!-margin-bottom-0">${r.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div>`;
}
