import test from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST, readDetails } from '../api/send.js';

const base = { key: 'p11', applicant: 'Jane Doe', profEmail: 'gp@example.nhs.uk', replyTo: 'me' };
const post = (body) => POST(new Request('https://example.org/api/send', { method: 'POST', body: JSON.stringify(body) }));

test('send it for me is always offered', async () => {
  assert.deepEqual(await GET().json(), { enabled: true });
});

test('pretends to send: says it was sent, and nothing leaves the server', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  const res = await post({ ...base, altEmail: 'safe@example.com' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { sent: true });
  assert.equal(fetch.mock.callCount(), 0);
});

test('a reply address is required, because replies cannot come back to the sender', async () => {
  assert.equal(readDetails(base)[1], 'Enter an email address for them to reply to');
  assert.equal(readDetails({ ...base, contactBy: 'phone', phone: '123' })[1], 'Enter a phone number, like 07700 900 982');
  assert.equal(readDetails({ ...base, replyTo: 'solicitor' })[1], 'Enter your solicitor’s email address');
  assert.equal(readDetails({ ...base, key: 'nope', altEmail: 'a@b.co' })[1], 'Unknown kind of evidence');
  assert.equal(readDetails({ ...base, key: 'police', event: 'made-up', altEmail: 'a@b.co' })[1], 'Unknown police outcome');
  assert.equal((await post(base)).status, 400);
});
