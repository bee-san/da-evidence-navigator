import test from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST, ukE164, callResult, forgetAgents } from '../api/call.js';

const PAGE = '<script type="application/ld+json">{"@type":"Physician","name":"Bampton Surgery","telephone":"01993 850257","email":"","url":""}</script>';
// A different address each time, so the per-person call limit does not apply.
let ip = 0;
const post = (body) => POST(new Request('https://example.org/api/call', { method: 'POST', headers: { 'x-forwarded-for': `10.0.0.${++ip}` }, body: JSON.stringify(body) }));

// Vercel builds with the real settings, so every test starts from none.
const KEYS = ['ELEVENLABS_API_KEY', 'ELEVENLABS_AGENT_ID', 'ELEVENLABS_PHONE_NUMBER_ID', 'CALL_DEMO_NUMBER', 'ELEVENLABS_GENERAL_AGENT_ID'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
test.beforeEach(() => { for (const k of KEYS) delete process.env[k]; forgetAgents(); });
test.after(() => { for (const k of KEYS) if (saved[k] !== undefined) process.env[k] = saved[k]; });

// What the agent's Security tab allows. Sending anything else does not fail
// the request: the call is killed as the conversation starts.
const agentConfig = (allow) => JSON.stringify({
  platform_settings: { overrides: { conversation_config_override: {
    agent: { first_message: allow.first_message !== false, prompt: { prompt: allow.prompt !== false } },
    tts: { speed: allow.speed !== false },
  } } },
});

function withElevenLabs(t, demo = '', allow = {}) {
  Object.assign(process.env, { ELEVENLABS_API_KEY: 'k', ELEVENLABS_AGENT_ID: 'agent_1', ELEVENLABS_PHONE_NUMBER_ID: 'phnum_1' });
  if (demo) process.env.CALL_DEMO_NUMBER = demo;
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    if (String(url).includes('nhs.uk')) return new Response(PAGE);
    if (/\/convai\/agents\//.test(String(url))) return new Response(agentConfig(allow));
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
  assert.deepEqual(await res.json(), { id: 'conv_abc', demo: false, script: true, speed: 1.2 });
  const call = calls.find((c) => String(c.url).endsWith('/twilio/outbound-call'));
  assert.equal(call.body.to_number, '+441993850257');
  assert.equal(call.body.conversation_initiation_client_data.dynamic_variables.practice_name, 'Bampton Surgery');
});

test('demo mode sends every call to the test phone', async (t) => {
  const calls = withElevenLabs(t, '07415 000000');
  const res = await post({ code: 'K84010', phone: '01993 850257', name: 'Bampton Surgery' });
  assert.deepEqual(await res.json(), { id: 'conv_abc', demo: true, script: true, speed: 1.2 });
  assert.ok(!calls.some((c) => String(c.url).includes('nhs.uk')));
  assert.equal(calls.at(-1).body.to_number, '+447415000000');
});

test('bad practice codes and conversation ids are refused', async (t) => {
  withElevenLabs(t);
  assert.equal((await post({ code: '../x', phone: '01993850257' })).status, 400);
  assert.equal((await GET(new Request('https://x/api/call?id=../../agents'))).status, 400);
});

test('the result keeps only a valid email address and the addressee, and says why the call ended', () => {
  const conv = (email, status = 'done') => ({ status, analysis: { data_collection_results: { request_email: { value: email }, addressee: { value: ' Dr Patel ' } } } });
  assert.deepEqual(callResult(conv('reception@nhs.net')), { status: 'done', email: 'reception@nhs.net', name: 'Dr Patel', reason: '', seconds: 0, turns: 0 });
  assert.equal(callResult(conv('not an email')).email, '');
  assert.equal(callResult(conv('', 'in-progress')).status, 'calling');
  assert.equal(callResult({ status: 'failed' }).status, 'failed');

  // An instant hangup: why it ended, how long it lasted and whether anything was said.
  const hangup = callResult({
    status: 'done',
    transcript: [],
    metadata: { termination_reason: 'agent_hangup', error: { code: 500, reason: 'tts failed' }, call_duration_secs: 1 },
  });
  assert.equal(hangup.reason, 'agent_hangup – tts failed');
  assert.equal(hangup.seconds, 1);
  assert.equal(hangup.turns, 0);
});

test('courts and services are only called with a general agent, never with the GP script', async (t) => {
  const calls = withElevenLabs(t);
  assert.deepEqual((await (await GET(new Request('https://x/api/call'))).json()).kinds, ['gp']);
  assert.equal((await post({ kind: 'court', slug: 'oxford-combined-court-centre', phone: '01865 264200' })).status, 400);
  process.env.ELEVENLABS_GENERAL_AGENT_ID = 'agent_general';
  assert.deepEqual((await (await GET(new Request('https://x/api/call'))).json()).kinds, ['gp', 'court', 'service']);
  assert.equal((await post({ kind: 'court', slug: 'oxford-combined-court-centre', phone: '07700 900982' })).status, 400, 'only the listed court number');
  const res = await post({ kind: 'court', slug: 'oxford-combined-court-centre', phone: '01865 264200' });
  assert.deepEqual(await res.json(), { id: 'conv_abc', demo: false, script: true, speed: 1.2 });
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
    assert.ok(s.first_message.split(/\s+/).length <= 14, kind);
    assert.match(s.first_message, /I'm an AI/, `${kind} still says it is an AI`);
    assert.match(s.first_message, /email address\?$/);
    assert.doesNotMatch(s.first_message, /address(ed)? (it )?to/i);
    assert.match(s.prompt.prompt, /Do not ask who to address it to/);
    assert.match(s.prompt.prompt, /Never give the person's name/);
  }
  assert.equal(script('gp', 'Test Org').first_message, "Hi, I'm an AI calling for a patient. What's your email address?");
});

test('the voice is sped up, and only what the agent allows is sent', async (t) => {
  const { voice, MAX_SPEED } = await import('../api/call.js');
  assert.equal(voice().speed, MAX_SPEED);
  assert.ok(MAX_SPEED > 1 && MAX_SPEED <= 1.2, 'within the 0.7 to 1.2 ElevenLabs allows');
  process.env.CALL_VOICE_SPEED = '5';
  assert.equal(voice().speed, 1.2, 'clamped, so ElevenLabs never 422s on it');
  process.env.CALL_VOICE_SPEED = '0.9';
  assert.equal(voice().speed, 0.9);
  delete process.env.CALL_VOICE_SPEED;

  // Everything enabled: the short script and the faster voice both go.
  let calls = withElevenLabs(t);
  let r = await (await post({ code: 'K84010', phone: '01993 850257' })).json();
  assert.deepEqual(r, { id: 'conv_abc', demo: false, script: true, speed: MAX_SPEED });
  let o = calls.filter((c) => String(c.url).endsWith('/twilio/outbound-call')).at(-1).body.conversation_initiation_client_data.conversation_config_override;
  assert.match(o.agent.first_message, /email address/);
  assert.equal(o.tts.speed, MAX_SPEED);
  assert.ok(calls.some((c) => /\/convai\/agents\//.test(String(c.url))), "the agent's settings are read first");
});

// The call that hung up: ElevenLabs returned 200 and a conversation id, then
// killed the conversation with 1008 "Override for field 'first_message' is not
// allowed by config". Nothing may be sent that the agent has not enabled.
test('an override the agent has not enabled is never sent', async (t) => {
  forgetAgents();
  let calls = withElevenLabs(t, '', { first_message: false, prompt: false });
  let r = await (await post({ code: 'K84010', phone: '01993 850257' })).json();
  assert.deepEqual(r, { id: 'conv_abc', demo: false, script: false, speed: 1.2 }, 'the voice still speeds up');
  let o = calls.filter((c) => String(c.url).endsWith('/twilio/outbound-call')).at(-1).body.conversation_initiation_client_data.conversation_config_override;
  assert.equal(o.agent, undefined, 'no script override');
  assert.equal(o.tts.speed, 1.2);

  // Only the system prompt refused: the opening question still applies.
  forgetAgents();
  calls = withElevenLabs(t, '', { prompt: false });
  await post({ code: 'K84010', phone: '01993 850257' });
  o = calls.filter((c) => String(c.url).endsWith('/twilio/outbound-call')).at(-1).body.conversation_initiation_client_data.conversation_config_override;
  assert.match(o.agent.first_message, /email address/);
  assert.equal(o.agent.prompt, undefined);

  // Nothing allowed: the call goes ahead with the agent exactly as it is.
  forgetAgents();
  calls = withElevenLabs(t, '', { first_message: false, prompt: false, speed: false });
  r = await (await post({ code: 'K84010', phone: '01993 850257' })).json();
  assert.deepEqual(r, { id: 'conv_abc', demo: false, script: false, speed: null });
  o = calls.filter((c) => String(c.url).endsWith('/twilio/outbound-call')).at(-1).body.conversation_initiation_client_data;
  assert.equal(o.conversation_config_override, undefined);
});

test("when the agent's settings cannot be read, no override is sent", async (t) => {
  forgetAgents();
  Object.assign(process.env, { ELEVENLABS_API_KEY: 'k', ELEVENLABS_AGENT_ID: 'agent_1', ELEVENLABS_PHONE_NUMBER_ID: 'phnum_1' });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    if (String(url).includes('nhs.uk')) return new Response(PAGE);
    if (/\/convai\/agents\//.test(String(url))) return new Response('nope', { status: 500 });
    return new Response('{"success":true,"conversation_id":"conv_abc"}');
  });
  const r = await (await post({ code: 'K84010', phone: '01993 850257' })).json();
  assert.deepEqual(r, { id: 'conv_abc', demo: false, script: false, speed: null }, 'the call still happens');
  const body = calls.filter((c) => String(c.url).endsWith('/twilio/outbound-call')).at(-1).body;
  assert.equal(body.conversation_initiation_client_data.conversation_config_override, undefined);
});

test("the agent's settings are read once, not on every call", async (t) => {
  forgetAgents();
  const calls = withElevenLabs(t);
  await post({ code: 'K84010', phone: '01993 850257' });
  await post({ code: 'K84010', phone: '01993 850257' });
  assert.equal(calls.filter((c) => /\/convai\/agents\//.test(String(c.url))).length, 1);
  assert.equal(calls.filter((c) => String(c.url).endsWith('/twilio/outbound-call')).length, 2);
});

test('each part of the override can be turned off without a deploy', async (t) => {
  const { override } = await import('../api/call.js');
  const all = { first_message: true, prompt: true, speed: true };
  t.after(() => { for (const k of ['CALL_VOICE_SPEED', 'CALL_SCRIPT', 'CALL_FIRST_MESSAGE']) delete process.env[k]; });

  assert.ok(override('gp', 'X', all).agent.prompt.prompt);
  assert.equal(override('gp', 'X', all).tts.speed, 1.2);

  process.env.CALL_VOICE_SPEED = 'off';
  assert.equal(override('gp', 'X', all).tts, undefined, 'no voice override');
  assert.ok(override('gp', 'X', all).agent, 'the script still applies');

  delete process.env.CALL_VOICE_SPEED;
  process.env.CALL_SCRIPT = 'off';
  assert.equal(override('gp', 'X', all).agent.prompt, undefined, "the agent's own system prompt is kept");
  assert.match(override('gp', 'X', all).agent.first_message, /email address/);

  delete process.env.CALL_SCRIPT;
  process.env.CALL_FIRST_MESSAGE = 'off';
  assert.equal(override('gp', 'X', all).agent, undefined, 'nothing of the script applies');
  assert.equal(override('gp', 'X', all).tts.speed, 1.2);

  process.env.CALL_VOICE_SPEED = 'off';
  assert.equal(override('gp', 'X', all), null, 'everything off is the agent as the dashboard has it');
});

// The override is dropped whole if its shape is wrong, which is how the first
// go at this shipped a call that used none of it: prompt was a bare string.
test('the override has the shape ElevenLabs documents', async (t) => {
  const calls = withElevenLabs(t);
  await post({ code: 'K84010', phone: '01993 850257' });
  const o = calls.at(-1).body.conversation_initiation_client_data.conversation_config_override;
  assert.deepEqual(Object.keys(o).sort(), ['agent', 'tts']);
  // AgentConfigOverride: first_message is a string, prompt is PromptAgentAPIModelOverride.
  assert.equal(typeof o.agent.first_message, 'string');
  assert.equal(typeof o.agent.prompt, 'object', 'prompt is an object, not the prompt string itself');
  assert.equal(typeof o.agent.prompt.prompt, 'string');
  // TTSConversationalConfigOverride.
  assert.equal(typeof o.tts.speed, 'number');
});

test('the script never lets the assistant hang up before it has asked', async () => {
  const { script } = await import('../api/call.js');
  const { prompt } = script('gp', 'Test Org').prompt;
  assert.match(prompt, /Always start by asking the question/);
  assert.match(prompt, /Never end the call before they have answered/);
  assert.match(prompt, /Once you have the email, and only then/);
  assert.doesNotMatch(prompt, /As soon as you have the email/);
});
