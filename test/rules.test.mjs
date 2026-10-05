import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLetter, detectType, changeRequest } from '../src/app/rules.js';
import { SAMPLES } from '../src/app/samples.js';
import { reply } from '../src/app/chat.js';

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
