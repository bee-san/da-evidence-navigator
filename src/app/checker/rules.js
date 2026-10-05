// Deterministic verifiers. Each returns [status, note, evidence sentences].
// A port of laa-evidence-checker (Python) rules.py: keep the two in step (see scripts/checker-golden.py).
//
// A verifier never guesses. When the text gives a partial or ambiguous signal it returns UNCLEAR, so a
// person makes the call. When nothing in the text addresses the requirement it returns MISSING.

import * as L from './lexicon.js';
import { search, match, finditer, sub, rx, findDates, addMonths, parseNumber, nameFound, surnameOf, ord, NAME_WORD, title, isUpper, escape } from './text.js';

export const Status = { PASS: 'pass', MISSING: 'missing', UNCLEAR: 'unclear', NOT_APPLICABLE: 'n/a', ADVISORY: 'advisory' };
const ORDER = { missing: 3, unclear: 2, pass: 1, advisory: 0, 'n/a': 0 };
const unique = (list) => [...new Set(list)];

function hits(doc, pattern, flags = 'i', limit = 3) {
  const out = [];
  for (const u of doc.units) {
    if (search(pattern, u.text, flags)) {
      out.push(u.text);
      if (out.length >= limit) break;
    }
  }
  return out;
}

// Python max()/min() return the first item with the highest/lowest key.
const first = (list, better) => list.reduce((best, o) => (better(o, best) ? o : best), list[0]);

export function worst(...outs) {
  let list = outs.filter((o) => o[0] !== Status.NOT_APPLICABLE && o[0] !== Status.ADVISORY);
  if (!list.length) list = outs;
  const status = first(list, (o, b) => ORDER[o[0]] > ORDER[b[0]])[0];
  const notes = list.filter((o) => o[1] && (o[0] === status || status === Status.PASS)).map((o) => o[1]);
  const ev = [];
  for (const o of list) for (const e of o[2]) if (!ev.includes(e)) ev.push(e);
  return [status, notes.join(' '), ev.slice(0, 4)];
}

// ------------------------------------------------------------------ generic builders

// PASS if the pattern matches a sentence; UNCLEAR if only unclearRx matches; otherwise MISSING.
export function present(pattern, what, { unclearRx = null, unclearNote = '', flags = 'i', missingNote = null } = {}) {
  return (doc) => {
    let ev = hits(doc, pattern, flags);
    if (ev.length) return [Status.PASS, '', ev];
    if (unclearRx) {
      ev = hits(doc, unclearRx, flags);
      if (ev.length) return [Status.UNCLEAR, unclearNote || `Something close to ${what} is mentioned; check it.`, ev];
    }
    return [Status.MISSING, missingNote || `No mention of ${what}.`, []];
  };
}

// PASS if a and b occur in the same sentence (or within `window` sentences).
export function together(a, b, what, { window = 1, flags = 'i', partialNote = null } = {}) {
  return (doc) => {
    let aSeen = false;
    for (const u of doc.units) {
      if (search(a, u.text, flags)) {
        aSeen = true;
        if (search(b, doc.window(u.index, window, window), flags)) return [Status.PASS, '', [u.text]];
      }
    }
    if (aSeen || hits(doc, b, flags).length) {
      const ha = hits(doc, a, flags);
      return [Status.UNCLEAR, partialNote || `Part of ${what} is there, but not all of it together.`, ha.length ? ha : hits(doc, b, flags)];
    }
    return [Status.MISSING, `No statement of ${what}.`, []];
  };
}

// PASS unless the pattern matches (and unlessRx does not); then return `status` with a note.
export function absent(pattern, problem, { status = Status.UNCLEAR, unlessRx = null } = {}) {
  return (doc) => {
    const ev = hits(doc, pattern);
    if (ev.length && !(unlessRx && hits(doc, unlessRx).length)) return [status, problem, ev];
    return [Status.PASS, '', []];
  };
}

export const advisory = (note) => () => [Status.ADVISORY, note, []];
export const allOf = (...vs) => (doc, ctx) => worst(...vs.map((f) => f(doc, ctx)));
export const anyOf = (...vs) => (doc, ctx) => first(vs.map((f) => f(doc, ctx)), (o, b) => ORDER[o[0]] < ORDER[b[0]]);

