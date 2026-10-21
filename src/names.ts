// Names of things in the sky, in the current language.
import type { Dso, Star } from './data';
import type { Target } from './sky/sky';
import type { PlanetId } from './astro/solarsystem';
import { dsoName, t, type MsgKey } from './i18n';

export function bodyName(id: PlanetId | 'sun' | 'moon'): string {
  return t(`body.${id}` as MsgKey);
}

/** "M31 · Andromeda Galaxy", "NGC 5139 · Omega Centauri", "M3". */
export function dsoLabel(o: Dso): string {
  const name = dsoName(o.id, o.name);
  return name && name !== o.id ? `${o.id} · ${name}` : o.id;
}

export function starLabel(s: Star): string {
  return s.name || s.designation || `HR ${s.hr}`;
}

export function targetLabel(target: Target, stars: Star[], dso: Dso[]): string {
  switch (target.kind) {
    case 'star': return starLabel(stars[target.index]);
    case 'dso': return dsoLabel(dso[target.index]);
    case 'planet': return bodyName(target.id);
    default: return bodyName(target.kind);
  }
}
