import test from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST, ukE164, callResult } from '../api/call.js';

const PAGE = '<script type="application/ld+json">{"@type":"Physician","name":"Bampton Surgery","telephone":"01993 850257","email":"","url":""}</script>';
// A different address each time, so the per-person call limit does not apply.
let ip = 0;
const post = (body) => POST(new Request('https://example.org/api/call', { method: 'POST', headers: { 'x-forwarded-for': `10.0.0.${++ip}` }, body: JSON.stringify(body) }));

// Vercel builds with the real settings, so every test starts from none.
const KEYS = ['ELEVENLABS_API_KEY', 'ELEVENLABS_AGENT_ID', 'ELEVENLABS_PHONE_NUMBER_ID', 'CALL_DEMO_NUMBER', 'ELEVENLABS_GENERAL_AGENT_ID'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
test.beforeEach(() => { for (const k of KEYS) delete process.env[k]; });
test.after(() => { for (const k of KEYS) if (saved[k] !== undefined) process.env[k] = saved[k]; });

function withElevenLabs(t, demo = '') {
  Object.assign(process.env, { ELEVENLABS_API_KEY: 'k', ELEVENLABS_AGENT_ID: 'agent_1', ELEVENLABS_PHONE_NUMBER_ID: 'phnum_1' });
  if (demo) process.env.CALL_DEMO_NUMBER = demo;
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    if (String(url).includes('nhs.uk')) return new Response(PAGE);
    if (String(url).includes('find-court-tribunal')) return new Response(JSON.stringify({ name: 'Oxford Combined Court Centre', contacts: [{ description: 'Enquiries', number: '01865 264 200' }] }));
    return new Response('{"success":true,"conversation_id":"conv_abc"}');
  });
  return calls;
}

test('UK numbers become E.164, anything else is refused', () => {
  assert.equal(ukE164('01993 850257'), '+441993850257');
  assert.equal(ukE164('+44 (0)7700 900982'.replace('(0)', '')), '+447700900982');
  assert.equal(ukE164('+1 570 989 5830'), '');
  assert.equal(ukE164('999'), '');
});

test('calling is hidden and refused when ElevenLabs is not set up', async () => {
  assert.deepEqual(await (await GET(new Request('https://x/api/call'))).json(), { enabled: false, demo: false, kinds: [] });
  assert.equal((await post({ code: 'K84010', phone: '01993850257' })).status, 503);
});

test('only the number the NHS lists for the practice is called', async (t) => {
  const calls = withElevenLabs(t);
  assert.equal((await post({ code: 'K84010', phone: '07700 900982' })).status, 400);
  const res = await post({ code: 'K84010', phone: '01993 850257' });
  assert.deepEqual(await res.json(), { id: 'conv_abc', demo: false });
  const call = calls.find((c) => String(c.url).endsWith('/twilio/outbound-call'));
  assert.equal(call.body.to_number, '+441993850257');
  assert.equal(call.body.conversation_initiation_client_data.dynamic_variables.practice_name, 'Bampton Surgery');
});

test('demo mode sends every call to the test phone', async (t) => {
  const calls = withElevenLabs(t, '07415 000000');
  const res = await post({ code: 'K84010', phone: '01993 850257', name: 'Bampton Surgery' });
  assert.deepEqual(await res.json(), { id: 'conv_abc', demo: true });
  assert.ok(!calls.some((c) => String(c.url).includes('nhs.uk')));
  assert.equal(calls.at(-1).body.to_number, '+447415000000');
});

test('bad practice codes and conversation ids are refused', async (t) => {
  withElevenLabs(t);
  assert.equal((await post({ code: '../x', phone: '01993850257' })).status, 400);
  assert.equal((await GET(new Request('https://x/api/call?id=../../agents'))).status, 400);
});

test('the result keeps only a valid email address and the addressee', () => {
  const conv = (email, status = 'done') => ({ status, analysis: { data_collection_results: { request_email: { value: email }, addressee: { value: ' Dr Patel ' } } } });
  assert.deepEqual(callResult(conv('reception@nhs.net')), { status: 'done', email: 'reception@nhs.net', name: 'Dr Patel' });
  assert.equal(callResult(conv('not an email')).email, '');
  assert.equal(callResult(conv('', 'in-progress')).status, 'calling');
  assert.equal(callResult({ status: 'failed' }).status, 'failed');
});

test('courts and services are only called with a general agent, never with the GP script', async (t) => {
  const calls = withElevenLabs(t);
  assert.deepEqual((await (await GET(new Request('https://x/api/call'))).json()).kinds, ['gp']);
  assert.equal((await post({ kind: 'court', slug: 'oxford-combined-court-centre', phone: '01865 264200' })).status, 400);
  process.env.ELEVENLABS_GENERAL_AGENT_ID = 'agent_general';
  assert.deepEqual((await (await GET(new Request('https://x/api/call'))).json()).kinds, ['gp', 'court', 'service']);
  assert.equal((await post({ kind: 'court', slug: 'oxford-combined-court-centre', phone: '07700 900982' })).status, 400, 'only the listed court number');
  const res = await post({ kind: 'court', slug: 'oxford-combined-court-centre', phone: '01865 264200' });
  assert.deepEqual(await res.json(), { id: 'conv_abc', demo: false });
  const call = calls.filter((c) => String(c.url).endsWith('/twilio/outbound-call')).at(-1).body;
  assert.equal(call.agent_id, 'agent_general');
  assert.equal(call.to_number, '+441865264200');
  assert.deepEqual(call.conversation_initiation_client_data.dynamic_variables, {
    practice_name: 'Oxford Combined Court Centre', organisation_name: 'Oxford Combined Court Centre',
    organisation_type: 'court', on_behalf_of: 'someone who needs a copy of a court document',
  });
});

