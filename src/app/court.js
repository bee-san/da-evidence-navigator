// Finds courts near a postcode area, or by name, and a court's contact
// details, through api/court.js (HMCTS Find a Court or Tribunal).
//
// Only the centre point of the first half of the postcode (from postcodes.io,
// via location.js) or the court name is sent – never the full postcode.

import { findPlace, outwardCode } from './location.js';

const api = async (query, fetchFn) => {
  const res = await fetchFn(`api/court?${query}`, { credentials: 'omit', signal: AbortSignal.timeout(15000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`court lookup returned ${res.status}`);
  return res.json();
};

// Returns { courts: [{ slug, name, types, distance }] } or { problem }.
// kind is 'family' (family and civil courts) or 'crime'.
export async function findCourts(search, kind = 'family', fetchFn = fetch) {
  const s = String(search || '').trim();
  if (!s) return { problem: 'Enter the first half of a postcode, like M1, or the name of the court.' };
  let query;
  if (outwardCode(s)) {
    const place = await findPlace(s, fetchFn);
    if (place.problem) return { problem: place.problem };
    query = `lat=${place.latitude}&lon=${place.longitude}&kind=${kind}`;
  } else {
    if (s.length < 3) return { problem: 'Enter at least 3 letters of the court’s name.' };
    query = `q=${encodeURIComponent(s)}&kind=${kind}`;
  }
  const r = await api(query, fetchFn);
  if (!r?.courts?.length) return { problem: 'We could not find a court for that. Try the town the court is in, or fill in its details below.' };
  return { courts: r.courts };
}

// Returns { name, email, emailFor, phone, address, url } or null.
export const courtDetails = (slug, kind = 'family', fetchFn = fetch) => api(`slug=${encodeURIComponent(slug)}&kind=${kind}`, fetchFn);