// ------------------------------------------------------------------ people

const ROLE_WORDS = { client: 'client', other_party: 'other party (B)', child: 'child' };

// Checks the client, the other party or the child is named in the document.
// mayBeOther: the evidence may instead name another person in a family relationship with B (guidance 2.4).
// wherePossible: the guidance only requires the name "where named".
export function named(role, { mayBeOther = false, wherePossible = false } = {}) {
  return (doc, ctx) => {
    let name = ctx[role];
    if (role === 'client' && !name) name = ctx.detected.client;
    const who = ROLE_WORDS[role];
    const withheld = () => hits(doc, L.PERP_WITHHELD);
    if (!name) {
      if (role === 'other_party' && withheld().length) return [Status.MISSING, 'The author says they cannot name the other party, so B is not named.', withheld().slice(0, 1)];
      return [Status.UNCLEAR, `Enter the ${who}'s name so the checker can look for it.`, []];
    }
    const others = [['client', ctx.client || ctx.detected.client], ['other_party', ctx.other_party], ['child', ctx.child]]
      .filter(([r, n]) => r !== role && n).map(([, n]) => n);
    const [how, hit] = nameFound(doc, name, others);
    if (how === 'full') return [Status.PASS, '', [hit]];
    if (how === 'surname') return [Status.PASS, `Matched by surname only (${surnameOf(name)}).`, [hit]];
    if (how === 'first') return [Status.UNCLEAR, `Only the first name of the ${who} appears; check it is the same person.`, [hit]];
    if (role === 'other_party' && withheld().length) return [Status.MISSING, 'The author says they cannot name the other party, so B is not named.', withheld().slice(0, 1)];
    if (mayBeOther || wherePossible) {
      const extra = mayBeOther ? 'This evidence may relate to another person in a family relationship with B, so check who is named.'
        : 'The guidance asks for the name where it is given; check whether it should be.';
      return [Status.UNCLEAR, `The ${who} (${name}) is not named. ${extra}`, []];
    }
    return [Status.MISSING, `The ${who} (${name}) is not named in the document.`, []];
  };
}

export const otherPartyIsNotClient = () => (doc, ctx) => {
  if (ctx.other_party && ctx.client && surnameOf(ctx.other_party).toLowerCase() === surnameOf(ctx.client).toLowerCase()
      && ctx.other_party.split(/\s+/)[0].toLowerCase() === ctx.client.split(/\s+/)[0].toLowerCase()) {
    return [Status.MISSING, 'The person identified as the risk must not be your client.', []];
  }
  return [Status.PASS, '', []];
};

// ------------------------------------------------------------------ Schedule 1, para 11: health professional letter

export function healthProfessional(doc) {
  const prof = hits(doc, L.HEALTH_PROF);
  const reg = hits(doc, L.REGULATOR);
  const selfDesc = doc.units.filter((u) => search("\\bI(?:'m| am| work as| practise as)\\b|\\bmy role\\b", u.text, '')).map((u) => u.text);
  const ownProf = selfDesc.filter((t) => search(L.HEALTH_PROF, t));
  const ownExcluded = selfDesc.filter((t) => search(L.NOT_HEALTH_PROF, t));
  if (ownExcluded.length && !ownProf.length) {
    return [Status.MISSING, 'The author describes themselves as a counsellor, therapist or similar, who are not appropriate health professionals (Schedule 1, para 22).', ownExcluded.slice(0, 1)];
  }
  if (prof.length && reg.length) return [Status.PASS, '', unique([...reg, ...prof]).slice(0, 2)];
  if (hits(doc, L.NOT_HEALTH_PROF).length && !prof.length) {
    return [Status.MISSING, 'Counsellors, therapists and support workers are not appropriate health professionals (Schedule 1, para 22).', hits(doc, L.NOT_HEALTH_PROF)];
  }
  if (prof.length) return [Status.UNCLEAR, 'The profession is given but not the registering body (for example the GMC or NMC).', prof];
  if (reg.length) return [Status.UNCLEAR, "A registering body is mentioned but the author's profession is not clear.", reg];
  return [Status.MISSING, 'The letter does not say the author is an appropriate health professional.', []];
}

