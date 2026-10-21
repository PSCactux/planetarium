// Catalogue of real telescopes, eyepieces and Barlow lenses, and how a choice of them
// becomes the optical setup used by the renderer.
import type { TelescopeSetup } from './astro/optics';

export type Design = 'achromat' | 'apochromat' | 'newtonian' | 'maksutov' | 'sct' | 'binocular';

export interface TelescopeModel {
  id: string;
  name: string;
  design: Design;
  aperture: number; // mm
  focalLength: number; // mm
  /** Diameter of the central obstruction as a fraction of the aperture. */
  obstruction: number;
  /** Binoculars have fixed eyepieces: magnification and apparent field. */
  fixed?: { magnification: number; apparentFov: number };
  note: string;
}

export const DESIGN_NAMES: Record<Design, string> = {
  achromat: 'Achromatic refractor',
  apochromat: 'Apochromatic refractor',
  newtonian: 'Newtonian reflector',
  maksutov: 'Maksutov-Cassegrain',
  sct: 'Schmidt-Cassegrain',
  binocular: 'Binoculars',
};

/** Typical specifications of well-known models, as published by their makers. */
export const TELESCOPES: TelescopeModel[] = [
  { id: 'binoculars-10x50', name: '10×50 binoculars', design: 'binocular', aperture: 50, focalLength: 250, obstruction: 0,
    fixed: { magnification: 10, apparentFov: 65 }, note: 'The classic first instrument: wide, bright views of the Milky Way.' },
  { id: 'binoculars-15x70', name: '15×70 astronomy binoculars', design: 'binocular', aperture: 70, focalLength: 375, obstruction: 0,
    fixed: { magnification: 15, apparentFov: 66 }, note: 'Big binoculars for clusters and comets; best on a tripod.' },
  { id: 'printed-70-400', name: '3D-printed refractor 70/400', design: 'achromat', aperture: 70, focalLength: 400, obstruction: 0,
    note: 'The refractor from github.com/PSCactux/telescope-generator.' },
  { id: 'astromaster-70az', name: 'Celestron AstroMaster 70AZ', design: 'achromat', aperture: 70, focalLength: 900, obstruction: 0,
    note: 'Long, slow achromat: little false colour, good on the Moon and planets.' },
  { id: 'startravel-102', name: 'Sky-Watcher StarTravel 102', design: 'achromat', aperture: 102, focalLength: 500, obstruction: 0,
    note: 'Short rich-field refractor: wide views, violet halo on bright objects.' },
  { id: 'redcat-51', name: 'William Optics RedCat 51', design: 'apochromat', aperture: 51, focalLength: 250, obstruction: 0,
    note: 'Tiny apochromat made for wide-field astrophotography.' },
  { id: 'evostar-80ed', name: 'Sky-Watcher Evostar 80ED', design: 'apochromat', aperture: 80, focalLength: 600, obstruction: 0,
    note: 'ED doublet: sharp, colour-free images in a small tube.' },
  { id: 'fsq-106', name: 'Takahashi FSQ-106EDX4', design: 'apochromat', aperture: 106, focalLength: 530, obstruction: 0,
    note: 'Premium four-element apochromat.' },
  { id: 'heritage-130p', name: 'Sky-Watcher Heritage 130P', design: 'newtonian', aperture: 130, focalLength: 650, obstruction: 0.26,
    note: 'Collapsible tabletop Dobsonian: lots of aperture for its size.' },
  { id: 'skyliner-200p', name: 'Sky-Watcher Skyliner 200P Dobsonian', design: 'newtonian', aperture: 200, focalLength: 1200, obstruction: 0.23,
    note: 'The popular 8-inch Dobsonian: galaxies, nebulae and sharp planets.' },
  { id: 'skyliner-300p', name: 'Sky-Watcher Skyliner 300P FlexTube', design: 'newtonian', aperture: 305, focalLength: 1500, obstruction: 0.23,
    note: 'A 12-inch Dobsonian: globular clusters resolve into stars.' },
  { id: 'skymax-102', name: 'Sky-Watcher Skymax 102', design: 'maksutov', aperture: 102, focalLength: 1300, obstruction: 0.3,
    note: 'Compact Maksutov: high magnification for the Moon and planets.' },
  { id: 'nexstar-127slt', name: 'Celestron NexStar 127SLT', design: 'maksutov', aperture: 127, focalLength: 1500, obstruction: 0.31,
    note: 'Go-to Maksutov, a favourite for planets.' },
  { id: 'nexstar-8se', name: 'Celestron NexStar 8SE', design: 'sct', aperture: 203, focalLength: 2032, obstruction: 0.34,
    note: 'The classic 8-inch Schmidt-Cassegrain.' },
  { id: 'c11', name: 'Celestron C11', design: 'sct', aperture: 280, focalLength: 2800, obstruction: 0.33,
    note: 'An 11-inch Schmidt-Cassegrain for serious observing.' },
];

