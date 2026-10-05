import test from 'node:test';
import assert from 'node:assert/strict';
import { findPlace, socialServicesCouncil, forgetPlace, rememberedPlace } from '../src/app/location.js';
import { COUNCILS } from '../src/app/councils.js';

const fakeFetch = (result) => {
  const urls = [];
  const fn = async (url) => { urls.push(url); return { ok: true, status: 200, json: async () => ({ result }) }; };
  fn.urls = urls;
  return fn;
};

test('every council area in England and Wales is in the table', () => {
  assert.equal(Object.keys(COUNCILS).length, 318);
  for (const [name, c] of Object.entries(COUNCILS)) {
    assert.match(c.url, /^https?:\/\//, name);
    assert.ok(['unitary', 'district', 'county'].includes(c.tier), name);
    if (c.tier === 'district') assert.ok(c.parent, `${name} has a county council`);
  }
});

test('findPlace returns every council an outward code covers, and remembers it', async () => {
  forgetPlace();
  const f = fakeFetch({ latitude: 51.7, longitude: -1.2, country: ['England'], admin_district: ['Oxford', 'Vale of White Horse'] });
  const place = await findPlace('ox1 4aa', f);
  assert.deepEqual(place.councils.map((c) => c.name), ['Oxford City Council', 'Vale of White Horse District Council']);
  assert.deepEqual(f.urls, ['https://api.postcodes.io/outcodes/OX1']);
  assert.equal(rememberedPlace().outcode, 'OX1');
  await findPlace('OX1', f);
  assert.equal(f.urls.length, 1, 'the same area is not looked up twice');
  forgetPlace();
  assert.equal(rememberedPlace(), null);
});

test('social services are run by the county council above a district', () => {
  assert.equal(socialServicesCouncil(COUNCILS.Oxford).name, 'Oxfordshire County Council');
  assert.equal(socialServicesCouncil(COUNCILS.Manchester).name, 'Manchester City Council');
});