export function examination(doc) {
  const withMode = [];
  const withoutMode = [];
  for (const u of doc.units) {
    const t = u.text;
    for (const m of finditer(L.EXAM, t, 'i')) {
      if (search(L.NEGATION_BEFORE, t.slice(0, m.index))) continue;
      if (match(L.EXAM_NOT_PERSON, t.slice(m.index))) continue;
      (search(L.MODE, t) ? withMode : withoutMode).push(t);
      break;
    }
  }
  if (withMode.length) return [Status.PASS, '', withMode.slice(0, 2)];
  const seen = hits(doc, L.SEEN_WITH_MODE);
  if (withoutMode.length && (seen.length || hits(doc, L.MODE).length)) {
    // an examination in one sentence and how it happened in another
    return [Status.PASS, '', [...(seen.length ? seen : hits(doc, L.MODE)).slice(0, 1), ...withoutMode.slice(0, 1)]];
  }
  if (withoutMode.length) return [Status.UNCLEAR, 'An examination is mentioned, but not whether it was in person, by telephone or by video.', withoutMode.slice(0, 2)];
  const noContact = hits(doc, L.NO_CONTACT);
  const contact = [...hits(doc, L.CONTACT, 'i', 10), ...hits(doc, L.MODE, 'i', 10)].filter((t) => !noContact.includes(t));
  if (noContact.length) return [Status.MISSING, 'The letter says the client was not seen or spoken to. Written contact is not an examination.', noContact.slice(0, 2)];
  if (contact.length) {
    return [Status.UNCLEAR, 'There was contact (a call or consultation), but the letter does not say the client was examined or '
      + 'clinically assessed, as opposed to symptoms being reported.', contact.slice(0, 2)];
  }
  const written = hits(doc, L.WRITTEN_ONLY);
  if (written.length) return [Status.MISSING, 'Only written contact is described. Reading a message is not an examination.', written.slice(0, 2)];
  return [Status.MISSING, 'No examination in person, by telephone or by video is confirmed.', []];
}

export function consistencyJudgement(doc) {
  const weak = [];
  const negated = [];
  const attributed = [];
  for (const u of doc.units) {
    const t = u.text;
    const m = search(L.CONSISTENT, t) || search(L.CAUSAL, t);
    if (!m) continue;
    const end = m.index + m[0].length;
    if (!search(L.DA_ANY, t)) {
      const near = doc.window(u.index, 1, 0);
      if (!(search(L.DA_ANY, near) && search('\\babus\\w*|\\bvictim\\b|\\bharmed\\b', t.slice(end)))) continue;
    }
    if (search(L.NEGATED_CONSISTENT, t)) { negated.push(t); continue; }
    if (search(L.ATTRIBUTION, t.slice(0, m.index), '') || search(L.REQUEST, t.slice(0, m.index))) { attributed.push(t); continue; }
    const win = doc.window(u.index, 1, 1);
    const judged = search(L.JUDGEMENT, win);
    const cond = search(L.CONDITION, t) || search(L.CONDITION, win);
    if (judged && cond) return [Status.PASS, '', [t]];
    weak.push([t, judged, cond]);
  }
  if (weak.length && negated.length) return [Status.MISSING, 'The author declines to give, or says they cannot give, a consistency opinion.', negated.slice(0, 1)];
  if (weak.length) {
    const [t, judged] = weak[0];
    const gap = !judged ? "that this is the professional's own judgement" : 'which injuries or condition this refers to';
    return [Status.UNCLEAR, `There is a consistency statement, but it does not make clear ${gap}.`, [t]];
  }
  if (negated.length) return [Status.MISSING, 'The letter says the findings are not consistent with domestic abuse, or that the author cannot say.', negated.slice(0, 1)];
  const attrib = attributed.length ? attributed : doc.units.filter((u) => search(L.DA, u.text) && search(L.ATTRIBUTION, u.text, '')).map((u) => u.text);
  const described = doc.units.filter((u) => search(L.CAUSED_BY_PERSON, u.text)).map((u) => u.text);
  if (described.length && !attrib.length && hits(doc, L.CONDITION).length) {
    return [Status.UNCLEAR, 'The letter describes injuries or a condition and who caused them, but does not state the '
      + 'consistency judgement in words. No set wording is required if the meaning is clear (guidance 2.56), so a '
      + 'person should decide.', described.slice(0, 1)];
  }
  if (attrib.length) {
    return [Status.MISSING, "The only link to domestic abuse is the client's own account. The professional does not give "
      + 'their judgement that the injuries or condition are consistent with domestic abuse.', attrib.slice(0, 1)];
  }
  return [Status.MISSING, 'No professional judgement that injuries or a condition are consistent with domestic abuse.', []];
}

