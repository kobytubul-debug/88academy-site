// Pulls 88ACADEMY's Google reviews (Places API, New) and merges them into reviews.json.
// New reviews are added; reviews already in the file are kept and updated.
// Needs the GOOGLE_PLACES_API_KEY secret. PLACE_ID is optional (found by name if empty).
import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.GOOGLE_PLACES_API_KEY;
let PLACE_ID = process.env.PLACE_ID || '';
const QUERY = process.env.PLACE_QUERY || '88ACADEMY';
const FILE = 'reviews.json';

if (!KEY) { console.log('GOOGLE_PLACES_API_KEY is not set yet. Skipping.'); process.exit(0); }

async function api(url, init) {
  const r = await fetch(url, init);
  const j = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j.error || j)}`);
  return j;
}

let old = { reviews: [] };
try { old = JSON.parse(await readFile(FILE, 'utf8')); } catch {}
if (!PLACE_ID) PLACE_ID = old.placeId || '';

if (!PLACE_ID) {
  const s = await api('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress' },
    body: JSON.stringify({ textQuery: QUERY, languageCode: 'iw', regionCode: 'IL' })
  });
  if (!s.places?.length) throw new Error(`No place found for "${QUERY}". Set PLACE_ID.`);
  PLACE_ID = s.places[0].id;
  console.log(`Using place: ${s.places[0].displayName?.text} (${s.places[0].formattedAddress}) id=${PLACE_ID}`);
}

const fields = 'rating,userRatingCount,googleMapsUri,reviews';
const p = await api(`https://places.googleapis.com/v1/places/${PLACE_ID}?languageCode=iw`, {
  headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': fields }
});

const byId = new Map((old.reviews || []).filter(r => !String(r.id).startsWith('fb-')).map(r => [r.id, r]));
let added = 0;
for (const r of p.reviews || []) {
  const text = r.originalText?.text || r.text?.text || '';
  if (!text) continue;
  const id = r.name || `${r.authorAttribution?.displayName}-${r.publishTime}`;
  if (!byId.has(id)) added++;
  byId.set(id, {
    id,
    author: r.authorAttribution?.displayName || '',
    photo: r.authorAttribution?.photoUri || '',
    profile: r.authorAttribution?.uri || '',
    rating: r.rating,
    time: r.publishTime,
    text
  });
}
const reviews = [...byId.values()].sort((a, b) => new Date(b.time) - new Date(a.time));

const out = {
  placeId: PLACE_ID,
  rating: p.rating ?? old.rating ?? 5,
  total: Math.max(p.userRatingCount || 0, reviews.length),
  url: p.googleMapsUri || old.url || '',
  writeUrl: `https://search.google.com/local/writereview?placeid=${PLACE_ID}`,
  reviews
};
const next = JSON.stringify(out, null, 2) + '\n';
const prev = JSON.stringify(old, null, 2) + '\n';
if (next === prev) { console.log('No changes.'); process.exit(0); }
await writeFile(FILE, next);
console.log(`Saved ${reviews.length} reviews (${added} new). Rating ${out.rating} from ${out.total}.`);
