// Text handling: normalisation, sentence units, dates, names and email headers.
// A port of laa-evidence-checker (Python) text.py. All functions are deterministic.

// Python's re.search / re.match / re.fullmatch, with Python-style flags ('i' or '').
const cache = new Map();
export function rx(source, flags = 'i', mode = 'search') {
  const key = `${mode}\u0000${flags}\u0000${source}`;
  let r = cache.get(key);
  if (!r) {
    const src = mode === 'match' ? `^(?:${source})` : mode === 'full' ? `^(?:${source})$` : source;
    r = new RegExp(src, flags.replace('g', ''));
    cache.set(key, r);
  }
  return r;
}
export const search = (source, text, flags = 'i') => rx(source, flags).exec(text);
export const match = (source, text, flags = 'i') => rx(source, flags, 'match').exec(text);
export const fullmatch = (source, text, flags = 'i') => rx(source, flags, 'full').exec(text);
export function* finditer(source, text, flags = 'i') {
  const r = new RegExp(source, `${flags.replace('g', '')}g`);
  let m;
  while ((m = r.exec(text))) {
    yield m;
    if (m[0] === '') r.lastIndex += 1;
  }
}
export const sub = (source, repl, text, flags = 'i') => text.replace(new RegExp(source, `${flags.replace('g', '')}g`), repl);
export const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

// Python str.isupper(): at least one cased character, and no lower-case ones.
export const isUpper = (s) => /[A-Za-z]/.test(s) && s === s.toUpperCase() && s !== s.toLowerCase();
// Python str.title(): upper-case the first letter after any non-letter, lower-case the rest.
export const title = (s) => s.toLowerCase().replace(/(^|[^a-z])([a-z])/g, (m, a, b) => a + b.toUpperCase());

const TRANSLATE = {
  '‘': "'", '’': "'", '‚': "'", '‛': "'",
  '“': '"', '”': '"', '„': '"',
  '–': '-', '—': ' - ', '−': '-',
  ' ': ' ', ' ': ' ', ' ': ' ',
  '•': '-', '●': '-', '▪': '-', '‣': '-',
  '­': '',
};

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
export const MONTHS = Object.fromEntries([
  ...MONTH_NAMES.map((m, i) => [m, i + 1]),
  ...MONTH_NAMES.map((m, i) => [m.slice(0, 3), i + 1]),
  ['sept', 9],
]);
export const MONTH_RE = '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\\.?';

const STANDALONE_START = '^(dear|yours|kind regards|best wishes|with best wishes|regards|many thanks|re:|subject:|from:|to:|cc:|date:|sent:)';
const BULLET = '^\\s*(?:[-*o]|\\d+[.)])\\s+';
const ABBREV = '\\b(Dr|Mr|Mrs|Ms|Mx|Prof|St|No|Nos|para|paras|e\\.g|i\\.e|etc|cf|vs|approx|Ref|Tel|Inc|Ltd|Co|Jr|Sr|Rd)\\.';
const INITIAL = '\\b([A-Z])\\.(?=\\s+[A-Z])';