const DR = "\\bDr\\.?\\s+([A-Z][a-zA-Z'-]+)(?:\\s+([A-Z][a-zA-Z'-]+))?";

function signatorySurname(doc) {
  for (const u of doc.units.slice(-8).reverse()) {
    const m = match("^Dr\\.?\\s+([A-Z][a-zA-Z'-]+)(?:\\s+([A-Z][a-zA-Z'-]+))?", u.text, '');
    if (m) return (m[2] || m[1]).toLowerCase();
  }
  return null;
}

export function differentAuthor(doc, ctx) {
  const sig = signatorySurname(doc);
  const otherExam = [];
  for (const u of doc.units.length > 3 ? doc.units.slice(0, -3) : doc.units) {
    for (const m of finditer(DR, u.text, '')) {
      const sur = (m[2] || m[1]).toLowerCase();
      if (sig && sur !== sig && search(`${L.EXAM}|\\bconsultation\\b|\\bsaw\\b|\\bseen\\b`, u.text)) otherExam.push(u.text);
    }
  }
  const explicit = hits(doc, L.OTHER_EXAMINER);
  if (!(otherExam.length || explicit.length)) return [Status.NOT_APPLICABLE, 'The letter writer appears to be the examining professional.', []];
  ctx.detected.examiner_differs_from_author = true;
  const ev = [...otherExam, ...explicit].slice(0, 1);
  const unavailable = hits(doc, L.UNAVAILABLE);
  const access = hits(doc, L.RECORD_ACCESS);
  const parts = [];
  if (access.length) parts.push([Status.PASS, '', access.slice(0, 1)]);
  else if (hits(doc, L.RECORD_MENTION).length) {
    parts.push([Status.UNCLEAR, 'Records or notes are mentioned, but the letter does not clearly say the author had access to '
      + "the client's medical records.", hits(doc, L.RECORD_MENTION).slice(0, 1)]);
  } else parts.push([Status.MISSING, 'The author did not examine the client and does not say they have access to the medical records.', []]);
  if (unavailable.length) parts.push([Status.PASS, '', unavailable.slice(0, 1)]);
  else parts.push([Status.UNCLEAR, 'The letter does not say why the examining professional is unavailable to write.', []]);
  const [st, note, e] = worst(...parts);
  return [st, note, [...e, ...ev].slice(0, 3)];
}

export function registrationAtTime(doc) {
  const stated = hits(doc, L.REG_AT_TIME);
  if (stated.length && hits(doc, L.REGULATOR).length) {
    return [Status.ADVISORY, 'The letter states registration at the relevant time. The LAA may still check the register.', stated.slice(0, 1)];
  }
  return [Status.ADVISORY, 'Registration must have been in place at the examination and when the letter was written '
    + '(guidance 2.54). Check the professional register.', []];
}

export function emailRegistrationNumber(doc) {
  if (!doc.isEmail) return [Status.NOT_APPLICABLE, 'Not an email.', []];
  const ev = hits(doc, L.REG_NUMBER, '');
  if (ev.length) return [Status.PASS, '', ev.slice(0, 1)];
  return [Status.MISSING, "An email must include the professional's registration number (GMC, NMC, GDC or HCPC).", []];
}

// ------------------------------------------------------------------ support organisations (paras 17 and 18)

