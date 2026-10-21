// Loads the preprocessed catalogues from public/data (see scripts/build-data.mjs).

export interface Star {
  ra: number; // J2000, degrees
  dec: number; // J2000, degrees
  mag: number; // visual magnitude
  bv: number; // B-V colour index
  hr: number; // Bright Star Catalogue number
  designation: string; // Bayer or Flamsteed, e.g. "α Ori"
  name: string; // IAU proper name, if any
}

export interface Constellation {
  id: string;
  name: string;
  rank: number;
  label: [number, number] | null; // RA, Dec (J2000, degrees)
  lines: [number, number][][]; // polylines of [RA, Dec]
}

export type DsoKind = 'galaxy' | 'globular' | 'open' | 'nebula' | 'planetary' | 'double';

/** A deep-sky object from OpenNGC (see scripts/build-data.mjs). */
export interface Dso {
  id: string; // "M31", "NGC 5139", "LMC"
  name: string; // common name, may be empty
  catalogue: string; // NGC/IC designation
  kind: DsoKind;
  ra: number; // J2000, degrees
  dec: number;
  mag: number; // visual magnitude
  major: number; // arcmin
  minor: number; // arcmin
  pa: number; // position angle, degrees north through east
}

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
  if (!res.ok) throw new Error(`Could not load ${file}: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function loadCatalogues(): Promise<{ stars: Star[]; constellations: Constellation[]; dso: Dso[] }> {
  const [s, c, d] = await Promise.all([
    getJson<{ stars: [number, number, number, number, number, string, string][] }>('stars.json'),
    getJson<{ constellations: Constellation[] }>('constellations.json'),
    getJson<{ dso: [string, string, string, DsoKind, number, number, number, number, number, number][] }>('dso.json'),
  ]);
  const stars = s.stars.map(([ra, dec, mag, bv, hr, designation, name]) => ({ ra, dec, mag, bv, hr, designation, name }));
  const dso = d.dso.map(([id, name, catalogue, kind, ra, dec, mag, major, minor, pa]) => ({ id, name, catalogue, kind, ra, dec, mag, major, minor, pa }));
  return { stars, constellations: c.constellations, dso };
}
