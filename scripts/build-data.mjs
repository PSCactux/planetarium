// Builds the compact star and constellation data shipped in public/data/.
//
// Sources (downloaded into scripts/.cache/ on first run):
// - Yale Bright Star Catalogue, 5th rev. ed. (Hoffleit & Warren 1991), CDS V/50.
//   Public domain (US government / NASA ADC).
// - Constellation lines and label positions from d3-celestial by Olaf Frohn,
//   BSD 3-Clause license (lines follow the IAU constellation charts).
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