export function detectOrgName(doc) {
  const suffix = `\\b((?:${NAME_WORD}\\s+){0,4}${NAME_WORD}\\s+${L.ORG_SUFFIX})\\b`;
  const skip = '^(?:from|to|date|subject|cc|dear|re)\\b|^\\d|(?:United Kingdom|England|Wales|Scotland|Northern Ireland)$';
  for (const u of doc.units.slice(0, 4)) {
    if (search(skip, u.text) || (findDates(u.text).length && u.text.length < 30)) continue;
    const line = isUpper(u.text) ? title(u.text) : u.text;
    const m = search(suffix, line, '');
    if (m && u.text.length < 80) return m[1];
  }
  for (const u of doc.units.slice(-6)) {
    for (const part of u.text.trim().split(/\s*[|,]\s*/)) {
      const m = match(suffix, part, '');
      if (m) return m[1];
    }
  }
  for (const u of doc.units) {
    const m = search(`\\b(?:at|from|of|with|by)\\s+((?:${NAME_WORD}\\s+){1,4}${L.ORG_SUFFIX})\\b`, u.text, '');
    if (m) return m[1];
  }
  for (const u of doc.units) {
    const m = match(`^(?:[\\w ]{2,20}:\\s*)?((?:${NAME_WORD}\\s+){0,4}${NAME_WORD})'?s? is (?:a|an) (?:[\\w-]+ ){0,4}(?:charity|organi[sz]ation|service|project|partnership|trust|centre)\\b`, u.text, '');
    if (m) return m[1];
  }
  return null;
}

export function daSupportOrg(doc, ctx) {
  if (!('organisation' in ctx.detected)) ctx.detected.organisation = detectOrgName(doc);
  const org = ctx.detected.organisation;
  const da = hits(doc, L.DA_ORG);
  if (org && da.length) return [Status.PASS, `Organisation: ${org}.`, da.slice(0, 1)];
  if (da.length) return [Status.UNCLEAR, "The letter describes domestic abuse support, but the organisation's name is not clear.", da.slice(0, 1)];
  if (org) return [Status.UNCLEAR, `${org} is named, but the letter does not say it provides domestic abuse support services.`, []];
  return [Status.MISSING, 'The letter does not identify an organisation providing domestic abuse support services.', []];
}

export function ukSituated(doc) {
  let ev = hits(doc, '\\b(?:United Kingdom|Great Britain|England|Wales|Scotland|Northern Ireland)\\b');
  if (!ev.length) ev = hits(doc, '\\bU\\.?K\\.?\\b', '');
  if (!ev.length) ev = hits(doc, '\\b(?:Scottish|Welsh|English|British|Northern Irish) (?:charity|organi[sz]ation|service|registered charity)\\b');
  if (ev.length) return [Status.PASS, '', ev.slice(0, 1)];
  ev = hits(doc, L.UK_POSTCODE, '');
  if (ev.length) return [Status.UNCLEAR, 'There is a UK-style postcode, but the letter does not state the organisation is in the UK.', ev.slice(0, 1)];
  return [Status.MISSING, 'The letter does not confirm the organisation is situated in the United Kingdom.', []];
}

const DURATION = '\\bfor (over |more than |at least |almost |nearly |just under |about |around |some )?([a-z]+(?:-[a-z]+)?|\\d+) (months?|years?)\\b';

