// Finds someone's GP practice and how to contact it.
//
// Search uses the NHS Organisation Data Service (ODS), which only receives
// the first half of a postcode or the practice name typed in. Contact details
// come from api/gp.js (the NHS website), or the ODS phone number if that is
// not available, for example for practices in Wales.

import { getJson, outwardCode } from './location.js';

const ODS = 'https://directory.spineservices.nhs.uk/ORD/2-0-0/organisations';

// "ARDWICK MEDICAL PRACTICE" -> "Ardwick Medical Practice"
export const titleCase = (s) => String(s).toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase())
  .replace(/\b(Gp|Nhs|Dr|Drs)\b/g, (w) => ({ Gp: 'GP', Nhs: 'NHS', Dr: 'Dr', Drs: 'Drs' }[w]))
  .replace(/'S\b/g, "'s");

// Returns [{ code, name, postcode }] or { problem }.
export async function searchPractices(query, fetchFn = fetch) {
  const q = String(query || '').trim();
  if (q.length < 2) return { problem: 'Enter the first half of a postcode, like M13, or the name of the practice.' };
  const outcode = outwardCode(q);
  const params = new URLSearchParams({ NonPrimaryRoleId: 'RO76', Status: 'Active', Limit: '60' });
  if (outcode) params.set('PostCode', outcode); else params.set('Name', q);
  const data = await getJson(`${ODS}?${params}`, fetchFn);
  let list = (data?.Organisations || []).map((o) => ({ code: o.OrgId, name: titleCase(o.Name), postcode: o.PostCode }));
  // ODS matches the start of a postcode, so "OX1" also finds OX11. Keep the exact area.
  if (outcode) list = list.filter((p) => p.postcode.startsWith(`${outcode} `));
  if (!list.length) return { problem: outcode ? `We could not find a GP practice in ${outcode}. Try the practice name instead.` : `We could not find a GP practice called “${q}”. Try the first half of its postcode instead.` };
  return list.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 30);
}

// Returns { name, telephone, email, url } for a practice code.
export async function practiceContact(code, fetchFn = fetch) {
  try {
    const r = await fetchFn(`api/gp?code=${encodeURIComponent(code)}`, { credentials: 'omit' });
    if (r.ok) return await r.json();
  } catch { /* fall back to ODS below */ }
  const org = (await getJson(`${ODS}/${encodeURIComponent(code)}`, fetchFn))?.Organisation;
  const tel = org?.Contacts?.Contact?.find((c) => c.type === 'tel')?.value || '';
  return { name: titleCase(org?.Name || ''), telephone: tel, email: '', url: '' };
}
