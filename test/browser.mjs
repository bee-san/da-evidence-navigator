// End-to-end and accessibility checks in a real Chrome.
// Serves _site/, runs axe-core (WCAG 2.2 A and AA) on every page, checks
// keyboard access, and walks through each journey.
//
//   npm run build && npm run test:browser
//
// Set CHROME_PATH if Chrome is not in the usual place. Set RUN_MODEL=1 to
// also test the optional AI second opinion (downloads about 30 MB).
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile, readdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const root = new URL('../_site/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.gz': 'application/gzip' };
const server = createServer(async (req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try {
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const CHROME = process.env.CHROME_PATH || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
const profile = await mkdtemp(join(tmpdir(), 'da-chrome-'));
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true, defaultViewport: null, userDataDir: profile,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--window-size=1100,900'],
});
const page = (await browser.pages())[0] || await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`${page.url()}: ${m.text()}`));
page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
const axe = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log(`ok - ${name}`); } catch (e) { failures += 1; console.log(`not ok - ${name}\n  ${e.message.split('\n').join('\n  ')}`); }
}
const go = (p) => page.goto(base + p, { waitUntil: 'networkidle0' });
const text = (sel) => page.$eval(sel, (e) => e.textContent.trim());
const until = (fn, ms = 60000) => page.waitForFunction(fn, { timeout: ms, polling: 250 });

async function audit(label) {
  await page.evaluate(axe);
  const r = await page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }));
  const v = r.violations.map((x) => `${x.id} (${x.impact}): ${x.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
  assert.deepEqual(v, [], `${label} has accessibility problems`);
}

// Every page, before any interaction.
const pages = (await readdir(root)).filter((f) => f.endsWith('.html')).sort();
for (const p of pages) await step(`axe: ${p}`, async () => { await go(p); await audit(p); });

await step('keyboard: skip link first, then Exit this page is reachable', async () => {
  await go('index.html');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'govuk-skip-link');
  let reached = false;
  for (let i = 0; i < 25 && !reached; i += 1) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() => document.activeElement.classList.contains('govuk-exit-this-page__button'));
  }
  assert.ok(reached, 'Exit this page is reachable by keyboard');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle + getComputedStyle(document.activeElement).boxShadow);
  assert.notEqual(outline, 'nonenone', 'focus is visible');
});

await step('home page has one button, which starts the find-a-solicitor flow', async () => {
  await go('index.html');
  const buttons = await page.$$eval('main .govuk-button, header nav a', (b) => b.map((x) => x.textContent.trim()));
  assert.deepEqual(buttons, ['Start now']);
  await Promise.all([page.waitForNavigation(), page.click('.govuk-button--start')]);
  await until(() => document.querySelector('#flow h1'));
  assert.equal(await text('#flow h1'), 'Do you have a solicitor for your family case?');
});

await step('find a solicitor: error, keyboard answers, back link, finder search', async () => {
  await go('find-solicitor.html');
  await until(() => document.querySelector('#flow form'));
  await page.click('#flow .govuk-button');
  await until(() => document.querySelector('.govuk-error-summary'));
  assert.equal(await page.evaluate(() => document.activeElement.className), 'govuk-error-summary');
  assert.match(await page.title(), /^Error: /);
  await audit('flow error');
  await page.click('.govuk-error-summary a');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'have-0');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await until(() => document.querySelector('#flow h1')?.textContent === 'Are you at risk of harm now?');
  assert.equal(await page.evaluate(() => document.activeElement.tagName), 'H1', 'focus moves to the new question');
  await page.click('#risk-1');
  await page.click('#flow .govuk-button');
  await until(() => document.querySelector('#flow h1')?.textContent === 'Find a legal aid solicitor');
  await audit('flow result');
  await page.goBack();
  await until(() => document.querySelector('#flow h1')?.textContent === 'Are you at risk of harm now?');
  await page.click('.govuk-back-link');
  await until(() => document.querySelector('#flow h1')?.textContent === 'Do you have a solicitor for your family case?');
  await page.goto(`${base}find-solicitor.html#have/risk/urgent`, { waitUntil: 'networkidle0' });
  await until(() => document.querySelector('#flow h1')?.textContent === 'Get help now');
  // The search goes to the GOV.UK finder with Family chosen. Stop the request
  // rather than leave the test site.
  await page.setRequestInterception(true);
  let finder;
  const stop = (r) => { if (r.url().startsWith('https://find-legal-advice')) { finder = r.url(); r.abort(); } else r.continue(); };
  page.on('request', stop);
  await page.type('#postcode', 'SW1H 9AJ');
  await page.click('form[action*="find-legal-advice"] button');
  await new Promise((r) => setTimeout(r, 500));
  page.off('request', stop);
  await page.setRequestInterception(false);
  assert.equal(finder, 'https://find-legal-advice.justice.gov.uk/search?categories=mat&postcode=SW1H+9AJ');
  errors.splice(0, errors.length, ...errors.filter((e) => !e.includes('find-legal-advice')));
});