export function operatingSixMonths(doc) {
  const letter = doc.letterDate ? doc.letterDate.value : null;
  const goodCont = [];
  const goodNoCont = [];
  const short = [];
  const undatedCont = [];
  for (const u of doc.units) {
    const t = u.text;
    if (!search(L.OPERATING, t)) continue;
    const cont = !!search(L.CONTINUOUS, doc.window(u.index, 0, 1));
    let months = null;
    const m = search(DURATION, t);
    if (m) {
      const n = parseNumber(m[2]);
      if (n) {
        months = n * (m[3].toLowerCase().startsWith('year') ? 12 : 1);
        if (m[1] && ['almost', 'nearly', 'just under'].includes(m[1].trim().toLowerCase())) months -= 0.5;
      }
    }
    const dates = findDates(t, true).filter((d) => !letter || ord(d.value) < ord(letter));
    const start = dates.length ? dates.map((d) => d.value).reduce((a, b) => (ord(b) < ord(a) ? b : a)) : null;
    if (!dates.length && months === null) {
      if (cont) undatedCont.push(t);
      continue;
    }
    let ok = (months !== null && months >= 6) || (start !== null && letter !== null && ord(addMonths(start, 6)) <= ord(letter));
    if (start !== null && letter === null && months === null) ok = null;
    if (ok) (cont ? goodCont : goodNoCont).push(t);
    else if (ok === null) undatedCont.push(t);
    else if (cont) short.push(t);
  }

  const interruptions = [];
  for (const u of doc.units) {
    const t = sub(L.CONTINUOUS, ' ', u.text);
    if (search(L.INTERRUPTION, t) && search(L.ORG_REF, t) && !search('\\b(?:account|case|file|tenancy|door|window)s?\\b', t)) interruptions.push(u.text);
  }

  // guidance 2.75: the organisation must have operated for six months, not a particular service
  const services = new Set();
  for (const u of doc.units) {
    for (const m of finditer("\\b([A-Z][\\w'-]+(?: [A-Z][\\w'-]+){0,3}),? (?:is |as )?our (?:[\\w-]+ ){0,3}(?:service|team|project|programme|strand|scheme|unit)\\b", u.text, '')) {
      services.add(m[1].split(' ').at(-1).toLowerCase());
    }
    for (const m of finditer("\\bour (?:[\\w-]+ ){0,3}(?:service|team|project|programme|strand|scheme|unit),? ([A-Z][\\w'-]+(?: [A-Z][\\w'-]+){0,3})", u.text, '')) {
      services.add(m[1].split(' ')[0].toLowerCase());
    }
  }
  const serviceLevel = (t) => {
    const f = match("^([A-Z][\\w'-]+)", t, '');
    return !!(f && services.has(f[1].toLowerCase())) || !!match('^(?:our|the|this) (?:[\\w-]+ ){0,3}(?:service|team|project|programme|strand)\\b', t);
  };
  const orgLevel = goodCont.filter((t) => !serviceLevel(t));
  if (goodCont.length && !orgLevel.length && !interruptions.length) {
    return [Status.UNCLEAR, 'The operating period given appears to be for a service, not the organisation as a whole. '
      + 'It is the organisation that must have operated for six months (guidance 2.75).', goodCont.slice(0, 1)];
  }
  const good = orgLevel.length ? orgLevel : goodCont;
  if (good.length && !interruptions.length) return [Status.PASS, '', good.slice(0, 1)];
  if (good.length && interruptions.length) return [Status.UNCLEAR, 'Continuous operation is stated, but the letter also mentions a closure or interruption.', [...good, ...interruptions].slice(0, 2)];
  if (goodNoCont.length) {
    let note = 'The letter says when the organisation started, but not that it has operated without interruption for six months or more.';
    if (interruptions.length) {
      note = 'The organisation started more than six months ago, but the letter mentions a closure or reopening and does not '
        + 'confirm six months of uninterrupted operation.';
    }
    return [Status.UNCLEAR, note, [...goodNoCont, ...interruptions].slice(0, 2)];
  }
  if (short.length) return [Status.MISSING, 'The organisation has operated for less than six months according to the letter.', short.slice(0, 1)];
  if (undatedCont.length) return [Status.UNCLEAR, "Continuous operation is stated, but the period (or the letter's date) is not clear.", undatedCont.slice(0, 1)];
  if (interruptions.length) return [Status.UNCLEAR, 'A closure or interruption is mentioned and no operating period is confirmed.', interruptions.slice(0, 1)];
  return [Status.MISSING, 'No statement that the organisation has operated for an uninterrupted period of six months or more.', []];
}

function clientRef(ctx) {
  const name = ctx.client || ctx.detected.client;
  const words = (name ? name.split(/\s+/).filter(Boolean) : []).map(escape);
  return `\\b(?:she|he|they|her|him|them|your client|the client|(?:Mr|Mrs|Ms|Miss|Mx)\\.? [A-Z][\\w'-]+|${[...words, 'xx_no_name'].join('|')})\\b`;
}

// The author's reasonable professional judgement that the person is, or is at risk of being, a victim.
export function authorJudgement() {
  return (doc, ctx) => {
    const partial = [];
    for (const u of doc.units) {
      const t = u.text;
      if (!search(L.AUTHOR_JUDGEMENT, t)) continue;
      if (search(L.CANNOT_SAY, t)) { partial.push(t); continue; }
      const win = doc.window(u.index, 1, 1);
      if (search(L.VICTIM_STATE, t) && search(`${L.DA_ANY}|\\babus\\w*`, win) && search(clientRef(ctx), t)) return [Status.PASS, '', [t]];
      partial.push(t);
    }
    if (partial.length) return [Status.UNCLEAR, 'A professional judgement is mentioned, but it does not clearly say the person is, or is at risk of being, a victim of domestic abuse.', partial.slice(0, 1)];
    const bare = hits(doc, '\\b(?:is|has been|was) (?:a )?victim of domestic abuse\\b|\\bat risk of domestic abuse\\b');
    if (bare.length) return [Status.UNCLEAR, "The letter says the person is a victim or at risk, but not that this is the author's professional judgement.", bare.slice(0, 1)];
    return [Status.MISSING, "No statement of the author's professional judgement that the person is, or is at risk of being, a victim of domestic abuse.", []];
  };
}

