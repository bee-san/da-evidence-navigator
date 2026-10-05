// Local domestic abuse services for a council area, from src/app/services.js
// (scraped from the Routes to Support directory for the hackathon).
//
// The directory lists services by county and unitary council, so a district
// such as Adur is looked up through its county, West Sussex.

import { SERVICES, SERVICES_BY_AREA } from './services.js';

// Which services fit each kind of evidence, by the directory's service types.
const FITS = {
  p14: (s) => s.types.includes('IDVA/DAPA service'),
  marac: (s) => s.types.includes('IDVA/DAPA service'),
  p15: (s) => s.types.includes('Independent Sexual Violence Advocate (ISVA)'),
  refugeStay: (s) => s.types.includes('Refuge'),
  p18: (s) => s.types.includes('Refuge'),
  p17: () => true,
};

export const hasServiceList = (key) => key in FITS;

const directoryName = (council) => council.parent?.name.replace(/ County Council$/, '');

// Returns [{ id, ...service }] for a council from location.js, best first:
// services with an email address (so the request can be filled in) come first.
export function servicesFor(council, key) {
  const ids = SERVICES_BY_AREA[council.area] || SERVICES_BY_AREA[directoryName(council)] || [];
  const fits = FITS[key] || (() => true);
  return ids.map((id) => ({ id, ...SERVICES[id] }))
    .filter((s) => fits(s))
    .sort((a, b) => Number(!!b.email) - Number(!!a.email) || a.name.localeCompare(b.name));
}
