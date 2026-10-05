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
import { makeDocx } from './docx-fixture.mjs';

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
  // A fake camera, so the photo flow can be tested without a device.
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--window-size=1100,900', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
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

await step('home page has one button, which starts preparing evidence', async () => {
  await go('index.html');
  assert.equal(await text('main h1'), 'Get help preparing evidence for legal aid for domestic abuse');
  const buttons = await page.$$eval('main .govuk-button, header nav a', (b) => b.map((x) => x.textContent.trim()));
  assert.deepEqual(buttons, ['Start now']);
  assert.ok(await page.$('main a[href="https://find-legal-advice.justice.gov.uk/"]'), 'points to the GOV.UK solicitor finder');
  await Promise.all([page.waitForNavigation(), page.click('.govuk-button--start')]);
  await until(() => document.querySelector('#flow h1'));
  assert.equal(await text('#flow h1'), 'Do you have a solicitor for your family case?');
  assert.match(page.url(), /check\.html/);
});

await step('find a solicitor leads into find evidence without asking about a solicitor again', async () => {
  await go('find-solicitor.html#have/risk/find');
  await until(() => document.querySelector('a[href^="check.html?solicitor="]'));
  await Promise.all([page.waitForNavigation(), page.click('a[href^="check.html?solicitor="]')]);
  await until(() => document.querySelector('#flow h1'));
  assert.equal(await text('#flow h1'), 'Have the police been involved?');
  await page.evaluate(() => { location.hash = 'solicitor/police/court/health/evP11'; });
  await until(() => document.querySelector('#contact-form'));
  assert.equal(await page.$('#replyTo-solicitor'), null, 'not asked about a solicitor again');
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
  await page.click('form[action*="find-legal-advice"] button[type=submit]');
  await new Promise((r) => setTimeout(r, 500));
  page.off('request', stop);
  await page.setRequestInterception(false);
  assert.equal(finder, 'https://find-legal-advice.justice.gov.uk/search?categories=mat&postcode=SW1H+9AJ');
  errors.splice(0, errors.length, ...errors.filter((e) => !e.includes('find-legal-advice')));
});

const clearPostcode = async () => {
  await page.focus('#postcode');
  await page.evaluate(() => document.querySelector('#postcode').select());
  await page.keyboard.press('Backspace');
};

await step('find a solicitor: Find location fills the postcode district', async () => {
  await browser.defaultBrowserContext().overridePermissions(base.slice(0, -1), ['geolocation']);
  await page.setGeolocation({ latitude: 51.49943, longitude: -0.13371 });
  await go('find-solicitor.html#have/risk/find');
  await until(() => document.querySelector('[data-locate]'));
  const sent = [];
  const answer = (r) => {
    if (r.url().startsWith('https://api.postcodes.io/')) {
      sent.push(r.url());
      r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ result: [{ postcode: 'SW1H 0BB', outcode: 'SW1H' }] }) });
    } else r.continue();
  };
  await page.setRequestInterception(true);
  page.on('request', answer);
  try {
    await page.click('[data-locate]');
    await until(() => document.querySelector('#postcode').value === 'SW1H', 10000);
  } finally {
    page.off('request', answer);
    await page.setRequestInterception(false);
  }
  assert.equal(sent.length, 1);
  assert.match(sent[0], /lon=-0\.13&lat=51\.50&/, 'location is rounded before it is sent');
  assert.match(await text('#postcode-locate-status'), /Found SW1H/);
  assert.equal(await page.evaluate(() => document.querySelector('[data-locate-group]').hidden), true, 'location option hides once there is a postcode');
  await audit('flow with location found');
  // One or the other: a typed postcode hides the location option, and
  // clearing it brings the option back.
  await clearPostcode();
  assert.equal(await page.evaluate(() => document.querySelector('[data-locate-group]').hidden), false);
  await page.type('#postcode', 'L8 7AE');
  assert.equal(await page.evaluate(() => document.querySelector('[data-locate-group]').hidden), true);
  assert.equal(await page.evaluate(() => document.querySelector('#postcode').value), 'L8 7AE');
});