test('a local service is called only on the number in the directory, and helplines never', async (t) => {
  const calls = withElevenLabs(t);
  process.env.ELEVENLABS_GENERAL_AGENT_ID = 'agent_general';
  assert.equal((await post({ kind: 'service', id: 'df3f5408-9ba3-46ac-a8af-e4f198eda1a3', phone: '07700 900982' })).status, 400);
  assert.equal((await post({ kind: 'service', id: 'not-a-service', phone: "01226 384 054" })).status, 400);
  assert.match((await (await post({ kind: 'service', id: '77566069-345f-447d-89c9-785150343fba', phone: '0808 2000 247' })).json()).error, /do not call helplines/);
  const res = await post({ kind: 'service', id: 'df3f5408-9ba3-46ac-a8af-e4f198eda1a3', phone: "01226 384 054" });
  assert.equal((await res.json()).id, 'conv_abc');
  const vars = calls.filter((c) => String(c.url).endsWith('/twilio/outbound-call')).at(-1).body.conversation_initiation_client_data.dynamic_variables;
  assert.equal(vars.organisation_name, "Barnsley IDAS - Refuge and Community Service");
  assert.equal(vars.organisation_type, 'domestic abuse support service');
});

test('the call script asks for the email only, and never gives the person away', async () => {
  const { script } = await import('../api/call.js');
  for (const kind of ['gp', 'court', 'service']) {
    const s = script(kind, 'Test Org');
    // About 10 seconds of speech at ~2.5 words a second, with room to spare.
    assert.ok(s.first_message.split(/\s+/).length <= 20, kind);
    assert.match(s.first_message, /AI assistant/);
    assert.match(s.first_message, /email address\?$/);
    assert.doesNotMatch(s.first_message, /address(ed)? (it )?to/i);
    assert.match(s.prompt, /Do not ask who to address it to/);
    assert.match(s.prompt, /Never give the person's name/);
  }
  assert.match(script('gp', 'Test Org').first_message, /a patient at the surgery/);
});

test('the voice is sped up, and the overrides fall back one by one', async (t) => {
  const { VOICE } = await import('../api/call.js');
  assert.ok(VOICE.speed > 1 && VOICE.speed <= 1.2, 'within the 0.7 to 1.2 ElevenLabs allows');

  const calls = withElevenLabs(t);
  await post({ code: 'K84010', phone: '01993 850257' });
  const first = calls.filter((c) => String(c.url).endsWith('/twilio/outbound-call'));
  assert.equal(first.length, 1, 'one attempt when the agent accepts everything');
  const override = first[0].body.conversation_initiation_client_data.conversation_config_override;
  assert.equal(override.tts.speed, VOICE.speed);
  assert.match(override.agent.first_message, /email address/);

  // An agent that has not enabled the speed override rejects the first attempt.
  calls.length = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url, body });
    if (String(url).includes('nhs.uk')) return new Response(PAGE);
    const o = body?.conversation_initiation_client_data?.conversation_config_override;
    if (o?.tts) return new Response('{"detail":"tts overrides not allowed"}', { status: 400 });
    return new Response('{"success":true,"conversation_id":"conv_abc"}');
  });
  assert.equal((await (await post({ code: 'K84010', phone: '01993 850257' })).json()).id, 'conv_abc');
  const tries = calls.filter((c) => String(c.url).endsWith('/twilio/outbound-call')).map((c) => c.body.conversation_initiation_client_data.conversation_config_override);
  assert.equal(tries.length, 2);
  assert.ok(tries[0].tts && tries[0].agent, 'script and voice first');
  assert.ok(!tries[1].tts && tries[1].agent, 'then the script on its own');

  // An agent that allows no overrides at all still gets called with its own script.
  calls.length = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url, body });
    if (String(url).includes('nhs.uk')) return new Response(PAGE);
    if (body?.conversation_initiation_client_data?.conversation_config_override) return new Response('{"detail":"overrides not allowed"}', { status: 400 });
    return new Response('{"success":true,"conversation_id":"conv_abc"}');
  });
  assert.equal((await (await post({ code: 'K84010', phone: '01993 850257' })).json()).id, 'conv_abc');
  const plain = calls.filter((c) => String(c.url).endsWith('/twilio/outbound-call'));
  assert.equal(plain.length, 3);
  assert.equal(plain[2].body.conversation_initiation_client_data.conversation_config_override, undefined);
});
