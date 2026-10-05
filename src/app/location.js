// Turns the first half of a postcode into a place: its council areas and
// centre point. Only the outward code (like "M1") is sent, to postcodes.io.
// Results are kept in memory for this visit only, so someone does not have
// to type it again on the next page. Nothing is saved.

import { COUNCILS } from './councils.js';

// "sw1a 1aa" -> "SW1A", "M1" -> "M1". Returns null if it does not look like a UK postcode.
export function outwardCode(postcode) {
  const s = String(postcode || '').toUpperCase().replace(/\s+/g, '');
  const full = s.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  if (full) return full[1];
  return /^[A-Z]{1,2}\d[A-Z\d]?$/.test(s) ? s : null;
}

export async function getJson(url, fetchFn = fetch) {
  const res = await fetchFn(url, { signal: AbortSignal.timeout(10000), referrerPolicy: 'no-referrer', credentials: 'omit' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return res.json();
}

const cache = new Map();
let remembered = null;

// The last place found on this visit, if any.
export const rememberedPlace = () => remembered;
export const forgetPlace = () => { remembered = null; cache.clear(); };

// Returns { outcode, latitude, longitude, councils: [...] } or { problem }.
export async function findPlace(postcode, fetchFn = fetch) {
  const outcode = outwardCode(postcode);
  if (!outcode) return { problem: 'Enter a postcode, like M1 1AE, or the first half of one, like M1.' };
  if (cache.has(outcode)) return (remembered = cache.get(outcode));
  const area = (await getJson(`https://api.postcodes.io/outcodes/${encodeURIComponent(outcode)}`, fetchFn))?.result;
  if (!area?.latitude) return { problem: `We could not find the postcode area ${outcode}. Check it and try again.` };
  const countries = area.country || [];
  if (countries.length && !countries.some((c) => c === 'England' || c === 'Wales')) {
    return { problem: `${outcode} is in ${countries.join(' and ')}, which has its own legal aid system. This service covers England and Wales.` };
  }
  const place = {
    outcode,
    latitude: area.latitude,
    longitude: area.longitude,
    councils: (area.admin_district || []).filter((d) => COUNCILS[d]).map((d) => ({ ...COUNCILS[d], area: d })),
  };
  cache.set(outcode, place);
  return (remembered = place);
}

// The council that runs social services and children's services: the county
// council for a district, otherwise the council itself.
export const socialServicesCouncil = (c) => (c.tier === 'district' && c.parent ? c.parent : c);
