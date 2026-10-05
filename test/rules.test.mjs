import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLetter, detectType, changeRequest, findDates } from '../src/app/rules.js';
import { SAMPLES } from '../src/app/samples.js';
import { evaluate } from '../src/app/evaluate.js';
import { reply } from '../src/app/chat.js';

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

import { BUILDER, buildLetter, exampleAnswers } from '../src/app/builder.js';
import { ROUTES } from '../src/app/routes.js';

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
