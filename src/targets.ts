// Showpiece objects for the telescope view and the logic that picks which of them are up right now.

import type { Dso, Star } from './data';
import type { Sky, Target } from './sky/sky';
import { PLANETS } from './astro/solarsystem';
import { horizonVecToAltAz } from './astro/coords';

export interface TourStop {
  key: string;
  name: string;
  target: Target;
}

/** The default target when it is up: bright, white and easy to recognise. */
export const DEFAULT_STAR = 'Vega';

// Planets first (they show a disc and phases), then stars that are classic eyepiece targets:
// colourful doubles (Albireo, Mizar, Almach), clusters (Alcyone = the Pleiades) and the brightest stars.
const PLANET_ORDER = ['jupiter', 'saturn', 'mars', 'venus', 'mercury', 'uranus', 'neptune'] as const;
const STAR_ORDER = [
  DEFAULT_STAR, 'Albireo', 'Mizar', 'Alcyone', 'Almach', 'Polaris', 'Arcturus', 'Capella', 'Altair', 'Deneb',
  'Sirius', 'Betelgeuse', 'Rigel', 'Aldebaran', 'Antares', 'Spica', 'Regulus', 'Procyon', 'Castor', 'Pollux',
  'Algol', 'Mira', 'Fomalhaut', 'Canopus', 'Achernar', 'Acrux', 'Rigil Kentaurus',
];

// Deep-sky showpieces, roughly from the most to the least striking in a small telescope.
const DSO_ORDER = [
  'M42', 'M31', 'M45', 'M13', 'NGC 869', 'NGC 884', 'M57', 'M27', 'M44', 'M8', 'M22', 'M11', 'M17', 'M51',
  'M81', 'M82', 'M104', 'M1', 'M3', 'M5', 'M92', 'M33', 'M20', 'M35', 'M37', 'M7', 'M6',
  'NGC 5139', 'NGC 104', 'NGC 3372', 'LMC', 'SMC', 'NGC 4755', 'NGC 7293', 'NGC 253', 'NGC 5128',
];

/** Minimum altitude, and minimum distance from the Sun, for a target to be offered. */
const MIN_ALT = 5;
const MIN_SUN_SEPARATION = 15;

export function buildTour(stars: Star[], dso: Dso[] = []): TourStop[] {
  const tour: TourStop[] = [{ key: 'moon', name: 'Moon', target: { kind: 'moon' } }];
  for (const id of PLANET_ORDER) {
    tour.push({ key: id, name: PLANETS.find((p) => p.id === id)!.name, target: { kind: 'planet', id } });
  }
  for (const id of DSO_ORDER) {
    const index = dso.findIndex((o) => o.id === id);
    if (index >= 0) tour.push({ key: `dso:${index}`, name: dsoLabel(dso[index]), target: { kind: 'dso', index } });
  }
  for (const name of STAR_ORDER) {
    const index = stars.findIndex((s) => s.name === name);
    if (index >= 0) tour.push({ key: `star:${index}`, name, target: { kind: 'star', index } });
  }
  return tour;
}

export function targetKey(t: Target): string {
  return t.kind === 'star' ? `star:${t.index}` : t.kind === 'dso' ? `dso:${t.index}` : t.kind === 'planet' ? t.id : t.kind;
}

/** "M31 Andromeda Galaxy", "NGC 5139 Omega Centauri", "M3". */
export function dsoLabel(o: Dso): string {
  return o.name && o.name !== o.id ? `${o.id} ${o.name}` : o.id;
}

/** Tour stops that are above the horizon, away from the Sun and bright enough to see right now. */
export function visibleStops(tour: TourStop[], sky: Sky, stars: Star[]): TourStop[] {
  const f = sky.frame;
  const sun = sky.targetVec({ kind: 'sun' });
  return tour.filter(({ target }) => {
    const v = sky.targetVec(target);
    if (horizonVecToAltAz(v).alt < MIN_ALT) return false;
    const cos = Math.min(1, v[0] * sun[0] + v[1] * sun[1] + v[2] * sun[2]);
    if ((Math.acos(cos) * 180) / Math.PI < MIN_SUN_SEPARATION) return false;
    switch (target.kind) {
      case 'moon': return true;
      case 'sun': return false;
      case 'star': return stars[target.index].mag <= f.limitMag;
      case 'planet': return f.planets.get(target.id)!.mag <= f.limitMag;
      // Faint fuzzies need a dark sky and a bit of margin over the star limit.
      case 'dso': return f.daylight < 0.35 && sky.dso[target.index].mag <= f.limitMag - 1;
    }
  });
}

/** Apparent magnitude of a tour stop in the current frame (lower is brighter). */
export function stopMagnitude(stop: TourStop, sky: Sky, stars: Star[]): number {
  const t = stop.target;
  switch (t.kind) {
    case 'moon': return sky.frame.moon.mag;
    case 'sun': return sky.frame.sun.mag;
    case 'star': return stars[t.index].mag;
    case 'planet': return sky.frame.planets.get(t.id)!.mag;
    case 'dso': return sky.dso[t.index].mag;
  }
}

/**
 * At night: Vega when it is up, otherwise the first visible stop of the tour.
 * In daylight a white star is hard to find, so the brightest visible object wins.
 */
export function defaultStop(
  visible: TourStop[],
  daylight = 0,
  magnitude: (s: TourStop) => number = () => 0,
): TourStop | undefined {
  if (daylight > 0.3 && visible.length) return [...visible].sort((a, b) => magnitude(a) - magnitude(b))[0];
  return visible.find((s) => s.name === DEFAULT_STAR) ?? visible[0];
}