await step('find evidence: no police or court, GP letter, email written on the device', async () => {
  await go('check.html');
  const answer = async (label) => {
    const h1 = await text('h1');
    const [radio] = await page.$$(`xpath/.//label[normalize-space()="${label}"]/preceding-sibling::input`);
    assert.ok(radio, `"${label}" is an option on "${h1}"`);
    await radio.click();
    await page.click('form[data-step] button');
    await page.waitForFunction((prev) => document.querySelector('h1')?.textContent.trim() !== prev, { timeout: 5000 }, h1);
  };
  assert.equal(await text('h1'), 'Do you have a solicitor for your family case?');
  await answer('No');
  assert.equal(await text('h1'), 'Have the police been involved?');
  await answer('No');
  await answer('No');
  await answer('Yes, they examined or treated me');
  assert.equal(await text('h1'), 'Ask the health professional for a letter');
  await audit('evidence result');

  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.click('#contact-form button[type=submit]');
  assert.match(await text('#contact-errors'), /Enter your full name/);
  await page.type('#applicant', 'Jane Doe');
  await page.type('#profName', 'Dr Patel');
  await page.type('#profEmail', 'surgery@example.nhs.uk');
  await page.click('#contact-form button[type=submit]');
  await until(() => document.querySelector('#email-body'), 5000);
  const body = await page.$eval('#email-body', (e) => e.textContent);
  assert.match(body, /^Dear Dr Patel,/);
  assert.match(body, /I can confirm that I have examined Jane Doe/);
  assert.match(body, /letter-checker\.html\?type=p11/);
  const mailto = await page.$eval('#send-app', (a) => a.href);
  assert.ok(mailto.startsWith('mailto:surgery%40example.nhs.uk?subject='), mailto);
  assert.ok(!requests.some((u) => /Jane|Patel|surgery/.test(u)), 'nothing typed is sent anywhere');
  await audit('evidence email');
});

await step('find evidence: a solicitor mentioned at the start is used, not asked about again', async () => {
  await go('index.html');
  await go('check.html');
  for (const label of ['Yes', 'No', 'No', 'Yes, they examined or treated me']) {
    const h1 = await text('h1');
    const [radio] = await page.$$(`xpath/.//label[normalize-space()="${label}"]/preceding-sibling::input`);
    await radio.click();
    await page.click('form[data-step] button');
    await page.waitForFunction((prev) => document.querySelector('h1')?.textContent.trim() !== prev, { timeout: 5000 }, h1);
  }
  assert.equal(await page.$eval('#replyTo-solicitor', (e) => e.checked), true);
  assert.equal(await page.$eval('#solicitor-details', (e) => e.hidden), false);
  assert.match(await text('#contact-form'), /Where should they send the letter\?/);
  assert.doesNotMatch(await text('#contact-form'), /Straight to my solicitor/);
});

await step('find evidence: police caution, sent straight to a solicitor', async () => {
  await go('check.html#solicitor/police/policeWhat/evCautioned');
  assert.equal(await text('h1'), 'Ask the police to confirm the caution');
  await page.type('#applicant', 'Jane Doe');
  await page.type('#other', 'John Doe');
  await page.click('#replyTo-solicitor');
  await page.type('#solicitorEmail', 'family@solicitors.example');
  await page.click('#contact-form button[type=submit]');
  await until(() => document.querySelector('#email-body'), 5000);
  const body = await page.$eval('#email-body', (e) => e.textContent);
  assert.match(body, /paragraph 2 /);
  assert.match(body, /John Doe was given a police caution/);
  assert.match(body, /send it to my solicitor at family@solicitors\.example/);
  assert.match(await page.$eval('#send-app', (a) => a.href), /cc=family%40solicitors\.example/);
});

