import type { TelescopeSetup } from './astro/optics';

export interface Place {
  name: string;
  lat: number;
  lon: number;
}

/** Public places only. The first entry is the default. */
export const PLACES: Place[] = [
  { name: 'Greenwich Observatory', lat: 51.4769, lon: -0.0005 },
  { name: 'Paris Observatory', lat: 48.8364, lon: 2.3364 },
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
  { name: 'New York', lat: 40.7128, lon: -74.006 },
  { name: 'Mauna Kea', lat: 19.8207, lon: -155.4681 },
  { name: 'Atacama (ALMA)', lat: -23.029, lon: -67.755 },
  { name: 'Sydney', lat: -33.8688, lon: 151.2093 },
  { name: 'Reykjavík', lat: 64.1466, lon: -21.9426 },
];

export const SPEEDS: { label: string; rate: number }[] = [
  { label: '−1 day/s', rate: -86400 },
  { label: '−1 h/s', rate: -3600 },
  { label: '−10 min/s', rate: -600 },
  { label: '−1 min/s', rate: -60 },
  { label: 'Real time', rate: 1 },
  { label: '1 min/s', rate: 60 },
  { label: '10 min/s', rate: 600 },
  { label: '1 h/s', rate: 3600 },
  { label: '1 day/s', rate: 86400 },
];

export const EYEPIECE_PRESETS = [25, 10, 6];

export interface AppState {
  time: number; // simulated time, ms since Unix epoch
  speedIndex: number;
  playing: boolean;
  lat: number;
  lon: number;
  placeName: string;
  /** View direction and vertical field of view, degrees. */
  az: number;
  alt: number;
  fov: number;
  showLines: boolean;
  showConstellationNames: boolean;
  showStarNames: boolean;
  showAtmosphere: boolean;
  showGround: boolean;
  telescopeMode: boolean;
  invertImage: boolean;
  telescope: TelescopeSetup;
}

export function defaultState(): AppState {
  return {
    time: Date.now(),
    speedIndex: 4,
    playing: true,
    lat: PLACES[0].lat,
    lon: PLACES[0].lon,
    placeName: PLACES[0].name,
    az: 180,
    alt: 35,
    fov: 70,
    showLines: true,
    showConstellationNames: true,
    showStarNames: true,
    showAtmosphere: true,
    showGround: true,
    telescopeMode: false,
    invertImage: false,
    telescope: { focalLength: 400, aperture: 70, eyepieceFocalLength: 10, apparentFov: 52 },
  };
}

/**
 * Optional overrides from the query string, handy for sharing a view or for screenshots:
 * ?t=2026-10-03T20:00:00Z&lat=51.48&lon=0.00&az=180&alt=40&fov=60&scope=1&eye=25&paused=1
 * (main.ts also reads ?target=<planet|moon|sun|star name> and ?panel=0)
 */
export function applyQuery(state: AppState, search: string): AppState {
  const q = new URLSearchParams(search);
  const num = (k: string) => {
    const v = q.get(k);
    return v !== null && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined;
  };
  const t = q.get('t');
  if (t && !Number.isNaN(Date.parse(t))) state.time = Date.parse(t);
  const lat = num('lat'), lon = num('lon');
  if (lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    state.lat = lat;
    state.lon = lon;
    state.placeName = PLACES.find((p) => p.lat === lat && p.lon === lon)?.name ?? 'Custom';
  }
  state.az = num('az') ?? state.az;
  state.alt = Math.max(-10, Math.min(89.9, num('alt') ?? state.alt));
  state.fov = Math.max(1, Math.min(120, num('fov') ?? state.fov));
  const eye = num('eye');
  if (eye && eye > 0) state.telescope.eyepieceFocalLength = eye;
  if (q.get('scope') === '1') state.telescopeMode = true;
  if (q.get('paused') === '1') state.playing = false;
  if (q.get('lines') === '0') state.showLines = false;
  return state;
}
