import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFlow, readPath, stepHtml } from '../src/app/flow.js';
import flow from '../src/app/flows/find-solicitor.js';

test('find-solicitor flow: every step exists and can be reached', () => {
  assert.deepEqual(validateFlow(flow), []);
});

test('validateFlow reports missing and unreachable steps', () => {
  const bad = { start: 'a', steps: { a: { title: 'A', options: [{ label: 'x', next: 'gone' }] }, b: { title: 'B', body: '<p></p>' } } };
  assert.deepEqual(validateFlow(bad), ['"a" option "x" goes to missing step "gone"', '"b" cannot be reached']);
});

test('readPath only follows real answers', () => {
  assert.deepEqual(readPath(flow, ''), ['have']);
  assert.deepEqual(readPath(flow, '#have/risk/find'), ['have', 'risk', 'find']);
  assert.deepEqual(readPath(flow, '#have/find'), ['have'], 'cannot skip the risk question');
  assert.deepEqual(readPath(flow, '#urgent'), ['have'], 'cannot start part way through');
});

test('every result page with a search links to the GOV.UK finder with Family chosen', () => {
  for (const [id, s] of Object.entries(flow.steps).filter(([, s]) => s.body)) {
    assert.match(s.body, /action="https:\/\/find-legal-advice\.justice\.gov\.uk\/search"/, id);
    assert.match(s.body, /name="categories" value="mat"/, id);
  }
});

test('someone at risk of harm is told about 999 and the Civil Legal Advice fast track', () => {
  const html = stepHtml(flow, ['have', 'risk', 'urgent']);
  assert.match(html, /call 999/);
  assert.match(html, /0345 345 4 345/);
  assert.match(html, /at risk of harm/);
});

test('a question with no answer shows a GOV.UK error', () => {
  const html = stepHtml(flow, ['have'], { error: true });
  assert.match(html, /govuk-error-summary/);
  assert.match(html, /aria-describedby="have-hint have-error"/);
});
