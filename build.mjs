// Renders src/pages/*.html into src/layout.html and writes a static site to _site/.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync } from 'node:fs';
import { fetchOcrModels, CACHE } from './scripts/fetch-ocr-models.mjs';
import { OCR_MODEL } from './src/app/ocr-model.js';

const NAV = [
  ['index', 'index.html', 'Home'],
  ['check', 'check.html', 'Find evidence'],
  ['request', 'request.html', 'Request notes'],
  ['letter-checker', 'letter-checker.html', 'Check a letter'],
  ['chat', 'chat.html', 'Ask the helper'],
  ['track', 'track.html', 'Track progress'],
  ['professionals', 'write-letter.html', 'For professionals'],
];

// The menu is hidden while the site focuses on the find-a-solicitor flow.
// Set to true to show it again; every page is still built and linkable.
const SHOW_MENU = false;

const out = '_site';
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
cpSync('assets', `${out}/assets`, { recursive: true });
cpSync('src/app', `${out}/app`, { recursive: true });

// Text reader for photos (src/app/ocr.js): paddleocr.js, ONNX Runtime Web and
// the PP-OCRv6 models, all served from this site.
await fetchOcrModels([OCR_MODEL]);
const ocrDir = `${out}/assets/vendor`;
mkdirSync(`${ocrDir}/paddleocr`, { recursive: true });
mkdirSync(`${ocrDir}/onnxruntime`, { recursive: true });
cpSync('node_modules/paddleocr/dist/index.mjs', `${ocrDir}/paddleocr/paddleocr.mjs`);
cpSync(`${CACHE}/${OCR_MODEL}`, `${ocrDir}/paddleocr/${OCR_MODEL}`, { recursive: true });
for (const f of ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) cpSync(`node_modules/onnxruntime-web/dist/${f}`, `${ocrDir}/onnxruntime/${f}`);

const fullLayout = readFileSync('src/layout.html', 'utf8');
// Footer links marked data-menu-only go with the menu.
const layout = SHOW_MENU ? fullLayout : fullLayout.split('\n').filter((l) => !l.includes('data-menu-only')).join('\n');
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
    .replace('{{menu}}', SHOW_MENU ? `<nav aria-label="Menu" class="govuk-service-navigation__wrapper">
          <button type="button" class="govuk-service-navigation__toggle govuk-js-service-navigation-toggle" aria-controls="navigation" hidden>Menu</button>
          <ul class="govuk-service-navigation__list" id="navigation">
            ${nav}
          </ul>
        </nav>` : '')
    .replace('{{scripts}}', script ? `<script type="module" src="${script}"></script>` : '')
    .replace('{{content}}', src.replace(/<!-- \w+: .+? -->\n/g, ''));
  writeFileSync(`${out}/${file}`, html);
}
console.log(`Built ${readdirSync('src/pages').length} pages into ${out}/`);