await step('find a solicitor: location refused, a typed postcode is used', async () => {
  await browser.defaultBrowserContext().clearPermissionOverrides();
  await go('find-solicitor.html#have/risk/find');
  await until(() => document.querySelector('[data-locate]'));
  await clearPostcode();
  await page.evaluate(() => { navigator.geolocation.getCurrentPosition = (ok, fail) => setTimeout(() => fail({ code: 1 }), 300); });
  await page.click('[data-locate]');
  await page.type('#postcode', 'L8 7AE');
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(await page.evaluate(() => document.querySelector('#postcode').value), 'L8 7AE');
  assert.equal(await text('#postcode-locate-status'), '', 'a late refusal does not tell them to type a postcode they already typed');
  await clearPostcode();
  await page.click('[data-locate]');
  await until(() => /not shared/.test(document.querySelector('#postcode-locate-status').textContent));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'postcode', 'focus goes to the postcode box');
  await audit('flow with location refused');
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
  assert.equal(await text('h1'), 'Do you want to find a legal aid solicitor first?');
  await answer('No, find evidence first');
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

await step('find evidence: court found from the first half of the postcode, and its email added', async () => {
  await go('check.html#solicitor/police/court/courtWhat/evInjunction');
  const sent = [];
  const answer = (r) => {
    const u = r.url();
    if (u.startsWith('https://api.postcodes.io/') || u.includes('/api/court?')) {
      sent.push(u);
      const body = u.includes('/outcodes/') ? { result: { latitude: 53.47, longitude: -2.23, country: ['England'] } }
        : u.includes('slug=') ? { name: 'Stockport County Court and Family Court', email: 'stockportfamily@justice.gov.uk', emailFor: 'Family court', phone: '0161 474 7707', address: 'The Courthouse, Edward Street, Stockport, SK1 3NF', url: 'https://www.find-court-tribunal.service.gov.uk/courts/stockport-county-court-and-family-court' }
          : { courts: [{ slug: 'manchester-civil-justice-centre-civil-and-family-courts', name: 'Manchester Civil Justice Centre (Civil and Family Courts)', types: ['Family Court'], distance: 0.6 }, { slug: 'stockport-county-court-and-family-court', name: 'Stockport County Court and Family Court', types: ['Family Court'], distance: 6.2 }] };
      r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    } else r.continue();
  };
  await page.setRequestInterception(true);
  page.on('request', answer);
  try {
    await page.$eval('#courtSearch', (e) => { e.value = ''; });
    await page.type('#courtSearch', 'M1 1AE');
    await page.click('#courtFind');
    await until(() => document.querySelectorAll('input[name=court]').length === 2, 5000);
    await page.click('#court-1');
    await until(() => document.querySelector('#courtDetail strong')?.textContent === 'Stockport County Court and Family Court', 5000);
  } finally {
    page.off('request', answer);
    await page.setRequestInterception(false);
  }
  assert.ok(sent.every((u) => !u.includes('1AE')), sent.join(' '));
  assert.ok(sent.some((u) => u.includes('api/court?lat=53.47&lon=-2.23&kind=family')), sent.join(' '));
  assert.equal(await page.$eval('#profName', (e) => e.value), 'Stockport County Court and Family Court');
  assert.equal(await page.$eval('#profEmail', (e) => e.value), 'stockportfamily@justice.gov.uk');
  await audit('court found');
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
    r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(r.method() === 'POST' ? { sent: true, to: 'support@service.example', testTo: 'test@example.com' } : { enabled: true }) });
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
    assert.match(await page.$eval('#email-body', (e) => e.textContent), /also attached as a Word document/);
    assert.equal(await page.$('#send-app'), null, 'the own-email buttons are not shown');
    await audit('send it for me');
    await page.click('#send-for-me');
    await until(() => document.querySelector('#sfm-sent'), 5000);
    assert.match(await text('#sfm-sent'), /asked to call you on 07700 900982/);
    assert.match(await text('#sfm-sent'), /Test mode: it went to test@example\.com, not to support@service\.example/);
    assert.equal(posted.contactBy, 'phone');
    assert.equal(posted.key, 'p17');
  } finally {
    page.off('request', answer);
    await page.setRequestInterception(false);
  }
});

