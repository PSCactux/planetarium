import { describe, expect, it } from 'vitest';
import { buildTour, defaultStop, targetKey } from '../src/targets';
import type { Star } from '../src/data';

const star = (name: string, mag: number): Star => ({ ra: 0, dec: 0, mag, bv: 0, hr: 0, designation: '', name });

describe('telescope tour', () => {
  const stars = [star('Sirius', -1.46), star('Vega', 0.03), star('', 4)];
  const tour = buildTour(stars);

  it('lists the Moon and planets first, then named stars from the catalogue', () => {
    expect(tour[0].name).toBe('Moon');
    expect(tour.slice(1, 8).every((s) => s.target.kind === 'planet')).toBe(true);
    expect(tour.filter((s) => s.target.kind === 'star').map((s) => s.name)).toEqual(['Vega', 'Sirius']);
  });

  it('defaults to Vega when it is visible, otherwise to the first visible stop', () => {
    const vega = tour.find((s) => s.name === 'Vega')!;
    const sirius = tour.find((s) => s.name === 'Sirius')!;
    expect(defaultStop([sirius, vega])?.name).toBe('Vega');
    expect(defaultStop([sirius])?.name).toBe('Sirius');
    expect(defaultStop([])).toBeUndefined();
  });

  it('prefers the brightest visible object in daylight', () => {
    const vega = tour.find((s) => s.name === 'Vega')!;
    const moon = tour[0];
    const mags: Record<string, number> = { Vega: 0.03, Moon: -11 };
    expect(defaultStop([vega, moon], 1, (s) => mags[s.name])?.name).toBe('Moon');
    expect(defaultStop([vega, moon], 0, (s) => mags[s.name])?.name).toBe('Vega');
  });

  it('keys targets consistently', () => {
    expect(targetKey(tour.find((s) => s.name === 'Vega')!.target)).toBe('star:1');
    expect(targetKey({ kind: 'planet', id: 'saturn' })).toBe('saturn');
  });
});
