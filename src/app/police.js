// Finds the police force for a postcode area, and how to contact it.
//
// Only the first half of the postcode (the outward code, like "M1" or
// "SW1A") leaves the device: postcodes.io turns it into the centre point of
// that area, and police.uk says which force covers that point. Areas near a
// force boundary can give the wrong force, so people can also choose it.

import { FORCES } from './police-forces.js';
import { findPlace, getJson, outwardCode } from './location.js';

export { FORCES, outwardCode };

// Force id for a place found by findPlace, or null.
export async function forceForPlace(place, fetchFn = fetch) {
  const where = await getJson(`https://data.police.uk/api/locate-neighbourhood?q=${place.latitude},${place.longitude}`, fetchFn);
  return FORCES[where?.force] ? where.force : null;
}

// Returns { id } for a force in England or Wales, or { problem } to show.
export async function findForce(postcode, fetchFn = fetch) {
  const place = await findPlace(postcode, fetchFn);
  if (place.problem) return { problem: place.problem.replace('Check it and try again.', 'Check it, or choose the police force instead.') };
  const id = await forceForPlace(place, fetchFn);
  if (!id) return { problem: 'We could not work out the police force for that area. Choose it from the list instead.' };
  return { id, outcode: place.outcode };
}
