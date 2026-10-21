// The equipment panel: telescope model, eyepiece and Barlow, with live readouts.
import { telescopeStats, EYE_PUPIL_MM } from '../astro/optics';
import {
  BARLOWS, CUSTOM_ID, EYEPIECES, TELESCOPES, type Design, type Barlow, type Eyepiece, findTelescope, chromaticAberration,
} from '../equipment';
import { type AppState, syncTelescope } from '../state';
import { type MsgKey, modelName, num, onLangChange, t as txt, telescopeNote } from '../i18n';

const designName = (d: Design) => txt(`design.${d}` as MsgKey);
export const eyepieceName = (e: Eyepiece) => txt(`eyepiece.${e.type}` as MsgKey, { mm: e.focalLength });

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Average apparent diameter of the full Moon, degrees. */
const MOON_DIAMETER = 0.52;

const GROUPS: [MsgKey, Design[]][] = [
  ['group.binoculars', ['binocular']],
  ['group.refractors', ['achromat', 'apochromat']],
  ['group.reflectors', ['newtonian']],
  ['group.catadioptrics', ['maksutov', 'sct']],
];

export class GearPanel {
  private onChange: () => void;

  constructor(private state: AppState, onChange: () => void) {
    this.onChange = onChange;
    const model = $<HTMLSelectElement>('gear-model');
    this.fillModels();
    model.addEventListener('change', () => { this.state.equipment.telescopeId = model.value; this.changed(); });

    const eyepieces = $('gear-eyepieces');
    for (const e of EYEPIECES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.id = e.id;
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
      b.textContent = `×${x}`;
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
    for (const d of ['achromat', 'apochromat', 'newtonian', 'maksutov', 'sct'] as Design[]) design.add(new Option(designName(d), d));
    design.addEventListener('change', () => { this.state.equipment.custom.design = design.value as Design; this.changed(); });

    $('gear-toggle').addEventListener('click', () => {
      const gear = $('gear');
      const open = gear.classList.toggle('collapsed') === false;
      $('gear-toggle').setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('gear-open', open);
    });
    onLangChange(() => {
      this.fillModels();
      design.querySelectorAll('option').forEach((o) => { o.textContent = designName(o.value as Design); });
      this.sync();
    });
    this.sync();
  }

  /** The telescope list, grouped by design, in the current language. */
  private fillModels(): void {
    const model = $<HTMLSelectElement>('gear-model');
    const groups = GROUPS.map(([label, designs]) => {
      const group = document.createElement('optgroup');
      group.label = txt(label);
      for (const x of TELESCOPES.filter((m) => designs.includes(m.design))) {
        group.append(new Option(`${modelName(x.id, x.name)} · ${x.aperture}/${x.focalLength}`, x.id));
      }
      return group;
    });
    model.replaceChildren(...groups, new Option(txt('gear.customOption'), CUSTOM_ID));
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
    const tel = s.telescope;
    const model = findTelescope(e.telescopeId);
    const stats = telescopeStats(tel);
    $<HTMLSelectElement>('gear-model').value = model ? model.id : CUSTOM_ID;
    const native = tel.nativeFocalLength ?? tel.focalLength;
    $('gear-name').textContent = model ? modelName(model.id, model.name) : txt('gear.custom');
    $('gear-spec').textContent = `${tel.aperture} mm · f/${num(native / tel.aperture, 1)} · ${designName((tel.design ?? 'achromat') as Design)}`;
    $('gear-mag').textContent = `${num(stats.magnification)}×`;
    $('gear-note').textContent = model ? telescopeNote(model.id, model.note) : txt('gear.customNote');

    const custom = !model;
    $('gear-custom').hidden = !custom;
    if (custom) {
      $<HTMLInputElement>('rng-aperture').value = String(e.custom.aperture);
      $<HTMLInputElement>('rng-focal').value = String(e.custom.focalLength);
      $('out-aperture').textContent = `${e.custom.aperture} mm`;
      $('out-focal').textContent = `${e.custom.focalLength} mm (f/${num(e.custom.focalLength / e.custom.aperture, 1)})`;
      $<HTMLSelectElement>('custom-design').value = e.custom.design;
    }
    // Binoculars have their own eyepieces.
    $('gear-eyepiece-block').hidden = Boolean(model?.fixed);
    for (const b of document.querySelectorAll<HTMLButtonElement>('#gear-eyepieces .chip')) {
      b.classList.toggle('active', b.dataset.id === e.eyepieceId);
      const ep = EYEPIECES.find((x) => x.id === b.dataset.id)!;
      b.title = txt('gear.eyepieceTitle', { name: eyepieceName(ep), afov: ep.apparentFov });
      const mag = (native * e.barlow) / ep.focalLength;
      b.classList.toggle('over', mag > stats.maxUsefulMagnification * 1.02);
    }
    for (const b of document.querySelectorAll<HTMLButtonElement>('#gear-barlows .chip')) {
      b.classList.toggle('active', Number(b.dataset.barlow) === e.barlow);
      if (b.dataset.barlow === '1') b.textContent = txt('gear.none');
    }
    this.renderReadouts();
  }

  private renderReadouts(): void {
    const tel = this.state.telescope;
    const s = telescopeStats(tel);
    const over = s.magnification > s.maxUsefulMagnification * 1.02;
    // Magnification on a log scale from the lowest useful to 1.6x the highest useful.
    const lo = Math.log(s.minUsefulMagnification), hi = Math.log(s.maxUsefulMagnification * 1.6);
    const magPos = Math.max(0, Math.min(1, (Math.log(s.magnification) - lo) / (hi - lo)));
    const usefulEnd = (Math.log(s.maxUsefulMagnification) - lo) / (hi - lo);
    const moons = s.trueFov / MOON_DIAMETER;
    const brightness = Math.min(1, 0.32 + 0.68 * Math.sqrt(Math.min(s.exitPupil, EYE_PUPIL_MM) / EYE_PUPIL_MM));
    const rows: string[] = [
      row(txt('read.mag'), `${num(s.magnification)}×`, over ? 'warn' : '',
        bar(magPos, usefulEnd), txt('read.useful', { lo: Math.ceil(s.minUsefulMagnification), hi: num(s.maxUsefulMagnification) })),
      row(txt('read.field'), `${num(s.trueFov, 2)}°`, '', bar(Math.min(1, s.trueFov / 4)),
        moons >= 1 ? txt('read.moons', { n: num(moons, 1) }) : txt('read.moonPart', { n: num(moons * 100) })),
      row(txt('read.pupil'), `${num(s.exitPupil, 1)} mm`, s.exitPupil > EYE_PUPIL_MM ? 'warn' : '', bar(Math.min(1, s.exitPupil / EYE_PUPIL_MM)),
        txt('read.nebulae', { n: num(brightness * 100) })),
      row(txt('read.faintest'), `mag ${num(s.limitingMagnitude, 1)}`, '', bar(Math.min(1, (s.limitingMagnitude - 6) / 9)),
        txt('read.light', { n: num(s.lightGrasp) })),
      row(txt('read.resolution'), `${num(s.dawesLimitArcsec, 1)}″`, '', bar(Math.min(1, 1 / s.dawesLimitArcsec)),
        txt('read.double')),
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
  const tel = state.telescope;
  const s = telescopeStats(tel);
  const ca = chromaticAberration(tel);
  if (s.magnification > s.maxUsefulMagnification * 1.02) return txt('advice.over');
  if (s.exitPupil > EYE_PUPIL_MM + 0.2) return txt('advice.wasted');
  const parts: string[] = [];
  if (s.trueFov >= 1.5) parts.push(txt('advice.wide'));
  else if (s.exitPupil >= 2) parts.push(txt('advice.medium'));
  else if (s.exitPupil >= 0.7) parts.push(txt('advice.high'));
  else parts.push(txt('advice.veryHigh'));
  if (tel.design === 'newtonian') parts.push(txt('advice.spikes'));
  else if (ca > 0.3) parts.push(txt('advice.halo'));
  return parts.join(' ');
}
