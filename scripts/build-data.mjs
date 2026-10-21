// Builds the compact star and constellation data shipped in public/data/.
//
// Sources (downloaded into scripts/.cache/ on first run):
// - Yale Bright Star Catalogue, 5th rev. ed. (Hoffleit & Warren 1991), CDS V/50.
//   Public domain (US government / NASA ADC).
// - Constellation lines and label positions from d3-celestial by Olaf Frohn,
//   BSD 3-Clause license (lines follow the IAU constellation charts).
// - Deep-sky objects from OpenNGC by Mattia Verga (release v20260501),
//   CC BY-SA 4.0. The derived dso.json is shared under the same license.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { STAR_NAMES } from './star-names.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = path.join(root, 'scripts', '.cache');
const outDir = path.join(root, 'public', 'data');
fs.mkdirSync(cacheDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

const SOURCES = {
  bsc5: 'https://cdsarc.cds.unistra.fr/ftp/V/50/catalog.gz',
  lines: 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json',
  names: 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.json',
  ngc: 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/v20260501/database_files/NGC.csv',
  addendum: 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/v20260501/database_files/addendum.csv',
};

async function cached(key) {
  const file = path.join(cacheDir, path.basename(SOURCES[key]));
  if (!fs.existsSync(file)) {
    console.log(`Downloading ${SOURCES[key]}`);
    const res = await fetch(SOURCES[key]);
    if (!res.ok) throw new Error(`${res.status} for ${SOURCES[key]}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const buf = fs.readFileSync(file);
  return file.endsWith('.gz') ? zlib.gunzipSync(buf).toString('latin1') : buf.toString('utf8');
}

const GREEK = {
  Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ', Eta: 'η', The: 'θ', Iot: 'ι',
  Kap: 'κ', Lam: 'λ', Mu: 'μ', Nu: 'ν', Xi: 'ξ', Omi: 'ο', Pi: 'π', Rho: 'ρ', Sig: 'σ',
  Tau: 'τ', Ups: 'υ', Phi: 'φ', Chi: 'χ', Psi: 'ψ', Ome: 'ω',
};
const SUPERSCRIPT = { 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
const col = (line, from, to) => line.slice(from - 1, to).trim(); // 1-based, inclusive (CDS ReadMe)

// --- Stars --------------------------------------------------------------
const bsc = await cached('bsc5');
const stars = [];
const keys = new Map();
for (const line of bsc.split('\n')) {
  if (line.length < 110) continue;
  const raH = col(line, 76, 77);
  const vmag = col(line, 103, 107);
  if (!raH || !vmag) continue; // a few entries (novae, clusters) have no position
  const hr = Number(col(line, 1, 4));
  const ra = 15 * (Number(raH) + Number(col(line, 78, 79)) / 60 + Number(col(line, 80, 83)) / 3600);
  const sign = col(line, 84, 84) === '-' ? -1 : 1;
  const dec = sign * (Number(col(line, 85, 86)) + Number(col(line, 87, 88)) / 60 + Number(col(line, 89, 90)) / 3600);
  const bvText = col(line, 110, 114);
  const bv = bvText ? Number(bvText) : 0.6;
  const flam = col(line, 5, 7);
  const bayer = col(line, 8, 10);
  const sup = col(line, 11, 11);
  const con = col(line, 12, 14);
  let desig = '';
  if (bayer && GREEK[bayer]) desig = `${GREEK[bayer]}${SUPERSCRIPT[sup] ?? ''} ${con}`;
  else if (flam) desig = `${flam} ${con}`;
  const star = [round(ra, 4), round(dec, 4), Number(vmag), round(bv, 2), hr, desig, ''];
  stars.push(star);
  // Several catalogue entries can share a designation (double stars): keep the brightest.
  const setKey = (k) => {
    if (!keys.has(k) || keys.get(k)[2] > star[2]) keys.set(k, star);
  };
  if (bayer) setKey(`${bayer}${sup} ${con}`);
  if (bayer && sup) setKey(`${bayer} ${con}`); // fallback key without the superscript
  if (flam) setKey(`${flam} ${con}`);
}
const missing = [];
for (const [key, name] of Object.entries(STAR_NAMES)) {
  const star = keys.get(key) ?? keys.get(key.replace(/\d /, ' '));
  if (star) star[6] = name;
  else missing.push(key);
}
if (missing.length) console.warn('Star names not matched:', missing.join(', '));
stars.sort((a, b) => a[2] - b[2]);
fs.writeFileSync(
  path.join(outDir, 'stars.json'),
  JSON.stringify({
    source: 'Yale Bright Star Catalogue 5th ed. (public domain); names: IAU WGSN',
    fields: ['raJ2000deg', 'decJ2000deg', 'vmag', 'bv', 'hr', 'designation', 'name'],
    stars,
  }),
);
console.log(`stars.json: ${stars.length} stars, ${stars.filter((s) => s[6]).length} named`);

// --- Constellations -----------------------------------------------------
const lon2ra = (lon) => round((lon + 360) % 360, 4);
const lines = JSON.parse(await cached('lines'));
const names = JSON.parse(await cached('names'));
const nameById = new Map(names.features.map((f) => [f.id, f]));
const constellations = lines.features.map((f) => {
  const label = nameById.get(f.id);
  return {
    id: f.id,
    name: label?.properties.name ?? f.id,
    rank: Number(label?.properties.rank ?? 3),
    label: label ? [lon2ra(label.geometry.coordinates[0]), label.geometry.coordinates[1]] : null,
    lines: f.geometry.coordinates.map((poly) => poly.map(([lon, lat]) => [lon2ra(lon), round(lat, 4)])),
  };
});
fs.writeFileSync(
  path.join(outDir, 'constellations.json'),
  JSON.stringify({
    source: 'd3-celestial by Olaf Frohn (BSD 3-Clause), https://github.com/ofrohn/d3-celestial',
    constellations,
  }),
);
console.log(`constellations.json: ${constellations.length} figures`);

// --- Deep-sky objects -----------------------------------------------------
// The Messier catalogue plus classic showpieces it misses, mostly in the southern sky.
const EXTRA = {
  NGC0869: 'Double Cluster (h Persei)', NGC0884: 'Double Cluster (χ Persei)', NGC5139: 'Omega Centauri',
  NGC0104: '47 Tucanae', NGC3372: 'Carina Nebula', NGC0253: 'Sculptor Galaxy', NGC7293: 'Helix Nebula',
  NGC7000: 'North America Nebula', NGC6960: 'Western Veil Nebula', NGC6992: 'Eastern Veil Nebula',
  NGC2070: 'Tarantula Nebula', NGC6543: "Cat's Eye Nebula", NGC0457: 'Owl Cluster', NGC2392: 'Eskimo Nebula',
  NGC3242: "Ghost of Jupiter", NGC4565: 'Needle Galaxy', NGC5128: 'Centaurus A', NGC4755: 'Jewel Box',
  IC2602: 'Southern Pleiades', NGC6231: 'Northern Jewel Box', NGC2237: 'Rosette Nebula',
  NGC0292: 'Small Magellanic Cloud', 'ESO056-115': 'Large Magellanic Cloud',
};
// Popular names where OpenNGC has none or lists a less common one first.
const MESSIER_NAMES = {
  1: 'Crab Nebula', 11: 'Wild Duck Cluster', 13: 'Great Hercules Cluster', 17: 'Omega Nebula',
  24: 'Sagittarius Star Cloud', 31: 'Andromeda Galaxy', 33: 'Triangulum Galaxy', 40: 'Winnecke 4',
  42: 'Orion Nebula', 43: "De Mairan's Nebula", 44: 'Beehive Cluster', 45: 'Pleiades', 51: 'Whirlpool Galaxy',
  63: 'Sunflower Galaxy', 64: 'Black Eye Galaxy', 76: 'Little Dumbbell Nebula', 81: "Bode's Galaxy",
  82: 'Cigar Galaxy', 83: 'Southern Pinwheel Galaxy', 87: 'Virgo A', 101: 'Pinwheel Galaxy', 104: 'Sombrero Galaxy',
};
// Magnitudes missing in OpenNGC (usual visual values from observing guides).
const MAG_FIX = { 22: 5.1, 35: 5.3, 40: 8.4, 62: 6.5, 69: 7.6, 70: 7.9, 71: 8.2, 107: 7.9, 102: 9.9 };
const KIND = {
  G: 'galaxy', GPair: 'galaxy', GTrpl: 'galaxy', GGroup: 'galaxy', GCl: 'globular', OCl: 'open', '*Ass': 'open',
  'Cl+N': 'nebula', HII: 'nebula', EmN: 'nebula', Neb: 'nebula', RfN: 'nebula', SNR: 'nebula', PN: 'planetary',
  '**': 'double', Other: 'open',
};
const parseCsv = (text) => {
  const [head, ...rows] = text.trim().split('\n');
  const keys = head.split(';');
  return rows.map((r) => Object.fromEntries(r.split(';').map((v, i) => [keys[i], v])));
};
const sexa = (text, scale) => {
  const sign = text.trim().startsWith('-') ? -1 : 1;
  const [a, b, c] = text.replace(/^[+-]/, '').split(':').map(Number);
  return sign * scale * (a + b / 60 + c / 3600);
};
const ngcRows = [...parseCsv(await cached('ngc')), ...parseCsv(await cached('addendum'))];
const byName = new Map(ngcRows.map((r) => [r.Name, r]));
const dsoRows = [];
for (const r of ngcRows) {
  // OpenNGC keeps M102 as a duplicate entry (numbered 101); it is usually identified with NGC 5866.
  if (r.Name === 'M102') dsoRows.push({ r: byName.get('NGC5866'), messier: 102 });
  else if (r.M) dsoRows.push({ r, messier: Number(r.M) });
  else if (EXTRA[r.Name]) dsoRows.push({ r, messier: 0 });
}
const dso = dsoRows.map(({ r, messier }) => {
  const v = Number(r['V-Mag']), b = Number(r['B-Mag']);
  const kind = KIND[r.Type] ?? 'open';
  // Without V, galaxies are about 0.7 mag brighter in V than in B.
  let mag = r['V-Mag'] ? v : r['B-Mag'] ? b - (kind === 'galaxy' ? 0.7 : 0) : NaN;
  if (MAG_FIX[messier]) mag = MAG_FIX[messier];
  const common = (r['Common names'] || '').split(',')[0];
  const name = messier ? MESSIER_NAMES[messier] ?? common : EXTRA[r.Name];
  const major = Number(r.MajAx) || 1;
  const short = { 'ESO056-115': 'LMC', NGC0292: 'SMC' };
  const id = messier ? `M${messier}` : short[r.Name] ?? r.Name.replace(/^(NGC|IC)0*/, '$1 ');
  return [
    id, name || '', r.Name.replace(/^(NGC|IC)0*/, '$1 '), kind,
    round(sexa(r.RA, 15), 4), round(sexa(r.Dec, 1), 4),
    Number.isFinite(mag) ? round(mag, 1) : 9, round(major, 2), round(Number(r.MinAx) || major, 2), Number(r.PosAng) || 0,
  ];
});
dso.sort((a, b) => a[6] - b[6]);
fs.writeFileSync(
  path.join(outDir, 'dso.json'),
  JSON.stringify({
    source: 'OpenNGC by Mattia Verga, https://github.com/mattiaverga/OpenNGC (CC BY-SA 4.0); this file is shared under the same license',
    fields: ['id', 'name', 'catalogue', 'kind', 'raJ2000deg', 'decJ2000deg', 'vmag', 'majorArcmin', 'minorArcmin', 'positionAngleDeg'],
    dso,
  }),
);
console.log(`dso.json: ${dso.length} deep-sky objects`);
