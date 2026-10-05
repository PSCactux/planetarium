import { describe, expect, it } from 'vitest';
import { gmstDeg, julianDate, lstDeg } from '../src/astro/time';
import {
  equatorialToHorizontal,
  horizonVecToAltAz,
  j2000ToHorizonMatrix,
  precessRaDec,
  horizonMatrix,
} from '../src/astro/coords';
import { mulMatVec, sphericalToVec, vecToSpherical } from '../src/astro/math';
import { moonEcliptic, planetPosition, sunPosition } from '../src/astro/solarsystem';
import { nakedEyeLimitingMagnitude, telescopeStats } from '../src/astro/optics';

const hms = (h: number, m: number, s: number) => 15 * (h + m / 60 + s / 3600);
const dms = (d: number, m: number, s: number) => Math.sign(d || 1) * (Math.abs(d) + m / 60 + s / 3600);
/** Smallest difference between two angles in degrees. */
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('time', () => {
  it('computes Julian dates', () => {
    expect(julianDate(new Date(Date.UTC(2000, 0, 1, 12)))).toBeCloseTo(2451545.0, 6);
    // Meeus example 7.a: 1957 October 4.81 (Sputnik 1).
    expect(julianDate(new Date(Date.UTC(1957, 9, 4, 19, 26, 24)))).toBeCloseTo(2436116.31, 6);
  });

  it('computes Greenwich mean sidereal time (Meeus 12.a / 12.b)', () => {
    expect(gmstDeg(julianDate(new Date(Date.UTC(1987, 3, 10, 0, 0, 0))))).toBeCloseTo(hms(13, 10, 46.3668), 4);
    expect(gmstDeg(julianDate(new Date(Date.UTC(1987, 3, 10, 19, 21, 0))))).toBeCloseTo(hms(8, 34, 57.0896), 4);
  });
});

describe('coordinates', () => {
  // Meeus example 13.b: Venus seen from the US Naval Observatory, 1987 April 10, 19:21 UT.
  const lat = dms(38, 55, 17);
  const lon = -dms(77, 3, 56);
  const ra = hms(23, 9, 16.641);
  const dec = dms(-6, 43, 11.61);
  const lst = lstDeg(julianDate(new Date(Date.UTC(1987, 3, 10, 19, 21, 0))), lon);

  it('converts RA/Dec to Alt/Az (Meeus 13.b)', () => {
    const { alt, az } = equatorialToHorizontal(ra, dec, lat, lst);
    expect(alt).toBeCloseTo(15.1249, 2);
    // Meeus measures azimuth from the south; we measure from the north.
    expect(angDiff(az, 68.0337 + 180)).toBeLessThan(0.01);
  });

  it('matrix path agrees with spherical trigonometry', () => {
    const m = horizonMatrix(lat, lst);
    const fromMatrix = horizonVecToAltAz(mulMatVec(m, sphericalToVec(ra, dec)));
    const fromTrig = equatorialToHorizontal(ra, dec, lat, lst);
    expect(fromMatrix.alt).toBeCloseTo(fromTrig.alt, 9);
    expect(angDiff(fromMatrix.az, fromTrig.az)).toBeLessThan(1e-9);
    for (const [r, d, p, l] of [[10, 20, -33, 100], [250, -60, 64, 3], [359, 89, 0, 180]]) {
      const a = horizonVecToAltAz(mulMatVec(horizonMatrix(p, l), sphericalToVec(r, d)));
      const b = equatorialToHorizontal(r, d, p, l);
      expect(a.alt).toBeCloseTo(b.alt, 9);
      expect(angDiff(a.az, b.az)).toBeLessThan(1e-9);
    }
  });

  it('precesses J2000 coordinates (Meeus 21.b, theta Persei)', () => {
    const jd = 2462088.69; // 2028 November 13.19 TD
    const years = (jd - 2451545.0) / 365.25;
    // Apply the star's proper motion first so the result is comparable with Meeus.
    const ra0 = hms(2, 44, 11.986) + (0.03425 * years * 15) / 3600;
    const dec0 = dms(49, 13, 42.48) - (0.0895 * years) / 3600;
    const [ra1, dec1] = precessRaDec(ra0, dec0, jd);
    expect(angDiff(ra1, hms(2, 46, 11.331))).toBeLessThan(2e-4);
    expect(dec1).toBeCloseTo(dms(49, 20, 54.54), 3);
  });

  it('puts Polaris at an altitude close to the latitude (Greenwich)', () => {
    const jd = julianDate(new Date(Date.UTC(2026, 9, 3, 21, 0, 0)));
    const lat = 51.4769;
    const m = j2000ToHorizonMatrix(jd, lat, lstDeg(jd, -0.0005));
    const { alt } = horizonVecToAltAz(mulMatVec(m, sphericalToVec(37.9529, 89.2642)));
    expect(Math.abs(alt - lat)).toBeLessThan(0.8);
  });
});

