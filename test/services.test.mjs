import test from 'node:test';
import assert from 'node:assert/strict';
import { servicesFor, hasServiceList } from '../src/app/services-lookup.js';
import { SERVICES } from '../src/app/services.js';
import { COUNCILS } from '../src/app/councils.js';

const council = (name) => ({ ...COUNCILS[name], area: name });

test('every council area in England and Wales has local services', () => {
  const none = Object.keys(COUNCILS).filter((n) => !servicesFor(council(n), 'p17').length);
  assert.deepEqual(none, []);
});

test('districts are looked up through their county', () => {
  assert.ok(servicesFor(council('Adur'), 'p17').length, 'Adur, West Sussex');
});

test('services are filtered to fit the evidence, with emails first', () => {
  for (const s of servicesFor(council('Manchester'), 'p14')) assert.ok(s.types.includes('IDVA/DAPA service'), s.name);
  for (const s of servicesFor(council('Oxford'), 'refugeStay')) assert.ok(s.types.includes('Refuge'), s.name);
  const list = servicesFor(council('Manchester'), 'p17');
  const firstWithout = list.findIndex((s) => !s.email);
  assert.ok(firstWithout === -1 || list.slice(firstWithout).every((s) => !s.email));
  assert.equal(hasServiceList('p19'), false);
});

test('no refuge addresses are kept', () => {
  for (const s of Object.values(SERVICES)) assert.deepEqual(Object.keys(s).sort(), ['email', 'for', 'name', 'phone', 'provider', 'types', 'website'], s.name);
});
