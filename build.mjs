// Renders src/pages/*.html into src/layout.html and writes a static site to _site/.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync } from 'node:fs';

const NAV = [
  ['index', 'index.html', 'Home'],
  ['check', 'check.html', 'Find evidence'],
  ['request', 'request.html', 'Request notes'],
  ['letter-checker', 'letter-checker.html', 'Check a letter'],
  ['chat', 'chat.html', 'Ask the helper'],
  ['track', 'track.html', 'Track progress'],
  ['professionals', 'write-letter.html', 'For professionals'],
];

const out = '_site';
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
cpSync('assets', `${out}/assets`, { recursive: true });
cpSync('src/app', `${out}/app`, { recursive: true });

const layout = readFileSync('src/layout.html', 'utf8');
const meta = (src, key) => (src.match(new RegExp(`<!-- ${key}: (.+?) -->`)) || [])[1];

for (const file of readdirSync('src/pages')) {
  const src = readFileSync(`src/pages/${file}`, 'utf8');
  const current = meta(src, 'nav');
  const nav = NAV.map(([id, href, text]) => (id === current
    ? `<li class="govuk-service-navigation__item govuk-service-navigation__item--active"><a class="govuk-service-navigation__link" href="${href}" aria-current="page"><strong class="govuk-service-navigation__active-fallback">${text}</strong></a></li>`
    : `<li class="govuk-service-navigation__item"><a class="govuk-service-navigation__link" href="${href}">${text}</a></li>`)).join('\n            ');
  const script = meta(src, 'script');
  const html = layout
    .replace('{{lang}}', meta(src, 'lang') || 'en')
    .replace('{{title}}', meta(src, 'title'))
    .replace('{{nav}}', nav)
    .replace('{{scripts}}', script ? `<script type="module" src="${script}"></script>` : '')
    .replace('{{content}}', src.replace(/<!-- \w+: .+? -->\n/g, ''));
  writeFileSync(`${out}/${file}`, html);
}
console.log(`Built ${readdirSync('src/pages').length} pages into ${out}/`);