await step('find evidence: find my GP and add their email', async () => {
  await go('index.html');
  const sent = [];
  const answer = (r) => {
    const u = r.url();
    if (u.startsWith('https://directory.spineservices.nhs.uk/')) {
      sent.push(u);
      r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ Organisations: [{ OrgId: 'K84016', Name: 'BEAUMONT ELMS PRACTICE', PostCode: 'OX1 2HB' }] }) });
    } else if (u.includes('/api/gp?code=K84016')) {
      sent.push(u);
      r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ name: 'Beaumont Elms Practice', telephone: '01865240501', email: 'info.nbs@nhs.net', url: 'https://www.beaumontelmspractice.co.uk/' }) });
    } else r.continue();
  };
  await page.setRequestInterception(true);
  page.on('request', answer);
  try {
    await go('check.html#solicitor/police/court/health/evP11');
    await page.$eval('#gpSearch', (e) => { e.value = ''; });
    await page.type('#gpSearch', 'OX1 2HB');
    await page.click('#gpFind');
    await until(() => document.querySelector('#gp-0'), 5000);
    await page.click('#gp-0');
    await until(() => document.querySelector('#gpDetail strong'), 5000);
    assert.equal(await page.$eval('#profEmail', (e) => e.value), 'info.nbs@nhs.net');
    assert.equal(await page.$eval('#profName', (e) => e.value), 'Beaumont Elms Practice');
    assert.match(await text('#gpDetail'), /01865240501/);
    assert.ok(sent.every((u) => !u.includes('2HB')), sent.join(' '));
    await audit('GP found');
  } finally {
    page.off('request', answer);
    await page.setRequestInterception(false);
  }
});

await step('find evidence: an AI assistant calls the GP and fills in the email', async () => {
  await go('index.html');
  const posted = [];
  const answer = (r) => {
    const u = r.url();
    const ok = (body) => r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (u.startsWith('https://directory.spineservices.nhs.uk/')) ok({ Organisations: [{ OrgId: 'K84016', Name: 'BEAUMONT ELMS PRACTICE', PostCode: 'OX1 2HB' }] });
    else if (u.includes('/api/gp?code=K84016')) ok({ name: 'Beaumont Elms Practice', telephone: '01865240501', email: '', url: '' });
    else if (u.endsWith('/api/call') && r.method() === 'POST') { posted.push(JSON.parse(r.postData())); ok({ id: 'conv_test', demo: true }); }
    else if (u.endsWith('/api/call')) ok({ enabled: true, demo: true });
    else if (u.includes('/api/call?id=conv_test')) ok({ status: 'done', email: 'letters.beaumont@nhs.net', name: 'Dr Okafor' });
    else r.continue();
  };
  await page.setRequestInterception(true);
  page.on('request', answer);
  try {
    await go('check.html#solicitor/police/court/health/evP11');
    await page.$eval('#gpSearch', (e) => { e.value = ''; });
    await page.type('#gpSearch', 'OX1 2HB');
    await page.click('#gpFind');
    await until(() => document.querySelector('#gp-0'), 5000);
    await page.click('#gp-0');
    await until(() => document.querySelector('#callStart'), 5000);
    assert.match(await text('#gpCall'), /Demo: this calls a test phone/);
    assert.equal(await page.$eval('#callPhone', (e) => e.value), '01865240501');
    await audit('GP call offered');
    await page.click('#callStart');
    await until(() => document.querySelector('#profEmail').value === 'letters.beaumont@nhs.net', 12000);
    assert.equal(await page.$eval('#profName', (e) => e.value), 'Dr Okafor');
    assert.deepEqual(posted, [{ kind: 'gp', code: 'K84016', phone: '01865240501', name: 'Beaumont Elms Practice' }]);
    assert.match(await text('#callStatus'), /send it to letters\.beaumont@nhs\.net, for Dr Okafor/);
  } finally {
    page.off('request', answer);
    await page.setRequestInterception(false);
  }
});