export function normalise(text) {
  let t = [...text].map((c) => (c in TRANSLATE ? TRANSLATE[c] : c)).join('').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  t = t.replace(/[ \t]+/g, ' ');
  t = t.split('\n').map((line) => line.trim()).join('\n');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

// Python str.islower() on the first character.
const startsLower = (s) => !!s && s[0] !== s[0].toUpperCase() && s[0] === s[0].toLowerCase();

function continues(nxt) {
  return !!nxt && startsLower(nxt) && !match('(?:www\\.|https?://|\\S+@\\S+)', nxt, '');
}

function isStandalone(line, nxt) {
  if (search(STANDALONE_START, line) || search(BULLET, line, '')) return true;
  if (line.length < 75 && !/[.,;:!?]$/.test(line)) return !continues(nxt);
  return false;
}

export function splitSentences(text) {
  let p = text.replace(new RegExp(ABBREV, 'gi'), (m) => m.replace(/\./g, '\u0000'));
  p = p.replace(new RegExp(INITIAL, 'g'), (m, a) => `${a}\u0000`);
  return p.split(/(?<=[.!?])\s+(?=["'(\[]?[A-Z0-9-])/).map((s) => s.replace(/\u0000/g, '.').trim()).filter(Boolean);
}

function unitsFromBlocks(text) {
  const units = [];
  const blocks = text.split('\n\n').filter((b) => b.trim());
  blocks.forEach((block, bi) => {
    const lines = block.split('\n').filter((l) => l.trim());
    const pieces = [];
    let buf = '';
    lines.forEach((line, i) => {
      const nxt = i + 1 < lines.length ? lines[i + 1] : null;
      const startsNew = !!(search(BULLET, line, '') || search(STANDALONE_START, line));
      if (startsNew && buf) { pieces.push(buf); buf = ''; }
      buf = buf ? `${buf} ${line}`.trim() : line;
      if (isStandalone(line, nxt) && !continues(nxt)) { pieces.push(buf); buf = ''; }
    });
    if (buf) pieces.push(buf);
    for (const piece of pieces) for (const s of splitSentences(piece)) units.push({ text: s, index: units.length, block: bi });
  });
  return units;
}

// ---------------------------------------------------------------- dates
// A date is { y, m, d }. Compare with ord().

const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const ord = (d) => d.y * 10000 + d.m * 100 + d.d;
export const iso = (d) => `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;

function mk(y, m, d, latest) {
  if (!(m >= 1 && m <= 12) || y < 1) throw new Error('bad date');
  if (d == null) d = latest ? daysIn(y, m) : 1;
  if (d < 1) throw new Error('bad date');
  return { y, m, d: Math.min(d, daysIn(y, m)) };
}

// Finds dates. Month-only and year-only dates resolve to the latest (or earliest) day they could mean.
export function findDates(text, latest = false) {
  const found = [];
  const taken = [];
  const free = (a, b) => taken.every(([x, y]) => b <= x || a >= y);
  const pats = [
    [`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE}),?\\s+(\\d{4})\\b`, 'dmy'],
    [`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'mdy'],
    ['\\b(\\d{1,2})/(\\d{1,2})/(\\d{4})\\b', 'num'],
    ['\\b(\\d{4})-(\\d{2})-(\\d{2})\\b', 'iso'],
    [`\\b(${MONTH_RE}),?\\s+(\\d{4})\\b`, 'my'],
    ['\\b(19[5-9]\\d|20[0-4]\\d)\\b', 'y'],
  ];
  const month = (s) => {
    const n = MONTHS[s.toLowerCase().replace(/\.+$/, '')];
    if (!n) throw new Error('bad month');
    return n;
  };
  for (const [pat, kind] of pats) {
    for (const m of finditer(pat, text, 'i')) {
      const start = m.index;
      const end = start + m[0].length;
      if (!free(start, end)) continue;
      const g = m.slice(1);
      let v;
      let p;
      try {
        if (kind === 'dmy') { v = mk(+g[2], month(g[1]), +g[0], latest); p = 'day'; }
        else if (kind === 'mdy') { v = mk(+g[2], month(g[0]), +g[1], latest); p = 'day'; }
        else if (kind === 'num') { v = mk(+g[2], +g[1], +g[0], latest); p = 'day'; }
        else if (kind === 'iso') { v = mk(+g[0], +g[1], +g[2], latest); p = 'day'; }
        else if (kind === 'my') { v = mk(+g[1], month(g[0]), null, latest); p = 'month'; }
        else { const y = +g[0]; v = latest ? { y, m: 12, d: 31 } : { y, m: 1, d: 1 }; p = 'year'; }
      } catch {
        continue;
      }
      taken.push([start, end]);
      found.push([start, { value: v, precision: p, text: m[0] }]);
    }
  }
  return found.sort((a, b) => a[0] - b[0]).map(([, f]) => f);
}

export function addMonths(d, n) {
  const total = d.m - 1 + n;
  const y = d.y + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12 + 1;
  return { y, m, d: Math.min(d.d, daysIn(y, m)) };
}

const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, eighteen: 18, twenty: 20, 'twenty-four': 24, thirty: 30,
  several: 3, a: 1, an: 1,
};

export function parseNumber(tok) {
  const t = tok.toLowerCase();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  return WORD_NUMBERS[t] ?? null;
}

// ---------------------------------------------------------------- the document

const EMAIL_HDR = '^(from|to|cc|date|sent|subject):\\s*(.*)$';
const EMAIL_ADDR = "[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+";

export class Doc {
  constructor(raw) {
    this.raw = raw;
    this.text = normalise(raw);
    this.units = unitsFromBlocks(this.text);
    this.headers = {};
    for (const line of this.text.split('\n').slice(0, 12)) {
      const m = match(EMAIL_HDR, line);
      if (m) this.headers[m[1].toLowerCase()] = m[2].trim();
    }
    this.isEmail = !!search(EMAIL_ADDR, this.headers.from || '', '');
    this.letterDate = this.findLetterDate();
  }

  get sentences() { return this.units.map((u) => u.text); }

  window(i, before = 1, after = 2) {
    const lo = Math.max(0, i - before);
    const hi = Math.min(this.units.length, i + after + 1);
    return this.units.slice(lo, hi).map((u) => u.text).join(' ');
  }

  has(pattern, flags = 'i') { return !!search(pattern, this.text, flags); }

  findLetterDate() {
    if ('date' in this.headers || 'sent' in this.headers) {
      const ds = findDates(this.headers.date || this.headers.sent || '');
      if (ds.length) return ds[0];
    }
    for (const u of this.units.slice(0, 8)) {
      const ds = findDates(u.text).filter((x) => x.precision === 'day');
      if (ds.length && u.text.length < 60) return ds[0];
    }
    return null;
  }

  fromAddress() {
    const m = search(EMAIL_ADDR, this.headers.from || '', '');
    return m ? m[0].toLowerCase() : null;
  }
}

