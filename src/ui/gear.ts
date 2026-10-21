// The equipment panel: telescope model, eyepiece and Barlow, with live readouts.
import { telescopeStats, EYE_PUPIL_MM } from '../astro/optics';
import {
  BARLOWS, CUSTOM_ID, DESIGN_NAMES, EYEPIECES, TELESCOPES, type Design, type Barlow, findTelescope, chromaticAberration,
} from '../equipment';
import { type AppState, syncTelescope } from '../state';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Average apparent diameter of the full Moon, degrees. */
const MOON_DIAMETER = 0.52;

const GROUPS: [string, Design[]][] = [
  ['Binoculars', ['binocular']],
  ['Refractors', ['achromat', 'apochromat']],
  ['Reflectors', ['newtonian']],
  ['Catadioptrics', ['maksutov', 'sct']],
];

export class GearPanel {
  private onChange: () => void;

  constructor(private state: AppState, onChange: () => void) {
    this.onChange = onChange;
    const model = $<HTMLSelectElement>('gear-model');
    for (const [label, designs] of GROUPS) {
      const group = document.createElement('optgroup');
      group.label = label;
      for (const t of TELESCOPES.filter((x) => designs.includes(x.design))) {
        group.append(new Option(`${t.name} · ${t.aperture}/${t.focalLength}`, t.id));
      }
      model.append(group);
    }
    model.append(new Option('Custom telescope…', CUSTOM_ID));
    model.addEventListener('change', () => { this.state.equipment.telescopeId = model.value; this.changed(); });

    const eyepieces = $('gear-eyepieces');
    for (const e of EYEPIECES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.id = e.id;
      b.title = `${e.name}, ${e.apparentFov}° apparent field`;
      b.innerHTML = `${e.focalLength}<small>mm</small>`;
      b.addEventListener('click', () => { this.state.equipment.eyepieceId = e.id; this.changed(); });
      eyepieces.append(b);
    }
    const barlows = $('gear-barlows');
    for (const x of BARLOWS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.barlow = String(x);
      b.textContent = x === 1 ? 'None' : `×${x}`;
      b.addEventListener('click', () => { this.state.equipment.barlow = x as Barlow; this.changed(); });
      barlows.append(b);
    }

    // Custom telescope: the sliders update the view while they move.
    const bind = (id: string, key: 'aperture' | 'focalLength') => {
      const input = $<HTMLInputElement>(id);
      input.addEventListener('input', () => { this.state.equipment.custom[key] = Number(input.value); this.changed(); });
    };
    bind('rng-aperture', 'aperture');
    bind('rng-focal', 'focalLength');
    const design = $<HTMLSelectElement>('custom-design');
    for (const d of ['achromat', 'apochromat', 'newtonian', 'maksutov', 'sct'] as Design[]) design.add(new Option(DESIGN_NAMES[d], d));
    design.addEventListener('change', () => { this.state.equipment.custom.design = design.value as Design; this.changed(); });

    $('gear-toggle').addEventListener('click', () => {
      const gear = $('gear');
      const open = gear.classList.toggle('collapsed') === false;
      $('gear-toggle').setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('gear-open', open);
    });
    this.sync();
  }

  private changed(): void {
    syncTelescope(this.state);
    this.sync();
    this.onChange();
  }

  /** Brings every control and readout in line with the state. */
  sync(): void {
    const s = this.state;
    const e = s.equipment;
    const t = s.telescope;
    const model = findTelescope(e.telescopeId);
    const stats = telescopeStats(t);
    $<HTMLSelectElement>('gear-model').value = model ? model.id : CUSTOM_ID;
    const native = t.nativeFocalLength ?? t.focalLength;
    $('gear-name').textContent = model?.name ?? 'Custom telescope';
    $('gear-spec').textContent = `${t.aperture} mm · f/${(native / t.aperture).toFixed(1)} · ${DESIGN_NAMES[(t.design ?? 'achromat') as Design]}`;
    $('gear-mag').textContent = `${stats.magnification.toFixed(0)}×`;
    $('gear-note').textContent = model?.note ?? 'Set the aperture and focal length of your own telescope.';

    const custom = !model;
    $('gear-custom').hidden = !custom;
    if (custom) {
      $<HTMLInputElement>('rng-aperture').value = String(e.custom.aperture);
      $<HTMLInputElement>('rng-focal').value = String(e.custom.focalLength);
      $('out-aperture').textContent = `${e.custom.aperture} mm`;
      $('out-focal').textContent = `${e.custom.focalLength} mm (f/${(e.custom.focalLength / e.custom.aperture).toFixed(1)})`;
      $<HTMLSelectElement>('custom-design').value = e.custom.design;
    }
    // Binoculars have their own eyepieces.
    $('gear-eyepiece-block').hidden = Boolean(model?.fixed);
    for (const b of document.querySelectorAll<HTMLButtonElement>('#gear-eyepieces .chip')) {
      b.classList.toggle('active', b.dataset.id === e.eyepieceId);
      const ep = EYEPIECES.find((x) => x.id === b.dataset.id)!;
      const mag = (native * e.barlow) / ep.focalLength;
      b.classList.toggle('over', mag > stats.maxUsefulMagnification * 1.02);
    }
    for (const b of document.querySelectorAll<HTMLButtonElement>('#gear-barlows .chip')) {
      b.classList.toggle('active', Number(b.dataset.barlow) === e.barlow);
    }
    this.renderReadouts();
  }