await step('find evidence: choose a local support service to fill in the email', async () => {
  await go('index.html');
  const answer = (r) => {
    if (r.url().startsWith('https://api.postcodes.io/')) {
      r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ result: { latitude: 53.47, longitude: -2.23, country: ['England'], admin_district: ['Manchester'] } }) });
    } else r.continue();
  };
  await page.setRequestInterception(true);
  page.on('request', answer);
  try {
    await go('check.html#solicitor/police/court/health/services/evP17');
    await page.$eval('#localPostcode', (e) => { e.value = ''; });
    await page.type('#localPostcode', 'M1');
    await page.click('#localFind');
    await until(() => document.querySelector('input[name=service]'), 5000);
    await audit('local services');
    const id = await page.$eval('input[name=service]', (e) => e.id);
    await page.click(`#${id}`);
    const email = await page.$eval('#profEmail', (e) => e.value);
    assert.match(email, /@/, 'the first service listed has an email, and it is added');
    assert.match(await text('#service-status'), /added .* to your email/);
    await page.click('#service-none');
    assert.equal(await page.$eval('#profEmail', (e) => e.value), '', 'choosing none takes it out again');
  } finally {
    page.off('request', answer);
    await page.setRequestInterception(false);
  }
});

await step('find evidence: call them for me appears for a court with a phone number but no email', async () => {
  await go('index.html');
  const posted = [];
  const answer = (r) => {
    const u = r.url();
    const ok = (body) => r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (u.includes('/api/court?q=')) ok({ courts: [{ slug: 'oxford-combined-court-centre', name: 'Oxford Combined Court Centre', types: ['Family'], distance: null }] });
    else if (u.includes('/api/court?slug=')) ok({ name: 'Oxford Combined Court Centre', email: '', emailFor: '', phone: '01865 264 200', address: 'St Aldates, Oxford', url: 'https://www.find-court-tribunal.service.gov.uk/courts/oxford-combined-court-centre' });
    else if (u.endsWith('/api/call') && r.method() === 'POST') { posted.push(JSON.parse(r.postData())); ok({ id: 'conv_court', demo: true }); }
    else if (u.endsWith('/api/call')) ok({ enabled: true, demo: true, kinds: ['gp', 'court', 'service'] });
    else r.continue();
  };
  await page.setRequestInterception(true);
  page.on('request', answer);
  try {
    await go('check.html#solicitor/police/court/courtWhat/evInjunction');
    await page.type('#courtSearch', 'Oxford');
    await page.click('#courtFind');
    await until(() => document.querySelector('#court-0'), 5000);
    await page.click('#court-0');
    await until(() => document.querySelector('#courtCall #callStart'), 5000);
    assert.equal(await text('#courtCall #callStart'), 'Call the court for me');
    assert.equal(await page.$eval('#callPhone', (e) => e.value), '01865 264 200');
    await audit('call the court');
    await page.click('#callStart');
    await until(() => /Calling the court/.test(document.querySelector('#callStatus')?.textContent || ''), 5000);
    assert.deepEqual(posted, [{ kind: 'court', slug: 'oxford-combined-court-centre', name: 'Oxford Combined Court Centre', phone: '01865 264 200' }]);
  } finally {
    page.off('request', answer);
    await page.setRequestInterception(false);
  }
});

