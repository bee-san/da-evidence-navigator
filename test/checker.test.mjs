// The JavaScript checker (src/app/checker/) must give exactly the same result as the Python
// laa-evidence-checker for every letter in the Python package's own tests. Regenerate the cases with
// scripts/checker-golden.py when the Python package changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { check, CATEGORIES, getCategory } from '../src/app/checker/index.js';

const golden = JSON.parse(readFileSync(new URL('./fixtures/checker-golden.json', import.meta.url), 'utf8'));

test('the parity cases cover every evidence category', () => {
  assert.equal(CATEGORIES.length, 31);
  const covered = new Set(golden.cases.map((c) => c.category));
  assert.deepEqual(CATEGORIES.map((c) => c.id).filter((id) => !covered.has(id)), []);
});

for (const [i, c] of golden.cases.entries()) {
  const name = `${c.category} #${i}: ${c.text.split('\n').find((l) => l.trim())?.slice(0, 50) || ''}`;
  test(`same result as Python – ${name}`, () => {
    const js = check(c.text, c.category, c.inputs);
    const py = c.result;
    assert.equal(js.label, py.label, 'outcome');
    py.criteria.forEach((pc, j) => {
      assert.deepEqual(js.criteria[j], pc, `${pc.id} ${pc.label}`);
    });
    assert.deepEqual(js.detected, py.detected, 'detected values');
    assert.deepEqual(js.warnings, py.warnings, 'warnings');
  });
}

test('categories can be chosen by id, number or alias', () => {
  assert.equal(getCategory('gp').id, 'sch1-para11');
  assert.equal(getCategory('17').id, 'sch1-para17');
  assert.equal(getCategory('6a').id, 'sch1-para6a');
  assert.equal(getCategory('s2p7').id, 'sch2-para7');
  assert.throws(() => getCategory('nonsense'), /Unknown evidence category/);
});
