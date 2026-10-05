import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLetter, detectType, changeRequest } from '../src/app/rules.js';
import { SAMPLES } from '../src/app/samples.js';
import { reply, localReply, textToHtml } from '../src/app/chat.js';
import { POST } from '../api/chat.js';

for (const s of SAMPLES) {
  test(`${s.label} (${s.id})`, () => {
    assert.equal(detectType(s.text), s.type, 'detects the letter type');
    const r = checkLetter(s.text);
    const failed = r.checks.filter((c) => c.status === 'fail').map((c) => c.id);
    if (s.expected === 'accepted') {
      assert.deepEqual(failed, [], 'accepted example has no failing checks');
    } else {
      assert.ok(failed.length > 0, 'rejected example has a failing check');
      assert.match(changeRequest(r), /changes/);
    }
  });
}

test('unknown text is not classified', () => {
  assert.equal(checkLetter('hello there').outcome, 'unknown');
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

test('danger and pasted letters stay on the device; other questions go to the AI', () => {
  assert.match(localReply('I am in danger right now').html, /999/);
  assert.ok(localReply(SAMPLES[0].text));
  assert.equal(localReply('can my GP write a letter?'), null);
});

test('AI answers are escaped', () => {
  assert.equal(textToHtml('<b>a</b>\n\nb'), '<p class="govuk-body">&lt;b&gt;a&lt;/b&gt;</p>\n<p class="govuk-body">b</p>');
});

test('api/chat forwards a trimmed conversation to the AI Gateway', async (t) => {
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