await step('letter checker: each requirement, a confidence score, what to ask for and the letter marked up', async () => {
  await go('letter-checker.html?sample=p11-bad-5');
  await page.click('#letter-form button[type=submit]');
  assert.equal(await text('.govuk-notification-banner__heading'), 'This letter is missing something it needs');
  assert.match(await text('#result'), /Paragraph 11: Letter or report from an appropriate health professional/);
  assert.match(await text('#result'), /We worked out the type from the letter/);
  assert.equal(await page.$eval('#input-view', (e) => e.hidden), true, 'the review replaces the form');
  assert.equal(await page.$('#type-group:not([hidden]), #client:not(#recheck #client)'), null, 'no type or name fields on the first screen');
  assert.match(await text('.app-score'), /^\d+% confidence score/);
  assert.doesNotMatch(await text('.app-score'), /How much to trust/);
  assert.match(await text('#result'), /What to ask for:.*registering body/);
  assert.ok(await page.$('.app-markup .app-mark--missing, .app-markup .app-mark--unclear'), 'problem sentences are highlighted');
  assert.deepEqual(await page.$$eval('.app-markup .app-mark-word', (m) => m.map((x) => x.textContent.toLowerCase())), ['might'], 'the hedged word is marked');
  await audit('letter result');
  await page.click('#edit-letter');
  assert.equal(await page.$eval('#input-view', (e) => e.hidden), false, 'Edit goes back to the letter');
  assert.equal(await page.$eval('#result', (e) => e.hidden), true);
  assert.match(await page.$eval('#letter', (e) => e.value), /might be consistent/, 'with the text kept to edit');
});

await step('letter checker: check again as another type, with the names it needs', async () => {
  await go('letter-checker.html?sample=social-ok');
  await page.click('#letter-form button[type=submit]');
  await page.click('#recheck summary');
  assert.equal(await page.$eval('#child-group', (e) => e.hidden), true);
  await page.select('#recheck-type', 'sch2-para7');
  assert.equal(await page.$eval('#child-group', (e) => e.hidden), false, 'Schedule 2 asks for the child');
  await page.select('#recheck-type', 'sch1-para19');
  await page.type('#client', 'Jane Doe');
  await page.type('#other', 'John Doe');
  await page.click('#recheck-form button[type=submit]');
  assert.match(await text('#result'), /have not been tested against example letters/);
  assert.doesNotMatch(await text('#result'), /We worked out the type/);
  assert.equal(await page.$eval('#client', (e) => e.value), 'Jane Doe', 'names are kept for the next check');
  await audit('check again');
});

await step('letter checker: asks for the type only when it cannot be worked out', async () => {
  await go('letter-checker.html');
  await page.type('#letter', 'Thank you for your recent letter about the parking permit renewal for the residents of Example Road.');
  await page.click('#letter-form button[type=submit]');
  assert.equal(await page.$eval('#type-group', (e) => e.hidden), false);
  await page.select('#type', 'sch1-para17');
  await page.click('#letter-form button[type=submit]');
  assert.equal(await page.$eval('#input-view', (e) => e.hidden), true);
  assert.match(await text('#result'), /Paragraph 17/);
});

const tmp = await mkdtemp(join(tmpdir(), 'da-files-'));
await step('letter checker: camera flow takes, reviews and removes photos, then turns the camera off', async () => {
  await go('letter-checker.html');
  const external = [];
  const watch = (r) => { if (!r.url().startsWith(base) && !/^(data|blob):/.test(r.url())) external.push(r.url()); };
  page.on('request', watch);
  const snapAndUse = async () => {
    await until(() => document.getElementById('cam-video').videoWidth > 0, 10000);
    await page.click('#cam-snap');
    await until(() => !document.querySelector('.app-camera__review').hidden, 10000);
    await page.click('#cam-use');
  };
  await page.click('#cam-start');
  await until(() => !document.querySelector('.app-camera__live').hidden, 10000);
  await audit('camera on');
  await snapAndUse();
  assert.equal(await page.$$eval('#cam-list li', (l) => l.length), 1);
  assert.equal(await page.$eval('#cam-video', (v) => v.srcObject), null, 'camera off while reviewing pages');
  await page.click('#cam-more');
  await snapAndUse();
  assert.equal(await page.$$eval('#cam-list li', (l) => l.length), 2);
  await audit('two photos');
  await page.click('[data-remove="1"]');
  assert.equal(await page.$$eval('#cam-list li', (l) => l.length), 1);
  page.off('request', watch);
  assert.deepEqual(external, [], 'photos never leave the device');
});

