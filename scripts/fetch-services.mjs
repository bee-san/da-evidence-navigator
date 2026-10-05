// Writes src/app/services.js: local domestic abuse services for each council
// area in England and Wales, with referral contact details, from the public
// Routes to Support directory (the Women's Aid directory).
//
// HACKATHON ONLY: routestosupport.org asks crawlers not to visit (robots.txt).
// This reads only the public search pages, slowly, for a prototype. A real
// service would need a data agreement with Women's Aid.
//
//   node scripts/fetch-services.mjs
import { writeFileSync } from 'node:fs';

const BASE = 'https://www.routestosupport.org';
const UA = 'Mozilla/5.0 (hackathon prototype; low-rate)';
const DELAY_MS = 1500;
const MAX_LOCAL_AREAS = 12; // services covering more areas than this are regional or national
// For a quick trial: AREAS=2 OUT=/tmp/services.js node scripts/fetch-services.mjs
const AREAS = Number(process.env.AREAS || Infinity);
const OUT = process.env.OUT || 'src/app/services.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#0?39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const text = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    if (res.ok) return res.text();
    if (res.status === 429 || res.status >= 500) { await sleep(10000 * (i + 1)); continue; }
    throw new Error(`${res.status} ${url}`);
  }
  throw new Error(`gave up on ${url}`);
}

// Council areas from the directory's own search form.
const form = await get(`${BASE}/services/iframe/`);
const select = form.slice(form.indexOf('name=local_authority'), form.indexOf('</select>', form.indexOf('name=local_authority')));
const areas = [...select.matchAll(/<option value=([EW]\d{8})>([^<]+)/g)]
  .map(([, code, label]) => ({ code, name: decode(label).replace(/ \((England|Wales)\)$/, '') }));
areas.splice(AREAS);
console.log(`${areas.length} council areas`);

// Rows of a results table: id, name, areas, types, who it is for.
function rows(html) {
  const table = html.slice(html.indexOf('<table'), html.lastIndexOf('</table>'));
  return table.split(/<tr[ >]/).slice(2).map((r) => {
    const id = (r.match(/data-service-id=([0-9a-f-]{36})/) || [])[1];
    const name = text((r.match(/<th[^>]*>([\s\S]*?)(?=<td)/) || [])[1] || '');
    const cells = r.split(/<td[^>]*>/).slice(1);
    // Several areas come as a list; a single area is plain text.
    const items = [...(cells[2] || '').matchAll(/<li>([^<]+)/g)].map((m) => decode(m[1]));
    const las = items.length ? items : [text(cells[2] || '')].filter(Boolean);
    return { id, name, las, types: text(cells[3] || ''), for: text(cells[4] || '') };
  }).filter((r) => r.id);
}

const byArea = {};
const local = new Map();
for (const [i, a] of areas.entries()) {
  const found = [];
  for (let page = 1; page < 20; page++) {
    const html = await get(`${BASE}/services/iframe/?active_tab=location&search_by=local-authority&local_authority=${a.code}${page > 1 ? `&page=${page}` : ''}`);
    found.push(...rows(html));
    await sleep(DELAY_MS);
    if (!new RegExp(`[?&]page=${page + 1}\\b`).test(html)) break;
  }
  const mine = found.filter((r) => r.las.length && r.las.length <= MAX_LOCAL_AREAS && !r.las.some((l) => /not applicable/i.test(l)));
  byArea[a.name] = mine.map((r) => r.id);
  for (const r of mine) local.set(r.id, r);
  if (i % 20 === 0) console.log(`${i + 1}/${areas.length} ${a.name}: ${mine.length} local services`);
}

// Contact details for each local service.
function details(html) {
  const t = decode(html);
  const after = (label) => {
    const i = t.indexOf(label);
    return i < 0 ? '' : text(t.slice(i + label.length, i + label.length + 400)).split(' ')[0];
  };
  const emails = [...new Set((t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).map((e) => e.toLowerCase()))];
  const phone = (text(t).match(/Phone:\s*([+\d][\d\s]{8,16}\d)/) || [])[1] || '';
  const website = (after('Website:').match(/^https?:\/\/\S+/) || [''])[0];
  const provider = (text(t).match(/Service provider\s+(.+?)\s+(Membership|Areas)\b/) || [])[1] || '';
  return { email: emails[0] || '', phone: phone.replace(/\s+/g, ' ').trim(), website, provider };
}

const services = {};
let n = 0;
for (const [id, r] of local) {
  try {
    const j = JSON.parse(await get(`${BASE}/services/api/iframe/modal/${id}/`));
    services[id] = { name: r.name, ...details(j.html || ''), types: [...new Set(r.types.split(/,\s*/).filter(Boolean))], for: r.for === '-' ? '' : r.for };
  } catch (e) {
    console.log(`skipped ${r.name}: ${e.message}`);
  }
  if (++n % 50 === 0) console.log(`${n}/${local.size} services`);
  await sleep(DELAY_MS);
}

for (const k of Object.keys(byArea)) byArea[k] = byArea[k].filter((id) => services[id]);
writeFileSync(OUT, `// Local domestic abuse services by council area, from the public Routes to
// Support directory (Women's Aid). Generated by scripts/fetch-services.mjs on
// ${new Date().toISOString().slice(0, 10)}. HACKATHON PROTOTYPE ONLY – a real service needs a
// data agreement with Women's Aid. Do not edit by hand.

export const SERVICES = ${JSON.stringify(services)};

export const SERVICES_BY_AREA = ${JSON.stringify(byArea)};
`);
console.log(`${Object.keys(services).length} services across ${Object.keys(byArea).length} areas written`);
