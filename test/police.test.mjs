import test from 'node:test';
import assert from 'node:assert/strict';
import { outwardCode, findForce, FORCES } from '../src/app/police.js';

test('outwardCode keeps only the first half of a postcode', () => {
  assert.equal(outwardCode('sw1a 1aa'), 'SW1A');
  assert.equal(outwardCode('M11AE'), 'M1');
  assert.equal(outwardCode('m1'), 'M1');
  assert.equal(outwardCode('CR0 2YR'), 'CR0');
  assert.equal(outwardCode('not a postcode'), null);
  assert.equal(outwardCode(''), null);
});

// Fake fetch that records every URL and answers from a table.
const fakeFetch = (answers) => {
  const urls = [];
  const fn = async (url) => {
    urls.push(url);
    const key = Object.keys(answers).find((k) => url.includes(k));
    const body = key ? answers[key] : null;
    return { ok: !!body, status: body ? 200 : 404, json: async () => body };
  };
  fn.urls = urls;
  return fn;
};

test('findForce sends only the outward code and returns the force', async () => {
  const f = fakeFetch({
    '/outcodes/M1': { result: { latitude: 53.47, longitude: -2.23, country: ['England'] } },
    'locate-neighbourhood': { force: 'greater-manchester', neighbourhood: 'AC25' },
  });
  assert.deepEqual(await findForce('M1 1AE', f), { id: 'greater-manchester', outcode: 'M1' });
  assert.ok(f.urls.every((u) => !u.includes('1AE')), 'the second half of the postcode is never sent');
});

test('findForce explains Scotland and Northern Ireland', async () => {
  const scot = fakeFetch({ '/outcodes/EH1': { result: { latitude: 55.9, longitude: -3.1, country: ['Scotland'] } } });
  assert.match((await findForce('EH1 1AA', scot)).problem, /Scotland, which has its own legal aid system/);
  assert.equal(scot.urls.length, 1, 'police.uk is not asked');
  const ni = fakeFetch({ '/outcodes/BT1': { result: { latitude: 54.6, longitude: -5.9, country: ['Northern Ireland'] } } });
  assert.match((await findForce('BT1', ni)).problem, /Northern Ireland/);
});

test('findForce handles unknown postcodes', async () => {
  assert.match((await findForce('nonsense', fakeFetch({}))).problem, /Enter a postcode/);
  assert.match((await findForce('ZZ9', fakeFetch({}))).problem, /could not find the postcode area ZZ9/);
});

test('there are 43 forces in England and Wales', () => {
  assert.equal(Object.keys(FORCES).length, 43);
  assert.ok(!FORCES['northern-ireland']);
});