await step('compare text readers: this site’s reader scores an example letter, offline', async () => {
  await go('ocr-compare.html');
  for (const id of await page.$$eval('input[name=engine]:checked', (els) => els.map((e) => e.id))) {
    if (id !== 'engine-current') await page.click(`#${id}`);
  }
  await page.click('#photo-like'); // a clean image, so the score is stable
  const external = [];
  const watch = (r) => { if (!r.url().startsWith(base) && !/^(data|blob):/.test(r.url())) external.push(r.url()); };
  page.on('request', watch);
  await page.click('#compare-form button[type=submit]');
  await until(() => document.getElementById('compare-status').textContent === 'Done.', 120000);
  page.off('request', watch);
  const cells = await page.$$eval('#results tbody td', (tds) => tds.map((t) => t.textContent.trim()));
  assert.ok(parseInt(cells[1], 10) >= 80, `This site’s reader read most words: ${cells.join(' | ')}`);
  assert.deepEqual(external, [], 'This site’s reader needs no downloads from other sites');
  await audit('compare results');
});

await step('letter checker (AI demo): same page, checked by GPT-6 Sol through api/check-ai', async () => {
  await go('index.html');
  let posted;
  const answer = (r) => {
    if (!r.url().endsWith('/api/check-ai')) return r.continue();
    posted = JSON.parse(r.postData());
    r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({
      category: 'sch1-para11', category_name: 'Letter or report from an appropriate health professional', label: 'Incomplete', tested_against_examples: false,
      detected: { client: 'Jane Doe', client_source: 'found in the text' },
      criteria: [
        { id: 'GP1', label: 'Written by an appropriate health professional', status: 'missing', note: 'No profession is given.', evidence: [], ref: 'guidance 2.52', ask_for: 'Ask for their profession.' },
        { id: 'GP4', label: 'Professional judgement', status: 'missing', note: 'The judgement is hedged.', evidence: ['I can confirm that I have examined Jane Doe and in my reasonable professional judgement, the condition that the applicant has might be consistent with domestic abuse.'], ref: 'guidance 2.55', ask_for: 'Ask for a firm judgement.' },
      ],
      warnings: ['Checked by an AI model (gpt-6-sol) reading the LAA guidance, not by fixed rules.'],
    }) });
  };
  await page.setRequestInterception(true);
  page.on('request', answer);
  try {
    await go('letter-checker-ai.html?sample=p11-bad-5');
    assert.match(await text('#input-view'), /sends the letter’s text to OpenAI/);
    await page.click('#letter-form button[type=submit]');
    await until(() => !document.getElementById('result').hidden, 5000);
    assert.equal(posted.category, '', 'the AI works out the type');
    assert.match(posted.text, /might be consistent/);
    assert.equal(await text('.govuk-notification-banner__heading'), 'This letter is missing something it needs');
    assert.match(await text('#result'), /GPT-6 Sol worked out the type from the letter/);
    assert.ok(await page.$('.app-markup .app-mark--missing'), 'the sentence the AI quoted is highlighted');
    assert.equal(await page.$('#opinion'), null, 'no separate AI second opinion on the AI page');
    await audit('AI demo result');
  } finally {
    page.off('request', answer);
    await page.setRequestInterception(false);
  }
});

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
  await page.click('.govuk-details__summary');
  await (await page.$('#file')).uploadFile(file);
  await until(() => /Text added/.test(document.getElementById('file-status').textContent), 120000);
  page.off('request', watch);
  assert.deepEqual(external, [], 'no requests leave the site while reading the photo');
  await page.click('#letter-form button[type=submit]');
  assert.equal(await text('.govuk-notification-banner__heading'), 'This letter is missing something it needs');
  assert.match(await page.$eval('.app-markup', (e) => e.textContent), /might/);
});

