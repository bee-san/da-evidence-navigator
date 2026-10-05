import test from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST } from '../api/ocr-openai.js';

const IMAGE = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const post = (body) => POST(new Request('https://x/api/ocr-openai', { method: 'POST', body: JSON.stringify(body) }));

test('not available without OPENAI_API_KEY', async () => {
  assert.equal((await GET().json()).enabled, false);
  assert.equal((await post({ image: IMAGE })).status, 503);
});

test('sends one image to GPT-6 Sol and returns its text', async (t) => {
  process.env.OPENAI_API_KEY = 'test-key';
  t.after(() => { delete process.env.OPENAI_API_KEY; });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), auth: init.headers.authorization });
    return new Response(JSON.stringify({ choices: [{ message: { content: ' I understand that Jane Doe… ' } }] }));
  });
  assert.equal((await post({ image: 'not an image' })).status, 400);
  const r = await post({ image: IMAGE });
  assert.deepEqual(await r.json(), { text: 'I understand that Jane Doe…', model: 'gpt-6-sol' });
  assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(calls[0].auth, 'Bearer test-key');
  assert.equal(calls[0].body.model, 'gpt-6-sol');
  assert.equal(calls[0].body.messages[0].content[1].image_url.url, IMAGE);
});
