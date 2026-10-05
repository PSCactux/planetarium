// Visual telescope formulas. Lengths in millimetres, angles in degrees.

export interface TelescopeSetup {
  focalLength: number;
  aperture: number;
  eyepieceFocalLength: number;
  apparentFov: number;
}

export interface TelescopeStats {
  magnification: number;
  trueFov: number;
  exitPupil: number;
  focalRatio: number;
  maxUsefulMagnification: number;
  minUsefulMagnification: number;
  limitingMagnitude: number;
  dawesLimitArcsec: number;
  lightGrasp: number;
}

/** Fully dark-adapted human pupil, mm. */
export const EYE_PUPIL_MM = 7;

export function telescopeStats(s: TelescopeSetup): TelescopeStats {
  const magnification = s.focalLength / s.eyepieceFocalLength;
  return {
    magnification,
    // Simple approximation; exact for a field stop of AFOV-matched size.
    trueFov: s.apparentFov / magnification,
    exitPupil: s.aperture / magnification,
    focalRatio: s.focalLength / s.aperture,
    // Rule of thumb: 2x per mm of aperture (~50x per inch).
    maxUsefulMagnification: 2 * s.aperture,
    // Below this the exit pupil is larger than the eye's pupil and light is wasted.
    minUsefulMagnification: s.aperture / EYE_PUPIL_MM,
    // Common visual estimate for a dark sky: 2.7 + 5 log10(D[mm]).
    limitingMagnitude: 2.7 + 5 * Math.log10(s.aperture),
    dawesLimitArcsec: 116 / s.aperture,
    lightGrasp: (s.aperture / EYE_PUPIL_MM) ** 2,
  };
}

/**
 * Naked-eye limiting magnitude as a function of the Sun's altitude (degrees).
 * A coarse piecewise-linear model: dark sky 6.5, civil twilight ~3, daylight ~ -3.
 */
export function nakedEyeLimitingMagnitude(sunAltDeg: number): number {
  const table: [number, number][] = [
    [-90, 6.5], [-18, 6.5], [-12, 5.5], [-6, 3.5], [0, 0.5], [10, -2.5], [90, -3.5],
  ];
  for (let i = 1; i < table.length; i++) {
    const [a1, m1] = table[i];
    if (sunAltDeg <= a1) {
      const [a0, m0] = table[i - 1];
      return m0 + ((sunAltDeg - a0) / (a1 - a0)) * (m1 - m0);
    }
  }
  return -3.5;
}