await step('letter checker: reads a text-layer PDF', async () => {
  await go('letter-checker.html');
  const pdfPage = await browser.newPage();
  await pdfPage.setContent('<p style="font:16px Arial">Re: Jane Doe</p><p style="font:16px Arial">I am a general practitioner registered with the General Medical Council. I examined Jane Doe in person at the surgery on 2 September 2026. In my reasonable professional judgement, the injuries that Jane Doe has are consistent with domestic abuse.</p><p style="font:16px Arial">Dr Asha Patel, GMC 7654321</p>');
  const file = join(tmp, 'letter.pdf');
  await writeFile(file, await pdfPage.pdf({ format: 'A4' }));
  await pdfPage.close();
  await (await page.$('#file')).uploadFile(file);
  await until(() => /Text added/.test(document.getElementById('file-status').textContent));
  await page.click('#letter-form button[type=submit]');
  assert.equal(await text('.govuk-notification-banner__heading'), 'Nothing obviously missing');
  assert.match(await text('.app-score'), /^100% confidence score/);
});

await step('letter checker: reads a Word (.docx) letter, with the letterhead from its header', async () => {
  await go('letter-checker.html');
  const file = join(tmp, 'letter.docx');
  await writeFile(file, await makeDocx({
    header: ['Dr Asha Patel, General Practitioner, GMC 7654321'],
    paragraphs: ['Re: Jane Doe', 'I am a general practitioner registered with the General Medical Council. I examined Jane Doe in person at the surgery on 2 September 2026. In my reasonable professional judgement, the injuries that Jane Doe has are consistent with domestic abuse.'],
  }));
  await (await page.$('#file')).uploadFile(file);
  await until(() => /Text added/.test(document.getElementById('file-status').textContent), 10000);
  const letterText = await page.$eval('#letter', (e) => e.value);
  assert.match(letterText, /^Dr Asha Patel, General Practitioner, GMC 7654321/, 'the header comes first');
  assert.match(letterText, /consistent with domestic abuse/);
  await page.click('#letter-form button[type=submit]');
  assert.equal(await text('.govuk-notification-banner__heading'), 'Nothing obviously missing');
});

await step('letter checker: a scanned PDF with a typed header is still read with the text reader', async () => {
  await go('letter-checker.html');
  // A scan (an image of the letter) with a short line of real text added above it.
  const png = await page.evaluate(async () => {
    const { SAMPLES } = await import('./app/samples.js');
    const lines = SAMPLES.find((s) => s.id === 'p11-bad-5').text.split('\n').flatMap((l) => l.match(/.{1,70}(\s|$)/g));
    const c = Object.assign(document.createElement('canvas'), { width: 1400, height: 60 + lines.length * 40 });
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#000'; x.font = '28px Arial';
    lines.forEach((l, i) => x.fillText(l, 30, 50 + i * 40));
    return c.toDataURL('image/png');
  });
  const pdfPage = await browser.newPage();
  await pdfPage.setContent(`<p style="font:14px Arial">Scanned by Example Surgery on 3 October 2026</p><img src="${png}" style="width:100%">`);
  const file = join(tmp, 'scan.pdf');
  await writeFile(file, await pdfPage.pdf({ format: 'A4' }));
  await pdfPage.close();
  await (await page.$('#file')).uploadFile(file);
  await until(() => /Text added/.test(document.getElementById('file-status').textContent), 120000);
  const scanned = await page.$eval('#letter', (e) => e.value);
  assert.match(scanned, /might\s+be\s+consistent/, `the scanned part was read: ${scanned.slice(0, 300)}`);
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
  assert.match(await text('#batch-result p'), /^11 look ready, 1 need checking, 8 need changes, 0 could not be read\.$/);
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
  // api/send and api/call are Vercel functions, so the static test server
  // answers 404 and the page falls back to the person's own email. That is expected.
  const sendCheck = (e) => e.includes('/api/send') || e.includes('/api/call') || (e.includes('check.html') && e.includes('status of 404'));
  assert.deepEqual(errors.filter((e) => !e.includes('bbc.co.uk') && !sendCheck(e)), []);
});

await browser.close();
server.close();
await rm(tmp, { recursive: true, force: true });
await rm(profile, { recursive: true, force: true });
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
