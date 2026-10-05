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

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
  if (!res.ok) throw new Error(`Could not load ${file}: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function loadCatalogues(): Promise<{ stars: Star[]; constellations: Constellation[] }> {
  const [s, c] = await Promise.all([
    getJson<{ stars: [number, number, number, number, number, string, string][] }>('stars.json'),
    getJson<{ constellations: Constellation[] }>('constellations.json'),
  ]);
  const stars = s.stars.map(([ra, dec, mag, bv, hr, designation, name]) => ({ ra, dec, mag, bv, hr, designation, name }));
  return { stars, constellations: c.constellations };
}
