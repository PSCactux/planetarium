import { DEG, RAD, type Vec3, mulMatVec, norm360, transpose } from './math';
import { eclipticToEquatorial, obliquityDeg, precessionMatrix } from './coords';
import { centuriesSinceJ2000 } from './time';

/**
 * Keplerian elements and their rates per Julian century, J2000 ecliptic and equinox.
 * Source: E. M. Standish, "Keplerian Elements for Approximate Positions of the Major
 * Planets", JPL Solar System Dynamics, Table 1 (valid 1800 AD - 2050 AD).
 * [a (au), e, I (deg), L (deg), longitude of perihelion (deg), longitude of node (deg)]
 */
type Elements = [number, number, number, number, number, number];
const ELEMENTS: Record<string, [Elements, Elements]> = {
  mercury: [
    [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  ],
  venus: [
    [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  ],
  earth: [
    [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  ],
  mars: [
    [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  ],
  jupiter: [
    [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  ],
  saturn: [
    [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  ],
  uranus: [
    [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  ],
  neptune: [
    [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
  ],
};

export type PlanetId = 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';
export const PLANETS: { id: PlanetId; name: string; color: [number, number, number] }[] = [
  { id: 'mercury', name: 'Mercury', color: [0.85, 0.8, 0.75] },
  { id: 'venus', name: 'Venus', color: [1.0, 0.97, 0.85] },
  { id: 'mars', name: 'Mars', color: [1.0, 0.55, 0.35] },
  { id: 'jupiter', name: 'Jupiter', color: [1.0, 0.92, 0.8] },
  { id: 'saturn', name: 'Saturn', color: [1.0, 0.9, 0.65] },
  { id: 'uranus', name: 'Uranus', color: [0.7, 0.9, 1.0] },
  { id: 'neptune', name: 'Neptune', color: [0.55, 0.7, 1.0] },
];

/** Solves Kepler's equation M = E - e sin E (radians) by Newton iteration. */
export function solveKepler(meanAnomaly: number, e: number): number {
  let E = meanAnomaly + e * Math.sin(meanAnomaly);
  for (let i = 0; i < 10; i++) {
    const dE = (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

/** Heliocentric ecliptic J2000 position (au) of a body from the JPL table. */
export function heliocentricEcliptic(id: PlanetId | 'earth', jdTT: number): Vec3 {
  const t = centuriesSinceJ2000(jdTT);
  const [el, rate] = ELEMENTS[id];
  const [a, e, inc, L, peri, node] = el.map((x, i) => x + rate[i] * t);
  const w = (peri - node) * DEG; // argument of perihelion
  const M = norm360(L - peri) * DEG;
  const E = solveKepler(M > Math.PI ? M - 2 * Math.PI : M, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w);
  const cO = Math.cos(node * DEG), sO = Math.sin(node * DEG);
  const cI = Math.cos(inc * DEG), sI = Math.sin(inc * DEG);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}

export interface BodyPosition {
  /** Geocentric J2000 equatorial unit vector. */
  dirJ2000: Vec3;
  /** Distance from Earth in au (Moon: also in au). */
  distanceAu: number;
  /** Visual magnitude estimate. */
  mag: number;
  /** Phase angle Sun-body-Earth in degrees. */
  phaseAngle: number;
  /** Illuminated fraction of the disk, 0..1. */
  illuminated: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const LIGHT_DAYS_PER_AU = 0.0057755183;

/** Planet magnitude formulas from Meeus, Astronomical Algorithms, ch. 41 (r, delta in au; i in deg). */
function planetMagnitude(id: PlanetId, r: number, delta: number, i: number): number {
  const base = 5 * Math.log10(r * delta);
  switch (id) {
    case 'mercury': return -0.42 + base + 0.038 * i - 0.000273 * i * i + 2e-6 * i * i * i;
    case 'venus': return -4.4 + base + 0.0009 * i + 0.000239 * i * i - 6.5e-7 * i * i * i;
    case 'mars': return -1.52 + base + 0.016 * i;
    case 'jupiter': return -9.4 + base + 0.005 * i;
    case 'saturn': return -8.88 + base; // ignores the rings
    case 'uranus': return -7.19 + base;
    case 'neptune': return -6.87 + base;
  }
}

/** Geocentric position of a planet, corrected for light time. */
export function planetPosition(id: PlanetId, jdTT: number): BodyPosition {
  const earth = heliocentricEcliptic('earth', jdTT);
  let helio = heliocentricEcliptic(id, jdTT);
  let geo = sub(helio, earth);
  // One light-time iteration is plenty for this accuracy.
  helio = heliocentricEcliptic(id, jdTT - len(geo) * LIGHT_DAYS_PER_AU);
  geo = sub(helio, earth);
  const r = len(helio), delta = len(geo), R = len(earth);
  const cosI = (r * r + delta * delta - R * R) / (2 * r * delta);
  const i = Math.acos(Math.max(-1, Math.min(1, cosI))) * RAD;
  return {
    dirJ2000: scale(eclipticToEquatorial(geo), 1 / delta),
    distanceAu: delta,
    mag: planetMagnitude(id, r, delta, i),
    phaseAngle: i,
    illuminated: (1 + cosI) / 2,
  };
}

/** Geocentric position of the Sun (the Earth-Moon barycentre orbit, mirrored). */
export function sunPosition(jdTT: number): BodyPosition {
  const earth = heliocentricEcliptic('earth', jdTT);
  const d = len(earth);
  return { dirJ2000: scale(eclipticToEquatorial(earth), -1 / d), distanceAu: d, mag: -26.74, phaseAngle: 0, illuminated: 1 };
}

const AU_KM = 149597870.7;
export const EARTH_RADIUS_KM = 6378.14;
export const MOON_RADIUS_KM = 1737.4;
export const SUN_RADIUS_KM = 695700;

/**
 * Geocentric ecliptic coordinates of the Moon of date: the largest periodic terms of
 * Meeus, Astronomical Algorithms, ch. 47 (accuracy a few arcminutes).
 * Returns [longitude deg, latitude deg, distance km].
 */
export function moonEcliptic(jdTT: number): [number, number, number] {
  const t = centuriesSinceJ2000(jdTT);
  const Lp = 218.3164477 + 481267.88123421 * t;
  const D = (297.8501921 + 445267.1114034 * t) * DEG;
  const M = (357.5291092 + 35999.0502909 * t) * DEG;
  const Mp = (134.9633964 + 477198.8675055 * t) * DEG;
  const F = (93.272095 + 483202.0175233 * t) * DEG;
  const s = Math.sin, c = Math.cos;
  const l =
    6288774 * s(Mp) + 1274027 * s(2 * D - Mp) + 658314 * s(2 * D) + 213618 * s(2 * Mp) - 185116 * s(M) -
    114332 * s(2 * F) + 58793 * s(2 * D - 2 * Mp) + 57066 * s(2 * D - M - Mp) + 53322 * s(2 * D + Mp) +
    45758 * s(2 * D - M) - 40923 * s(M - Mp) - 34720 * s(D) - 30383 * s(M + Mp) + 15327 * s(2 * D - 2 * F) -
    12528 * s(Mp + 2 * F) + 10980 * s(Mp - 2 * F) + 10675 * s(4 * D - Mp) + 10034 * s(3 * Mp) +
    8548 * s(4 * D - 2 * Mp) - 7888 * s(2 * D + M - Mp) - 6766 * s(2 * D + M) - 5163 * s(D - Mp) +
    4987 * s(D + M) + 4036 * s(2 * D - M + Mp);
  const r =
    -20905355 * c(Mp) - 3699111 * c(2 * D - Mp) - 2955968 * c(2 * D) - 569925 * c(2 * Mp) + 48888 * c(M) -
    3149 * c(2 * F) + 246158 * c(2 * D - 2 * Mp) - 152138 * c(2 * D - M - Mp) - 170733 * c(2 * D + Mp) -
    204586 * c(2 * D - M) - 129620 * c(M - Mp) + 108743 * c(D) + 104755 * c(M + Mp) + 10321 * c(2 * D - 2 * F) +
    79661 * c(Mp - 2 * F) - 34782 * c(4 * D - Mp) - 23210 * c(3 * Mp) - 21636 * c(4 * D - 2 * Mp) +
    24208 * c(2 * D + M - Mp) + 30824 * c(2 * D + M) - 8379 * c(D - Mp) - 16675 * c(D + M) - 12831 * c(2 * D - M + Mp);
  const b =
    5128122 * s(F) + 280602 * s(Mp + F) + 277693 * s(Mp - F) + 173237 * s(2 * D - F) + 55413 * s(2 * D - Mp + F) +
    46271 * s(2 * D - Mp - F) + 32573 * s(2 * D + F) + 17198 * s(2 * Mp + F) + 9266 * s(2 * D + Mp - F) +
    8822 * s(2 * Mp - F) + 8216 * s(2 * D - M - F) + 4324 * s(2 * D - 2 * Mp - F) + 4200 * s(2 * D + Mp + F);
  return [norm360(Lp + l / 1e6), b / 1e6, 385000.56 + r / 1000];
}

/**
 * Topocentric Moon position. `observerEqOfDate` is the observer's geocentric position in
 * km, in the equatorial frame of date (the parallax of the Moon reaches ~1 degree).
 */
export function moonPosition(jdTT: number, observerEqOfDate: Vec3 = [0, 0, 0]): BodyPosition {
  const [lon, lat, distKm] = moonEcliptic(jdTT);
  const cl = Math.cos(lat * DEG);
  const ecl: Vec3 = [cl * Math.cos(lon * DEG) * distKm, cl * Math.sin(lon * DEG) * distKm, Math.sin(lat * DEG) * distKm];
  const eqDate = sub(eclipticToEquatorial(ecl, obliquityDeg(jdTT)), observerEqOfDate);
  const topoKm = len(eqDate);
  // Back to J2000 so the Moon lives in the same frame as the stars.
  const dirJ2000 = mulMatVec(transpose(precessionMatrix(jdTT)), scale(eqDate, 1 / topoKm));
  const sun = sunPosition(jdTT);
  const sunGeo = scale(sun.dirJ2000, sun.distanceAu * AU_KM);
  const moonGeo = scale(dirJ2000, topoKm);
  const toSun = sub(sunGeo, moonGeo);
  const cosI = -(moonGeo[0] * toSun[0] + moonGeo[1] * toSun[1] + moonGeo[2] * toSun[2]) / (len(moonGeo) * len(toSun));
  const i = Math.acos(Math.max(-1, Math.min(1, cosI))) * RAD;
  return {
    dirJ2000,
    distanceAu: topoKm / AU_KM,
    mag: -12.73 + 0.026 * i + 4e-9 * i ** 4,
    phaseAngle: i,
    illuminated: (1 + cosI) / 2,
  };
}

/** Observer's geocentric position (km) in the equatorial frame of date, spherical Earth. */
export function observerPosition(latDeg: number, lstDegrees: number): Vec3 {
  const cl = Math.cos(latDeg * DEG);
  return [
    EARTH_RADIUS_KM * cl * Math.cos(lstDegrees * DEG),
    EARTH_RADIUS_KM * cl * Math.sin(lstDegrees * DEG),
    EARTH_RADIUS_KM * Math.sin(latDeg * DEG),
  ];
}

/** Angular radius in degrees of a sphere of `radiusKm` seen from `distanceAu`. */
export function angularRadiusDeg(radiusKm: number, distanceAu: number): number {
  return Math.asin(radiusKm / (distanceAu * AU_KM)) * RAD;
}

export type MoonPhase = 'new' | 'full' | 'firstQuarter' | 'lastQuarter' | 'waxingCrescent' | 'waningCrescent' | 'waxingGibbous' | 'waningGibbous';

/** Lunar phase from the illuminated fraction and whether it is growing. */
export function moonPhase(illuminated: number, waxing: boolean): MoonPhase {
  if (illuminated < 0.03) return 'new';
  if (illuminated > 0.97) return 'full';
  if (Math.abs(illuminated - 0.5) < 0.05) return waxing ? 'firstQuarter' : 'lastQuarter';
  if (illuminated < 0.5) return waxing ? 'waxingCrescent' : 'waningCrescent';
  return waxing ? 'waxingGibbous' : 'waningGibbous';
}
