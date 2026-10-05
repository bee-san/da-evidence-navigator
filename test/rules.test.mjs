import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLetter, detectType, changeRequest, findDates } from '../src/app/rules.js';
import { SAMPLES } from '../src/app/samples.js';
import { evaluate } from '../src/app/evaluate.js';
import { reply, localReply, textToHtml } from '../src/app/chat.js';
import { POST } from '../api/chat.js';
import { BUILDER, buildLetter, exampleAnswers } from '../src/app/builder.js';
import { ROUTES } from '../src/app/routes.js';

const { rows, summary } = evaluate();
for (const r of rows) {
  test(`${r.source}: ${r.label} (${r.id})`, () => {
    assert.equal(r.detected, r.type, 'detects the letter type');
    assert.equal(r.predicted, r.expected, `outcome; failed checks: ${r.failed.join(', ') || 'none'}`);
    if (r.failId) assert.ok(r.failed.includes(r.failId), `fails for the right reason (${r.failId}); failed: ${r.failed.join(', ')}`);
  });
}

test('every letter is classified correctly', () => {
  assert.equal(summary.all.correct, summary.all.total);
});

test('rejected letters produce a change request', () => {
  const bad = SAMPLES.find((s) => s.id === 'p11-bad-5');
  assert.match(changeRequest(checkLetter(bad.text)), /consistent with domestic abuse/);
});

test('unknown text is not classified', () => {
  assert.equal(checkLetter('hello there').outcome, 'unknown');
  assert.equal(detectType('hello there'), null);
});

test('dates: finds written and numeric dates', () => {
  assert.deepEqual(findDates('On 3rd March 2019, 1 Sept 2020 and 12/04/2021').map((d) => d.toISOString().slice(0, 10)),
    ['2019-03-03', '2020-09-01', '2021-04-12']);
});

test('dates: warns about letters older than 5 years or in the future', () => {
  const p18 = SAMPLES.find((s) => s.id === 'p18-ok-8').text;
  const at = (iso) => checkLetter(p18, undefined, { today: new Date(iso) }).checks.find((c) => c.id === 'dates').status;
  assert.equal(at('2026-10-05'), 'pass');
  assert.equal(at('2032-01-01'), 'warn');
  assert.equal(at('2026-01-01'), 'warn');
});

test('chatbot points to emergency help on danger', () => {
  assert.match(reply('I am in danger right now').html, /999/);
});

test('chatbot checks a pasted letter', () => {
  const bad = SAMPLES.find((s) => s.id.startsWith('p11-bad'));
  assert.match(reply(bad.text).html, /might/);
});

test('chatbot answers a GP question', () => {
  assert.match(reply('can my GP write a letter?').html, /health professional/i);
});


for (const type of Object.keys(BUILDER)) {
  test(`letter builder writes a ${type} letter the checker accepts`, () => {
    const { text, missing } = buildLetter(type, exampleAnswers(type), new Date('2026-10-05'));
    assert.deepEqual(missing, []);
    assert.equal(detectType(text), type);
    const r = checkLetter(text, undefined, { today: new Date('2026-10-05') });
    assert.deepEqual(r.checks.filter((c) => c.status !== 'pass').map((c) => c.id), []);
  });
}

test('every letter type has a request note and a builder', () => {
  assert.deepEqual(Object.keys(ROUTES).sort(), Object.keys(BUILDER).sort());
});

test('danger and pasted letters stay on the device; other questions go to the AI', () => {
  assert.match(localReply('I am in danger right now').html, /999/);
  assert.ok(localReply(SAMPLES[0].text));
  assert.equal(localReply('can my GP write a letter?'), null);
});

test('AI answers are escaped', () => {
  assert.equal(textToHtml('<b>a</b>\n\nb'), '<p class="govuk-body">&lt;b&gt;a&lt;/b&gt;</p>\n<p class="govuk-body">b</p>');
});

test('api/chat forwards a trimmed conversation to the AI Gateway', async (t) => {
  delete process.env.OPENAI_API_KEY;
  process.env.AI_GATEWAY_API_KEY = 'test-key';
  let sent;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    sent = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ choices: [{ message: { content: ' Ask your GP. ' } }] }));
  });
  const messages = Array.from({ length: 21 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(5000) }));
  const res = await POST(new Request('http://x/api/chat', { method: 'POST', body: JSON.stringify({ messages }) }));
  assert.deepEqual(await res.json(), { text: 'Ask your GP.' });
  assert.equal(sent.url, 'https://ai-gateway.vercel.sh/v1/chat/completions');
  assert.equal(sent.init.headers.authorization, 'Bearer test-key');
  assert.equal(sent.body.messages[0].role, 'system');
  assert.equal(sent.body.messages.length, 13);
  assert.ok(sent.body.messages.slice(1).every((m) => m.content.length === 4000));
  assert.equal((await POST(new Request('http://x', { method: 'POST', body: '{}' }))).status, 400);
});

test('api/chat uses the OpenAI API when OPENAI_API_KEY is set', async (t) => {
  process.env.OPENAI_API_KEY = 'sk-test';
  t.after(() => { delete process.env.OPENAI_API_KEY; });
  let sent;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    sent = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
  });
  await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) }));
  assert.equal(sent.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(sent.init.headers.authorization, 'Bearer sk-test');
  assert.equal(sent.body.model, 'gpt-5-mini');
});

test('the rules page describes every check', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../src/pages/rules.html', import.meta.url), 'utf8');
  const documented = new Set([...page.matchAll(/data-check="([\w]+):([\w]+)"/g)].map((m) => `${m[1]}:${m[2]}`));
  const isva = 'Name of perpetrator: John Doe\nI am an ISVA. I can confirm that I am providing Jane Doe with support relating to sexual violence by John Doe.\nJohn Smith\nISVA';
  const gp = 'I can confirm that I examined Jane Doe. The injuries are consistent with domestic abuse.\nYours sincerely,\nDr John Smith\nGeneral Practitioner';
  const unnamed = 'I can confirm that I am providing the client with support.\nYours sincerely,\nJohn Smith\nIDVA';
  const letters = [...Object.keys(BUILDER).map((t) => buildLetter(t, exampleAnswers(t), new Date('2026-10-05')).text), isva, gp, unnamed];
  const found = new Set();
  for (const text of letters) {
    const r = checkLetter(text, undefined, { today: new Date('2026-10-05') });
    // Regulation 33 and the date warning apply to every type; refuge stays also have their own dates check.
    for (const c of r.checks) found.add(c.id === 'reg33' || (c.id === 'dates' && r.type !== 'refugeStay') ? `all:${c.id}` : `${r.type}:${c.id}`);
  }
  for (const id of found) assert.ok(documented.has(id), `rules.html is missing ${id}`);
  for (const id of documented) assert.ok(found.has(id) || id === 'all:dates', `rules.html describes ${id}, which no check produces`);
});

test('confidence: certain, probable and possible findings lower the rating by different amounts', () => {
  const at = (id) => checkLetter(SAMPLES.find((s) => s.id === id).text, undefined, { today: new Date('2026-10-05') }).confidence;
  assert.deepEqual(at('p11-ok-4'), { score: 100, level: 'high' });
  assert.deepEqual(at('p11-bad-5'), { score: 5, level: 'low' }); // hedged: certain
  assert.deepEqual(at('p18-bad-9'), { score: 6, level: 'low' }); // two missing: probably × 2
  assert.deepEqual(at('p17-bad-3'), { score: 60, level: 'medium' }); // too general: possibly
});