await step('find evidence: police force found from the first half of the postcode only', async () => {
  await go('check.html#solicitor/police/policeWhat/evArrested');
  const sent = [];
  const answer = (r) => {
    const u = r.url();
    if (u.startsWith('https://api.postcodes.io/') || u.startsWith('https://data.police.uk/')) {
      sent.push(u);
      const body = u.includes('/outcodes/') ? { result: { latitude: 53.47, longitude: -2.23, country: ['England'] } } : { force: 'greater-manchester' };
      r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    } else r.continue();
  };
  await page.setRequestInterception(true);
  page.on('request', answer);
  try {
    await page.$eval('#forcePostcode', (e) => { e.value = ''; });
    await page.type('#forcePostcode', 'M1 1AE');
    await page.click('#forceFind');
    await until(() => document.querySelector('#forceResult strong')?.textContent === 'Greater Manchester Police', 5000);
  } finally {
    page.off('request', answer);
    await page.setRequestInterception(false);
  }
  assert.equal(sent.length, 2);
  assert.ok(sent.every((u) => !u.includes('1AE')), sent.join(' '));
  assert.equal(await page.$eval('#forceId', (e) => e.value), 'greater-manchester');
  assert.equal(await page.$eval('#profName', (e) => e.value), 'Greater Manchester Police');
  await audit('police force found');
});

await step('find evidence: MARAC and council pages show who to ask locally', async () => {
  await go('check.html#solicitor/police/court/health/services/evMarac');
  const sent = [];
  const answer = (r) => {
    const u = r.url();
    if (u.startsWith('https://api.postcodes.io/') || u.startsWith('https://data.police.uk/')) {
      sent.push(u);
      const body = u.includes('/outcodes/')
        ? { result: { latitude: 51.75, longitude: -1.25, country: ['England'], admin_district: ['Oxford', 'Vale of White Horse'] } }
        : { force: 'thames-valley' };
      r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    } else r.continue();
  };
  await page.setRequestInterception(true);
  page.on('request', answer);
  try {
  await page.$eval('#localPostcode', (e) => { e.value = ''; });
  await page.type('#localPostcode', 'OX1 4AA');
  await page.click('#localFind');
  await until(() => document.querySelector('#localDetail')?.textContent.includes('Thames Valley Police'), 5000);
  assert.match(await text('#localResult'), /more than one council area/);
  assert.match(await text('#localDetail'), /Oxfordshire County Council/);
  await audit('MARAC local help');

  // Next page on the same visit: the area is remembered and the council named in the email.
  await page.evaluate(() => { location.hash = 'solicitor/police/court/health/services/evP19'; });
  await until(() => document.querySelector('#localDetail'), 5000);
  await page.click('#council-1');
  assert.match(await text('#localDetail'), /Vale of White Horse District Council/);
  assert.equal(await page.$eval('#profName', (e) => e.value), 'Vale of White Horse District Council');
  } finally {
    page.off('request', answer);
    await page.setRequestInterception(false);
  }
  assert.equal(sent.filter((u) => u.includes('postcodes.io')).length, 1, 'the area is looked up once');
  assert.ok(sent.every((u) => !u.includes('4AA')), sent.join(' '));
});

