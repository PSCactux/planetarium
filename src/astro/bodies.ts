// Physical data of the Moon and planets: size, shape, orientation of the axis and rotation,
// and the positions of Jupiter's four big moons.
import { DEG, type Vec3, norm360, sphericalToVec } from './math';
import { type PlanetId, planetPosition } from './solarsystem';

export type BodyId = PlanetId | 'moon';

/**
 * IAU WGCCRE 2015 rotation elements at J2000 (secular and periodic terms dropped: the
 * pole moves by a fraction of a degree per century). Pole RA/Dec and prime meridian
 * W = w0 + wDot * days, all in degrees. Radii in km; flattening = 1 - polar/equatorial.
 */
const PHYSICAL: Record<BodyId, { ra: number; dec: number; w0: number; wDot: number; radius: number; flattening: number }> = {
  mercury: { ra: 281.0103, dec: 61.4155, w0: 329.5988, wDot: 6.1385108, radius: 2440.53, flattening: 0 },
  venus: { ra: 272.76, dec: 67.16, w0: 160.2, wDot: -1.4813688, radius: 6051.8, flattening: 0 },
  mars: { ra: 317.269202, dec: 54.432516, w0: 176.049863, wDot: 350.891982443297, radius: 3396.19, flattening: 0.00589 },
  jupiter: { ra: 268.056595, dec: 64.495303, w0: 284.95, wDot: 870.536, radius: 71492, flattening: 0.06487 },
  saturn: { ra: 40.589, dec: 83.537, w0: 38.9, wDot: 810.7939024, radius: 60268, flattening: 0.09796 },
  uranus: { ra: 257.311, dec: -15.175, w0: 203.81, wDot: -501.1600928, radius: 25559, flattening: 0.02293 },
  neptune: { ra: 299.36, dec: 43.46, w0: 249.978, wDot: 541.1397757, radius: 24764, flattening: 0.0171 },
  moon: { ra: 269.9949, dec: 66.5392, w0: 38.3213, wDot: 13.17635815, radius: 1737.4, flattening: 0 },
};

export function bodyRadiusKm(id: BodyId): number {
  return PHYSICAL[id].radius;
}

export function bodyFlattening(id: BodyId): number {
  return PHYSICAL[id].flattening;
}

/**
 * Body-fixed axes in the J2000 equatorial frame: `pole` (north pole), `prime` (towards
 * longitude 0 on the equator) and `east` (longitude 90° east), a right-handed set.
 */
export function bodyAxes(id: BodyId, jdTT: number): { pole: Vec3; prime: Vec3; east: Vec3 } {
  const p = PHYSICAL[id];
  const pole = sphericalToVec(p.ra, p.dec);
  // The body's equator crosses the Earth's equator (ascending) at RA = pole RA + 90°.
  const node: Vec3 = [-Math.sin(p.ra * DEG), Math.cos(p.ra * DEG), 0];
  const q = cross(pole, node);
  const w = norm360(p.w0 + p.wDot * (jdTT - 2451545.0)) * DEG;
  const prime: Vec3 = [
    node[0] * Math.cos(w) + q[0] * Math.sin(w),
    node[1] * Math.cos(w) + q[1] * Math.sin(w),
    node[2] * Math.cos(w) + q[2] * Math.sin(w),
  ];
  return { pole, prime, east: cross(pole, prime) };
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export interface GalileanMoon {
  name: 'Io' | 'Europa' | 'Ganymede' | 'Callisto';
  /** Apparent offset from Jupiter's centre in equatorial radii: +x west, +y north (Jupiter's own axes). */
  x: number;
  y: number;
  /** True when the moon is farther than Jupiter (hidden if it is also inside the disc). */
  behind: boolean;
  mag: number;
}

/**
 * Positions of Io, Europa, Ganymede and Callisto with the low-accuracy method of
 * Meeus, Astronomical Algorithms, ch. 44 (good to a few hundredths of a Jupiter radius).
 */
export function galileanMoons(jdTT: number): GalileanMoon[] {
  const d = jdTT - 2451545.0;
  const sin = (x: number) => Math.sin(x * DEG), cos = (x: number) => Math.cos(x * DEG);
  const V = 172.74 + 0.00111588 * d;
  const M = 357.529 + 0.9856003 * d;
  const N = 20.02 + 0.0830853 * d + 0.329 * sin(V);
  const J = 66.115 + 0.9025179 * d - 0.329 * sin(V);
  const A = 1.915 * sin(M) + 0.02 * sin(2 * M);
  const B = 5.555 * sin(N) + 0.168 * sin(2 * N);
  const K = J + A - B;
  const R = 1.00014 - 0.01671 * cos(M) - 0.00014 * cos(2 * M);
  const r = 5.20872 - 0.25208 * cos(N) - 0.00611 * cos(2 * N);
  const delta = Math.sqrt(r * r + R * R - 2 * r * R * cos(K));
  const psi = Math.asin((R / delta) * sin(K)) / DEG;
  const t = d - delta / 173;
  const base = psi - B;
  let u1 = 163.8069 + 203.4058646 * t + base;
  let u2 = 358.414 + 101.2916335 * t + base;
  let u3 = 5.7176 + 50.234518 * t + base;
  let u4 = 224.8092 + 21.48798 * t + base;
  const G = 331.18 + 50.310482 * t;
  const H = 87.45 + 21.569231 * t;
  const r1 = 5.9057 - 0.0244 * cos(2 * (u1 - u2));
  const r2 = 9.3966 - 0.0882 * cos(2 * (u2 - u3));
  const r3 = 14.9883 - 0.0216 * cos(G);
  const r4 = 26.3627 - 0.1939 * cos(H);
  u1 += 0.473 * sin(2 * (u1 - u2));
  u2 += 1.065 * sin(2 * (u2 - u3));
  u3 += 0.165 * sin(G);
  u4 += 0.843 * sin(H);
  // Jupiter-centric declination of the Earth, from Jupiter's pole and our line of sight. Meeus'
  // short formula for it is off by ~0.3°, which tilts the moons' apparent paths visibly.
  const pole = bodyAxes('jupiter', jdTT).pole;
  const los = planetPosition('jupiter', jdTT).dirJ2000;
  const De = -Math.asin(pole[0] * los[0] + pole[1] * los[1] + pole[2] * los[2]) / DEG;
  const moon = (name: GalileanMoon['name'], u: number, rr: number, mag: number): GalileanMoon => ({
    name, x: rr * sin(u), y: -rr * cos(u) * sin(De), behind: cos(u) < 0, mag,
  });
  return [moon('Io', u1, r1, 5.0), moon('Europa', u2, r2, 5.3), moon('Ganymede', u3, r3, 4.6), moon('Callisto', u4, r4, 5.7)];
}
