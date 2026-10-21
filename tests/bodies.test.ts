import { describe, expect, it } from 'vitest';
import { bodyAxes, galileanMoons } from '../src/astro/bodies';
import { vecToSpherical } from '../src/astro/math';

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('Galilean moons', () => {
  it('matches Meeus example 44.a (1992 December 16, 0h UT)', () => {
    const moons = galileanMoons(2448972.50068);
    const expected = [[-3.44, 0.21], [7.44, 0.25], [1.24, 0.65], [7.08, 1.1]];
    moons.forEach((m, i) => {
      expect(m.x).toBeCloseTo(expected[i][0], 1);
      expect(m.y).toBeCloseTo(expected[i][1], 1);
    });
  });
});

describe('body axes', () => {
  it('gives an orthonormal right-handed frame', () => {
    const { pole, prime, east } = bodyAxes('saturn', 2460000.5);
    expect(dot(pole, prime)).toBeCloseTo(0, 9);
    expect(dot(pole, east)).toBeCloseTo(0, 9);
    expect(dot(prime, east)).toBeCloseTo(0, 9);
    expect(dot(east, east)).toBeCloseTo(1, 9);
  });

  it('puts Jupiter’s north pole at the IAU coordinates', () => {
    const [ra, dec] = vecToSpherical(bodyAxes('jupiter', 2451545).pole);
    expect(ra).toBeCloseTo(268.0566, 3);
    expect(dec).toBeCloseTo(64.4953, 3);
  });
});
