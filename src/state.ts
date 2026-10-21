import type { TelescopeSetup } from './astro/optics';
import { BARLOWS, type Barlow, type Equipment, defaultEquipment, findTelescope, nearestEyepiece, opticalSetup } from './equipment';

export interface Place {
  /** Key of the place name in i18n.ts ("place.<id>"). */
  id: string;
  lat: number;
  lon: number;
}

/** Public places only. The first entry is the fallback default. */
export const PLACES: Place[] = [
  { id: 'greenwich', lat: 51.4769, lon: -0.0005 },
  { id: 'madrid', lat: 40.4168, lon: -3.7038 },
  { id: 'barcelona', lat: 41.3874, lon: 2.1686 },
  { id: 'lapalma', lat: 28.7543, lon: -17.8835 },
  { id: 'paris', lat: 48.8364, lon: 2.3364 },
  { id: 'newyork', lat: 40.7128, lon: -74.006 },
  { id: 'mexico', lat: 19.4326, lon: -99.1332 },
  { id: 'buenosaires', lat: -34.6037, lon: -58.3816 },
  { id: 'atacama', lat: -23.029, lon: -67.755 },
  { id: 'maunakea', lat: 19.8207, lon: -155.4681 },
  { id: 'tokyo', lat: 35.6762, lon: 139.6503 },
  { id: 'sydney', lat: -33.8688, lon: 151.2093 },
  { id: 'reykjavik', lat: 64.1466, lon: -21.9426 },
];

/**
 * A city for the browser's time zone, so the first view is roughly the user's own sky
 * without asking for their location. [city, latitude, longitude].
 */
const TIME_ZONES: Record<string, [string, number, number]> = {
  'Europe/Madrid': ['Madrid', 40.42, -3.7], 'Atlantic/Canary': ['Santa Cruz de Tenerife', 28.46, -16.25],
  'Europe/Lisbon': ['Lisboa', 38.72, -9.14], 'Europe/London': ['London', 51.51, -0.13], 'Europe/Dublin': ['Dublin', 53.35, -6.26],
  'Europe/Paris': ['Paris', 48.86, 2.35], 'Europe/Brussels': ['Bruxelles', 50.85, 4.35], 'Europe/Amsterdam': ['Amsterdam', 52.37, 4.9],
  'Europe/Berlin': ['Berlin', 52.52, 13.4], 'Europe/Zurich': ['Zürich', 47.38, 8.54], 'Europe/Rome': ['Roma', 41.9, 12.5],
  'Europe/Vienna': ['Wien', 48.21, 16.37], 'Europe/Prague': ['Praha', 50.08, 14.44], 'Europe/Warsaw': ['Warszawa', 52.23, 21.01],
  'Europe/Copenhagen': ['København', 55.68, 12.57], 'Europe/Stockholm': ['Stockholm', 59.33, 18.07], 'Europe/Oslo': ['Oslo', 59.91, 10.75],
  'Europe/Helsinki': ['Helsinki', 60.17, 24.94], 'Europe/Athens': ['Athína', 37.98, 23.73], 'Europe/Istanbul': ['İstanbul', 41.01, 28.98],
  'Europe/Moscow': ['Moskva', 55.76, 37.62], 'Europe/Andorra': ['Andorra la Vella', 42.51, 1.52],
  'America/New_York': ['New York', 40.71, -74.01], 'America/Chicago': ['Chicago', 41.88, -87.63], 'America/Denver': ['Denver', 39.74, -104.99],
  'America/Los_Angeles': ['Los Angeles', 34.05, -118.24], 'America/Toronto': ['Toronto', 43.65, -79.38], 'America/Vancouver': ['Vancouver', 49.28, -123.12],
  'America/Mexico_City': ['Ciudad de México', 19.43, -99.13], 'America/Bogota': ['Bogotá', 4.71, -74.07], 'America/Lima': ['Lima', -12.05, -77.04],
  'America/Santiago': ['Santiago', -33.45, -70.67], 'America/Argentina/Buenos_Aires': ['Buenos Aires', -34.6, -58.38],
  'America/Sao_Paulo': ['São Paulo', -23.55, -46.63], 'America/Caracas': ['Caracas', 10.48, -66.9], 'America/Montevideo': ['Montevideo', -34.9, -56.16],
  'Asia/Tokyo': ['Tokyo', 35.68, 139.65], 'Asia/Shanghai': ['Shanghai', 31.23, 121.47], 'Asia/Hong_Kong': ['Hong Kong', 22.32, 114.17],
  'Asia/Singapore': ['Singapore', 1.35, 103.82], 'Asia/Kolkata': ['Kolkata', 22.57, 88.36], 'Asia/Dubai': ['Dubai', 25.2, 55.27],
  'Asia/Seoul': ['Seoul', 37.57, 126.98], 'Australia/Sydney': ['Sydney', -33.87, 151.21], 'Australia/Melbourne': ['Melbourne', -37.81, 144.96],
  'Pacific/Auckland': ['Auckland', -36.85, 174.76], 'Africa/Johannesburg': ['Johannesburg', -26.2, 28.05], 'Africa/Cairo': ['Cairo', 30.04, 31.24],
};