await step('find evidence: send it for me, with a phone call back instead of a reply', async () => {
  await go('index.html'); // fresh page load, so the send check runs again
  let posted;
  const answer = (r) => {
    if (!r.url().endsWith('/api/send')) return r.continue();
    if (r.method() === 'POST') posted = JSON.parse(r.postData());
    r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(r.method() === 'POST' ? { sent: true, to: 'support@service.example' } : { enabled: true }) });
  };
  await page.setRequestInterception(true);
  page.on('request', answer);
  try {
    await go('check.html#solicitor/police/court/health/services/evP17');
    await page.type('#applicant', 'Jane Doe');
    await page.type('#profEmail', 'support@service.example');
    await until(() => document.querySelector('#method-phone'), 5000);
    await page.click('#method-phone');
    await page.click('#contact-form button[type=submit]');
    assert.match(await text('#contact-errors'), /Enter a phone number/);
    await page.type('#phone', '07700 900982');
    await page.click('#contact-form button[type=submit]');
    await until(() => document.querySelector('#send-for-me'), 5000);
    assert.match(await page.$eval('#email-body', (e) => e.textContent), /Please call me on 07700 900982/);
    assert.equal(await page.$('#send-app'), null, 'the own-email buttons are not shown');
    await audit('send it for me');
    await page.click('#send-for-me');
    await until(() => document.querySelector('#sfm-sent'), 5000);
    assert.match(await text('#sfm-sent'), /asked to call you on 07700 900982/);
    assert.equal(posted.contactBy, 'phone');
    assert.equal(posted.key, 'p17');
  } finally {
    page.off('request', answer);
    await page.setRequestInterception(false);
  }
});

await step('letter checker: rejected example needs changes, with a message', async () => {
  await go('letter-checker.html?sample=p11-bad-5');
  await page.click('#letter-form button[type=submit]');
  assert.equal(await text('.govuk-notification-banner__heading'), 'This letter needs changes');
  assert.match(await text('#result pre'), /consistent with domestic abuse/);
  await audit('letter result');
});

await step('letter checker: guidance-only types are labelled', async () => {
  await go('letter-checker.html?sample=social-ok');
  await page.click('#letter-form button[type=submit]');
  assert.equal(await text('.govuk-notification-banner__heading'), 'This letter looks ready');
  assert.match(await text('#result'), /based on GOV.UK guidance only/);
});

const tmp = await mkdtemp(join(tmpdir(), 'da-files-'));
await step('letter checker: reads a photo of a letter on the device', async () => {
  await go('letter-checker.html');
  // Draw the rejected example as an image, the way a phone photo would arrive.
  const png = await page.evaluate(async () => {
    const { SAMPLES } = await import('./app/samples.js');
    const lines = SAMPLES.find((s) => s.id === 'p11-bad-5').text.split('\n').flatMap((l) => l.match(/.{1,70}(\s|$)/g));
    const c = Object.assign(document.createElement('canvas'), { width: 1400, height: 60 + lines.length * 40 });
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#000'; x.font = '28px Arial';
    lines.forEach((l, i) => x.fillText(l, 30, 50 + i * 40));
    return c.toDataURL('image/png').split(',')[1];
  });
  const file = join(tmp, 'letter.png');
  await writeFile(file, Buffer.from(png, 'base64'));
  const external = [];
  const watch = (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); };
  page.on('request', watch);
  await (await page.$('#file')).uploadFile(file);
  await until(() => /Text added/.test(document.getElementById('file-status').textContent), 120000);
  page.off('request', watch);
  assert.deepEqual(external, [], 'no requests leave the site while reading the photo');
  await page.click('#letter-form button[type=submit]');
  assert.equal(await text('.govuk-notification-banner__heading'), 'This letter needs changes');
  assert.match(await text('#result'), /hedged \("might"\)/);
});

await step('letter checker: reads a text-layer PDF', async () => {
  await go('letter-checker.html');
  const pdfPage = await browser.newPage();
  await pdfPage.setContent('<p style="font:16px Arial">I understand that Jane Doe wishes to access legal aid. I have been asked to provide a letter in accordance with regulation 33 of the Civil Legal Aid (Procedure) Regulations 2012. I can confirm that I have examined Jane Doe and in my reasonable professional judgement, the condition that the applicant has is consistent with domestic abuse.</p>');
  const file = join(tmp, 'letter.pdf');
  await writeFile(file, await pdfPage.pdf({ format: 'A4' }));
  await pdfPage.close();
  await (await page.$('#file')).uploadFile(file);
  await until(() => /Text added/.test(document.getElementById('file-status').textContent));
  await page.click('#letter-form button[type=submit]');
  assert.equal(await text('.govuk-notification-banner__heading'), 'This letter looks ready');
});

