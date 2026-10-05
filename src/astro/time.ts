import { norm360 } from './math';

/** Julian Date (UT) for a JavaScript Date. Unix epoch is JD 2440587.5. */
export function julianDate(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

export function dateFromJulian(jd: number): Date {
  return new Date((jd - 2440587.5) * 86400000);
}

/** Julian centuries since J2000.0. */
export function centuriesSinceJ2000(jd: number): number {
  return (jd - 2451545.0) / 36525;
}

/**
 * Approximate TT - UT (delta T) in seconds. A constant close to the 2020s value
 * is good enough here: the Moon moves about 0.5" per second.
 */
export const DELTA_T_SECONDS = 69;

export function ttFromUt(jdUt: number): number {
  return jdUt + DELTA_T_SECONDS / 86400;
}

/** Greenwich Mean Sidereal Time in degrees (Meeus, Astronomical Algorithms, eq. 12.4). */
export function gmstDeg(jdUt: number): number {
  const t = centuriesSinceJ2000(jdUt);
  return norm360(
    280.46061837 + 360.98564736629 * (jdUt - 2451545.0) + 0.000387933 * t * t - (t * t * t) / 38710000,
  );
}

/** Local Mean Sidereal Time in degrees; longitude positive east. */
export function lstDeg(jdUt: number, lonDeg: number): number {
  return norm360(gmstDeg(jdUt) + lonDeg);
}
