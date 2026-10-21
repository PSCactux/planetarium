import { describe, expect, it } from 'vitest';
import { TELESCOPES, chromaticAberration, defaultEquipment, nearestEyepiece, opticalSetup } from '../src/equipment';
import { telescopeStats } from '../src/astro/optics';
import { buildSearchIndex, search } from '../src/ui/search';
import type { Dso, Star } from '../src/data';

describe('equipment', () => {
  it('turns a telescope, eyepiece and Barlow into an optical setup', () => {
    const e = { ...defaultEquipment(), telescopeId: 'skyliner-200p', eyepieceId: '10', barlow: 2 as const };
    const s = opticalSetup(e);
    expect(s.focalLength).toBe(2400);
    expect(s.aperture).toBe(200);
    expect(telescopeStats(s).magnification).toBe(240);
  });

  it('keeps binoculars at their fixed magnification whatever the eyepiece', () => {
    const s = opticalSetup({ ...defaultEquipment(), telescopeId: 'binoculars-10x50', eyepieceId: '4', barlow: 3 });
    expect(telescopeStats(s).magnification).toBeCloseTo(10, 6);
    expect(telescopeStats(s).trueFov).toBeCloseTo(6.5, 6);
  });

  it('dims a reflector for its central obstruction', () => {
    const open = telescopeStats({ focalLength: 1200, aperture: 200, eyepieceFocalLength: 10, apparentFov: 52 });
    const newt = opticalSetup({ ...defaultEquipment(), telescopeId: 'skyliner-200p' });
    expect(telescopeStats(newt).limitingMagnitude).toBeLessThan(open.limitingMagnitude);
  });

  it('rates false colour only for achromats, worse for short ones, not changed by a Barlow', () => {
    const short = opticalSetup({ ...defaultEquipment(), telescopeId: 'startravel-102' });
    const long = opticalSetup({ ...defaultEquipment(), telescopeId: 'astromaster-70az' });
    const apo = opticalSetup({ ...defaultEquipment(), telescopeId: 'evostar-80ed' });
    const barlowed = opticalSetup({ ...defaultEquipment(), telescopeId: 'startravel-102', barlow: 3 });
    expect(chromaticAberration(short)).toBeGreaterThan(chromaticAberration(long));
    expect(chromaticAberration(apo)).toBe(0);
    expect(chromaticAberration(barlowed)).toBe(chromaticAberration(short));
  });

  it('has unique ids and sensible specs', () => {
    expect(new Set(TELESCOPES.map((t) => t.id)).size).toBe(TELESCOPES.length);
    for (const t of TELESCOPES) {
      expect(t.focalLength / t.aperture).toBeGreaterThan(3);
      expect(t.focalLength / t.aperture).toBeLessThan(16);
    }
  });

  it('maps ?eye= to the nearest catalogue eyepiece', () => {
    expect(nearestEyepiece(9).focalLength).toBe(10);
    expect(nearestEyepiece(30).focalLength).toBe(32);
  });
});

describe('search', () => {
  const stars: Star[] = [
    { ra: 279.2, dec: 38.8, mag: 0.03, bv: 0, hr: 7001, designation: 'α Lyr', name: 'Vega' },
    { ra: 292.7, dec: 27.9, mag: 3.08, bv: 1.13, hr: 7417, designation: 'β¹ Cyg', name: 'Albireo' },
  ];
  const dso: Dso[] = [
    { id: 'M31', name: 'Andromeda Galaxy', catalogue: 'NGC 224', kind: 'galaxy', ra: 10.7, dec: 41.3, mag: 3.4, major: 178, minor: 70, pa: 35 },
    { id: 'NGC 5139', name: 'Omega Centauri', catalogue: 'NGC 5139', kind: 'globular', ra: 201.7, dec: -47.5, mag: 3.9, major: 36, minor: 36, pa: 0 },
  ];
  const index = buildSearchIndex(stars, dso);
  const first = (q: string) => search(index, q)[0]?.label();

  it('finds planets, stars and deep-sky objects by name or number', () => {
    expect(first('jupi')).toBe('Jupiter');
    expect(first('vega')).toBe('Vega');
    expect(first('m31')).toBe('M31 · Andromeda Galaxy');
    expect(first('ngc224')).toBe('M31 · Andromeda Galaxy');
    expect(first('omega')).toBe('NGC 5139 · Omega Centauri');
  });

  it('ignores accents and case, and finds Bayer designations', () => {
    expect(first('ANDRÓMEDA')).toBe('M31 · Andromeda Galaxy');
    expect(first('α lyr')).toBe('Vega');
  });

  it('finds objects by their Spanish or Catalan names too', () => {
    expect(first('luna')).toBe('Moon');
    expect(first('saturno')).toBe('Saturn');
    expect(first('galaxia de andromeda')).toBe('M31 · Andromeda Galaxy');
    expect(first("galàxia d'andròmeda")).toBe('M31 · Andromeda Galaxy');
  });

  it('returns nothing for an empty query', () => {
    expect(search(index, '  ')).toEqual([]);
  });
});