await step('letter checker: AI second opinion needs consent first', async () => {
  await go('letter-checker.html?sample=p11-bad-5');
  await page.click('#letter-form button[type=submit]');
  await page.click('#opinion summary');
  assert.equal(await page.$eval('#run-model', (b) => b.disabled), true);
  await page.click('label[for=consent]');
  assert.equal(await page.$eval('#run-model', (b) => b.disabled), false);
  await audit('second opinion');
  if (process.env.RUN_MODEL) {
    await page.click('#run-model');
    await until(() => document.querySelector('#model-result table'), 300000);
    console.log('  model:', await text('#model-status'));
    console.log('  ', (await page.$$eval('#model-result td', (t) => t.map((x) => x.textContent))).join(' | '));
  }
});

await step('request notes: QR code links to the note and holds no personal data', async () => {
  await go('request.html#marac');
  await page.click('.govuk-details__summary');
  assert.ok(await page.$('.app-qr svg'));
  assert.match(await text('#note'), /member of the MARAC/);
  await audit('request with QR');
});

await step('track progress: nothing saved unless chosen, and delete works', async () => {
  await go('track.html');
  await page.click('#track-add button');
  await page.click('label[for=t-0-asked]');
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  await page.click('label[for=track-save]');
  assert.match(await page.evaluate(() => localStorage.getItem('app-progress')), /"asked":true/);
  await go('track.html');
  assert.match(await text('#track-list'), /1 of 4 steps/);
  await audit('tracker');
  await page.click('#track-clear');
  assert.equal(await page.evaluate(() => localStorage.length), 0);
});

await step('professionals: letter builder writes a letter that passes', async () => {
  await go('write-letter.html');
  await page.select('#write-type', 'p17');
  await page.click('#write-example');
  await page.click('#write-form button[type=submit]');
  assert.match(await text('#write-result h2:nth-of-type(2)'), /Looks ready/);
  await audit('letter builder');
});

await step('professionals: batch check summarises all example letters', async () => {
  await go('batch-check.html');
  await page.click('#batch-examples');
  await page.click('#batch-form button[type=submit]');
  await until(() => document.querySelector('#batch-result table'));
  assert.match(await text('#batch-result p'), /^11 look ready, 0 need checking, 9 need changes, 0 could not be read\.$/);
  await audit('batch results');
});

await step('demo: every test letter is classified correctly', async () => {
  await go('demo.html');
  const all = await page.$$eval('#demo-accuracy > table tbody tr', (rs) => rs.map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
  assert.match(all.at(-1), /All letters (\d+) \1 \(100%\)/);
  assert.match(await text('#impact-result'), /1,000 returned applications avoided/);
});

await step('chat: danger reply gives 999', async () => {
  await go('chat.html');
  await page.type('#msg', 'I feel unsafe right now');
  await page.click('#chat-form button[type=submit]');
  assert.match(await page.$$eval('.app-chat__msg--bot', (m) => m.at(-1).textContent), /999/);
});

await step('Welsh page is marked as Welsh', async () => {
  await go('cymraeg.html');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'cy');
});

await step('mobile: no horizontal scrolling', async () => {
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
  for (const p of pages) {
    await go(p);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 0, `${p} scrolls sideways by ${over}px at 320px wide`);
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride');
});

await step('exit: Shift 3 times leaves and clears what was typed', async () => {
  await page.setRequestInterception(true);
  page.on('request', (r) => (r.url().includes('bbc.co.uk') ? r.respond({ status: 200, contentType: 'text/html', body: 'left' }) : r.continue()));
  await go('letter-checker.html?sample=p11-bad-5');
  await page.focus('#letter');
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Shift');
  await page.waitForNavigation({ timeout: 10000 });
  assert.match(page.url(), /bbc\.co\.uk\/weather/);
});

await step('no console errors or missing files', async () => {
  // api/send is a Vercel function, so the static test server answers 404 and
  // the page falls back to the person's own email. That is expected.
  const sendCheck = (e) => e.includes('/api/send') || (e.includes('check.html') && e.includes('status of 404'));
  assert.deepEqual(errors.filter((e) => !e.includes('bbc.co.uk') && !sendCheck(e)), []);
});

await browser.close();
server.close();
await rm(tmp, { recursive: true, force: true });
await rm(profile, { recursive: true, force: true });
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