export function specificMatters(doc) {
  const acts = [];
  for (const u of doc.units) {
    if (match('^(?:subject|re):', u.text)) continue;
    if (L.CONDUCT.some((p) => search(p, u.text)) || search(L.EVIDENCE_SEEN, u.text, '')) acts.push(u.text);
  }
  if (acts.length) return [Status.PASS, `${acts.length} sentence(s) describe specific conduct or material.`, acts.slice(0, 2)];
  const generic = hits(doc, L.GENERIC_ABUSE);
  if (generic.length) {
    return [Status.MISSING, 'The letter names types of abuse but does not describe the specific matters (incidents, conduct '
      + 'or material) behind the judgement.', generic.slice(0, 1)];
  }
  return [Status.MISSING, 'Only general sources are listed. No specific conduct, incidents or material relied on is described.', []];
}

// True when the only 'support' in a sentence is a bare statement like "whom I have supported since April".
function onlySupportedSince(sentence) {
  if (!search(L.SUPPORTED_SINCE, sentence)) return false;
  const rest = sub(L.SUPPORTED_SINCE, ' ', sentence);
  return !search(L.DELIVERED, rest, '');
}

export function supportDelivered(doc) {
  let done = [...hits(doc, L.DELIVERED, '', 20), ...hits(doc, L.DELIVERED_PASSIVE, 'i', 20)].filter((t) => !onlySupportedSince(t));
  const notYet = hits(doc, L.NOT_YET);
  done = done.filter((t) => !notYet.includes(t));
  for (const u of doc.units) {
    const m = search(L.DELIVERED_HEADING, u.text);
    if (!m) continue;
    const rest = u.text.slice(m.index + m[0].length).replace(/^[ :-]+|[ :-]+$/g, '');
    if (rest.split(/\s+/).filter(Boolean).length >= 3) done.push(u.text);
    else if (u.index + 1 < doc.units.length) {
      const nxt = doc.units[u.index + 1].text;
      if (!(search(L.PLANNED, nxt) && search(L.PLAN_TOPIC, nxt))) done.push(`${u.text} ${nxt}`);
    }
  }
  if (done.length && !notYet.length) return [Status.PASS, '', done.slice(0, 2)];
  const planned = hits(doc, L.PLANNED, 'i', 20).filter((t) => search(L.PLAN_TOPIC, t));
  if (notYet.length || planned.length) {
    if (done.length) return [Status.UNCLEAR, 'Some support is described, but the letter also says support has not yet started.', [...notYet, ...done].slice(0, 2)];
    return [Status.MISSING, 'The support described is planned or conditional. The letter does not describe support actually provided.', [...notYet, ...planned].slice(0, 2)];
  }
  const involved = hits(doc, L.INVOLVEMENT);
  if (involved.length) return [Status.UNCLEAR, 'The letter says the client is involved with the service, but does not describe the support provided.', involved.slice(0, 1)];
  return [Status.MISSING, 'No description of the support provided.', []];
}

export function reasonsNeeded(doc) {
  let ev = hits(doc, L.REASONS);
  if (ev.length) return [Status.PASS, '', ev.slice(0, 1)];
  ev = hits(doc, L.NEED_NO_REASON);
  if (ev.length) return [Status.UNCLEAR, 'The need for support is mentioned, but not the reasons why it was needed.', ev.slice(0, 1)];
  return [Status.MISSING, 'No statement of why the person needed the support.', []];
}

export function letterOrOfficialEmail(doc) {
  if (!doc.isEmail) return [Status.PASS, "Sent as a letter. Check it is on the organisation's letterhead.", []];
  const addr = doc.fromAddress();
  if (!addr) return [Status.UNCLEAR, "This looks like an email, but the sender's address is missing.", []];
  if (search(L.FREE_WEBMAIL, addr)) return [Status.UNCLEAR, `Sent from a personal webmail address (${addr}). Emails must come from the organisation's official address.`, []];
  return [Status.PASS, `Sent from ${addr.split('@')[1]}.`, []];
}

