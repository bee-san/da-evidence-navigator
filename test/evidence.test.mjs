import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFlow, readPath, stepHtml } from '../src/app/flow.js';
import flow from '../src/app/flows/find-evidence.js';
import solicitorFlow from '../src/app/flows/find-solicitor.js';
import { EVIDENCE, POLICE_EVENTS, COURT_EVENTS, needsOtherParty } from '../src/app/evidence.js';
import { buildRequest, personalise, mailtoUrl } from '../src/app/contact.js';

const results = Object.entries(flow.steps).filter(([, s]) => s.body);

test('find-evidence flow: every step exists and can be reached', () => {
  assert.deepEqual(validateFlow(flow), []);
});

test('questions ask about a solicitor, then follow the order of Schedule 1', () => {
  const order = ['solicitor', 'police', 'court', 'health', 'services', 'immigration', 'money', 'none'];
  assert.deepEqual(readPath(flow, `#${order.join('/')}`), order, 'answering "no" to each section reaches the next');
});

test('every Schedule 1 paragraph from 1 to 21 has a result page', () => {
  const html = results.map(([, s]) => s.body).join('\n');
  const paras = new Set();
  for (const m of html.matchAll(/paragraphs? (\d+A?)(?: (?:to|and) (\d+A?))?/g)) { paras.add(m[1]); if (m[2]) paras.add(m[2]); }
  for (const e of [...Object.values(POLICE_EVENTS), ...Object.values(COURT_EVENTS)]) for (const m of e.para.matchAll(/\d+A?/g)) paras.add(m[0]);
  const missing = [...Array(21).keys()].map((i) => String(i + 1)).concat('6A').filter((p) => !paras.has(p));
  assert.deepEqual(missing, []);
});

test('"look for more evidence" links are valid paths into the next section', () => {
  for (const [id, s] of results) {
    for (const [, hash] of s.body.matchAll(/href="#([^"]+)"/g)) {
      assert.equal(readPath(flow, `#${hash}`).join('/'), hash, `${id} links to ${hash}`);
    }
  }
});

test('every evidence page can write a request, except ones you already hold', () => {
  for (const [id, s] of results) {
    if (id === 'none' || id === 'toSolicitor') continue;
    const key = (s.body.match(/data-contact="(\w+)"/) || [])[1];
    if (id === 'evP20') { assert.equal(key, undefined); continue; }
    assert.ok(EVIDENCE[key], `${id} has a contact form`);
  }
});

test('no question asks what happened', () => {
  for (const s of Object.values(flow.steps)) {
    assert.doesNotMatch(`${s.title} ${s.hint || ''}`, /describe|tell us what|what did they do to you/i);
  }
});

test('someone with no evidence is pointed to support services and a solicitor', () => {
  const html = stepHtml(flow, readPath(flow, '#solicitor/police/court/health/services/immigration/money/none'));
  assert.match(html, /0808 2000 247/);
  assert.match(html, /find-solicitor\.html/);
});

test('personalise fills only what the applicant knows', () => {
  const t = personalise(EVIDENCE.p18.template, { applicant: 'Jane Doe', other: 'John Doe' });
  assert.match(t, /^Name of perpetrator: John Doe$/m);
  assert.match(t, /Jane Doe, with whom John Doe/);
  assert.match(t, /\[date\]/, 'the professional still fills in the date');
  assert.doesNotMatch(t, /\[your name\]|\[perpetrator\]/);
});

test('letter request: musts, personalised wording, checker links and reply address', () => {
  const e = buildRequest('p11', { applicant: 'Jane Doe', profName: 'Dr Patel', profEmail: 'gp@example.nhs.uk', replyTo: 'me' }, { baseUrl: 'https://example.org/' });
  assert.equal(e.to, 'gp@example.nhs.uk');
  assert.equal(e.cc, '');
  assert.match(e.body, /^Dear Dr Patel,/);
  assert.match(e.body, /Schedule 1, paragraph 11/);
  assert.match(e.body, /consistent with domestic abuse/);
  assert.match(e.body, /https:\/\/example\.org\/write-letter\.html\?type=p11/);
  assert.match(e.body, /https:\/\/example\.org\/letter-checker\.html\?type=p11/);
  assert.match(e.body, /replying to this email/);
  assert.match(e.body, /Thank you,\nJane Doe$/);
});

test('records request: names the event, the paragraph and copies in the solicitor', () => {
  const e = buildRequest('police', { applicant: 'Jane Doe', other: 'John Doe', event: 'convicted', reference: 'AB/123', replyTo: 'solicitor', solicitorEmail: 'sol@example.com', solicitorName: 'Ms Khan' });
  assert.match(e.body, /paragraph 4 /);
  assert.match(e.body, /John Doe was convicted/);
  assert.match(e.body, /AB\/123/);
  assert.match(e.body, /my solicitor, Ms Khan, at sol@example\.com/);
  assert.equal(e.cc, 'sol@example.com');
});

test('solicitor is not copied in without an email address', () => {
  const e = buildRequest('p14', { applicant: 'Jane Doe', replyTo: 'solicitor', solicitorEmail: '' });
  assert.equal(e.cc, '');
  assert.match(e.body, /replying to this email/);
});

test('the other party is asked for only when the evidence must name them', () => {
  assert.equal(needsOtherParty('p11'), false);
  assert.equal(needsOtherParty('p17'), false);
  for (const k of ['police', 'court', 'p15', 'p18', 'p19', 'marac', 'refugeStay', 'social']) assert.equal(needsOtherParty(k), true, k);
});

test('email links are encoded', () => {
  const email = { to: 'a@b.com', cc: 'c@d.com', subject: 'A & B', body: 'Line 1\nLine 2 & ?' };
  assert.equal(mailtoUrl(email), 'mailto:a%40b.com?cc=c%40d.com&subject=A%20%26%20B&body=Line%201%0ALine%202%20%26%20%3F');
});

test('no solicitor: offered the GOV.UK solicitor search, then the evidence questions', () => {
  assert.deepEqual(readPath(flow, '#solicitor/findSolicitor/toSolicitor').at(-1), 'toSolicitor');
  assert.match(flow.steps.toSolicitor.body, /action="https:\/\/find-legal-advice\.justice\.gov\.uk\/search"/, 'searches GOV.UK directly');
  assert.match(flow.steps.toSolicitor.body, /name="categories" value="mat"/, 'with Family chosen');
  assert.equal(readPath(flow, '#solicitor/findSolicitor/police').at(-1), 'police', 'and can carry on to the evidence questions');
  assert.deepEqual(readPath(solicitorFlow, '#have/risk'), ['have', 'risk'], 'that link is a valid path');
});

test('every find-a-solicitor result leads into find evidence, past the solicitor question', () => {
  for (const [id, s] of Object.entries(solicitorFlow.steps).filter(([, x]) => x.body)) {
    const m = s.body.match(/href="check\.html\?solicitor=(yes|no)#([^"]+)"/);
    assert.ok(m, id);
    assert.deepEqual(readPath(flow, `#${m[2]}`).join('/'), m[2], `${id} links to a valid path`);
  }
});