export const CUSTOM_ID = 'custom';

export interface Eyepiece {
  id: string;
  focalLength: number; // mm
  apparentFov: number; // degrees
  name: string;
}

export const EYEPIECES: Eyepiece[] = [
  { id: '32', focalLength: 32, apparentFov: 50, name: '32 mm Plössl' },
  { id: '25', focalLength: 25, apparentFov: 52, name: '25 mm Plössl' },
  { id: '20', focalLength: 20, apparentFov: 68, name: '20 mm wide-angle' },
  { id: '15', focalLength: 15, apparentFov: 52, name: '15 mm Plössl' },
  { id: '10', focalLength: 10, apparentFov: 52, name: '10 mm Plössl' },
  { id: '6', focalLength: 6, apparentFov: 60, name: '6 mm' },
  { id: '4', focalLength: 4, apparentFov: 58, name: '4 mm' },
];

export const BARLOWS = [1, 2, 3] as const;
export type Barlow = (typeof BARLOWS)[number];

export interface Equipment {
  telescopeId: string;
  eyepieceId: string;
  barlow: Barlow;
  /** Used when telescopeId is CUSTOM_ID (and for a custom eyepiece). */
  custom: { aperture: number; focalLength: number; eyepieceFocalLength: number; apparentFov: number; design: Design };
}

export function defaultEquipment(): Equipment {
  return {
    telescopeId: 'printed-70-400',
    eyepieceId: '10',
    barlow: 1,
    custom: { aperture: 150, focalLength: 750, eyepieceFocalLength: 10, apparentFov: 52, design: 'newtonian' },
  };
}

export function findTelescope(id: string): TelescopeModel | undefined {
  return TELESCOPES.find((t) => t.id === id);
}

/** The optical setup that a choice of equipment gives. */
export function opticalSetup(e: Equipment): TelescopeSetup {
  const model = findTelescope(e.telescopeId);
  if (model?.fixed) {
    // Binoculars: express the fixed magnification as focal length / eyepiece.
    return {
      focalLength: model.focalLength,
      aperture: model.aperture,
      eyepieceFocalLength: model.focalLength / model.fixed.magnification,
      apparentFov: model.fixed.apparentFov,
      obstruction: 0,
      design: 'binocular',
      nativeFocalLength: model.focalLength,
    };
  }
  const eyepiece = EYEPIECES.find((x) => x.id === e.eyepieceId);
  const scope = model ?? { ...e.custom, obstruction: e.custom.design === 'newtonian' ? 0.23 : e.custom.design === 'sct' || e.custom.design === 'maksutov' ? 0.32 : 0 };
  return {
    focalLength: scope.focalLength * e.barlow,
    aperture: scope.aperture,
    eyepieceFocalLength: eyepiece?.focalLength ?? e.custom.eyepieceFocalLength,
    apparentFov: eyepiece?.apparentFov ?? e.custom.apparentFov,
    obstruction: scope.obstruction,
    design: model?.design ?? e.custom.design,
    nativeFocalLength: scope.focalLength,
  };
}

/** Picks the catalogue eyepiece closest to a focal length (for ?eye= in the URL). */
export function nearestEyepiece(mm: number): Eyepiece {
  return EYEPIECES.reduce((a, b) => (Math.abs(b.focalLength - mm) < Math.abs(a.focalLength - mm) ? b : a));
}

/**
 * Chromatic aberration index of a refractor: f-ratio divided by the aperture in inches.
 * Below ~3 the violet halo is obvious, above ~5 it is negligible. Apochromats have none.
 */
export function chromaticAberration(s: TelescopeSetup): number {
  if (s.design !== 'achromat') return 0;
  // A Barlow lengthens the focal length but not the objective's colour error.
  const index = (s.nativeFocalLength ?? s.focalLength) / s.aperture / (s.aperture / 25.4);
  return Math.max(0, Math.min(1, (5 - index) / 3.5));
}
