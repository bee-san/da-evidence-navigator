import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceDetails, GET } from '../api/gp.js';
import { searchPractices, practiceContact, titleCase } from '../src/app/gp.js';

const PAGE = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Physician","name":"Bampton Surgery","telephone":"01993850257","email":"bobicb-ox.bmp.reception@nhs.net","url":"https://www.bamptonmedicalpractice.co.uk","image":""}</script>';

test('practice details come from the NHS page schema.org data', () => {
  assert.deepEqual(practiceDetails(PAGE), { name: 'Bampton Surgery', telephone: '01993850257', email: 'bobicb-ox.bmp.reception@nhs.net', url: 'https://www.bamptonmedicalpractice.co.uk' });
  assert.equal(practiceDetails(PAGE.replace(/"email":"[^"]*"/, '"email":""')).email, '');
});

test('api/gp only accepts a practice code', async (t) => {
  assert.equal((await GET(new Request('https://x/api/gp?code=../../etc'))).status, 400);
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => { urls.push(url); return new Response(PAGE); });
  const r = await GET(new Request('https://x/api/gp?code=K84010'));
  assert.equal((await r.json()).email, 'bobicb-ox.bmp.reception@nhs.net');
  assert.deepEqual(urls, ['https://www.nhs.uk/services/gp-surgery/practice/K84010']);
});

const fakeFetch = (answer) => {
  const urls = [];
  const fn = async (url) => { urls.push(url); const body = answer(url); return { ok: !!body, status: body ? 200 : 404, json: async () => body }; };
  fn.urls = urls;
  return fn;
};

test('search by postcode area keeps only that exact area', async () => {
  const f = fakeFetch(() => ({ Organisations: [
    { OrgId: 'K84016', Name: 'BEAUMONT ELMS PRACTICE', PostCode: 'OX1 2HB' },
    { OrgId: 'K84002', Name: 'DIDCOT HEALTH CENTRE PRACTICE', PostCode: 'OX11 7AH' },
  ] }));
  const list = await searchPractices('ox1 2hb', f);
  assert.deepEqual(list, [{ code: 'K84016', name: 'Beaumont Elms Practice', postcode: 'OX1 2HB' }]);
  assert.match(f.urls[0], /PostCode=OX1(&|$)/);
  assert.doesNotMatch(f.urls[0], /2HB/, 'only the first half of the postcode is sent');
});

test('search by name, and helpful problems', async () => {
  const f = fakeFetch(() => ({ Organisations: [{ OrgId: 'K84010', Name: 'BAMPTON SURGERY', PostCode: 'OX18 2LJ' }] }));
  assert.equal((await searchPractices('Bampton', f))[0].name, 'Bampton Surgery');
  assert.match(f.urls[0], /Name=Bampton/);
  assert.match((await searchPractices('a', f)).problem, /first half of a postcode/);
  assert.match((await searchPractices('Nowhere', fakeFetch(() => ({ Organisations: [] })))).problem, /could not find a GP practice called/);
});

test('without the NHS website lookup, the ODS phone number is used', async () => {
  const f = fakeFetch((url) => (url.startsWith('api/gp') ? null : { Organisation: { Name: 'BUTETOWN MEDICAL PRACTICE', Contacts: { Contact: [{ type: 'tel', value: '029 2048 0000' }] } } }));
  assert.deepEqual(await practiceContact('W97291', f), { name: 'Butetown Medical Practice', telephone: '029 2048 0000', email: '', url: '' });
});

test('titleCase keeps NHS and GP readable', () => {
  assert.equal(titleCase("DR SMITH'S NHS GP SURGERY"), "Dr Smith's NHS GP Surgery");
});
