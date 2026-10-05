import test from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST, readDetails } from '../api/send.js';

const base = { key: 'p11', applicant: 'Jane Doe', profEmail: 'gp@example.nhs.uk', replyTo: 'me' };
const post = (body) => POST(new Request('https://example.org/api/send', { method: 'POST', body: JSON.stringify(body) }));

function withResend(t) {
  process.env.RESEND_API_KEY = 'test-key';
  process.env.EMAIL_FROM = 'Requests <requests@example.org>';
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => { calls.push({ url, body: JSON.parse(init.body), auth: init.headers.authorization }); return new Response('{"id":"1"}'); });
  t.after(() => { delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM; });
  return calls;
}

test('send is hidden and refused when no email provider is set up', async () => {
  assert.deepEqual(await GET().json(), { enabled: false });
  assert.equal((await post({ ...base, altEmail: 'safe@example.com' })).status, 503);
});

test('a reply address is required, because replies cannot come back to the sender', () => {
  assert.equal(readDetails(base)[1], 'Enter an email address for them to reply to');
  assert.equal(readDetails({ ...base, contactBy: 'phone', phone: '123' })[1], 'Enter a phone number, like 07700 900 982');
  assert.equal(readDetails({ ...base, replyTo: 'solicitor' })[1], 'Enter your solicitor’s email address');
  assert.equal(readDetails({ ...base, key: 'nope', altEmail: 'a@b.co' })[1], 'Unknown kind of evidence');
  assert.equal(readDetails({ ...base, key: 'police', event: 'made-up', altEmail: 'a@b.co' })[1], 'Unknown police outcome');
});

test('sends with a different reply-to address and an on-behalf footer', async (t) => {
  const calls = withResend(t);
  const res = await post({ ...base, altEmail: 'safe@example.com' });
  assert.deepEqual(await res.json(), { sent: true, to: 'gp@example.nhs.uk' });
  const [c] = calls;
  assert.equal(c.url, 'https://api.resend.com/emails');
  assert.equal(c.auth, 'Bearer test-key');
  assert.deepEqual(c.body.to, ['gp@example.nhs.uk']);
  assert.equal(c.body.reply_to, 'safe@example.com');
  assert.match(c.body.text, /Please send it to me at safe@example\.com\./);
  assert.match(c.body.text, /sent for Jane Doe by a prototype service/);
  assert.match(c.body.text, /https:\/\/example\.org\/letter-checker\.html\?type=p11/);
});

test('phone call back: no reply-to, number and voicemail preference in the email', async (t) => {
  const calls = withResend(t);
  await post({ ...base, contactBy: 'phone', phone: '07700 900982', callTimes: 'weekdays 10am to 2pm', voicemail: false });
  const [c] = calls;
  assert.equal(c.body.reply_to, undefined);
  assert.match(c.body.text, /Please call me on 07700 900982/);
  assert.match(c.body.text, /weekdays 10am to 2pm/);
  assert.match(c.body.text, /Please do not leave a voicemail/);
});

test('the email text cannot be replaced, and long fields are cut short', async (t) => {
  const calls = withResend(t);
  await post({ ...base, altEmail: 'safe@example.com', body: 'Buy cheap pills', subject: 'Spam', note: 'x'.repeat(5000) });
  const [c] = calls;
  assert.doesNotMatch(c.body.text, /cheap pills/);
  assert.equal(c.body.subject, 'Request for a letter for my legal aid application');
  assert.ok(!c.body.text.includes('x'.repeat(501)));
});