// ------------------------------------------------------------------ dates against the application

export function eventBeforeApplication(eventRx, what) {
  return (doc, ctx) => {
    const idx = doc.units.filter((u) => search(eventRx, u.text)).map((u) => u.index);
    const sents = idx.map((i) => doc.units[i].text);
    let dates = idx.flatMap((i) => findDates(doc.window(i, 1, 2))).filter((d) => d.precision === 'day');
    if (!dates.length && idx.length && doc.letterDate) dates = [doc.letterDate];
    if (!ctx.application_date) return [Status.ADVISORY, `Enter the legal aid application date to check that ${what} came first.`, sents.slice(0, 1)];
    if (!dates.length) return [Status.UNCLEAR, `No date is given for ${what}.`, sents.slice(0, 1)];
    if (Math.min(...dates.map((d) => ord(d.value))) <= ord(ctx.application_date)) return [Status.PASS, '', sents.slice(0, 1)];
    return [Status.MISSING, `${what[0].toUpperCase()}${what.slice(1).toLowerCase()} is dated after the legal aid application.`, sents.slice(0, 1)];
  };
}

// ------------------------------------------------------------------ economic abuse (para 21)

export function economicConduct(doc) {
  const acts = doc.units.filter((u) => L.ECONOMIC.some((p) => search(p, u.text))).map((u) => u.text);
  if (acts.length >= 2) return [Status.PASS, `${acts.length} sentence(s) describe economic or financial conduct.`, acts.slice(0, 2)];
  if (acts.length) return [Status.UNCLEAR, 'One instance of economic conduct is described. A single incident may be enough, but a person should judge it.', acts];
  return [Status.MISSING, 'No economic or financial conduct is described.', []];
}

export function narrativeElements(doc) {
  const found = Object.entries(L.NARRATIVE_ELEMENTS).filter(([, r]) => search(r, doc.text)).map(([k]) => k);
  const missing = Object.keys(L.NARRATIVE_ELEMENTS).filter((k) => !found.includes(k));
  if (!missing.length) return [Status.PASS, '', []];
  return [Status.ADVISORY, `If this is the client's own narrative statement (guidance 2.93), it should cover: ${missing.join(', ')}.`, []];
}

// The author is providing, or has provided, support (not only planning to).
export function supportConfirmed(doc) {
  const refused = hits(doc, L.NOT_YET);
  const found = [...hits(doc, L.SUPPORTING, 'i', 20), ...hits(doc, L.DELIVERED, '', 20)]
    .filter((t) => !refused.includes(t) && !search('\\b(?:will|would|shall|going to|plan to|intend to|once)\\b', t));
  if (refused.length && !found.length) return [Status.MISSING, 'The letter says no support has been provided yet.', refused.slice(0, 1)];
  if (found.length) return [Status.PASS, '', found.slice(0, 1)];
  const planned = hits(doc, L.SUPPORTING).length ? hits(doc, L.SUPPORTING) : hits(doc, L.PLANNED);
  if (planned.length) return [Status.UNCLEAR, 'Support is described as planned or future, not as provided.', planned.slice(0, 1)];
  return [Status.MISSING, 'The letter does not confirm the author is providing, or has provided, support.', []];
}

// PASS if an assessment outcome is stated, unless the letter says the assessment has not concluded.
export function assessmentConcluded(pattern, what) {
  return (doc) => {
    const pending = hits(doc, L.ASSESSMENT_PENDING);
    if (pending.length) return [Status.MISSING, 'The letter says the assessment has not reached a conclusion.', pending.slice(0, 1)];
    const ev = hits(doc, pattern);
    if (ev.length) return [Status.PASS, '', ev.slice(0, 1)];
    if (hits(doc, '\\bassess\\w*\\b').length) return [Status.UNCLEAR, `An assessment is mentioned, but not its conclusion about ${what}.`, hits(doc, '\\bassess\\w*\\b').slice(0, 1)];
    return [Status.MISSING, `No assessment of ${what} is confirmed.`, []];
  };
}

export { rx };
