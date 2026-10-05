import test from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST, toResult } from '../api/check-ai.js';

const post = (body, ip = '10.1.0.1') => POST(new Request('https://x/api/check-ai', { method: 'POST', headers: { 'x-forwarded-for': ip }, body: JSON.stringify(body) }));
const LETTER = 'I can confirm that I have examined Jane Doe and in my reasonable professional judgement, the condition that the applicant has might be consistent with domestic abuse.';

test('not available without OPENAI_API_KEY', async () => {
  delete process.env.OPENAI_API_KEY;
  assert.equal((await GET().json()).enabled, false);
  assert.equal((await post({ text: LETTER })).status, 503);
});

test('sends the letter, the guidance and the checklist to GPT-6 Sol, and returns a checker result', async (t) => {
  process.env.OPENAI_API_KEY = 'test-key';
  t.after(() => { delete process.env.OPENAI_API_KEY; });
  const calls = [];
  const answer = {
    category: 'sch1-para11',
    client: 'Jane Doe',
    criteria: [
      { id: 'GP2', status: 'pass', note: 'Jane Doe is named.', evidence: [LETTER], ask_for: '' },
      { id: 'GP4', status: 'missing', note: 'The judgement is hedged ("might").', evidence: [LETTER], ask_for: 'Ask for a firm judgement.' },
    ],
  };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }));
  });
  assert.equal((await post({ text: '' }, '10.1.0.2')).status, 400);
  assert.equal((await post({ text: 'x'.repeat(20001) }, '10.1.0.3')).status, 400);
  assert.equal((await post({ text: LETTER, category: 'nonsense' }, '10.1.0.4')).status, 400);

  const r = await (await post({ text: LETTER }, '10.1.0.5')).json();
  const req = calls[0].body;
  assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(req.model, 'gpt-6-sol');
  assert.equal(req.response_format.type, 'json_schema');
  assert.match(req.messages[0].content, /Evidence Requirements for Private/);
  assert.match(req.messages[0].content, /sch1-para11 – Schedule 1, paragraph 11/);
  assert.match(req.messages[1].content, /might be consistent with domestic abuse/);

  assert.equal(r.category, 'sch1-para11');
  assert.equal(r.label, 'Incomplete', 'same outcome rule as the checker');
  assert.equal(r.criteria.length, 7, 'every requirement for the type, in order');
  assert.equal(r.criteria.find((c) => c.id === 'GP4').ask_for, 'Ask for a firm judgement.');
  assert.equal(r.criteria.find((c) => c.id === 'GP1').status, 'unclear', 'a requirement the AI skipped needs checking');
  assert.equal(r.detected.client, 'Jane Doe');
  assert.match(r.warnings[0], /Checked by an AI model \(gpt-6-sol\)/);
});

test('a type chosen by the person is used', () => {
  const r = toResult({ category: 'sch1-para11', client: '', criteria: [] }, 'gpt-6-sol');
  assert.equal(r.category, 'sch1-para11');
  assert.ok(r.criteria.every((c) => c.status === 'unclear'));
});
