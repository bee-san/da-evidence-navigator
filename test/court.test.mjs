import test from 'node:test';
import assert from 'node:assert/strict';
import { GET, pickEmail, courtContact } from '../api/court.js';
import { findCourts } from '../src/app/court.js';
import { forgetPlace } from '../src/app/location.js';

const MANCHESTER = [
  { address: 'bailiffs.manchester.countycourt@justice.gov.uk', description: 'County court', explanation: 'Bailiffs' },
  { address: 'manchesterfamily@justice.gov.uk', description: 'Family public law (children in care)', explanation: 'Paper process' },
  { address: 'manchesterfamilyorders@justice.gov.uk', description: 'Enquiries', explanation: 'Family Orders' },
  { address: 'manchesterdivorce@justice.gov.uk', description: 'Family court', explanation: 'Family divorce and financial remedy' },
];

test('court email: family orders first; skips public law, bailiffs and charities', () => {
  assert.equal(pickEmail(MANCHESTER, 'family').address, 'manchesterfamilyorders@justice.gov.uk');
  const cardiff = [
    { address: 'cardiff@supportthroughcourt.org', description: 'Enquiries', explanation: 'Support through Court' },
    { address: 'family.cardiff.countycourt@justice.gov.uk', description: 'Family public law (children in care)', explanation: 'Paper process including C100 applications' },
    { address: 'enquiries.cardiff.countycourt@justice.gov.uk', description: 'Enquiries', explanation: '' },
  ];
  assert.equal(pickEmail(cardiff, 'family').address, 'enquiries.cardiff.countycourt@justice.gov.uk');
});

test('court email: criminal courts use crime enquiries, not payments', () => {
  const magistrates = [
    { address: 'gm-aeu_enquiries@justice.gov.uk', description: 'Payments', explanation: '' },
    { address: 'contactcrime@justice.gov.uk', description: 'Enquiries', explanation: 'Magistrates’ Court Enquiries - Courts and Tribunals Service Centre' },
  ];
  assert.equal(pickEmail(magistrates, 'crime').address, 'contactcrime@justice.gov.uk');
  assert.equal(pickEmail([], 'crime'), null);
});

test('court contact: address lines, phone and the GOV.UK page', () => {
  const c = courtContact({
    name: 'Stockport County Court and Family Court', slug: 'stockport-county-court-and-family-court',
    emails: [{ address: 'stockportfamily@justice.gov.uk', description: 'Family court', explanation: null }],
    contacts: [{ number: '0161  474 7707', description: 'Enquiries' }],
    addresses: [{ type: 'Visit us', address: 'The Courthouse\nEdward Street\n\n', town: 'Stockport', postcode: 'SK1 3DQ' }, { type: 'Write to us', address: 'The Courthouse\r\nEdward Street', town: 'Stockport', postcode: 'SK1 3NF' }],
  }, 'family');
  assert.deepEqual(c, {
    name: 'Stockport County Court and Family Court', email: 'stockportfamily@justice.gov.uk', emailFor: 'Family court',
    phone: '0161 474 7707', address: 'The Courthouse, Edward Street, Stockport, SK1 3NF',
    url: 'https://www.find-court-tribunal.service.gov.uk/courts/stockport-county-court-and-family-court',
  });
});

test('api/court: searches from the area centre, through a postcode at that point', async (t) => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(url);
    const body = url.includes('postcodes.io') ? { result: [{ postcode: 'M1 4JD' }] }
      : [{ slug: 'manchester-civil-justice-centre-civil-and-family-courts', name: 'Manchester Civil Justice Centre (Civil and Family Courts)', types: ['County Court', 'Family Court'], distance: 0.63, emails: [] }];
    return new Response(JSON.stringify(body));
  });
  const r = await GET(new Request('https://x/api/court?lat=53.47&lon=-2.23&kind=family'));
  assert.deepEqual(await r.json(), { courts: [{ slug: 'manchester-civil-justice-centre-civil-and-family-courts', name: 'Manchester Civil Justice Centre (Civil and Family Courts)', types: ['County Court', 'Family Court'], distance: 0.63 }] });
  assert.match(urls[0], /^https:\/\/api\.postcodes\.io\/postcodes\?lon=-2\.23&lat=53\.47/);
  assert.equal(urls[1], 'https://www.find-court-tribunal.service.gov.uk/search/results.json?postcode=M1%204JD&aol=Domestic%20violence');
});

test('api/court: name search keeps only the right kind of court', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify([
    { slug: 'manchester-employment-tribunal', name: 'Manchester Employment Tribunal', types: ['Tribunal'] },
    { slug: 'manchester-magistrates-court', name: 'Manchester Magistrates\' Court', types: ['Magistrates\' Court'] },
  ])));
  const r = await GET(new Request('https://x/api/court?q=manchester&kind=crime'));
  assert.deepEqual((await r.json()).courts.map((c) => c.slug), ['manchester-magistrates-court']);
});

test('api/court: refuses anything that is not a UK point, a court name or a court id', async () => {
  for (const q of ['lat=48.8&lon=2.3', 'lat=abc&lon=1', 'slug=../../etc', 'q=a', 'q=<script>']) {
    assert.equal((await GET(new Request(`https://x/api/court?${q}`))).status, 400, q);
  }
});

test('findCourts sends only the area centre point, never the full postcode', async () => {
  forgetPlace();
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    const body = url.includes('/outcodes/') ? { result: { latitude: 53.47, longitude: -2.23, country: ['England'] } } : { courts: [{ slug: 'a', name: 'A court', types: [], distance: 1 }] };
    return { ok: true, status: 200, json: async () => body };
  };
  const r = await findCourts('M1 1AE', 'family', fetchFn);
  assert.equal(r.courts[0].name, 'A court');
  assert.ok(urls.every((u) => !u.includes('1AE')), urls.join(' '));
  assert.equal(urls[1], 'api/court?lat=53.47&lon=-2.23&kind=family');
  assert.equal((await findCourts('', 'family', fetchFn)).problem, 'Enter the first half of a postcode, like M1, or the name of the court.');
});
