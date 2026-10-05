import test from 'node:test';
import assert from 'node:assert/strict';
import { POST, DEFAULT_MODEL, REQUIREMENTS } from '../api/check-letter.js';
import { LETTER_TYPES } from '../src/app/rules.js';

const post = (body, headers = {}) => POST(new Request('https://example.org/api/check-letter', { method: 'POST', headers, body: JSON.stringify(body) }));
const answer = { type: 'p11', meets: 'yes', confidence: 92, requirements: [{ requirement: 'Examined', status: 'met', evidence: 'I have examined', note: 'Examined in person.' }], summary: 'Meets the requirements.' };

function withGateway(t, reply = { choices: [{ message: { content: JSON.stringify(answer) } }] }, status = 200) {
  process.env.AI_GATEWAY_API_KEY = 'test-key';
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => { calls.push({ url, body: JSON.parse(init.body), auth: init.headers.authorization }); return new Response(JSON.stringify(reply), { status }); });
  t.after(() => { delete process.env.AI_GATEWAY_API_KEY; delete process.env.LETTER_MODEL; });
  return calls;
}

test('check-letter: refused when no gateway credential is set up', async () => {
  const saved = process.env.VERCEL_OIDC_TOKEN;
  delete process.env.VERCEL_OIDC_TOKEN;
  assert.equal((await post({ text: 'A letter' })).status, 503);
  if (saved) process.env.VERCEL_OIDC_TOKEN = saved;
});

test('check-letter: asks the model for structured requirements and returns them', async (t) => {
  const calls = withGateway(t);
  const res = await post({ text: '  I examined Jane Doe.  ', type: 'p11' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { model: DEFAULT_MODEL, ...answer });
  assert.equal(calls[0].url, 'https://ai-gateway.vercel.sh/v1/chat/completions');
  assert.equal(calls[0].auth, 'Bearer test-key');
  assert.equal(calls[0].body.model, 'openai/gpt-6-sol');
  assert.equal(calls[0].body.response_format.json_schema.strict, true);
  assert.match(calls[0].body.messages[1].content, /^Type of evidence: p11\n\nLetter:\n"""\nI examined Jane Doe\.\n"""$/);
});

test('check-letter: LETTER_MODEL switches model; unknown types are ignored; long letters are cut', async (t) => {
  const calls = withGateway(t);
  process.env.LETTER_MODEL = 'openai/gpt-6.1-sol';
  await post({ text: 'x'.repeat(20000), type: 'nonsense' });
  assert.equal(calls[0].body.model, 'openai/gpt-6.1-sol');
  assert.doesNotMatch(calls[0].body.messages[1].content, /Type of evidence/);
  assert.ok(calls[0].body.messages[1].content.length < 12100);
});

test('check-letter: empty letters, gateway errors and unreadable replies are handled', async (t) => {
  withGateway(t, { error: 'no' }, 403);
  assert.equal((await post({ text: '' })).status, 400);
  assert.deepEqual(await (await post({ text: 'A letter' })).json(), { error: 'upstream', status: 403 });
});

test('check-letter: requirements cover every letter type the checker knows', () => {
  assert.deepEqual(Object.keys(REQUIREMENTS).sort(), Object.keys(LETTER_TYPES).sort());
});