describe('solar system', () => {
  it('places the Sun (Meeus 25.a, 1992 October 13.0 TD)', () => {
    const jd = 2448908.5;
    const [raJ, decJ] = vecToSpherical(sunPosition(jd).dirJ2000);
    const [ra, dec] = precessRaDec(raJ, decJ, jd);
    // Meeus gives apparent coordinates (with nutation and aberration, ~20"), so allow 0.02 deg.
    expect(angDiff(ra, hms(13, 13, 31.4))).toBeLessThan(0.02);
    expect(Math.abs(dec - dms(-7, 47, 6))).toBeLessThan(0.02);
    expect(sunPosition(jd).distanceAu).toBeCloseTo(0.99766, 3);
  });

  it('places the Moon (Meeus 47.a, 1992 April 12.0 TD)', () => {
    const [lon, lat, dist] = moonEcliptic(2448724.5);
    expect(angDiff(lon, 133.162655)).toBeLessThan(0.05);
    expect(Math.abs(lat - -3.229126)).toBeLessThan(0.05);
    expect(Math.abs(dist - 368409.7)).toBeLessThan(300);
  });

  it('places Venus (Meeus 33.a, 1992 December 20.0 TD)', () => {
    const jd = 2448976.5;
    const venus = planetPosition('venus', jd);
    const [raJ, decJ] = vecToSpherical(venus.dirJ2000);
    const [ra, dec] = precessRaDec(raJ, decJ, jd);
    expect(angDiff(ra, hms(21, 4, 41.454))).toBeLessThan(0.05);
    expect(Math.abs(dec - dms(-18, 53, 16.84))).toBeLessThan(0.05);
    expect(venus.distanceAu).toBeCloseTo(0.910845, 2);
    // Meeus 41.a finds -3.8 with the older Mueller formula; the Astronomical Almanac
    // formula used here gives about -4.2 for the same geometry.
    expect(venus.mag).toBeGreaterThan(-4.5);
    expect(venus.mag).toBeLessThan(-3.7);
  });
});

describe('optics', () => {
  it('computes the default 70/400 refractor with a 10 mm, 52 deg eyepiece', () => {
    const s = telescopeStats({ focalLength: 400, aperture: 70, eyepieceFocalLength: 10, apparentFov: 52 });
    expect(s.magnification).toBe(40);
    expect(s.trueFov).toBeCloseTo(1.3, 6);
    expect(s.exitPupil).toBeCloseTo(1.75, 6);
    expect(s.focalRatio).toBeCloseTo(5.714, 3);
    expect(s.maxUsefulMagnification).toBe(140);
    expect(s.limitingMagnitude).toBeCloseTo(11.93, 2);
    expect(s.dawesLimitArcsec).toBeCloseTo(1.657, 3);
  });

  it('dims the naked-eye limit as the Sun rises', () => {
    expect(nakedEyeLimitingMagnitude(-30)).toBe(6.5);
    expect(nakedEyeLimitingMagnitude(-9)).toBeCloseTo(4.5, 6);
    expect(nakedEyeLimitingMagnitude(30)).toBeLessThan(0);
  });
});