export function timeZonePlace(): { city: string; lat: number; lon: number } | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hit = TIME_ZONES[tz];
    return hit ? { city: hit[0], lat: hit[1], lon: hit[2] } : null;
  } catch {
    return null;
  }
}

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

/**
 * How dark the observing site is. `limit`: naked-eye limiting magnitude at night;
 * `milkyWay`: how much of the Milky Way survives; `surface`: faintest visible surface
 * brightness of extended objects, mag/arcmin² (a dark site's sky is about 13.1).
 */
export const SKY_QUALITY: { label: string; limit: number; milkyWay: number; surface: number }[] = [
  { label: 'Dark site (Bortle 2)', limit: 6.6, milkyWay: 1, surface: 13.6 },
  { label: 'Rural (Bortle 4)', limit: 6.0, milkyWay: 0.6, surface: 12.9 },
  { label: 'Suburban (Bortle 6)', limit: 5.0, milkyWay: 0.15, surface: 11.9 },
  { label: 'City (Bortle 8)', limit: 4.0, milkyWay: 0, surface: 10.9 },
];

export interface AppState {
  time: number; // simulated time, ms since Unix epoch
  speedIndex: number;
  playing: boolean;
  lat: number;
  lon: number;
  /** A PLACES id, 'custom', 'mine' (geolocation) or 'approx' (from the time zone, see placeCity). */
  placeId: string;
  placeCity: string;
  /** View direction and vertical field of view, degrees. */
  az: number;
  alt: number;
  fov: number;
  /** Rotation of the view around its axis, radians (set while following the phone). */
  roll: number;
  showLines: boolean;
  showConstellationNames: boolean;
  showStarNames: boolean;
  showAtmosphere: boolean;
  showGround: boolean;
  showMilkyWay: boolean;
  showDeepSky: boolean;
  /** Index into SKY_QUALITY. */
  skyQuality: number;
  telescopeMode: boolean;
  /** Show the image as the eyepiece does: rotated by a Newtonian, mirrored by a star diagonal. */
  realOrientation: boolean;
  equipment: Equipment;
  /** Derived from `equipment` by syncTelescope(). */
  telescope: TelescopeSetup;
}

export function syncTelescope(state: AppState): void {
  state.telescope = opticalSetup(state.equipment);
}

export function defaultState(): AppState {
  const guess = timeZonePlace();
  return {
    time: Date.now(),
    speedIndex: 4,
    playing: true,
    lat: guess?.lat ?? PLACES[0].lat,
    lon: guess?.lon ?? PLACES[0].lon,
    placeId: guess ? 'approx' : PLACES[0].id,
    placeCity: guess?.city ?? '',
    az: 180,
    alt: 35,
    fov: 70,
    roll: 0,
    showLines: true,
    showConstellationNames: true,
    showStarNames: true,
    showAtmosphere: true,
    showGround: true,
    showMilkyWay: true,
    showDeepSky: true,
    skyQuality: 1,
    telescopeMode: false,
    realOrientation: false,
    equipment: defaultEquipment(),
    telescope: opticalSetup(defaultEquipment()),
  };
}

/**
 * Optional overrides from the query string, handy for sharing a view or for screenshots:
 * ?t=2026-10-03T20:00:00Z&lat=51.48&lon=0.00&az=180&alt=40&fov=60&scope=1&eye=25&paused=1
 * and the equipment: &model=skyliner-200p&barlow=2&sky=0 (index into SKY_QUALITY)
 * (main.ts also reads ?target=<planet|moon|sun|star|M31|NGC 5139...> and ?panel=0/1)
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
    state.placeId = PLACES.find((p) => p.lat === lat && p.lon === lon)?.id ?? 'custom';
  }
  state.az = num('az') ?? state.az;
  state.alt = Math.max(-10, Math.min(89.9, num('alt') ?? state.alt));
  state.fov = Math.max(1, Math.min(120, num('fov') ?? state.fov));
  const model = q.get('model');
  if (model && findTelescope(model)) state.equipment.telescopeId = model;
  const eye = num('eye');
  if (eye && eye > 0) state.equipment.eyepieceId = nearestEyepiece(eye).id;
  const barlow = num('barlow');
  if (barlow && (BARLOWS as readonly number[]).includes(barlow)) state.equipment.barlow = barlow as Barlow;
  const sky = num('sky');
  if (sky !== undefined && sky >= 0 && sky < SKY_QUALITY.length) state.skyQuality = Math.round(sky);
  if (q.get('milkyway') === '0') state.showMilkyWay = false;
  if (q.get('deepsky') === '0') state.showDeepSky = false;
  syncTelescope(state);
  if (q.get('scope') === '1') state.telescopeMode = true;
  if (q.get('paused') === '1') state.playing = false;
  if (q.get('lines') === '0') state.showLines = false;
  return state;
}