  private renderReadouts(): void {
    const t = this.state.telescope;
    const s = telescopeStats(t);
    const over = s.magnification > s.maxUsefulMagnification * 1.02;
    // Magnification on a log scale from the lowest useful to 1.6x the highest useful.
    const lo = Math.log(s.minUsefulMagnification), hi = Math.log(s.maxUsefulMagnification * 1.6);
    const magPos = Math.max(0, Math.min(1, (Math.log(s.magnification) - lo) / (hi - lo)));
    const usefulEnd = (Math.log(s.maxUsefulMagnification) - lo) / (hi - lo);
    const moons = s.trueFov / MOON_DIAMETER;
    const brightness = Math.min(1, 0.32 + 0.68 * Math.sqrt(Math.min(s.exitPupil, EYE_PUPIL_MM) / EYE_PUPIL_MM));
    const rows: string[] = [
      row('Magnification', `${s.magnification.toFixed(0)}×`, over ? 'warn' : '',
        bar(magPos, usefulEnd), `Useful ${Math.ceil(s.minUsefulMagnification)}–${s.maxUsefulMagnification.toFixed(0)}×`),
      row('True field', `${s.trueFov.toFixed(2)}°`, '', bar(Math.min(1, s.trueFov / 4)),
        moons >= 1 ? `${moons.toFixed(1)} full Moons across` : `${(moons * 100).toFixed(0)}% of the Moon`),
      row('Exit pupil', `${s.exitPupil.toFixed(1)} mm`, s.exitPupil > EYE_PUPIL_MM ? 'warn' : '', bar(Math.min(1, s.exitPupil / EYE_PUPIL_MM)),
        `Nebulae at ${(brightness * 100).toFixed(0)}% brightness`),
      row('Faintest stars', `mag ${s.limitingMagnitude.toFixed(1)}`, '', bar(Math.min(1, (s.limitingMagnitude - 6) / 9)),
        `${s.lightGrasp.toFixed(0)}× the light of your eye`),
      row('Resolution', `${s.dawesLimitArcsec.toFixed(1)}″`, '', bar(Math.min(1, 1 / s.dawesLimitArcsec)),
        'Closest double star it splits'),
    ];
    $('gear-readouts').innerHTML = rows.join('');
    $('gear-advice').textContent = advice(this.state);
  }
}

function bar(value: number, zoneEnd?: number): string {
  const zone = zoneEnd !== undefined ? `<span class="zone" style="width:${(zoneEnd * 100).toFixed(1)}%"></span>` : '';
  return `<span class="bar">${zone}<span class="fill" style="width:${(value * 100).toFixed(1)}%"></span></span>`;
}

function row(label: string, value: string, cls: string, barHtml: string, hint: string): string {
  return `<div class="readout ${cls}"><span class="r-label">${label}</span><span class="r-value">${value}</span>${barHtml}<span class="r-hint">${hint}</span></div>`;
}

/** One sentence on what this combination is good for. */
function advice(state: AppState): string {
  const t = state.telescope;
  const s = telescopeStats(t);
  const ca = chromaticAberration(t);
  if (s.magnification > s.maxUsefulMagnification * 1.02) {
    return 'More magnification than this aperture can use: the image only gets dimmer and softer. Use a longer eyepiece.';
  }
  if (s.exitPupil > EYE_PUPIL_MM + 0.2) {
    return 'The beam is wider than your pupil, so some light is wasted. Still a fine, wide view.';
  }
  const parts: string[] = [];
  if (s.trueFov >= 1.5) parts.push('Wide, bright view: ideal for star clusters, the Milky Way and big nebulae.');
  else if (s.exitPupil >= 2) parts.push('Bright, medium view: galaxies, nebulae and the whole Moon.');
  else if (s.exitPupil >= 0.7) parts.push('High power: planets, craters on the Moon and close double stars.');
  else parts.push('Very high power: only for steady nights and bright targets.');
  if (t.design === 'newtonian') parts.push('Bright stars show four spikes from the secondary mirror’s supports.');
  else if (ca > 0.3) parts.push('Expect a violet halo around bright objects: this refractor is achromatic.');
  return parts.join(' ');
}
