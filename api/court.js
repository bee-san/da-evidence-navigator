// Vercel function: courts and their contact details, from HMCTS Find a Court
// or Tribunal (which does not allow calls from other websites' pages).
//
// Only the centre point of the first half of a postcode, or a court name, is
// sent here – never the person's own postcode or anything about them. Find a
// Court or Tribunal needs a full postcode, so we look up a postcode at that
// centre point (postcodes.io) and search with that. Nothing is logged or stored.
//
// GET /api/court?lat=53.48&lon=-2.24&kind=family -> { courts: [{ slug, name, types, distance }] }
// GET /api/court?q=manchester&kind=crime         -> { courts: [...] }
// GET /api/court?slug=manchester-magistrates-court&kind=crime -> { name, email, emailFor, phone, address, url }

const FACT = 'https://www.find-court-tribunal.service.gov.uk';
// Family and civil courts deal with protective orders, undertakings and
// findings of fact; criminal courts with restraining orders after a trial.
const AREA_OF_LAW = { family: 'Domestic violence', crime: 'Crime' };
const COURT_TYPES = { family: /Family|County/, crime: /Magistrates|Crown/ };
const MAX = 6;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': status === 200 ? 'public, max-age=86400' : 'no-store' },
});

async function getJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; legal aid evidence prototype)', accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.json();
}

export const summary = (c) => ({ slug: c.slug, name: c.name, types: c.types || [], distance: c.distance ?? null });

// The best address for asking for a copy of an order or judgment: family
// orders or enquiries for a family court, crime enquiries for a criminal one.
export function pickEmail(emails, kind) {
  // Court addresses only: some courts also list charities that support people at court.
  const list = (emails || []).filter((e) => /^[^\s@]+@justice\.gov\.uk$/i.test(e.address || ''));
  const text = (e) => `${e.description || ''} ${e.explanation || ''}`.toLowerCase();
  const wanted = kind === 'crime'
    ? [/crim|crime|magistrates|crown/, /enquir/]
    : [/family.*order|order.*family/, /family.*enquir|enquir.*family/, /family court|family/, /enquir|county court/];
  // Teams that do not deal with copies of orders or judgments.
  const avoid = /payment|bailiff|enforcement|breathing|transcript|listing|jury|single justice|probate|employment|business and property|attachment|social security|public law|adoption|court of protection|possession|administrative court|support through court/;
  for (const re of wanted) {
    const found = list.find((e) => re.test(text(e)) && !avoid.test(text(e)));
    if (found) return found;
  }
  return list.find((e) => !avoid.test(text(e))) || null;
}

export function courtContact(c, kind) {
  const email = pickEmail(c.emails, kind);
  const phone = (c.contacts || []).find((p) => /enquir/i.test(p.description)) || (c.contacts || [])[0];
  const address = (c.addresses || []).find((a) => /write/i.test(a.type || '')) || (c.addresses || [])[0];
  return {
    name: c.name,
    email: email?.address || '',
    emailFor: email ? [email.description, email.explanation].filter((x) => x && x !== 'null').join(' – ') : '',
    phone: phone?.number?.replace(/\s+/g, ' ').trim() || '',
    address: address ? [...String(address.address || '').split(/\r?\n/), address.town, address.postcode].map((x) => (x || '').trim()).filter(Boolean).join(', ') : '',
    url: `${FACT}/courts/${c.slug}`,
  };
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const kind = params.get('kind') === 'crime' ? 'crime' : 'family';
  try {
    const slug = params.get('slug');
    if (slug !== null) {
      if (!/^[a-z0-9-]{3,120}$/.test(slug)) return json({ error: 'bad slug' }, 400);
      const c = await getJson(`${FACT}/courts/${slug}.json`);
      return c?.name ? json(courtContact(c, kind)) : json({ error: 'not found' }, 404);
    }

    const q = (params.get('q') || '').trim();
    if (q) {
      if (q.length < 3 || q.length > 60 || /[^\p{L}\p{N} '’&().-]/u.test(q)) return json({ error: 'bad name' }, 400);
      const found = (await getJson(`${FACT}/search/results.json?q=${encodeURIComponent(q)}`)) || [];
      const courts = found.filter((c) => (c.types || []).some((t) => COURT_TYPES[kind].test(t)));
      return json({ courts: courts.slice(0, MAX).map(summary) });
    }

    const lat = Number(params.get('lat'));
    const lon = Number(params.get('lon'));
    // Roughly the UK, so this cannot be used to look up anywhere else.
    if (!(lat > 49 && lat < 61 && lon > -9 && lon < 3)) return json({ error: 'bad location' }, 400);
    const near = await getJson(`https://api.postcodes.io/postcodes?lon=${lon}&lat=${lat}&limit=1&widesearch=true`);
    const postcode = near?.result?.[0]?.postcode;
    if (!postcode) return json({ courts: [] });
    const found = (await getJson(`${FACT}/search/results.json?postcode=${encodeURIComponent(postcode)}&aol=${encodeURIComponent(AREA_OF_LAW[kind])}`)) || [];
    return json({ courts: (Array.isArray(found) ? found : []).slice(0, MAX).map(summary) });
  } catch {
    return json({ error: 'upstream' }, 502);
  }
}
