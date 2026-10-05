import { DEG, RAD, type Mat3, type Vec3, mulMat, mulMatVec, norm360, rotZ, sphericalToVec } from './math';
import { centuriesSinceJ2000 } from './time';

/** Mean obliquity of the ecliptic in degrees (Meeus 22.2, truncated). */
export function obliquityDeg(jdTT: number): number {
  const t = centuriesSinceJ2000(jdTT);
  return 23.4392911 - 0.0130042 * t - 1.64e-7 * t * t + 5.036e-7 * t * t * t;
}

export const OBLIQUITY_J2000 = 23.4392911;

/** Rotates an ecliptic vector into the equatorial frame with the given obliquity. */
export function eclipticToEquatorial(v: Vec3, obliquity = OBLIQUITY_J2000): Vec3 {
  const c = Math.cos(obliquity * DEG), s = Math.sin(obliquity * DEG);
  return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]];
}

/**
 * Precession matrix from the J2000.0 mean equator/equinox to the mean equator/equinox
 * of `jdTT` (IAU 1976 angles zeta, z, theta; Meeus 21.2). Multiply a J2000 unit vector by it.
 */
export function precessionMatrix(jdTT: number): Mat3 {
  const t = centuriesSinceJ2000(jdTT);
  const arcsec = DEG / 3600;
  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t * t * t) * arcsec;
  const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t * t * t) * arcsec;
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t * t * t) * arcsec;
  const cz = Math.cos(zeta), sz = Math.sin(zeta);
  const cZ = Math.cos(z), sZ = Math.sin(z);
  const ct = Math.cos(theta), st = Math.sin(theta);
  return [
    cz * cZ * ct - sz * sZ, -sz * cZ * ct - cz * sZ, -st * cZ,
    cz * sZ * ct + sz * cZ, -sz * sZ * ct + cz * cZ, -st * sZ,
    cz * st, -sz * st, ct,
  ];
}

/**
 * Matrix taking an equatorial vector (of date) to the local horizon frame used by the
 * renderer (three.js convention): x = east, y = up (zenith), z = south.
 * Built as  [E; Z; -N] * Rz(-LST).
 */
export function horizonMatrix(latDeg: number, lstDegrees: number): Mat3 {
  const sp = Math.sin(latDeg * DEG), cp = Math.cos(latDeg * DEG);
  const frame: Mat3 = [
    0, 1, 0, // east
    cp, 0, sp, // zenith
    sp, 0, -cp, // south (= -north)
  ];
  return mulMat(frame, rotZ(-lstDegrees));
}

/** Full J2000 equatorial -> local horizon matrix (precession + Earth rotation + latitude). */
export function j2000ToHorizonMatrix(jdTT: number, latDeg: number, lstDegrees: number): Mat3 {
  return mulMat(horizonMatrix(latDeg, lstDegrees), precessionMatrix(jdTT));
}

export interface AltAz {
  /** Altitude above the horizon, degrees. */
  alt: number;
  /** Azimuth measured from north through east, degrees in [0, 360). */
  az: number;
}

/** Converts a vector in the renderer's horizon frame to altitude/azimuth. */
export function horizonVecToAltAz(v: Vec3): AltAz {
  const r = Math.hypot(v[0], v[1], v[2]);
  return { alt: Math.asin(v[1] / r) * RAD, az: norm360(Math.atan2(v[0], -v[2]) * RAD) };
}

/** Inverse of horizonVecToAltAz (unit vector). */
export function altAzToHorizonVec(altDeg: number, azDeg: number): Vec3 {
  const ca = Math.cos(altDeg * DEG);
  return [ca * Math.sin(azDeg * DEG), Math.sin(altDeg * DEG), -ca * Math.cos(azDeg * DEG)];
}

/**
 * Classic spherical-trig RA/Dec (of date) to Alt/Az. Independent from the matrix path
 * above; the tests check that both agree.
 */
export function equatorialToHorizontal(raDeg: number, decDeg: number, latDeg: number, lstDegrees: number): AltAz {
  const h = (lstDegrees - raDeg) * DEG;
  const d = decDeg * DEG, p = latDeg * DEG;
  const sinAlt = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(h);
  const alt = Math.asin(sinAlt);
  // Azimuth from north through east.
  const y = -Math.cos(d) * Math.sin(h);
  const x = Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(h);
  return { alt: alt * RAD, az: norm360(Math.atan2(y, x) * RAD) };
}

/** Precesses J2000 RA/Dec (degrees) to the mean equinox of date. */
export function precessRaDec(raDeg: number, decDeg: number, jdTT: number): [number, number] {
  const v = sphericalToVec(raDeg, decDeg);
  const p = mulMatVec(precessionMatrix(jdTT), v);
  const ra = norm360(Math.atan2(p[1], p[0]) * RAD);
  return [ra, Math.asin(p[2]) * RAD];
}