// ---------------------------------------------------------------- names

export const TITLE = '(?:Mr|Mrs|Ms|Miss|Mx|Dr)\\.?';
export const NAME_WORD = "[A-Z][a-zA-Z'-]+";
export const FULL_NAME = `${NAME_WORD}(?:\\s+${NAME_WORD}){1,3}`;

export function cleanName(name) {
  let n = normalise(name);
  n = n.replace(rx(`^${TITLE}\\s+`, ''), '');
  return n.replace(/\s+/g, ' ').trim().replace(/^[ ,.]+|[ ,.]+$/g, '');
}

// Finds the person the letter is about, from Re/Subject lines and common phrasings.
export function detectClientName(doc) {
  const pats = [
    `^Re:\\s*(?:${TITLE}\\s+)?(${FULL_NAME})\\s*(?:,|$|\\(|-|\\bdate\\b)`,
    `^Subject:.*?(?:\\bto\\b|\\bfor\\b|\\bregarding\\b|\\babout\\b|\\bre\\b|-|:)\\s*(?:${TITLE}\\s+)?(${FULL_NAME})\\s*(?:$|\\(|,)`,
    `^Subject:\\s*(?:${TITLE}\\s+)?(${FULL_NAME})\\s*(?:-|:|,|\\()`,
    `\\b(?:letter )?in support of:?\\s+(?:${TITLE}\\s+)?(${FULL_NAME})`,
    `\\bat the request of (?:${TITLE}\\s+)?(${FULL_NAME})`,
    `\\b(?:write|writing) (?:to you )?(?:about|regarding|concerning|on behalf of) (?:${TITLE}\\s+)?(${FULL_NAME})`,
    `^(?:${TITLE}\\s+)?(${FULL_NAME}) has asked (?:me|us) to (?:write|reply|provide|confirm)`,
    `\\bwith (?:${TITLE}\\s+)?(${FULL_NAME})'s (?:written )?(?:consent|permission|agreement)`,
    `\\bpatient:\\s*(?:${TITLE}\\s+)?(${FULL_NAME})`,
    `\\bname:\\s*(?:${TITLE}\\s+)?(${FULL_NAME})`,
  ];
  const bad = '\\b(Support|Service|Team|Practice|Surgery|Council|Court|Agency|Trust|Centre|Partnership|Legal|Law|Co)\\b';
  for (const pat of pats) {
    for (const u of doc.units.slice(0, 40)) {
      const m = search(pat, u.text, 'm');
      if (m) {
        const cand = cleanName(m[1]);
        if (cand.split(' ').length >= 2 && !search(bad, cand, '')) return cand;
      }
    }
  }
  // a heading line in capitals, such as "LETTER OF SUPPORT: MR GARETH LLEWELLYN"
  for (const u of doc.units.slice(0, 12)) {
    const m = fullmatch("(?:[A-Z ]{3,40}:\\s*)?(?:MR|MRS|MS|MISS|MX|DR)\\.?\\s+([A-Z'-]{2,}(?:\\s+[A-Z'-]{2,}){1,3})", u.text.trim(), '');
    if (m) return title(m[1]);
  }
  // otherwise the first titled full name in the body, skipping the salutation and email headers
  for (const u of doc.units.slice(0, 40)) {
    if (match('^(?:dear|to|from|cc)\\b', u.text)) continue;
    const m = search(`\\b${TITLE}\\s+(${FULL_NAME})`, u.text, '');
    if (m && !search(bad, m[1], '')) return cleanName(m[1]);
  }
  return null;
}

// Returns ['full' | 'surname' | 'first' | 'none', matched sentence]. `exclude` holds other people's
// full names, which are masked before the looser surname and first-name searches.
export function nameFound(doc, name, exclude = []) {
  if (!name) return ['none', ''];
  const n = cleanName(name);
  const parts = n.split(' ').filter(Boolean);
  if (!parts.length) return ['none', ''];
  const masks = exclude.filter((x) => x && cleanName(x).toLowerCase() !== n.toLowerCase())
    .map((x) => new RegExp(`\\b${cleanName(x).split(' ').map(escape).join('\\s+')}\\b`, 'gi'));
  const find = (pat, masked = true) => {
    for (const u of doc.units) {
      let t = u.text;
      if (masked) for (const mk of masks) t = t.replace(mk, ' ');
      if (search(pat, t, 'i')) return u.text;
    }
    return '';
  };
  let hit = find(`\\b${parts.map(escape).join('\\s+')}\\b`, false);
  if (hit) return ['full', hit];
  if (parts.length >= 2) {
    hit = find(`\\b${TITLE}\\s+${escape(parts.at(-1))}\\b`) || find(`\\b${escape(parts.at(-1))}\\b`);
    if (hit) return ['surname', hit];
    hit = find(`\\b${escape(parts[0])}\\b`);
    if (hit) return ['first', hit];
  }
  return ['none', ''];
}

export const surnameOf = (name) => cleanName(name).split(' ').at(-1);
