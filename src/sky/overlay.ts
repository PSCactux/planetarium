import type { AppState } from '../state';
import type { DsoKind } from '../data';
import { PLANETS } from '../astro/solarsystem';
import { telescopeStats } from '../astro/optics';
import { altAzToHorizonVec } from '../astro/coords';
import { mulMatVec, sphericalToVec } from '../astro/math';
import { chromaticAberration, findTelescope, EYEPIECES } from '../equipment';
import { dsoName, localCompass, modelName, num, t, type MsgKey } from '../i18n';
import { bodyName } from '../names';
import type { Sky, Target } from './sky';

const CARDINALS: [string, number, boolean][] = [
  ['N', 0, true], ['NE', 45, false], ['E', 90, true], ['SE', 135, false],
  ['S', 180, true], ['SW', 225, false], ['W', 270, true], ['NW', 315, false],
];

const DSO_COLOR: Record<DsoKind, string> = {
  galaxy: '255, 150, 140',
  globular: '255, 210, 120',
  open: '150, 200, 255',
  nebula: '140, 230, 190',
  planetary: '120, 230, 230',
  double: '220, 220, 220',
};

const FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";

/** 2D canvas on top of the WebGL view: labels, markers, optical effects and the eyepiece mask. */
export class Overlay {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(width: number, height: number): void {
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(sky: Sky, state: AppState, selection: Target | null, width: number, height: number): void {
    const ctx = this.ctx;
    const f = sky.frame;
    ctx.clearRect(0, 0, width, height);
    ctx.textBaseline = 'middle';
    const fov = sky.camera.fov;
    const night = 1 - 0.7 * f.daylight;
    const scope = state.telescopeMode;
    const visible = (v: [number, number, number]) => !state.showGround || v[1] > -0.002;

    if (scope) this.drawOpticalEffects(sky, state, width, height);

    if (state.showConstellationNames && !scope) {
      ctx.font = `600 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(120, 160, 230, ${0.75 * night})`;
      for (const c of sky.constellations) {
        if (!c.label || (fov > 80 && c.rank > 2)) continue;
        const v = mulMatVec(f.matrix, sphericalToVec(c.label[0], c.label[1]));
        if (!visible(v)) continue;
        const p = sky.project(v, width, height);
        if (p) ctx.fillText(c.name.toUpperCase(), p[0], p[1]);
      }
    }

    if (state.showDeepSky) this.drawDeepSkyMarkers(sky, state, width, height, night);

    ctx.textAlign = 'left';
    if (state.showStarNames) {
      // More names appear as you zoom in.
      const labelLimit = Math.min(f.limitMag, 1.6 + 2.5 * Math.log10(Math.max(1, 90 / fov)));
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = `rgba(225, 225, 210, ${0.8 * night})`;
      sky.stars.forEach((s, i) => {
        if (!s.name || s.mag > labelLimit) return;
        const v = sky.targetVec({ kind: 'star', index: i });
        if (!visible(v)) return;
        const p = sky.project(v, width, height);
        if (p) ctx.fillText(s.name, p[0] + 7, p[1] - 7);
      });
    }

    // Solar system labels are always shown: they are what people look for first.
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 214, 140, 0.95)';
    const solar: [string, Target][] = [
      [bodyName('sun'), { kind: 'sun' }],
      [bodyName('moon'), { kind: 'moon' }],
      ...PLANETS.map((p) => [bodyName(p.id), { kind: 'planet', id: p.id }] as [string, Target]),
    ];
    for (const [name, t] of solar) {
      if (t.kind === 'planet' && f.planets.get(t.id)!.mag > f.limitMag) continue;
      const v = sky.targetVec(t);
      if (!visible(v)) continue;
      const p = sky.project(v, width, height);
      const r = Math.min(sky.discRadiusPx(t, height) * 0.7, height * 0.3);
      if (p) ctx.fillText(name, p[0] + 9 + r, p[1] + 10 + r);
    }

    // Jupiter's moons, once they separate from the planet.
    const jupiterPx = sky.discRadiusPx({ kind: 'planet', id: 'jupiter' }, height);
    if (jupiterPx > 1.2) {
      ctx.font = `500 11px ${FONT}`;
      ctx.fillStyle = 'rgba(230, 220, 200, 0.75)';
      for (const m of sky.bodies.galilean) {
        if (!m.visible || !visible(m.dir)) continue;
        const p = sky.project(m.dir, width, height);
        if (p) ctx.fillText(t(`body.${m.name}` as MsgKey), p[0] + 6, p[1] - 9);
      }
    }

    if (state.showGround && !scope) {
      for (const [label, az, major] of CARDINALS) {
        const p = sky.project(altAzToHorizonVec(-2.5, az), width, height);
        if (!p) continue;
        ctx.textAlign = 'center';
        ctx.font = major ? `700 18px ${FONT}` : `600 13px ${FONT}`;
        ctx.fillStyle = major ? 'rgba(240, 120, 90, 0.95)' : 'rgba(200, 170, 150, 0.8)';
        ctx.fillText(localCompass(label), p[0], p[1]);
      }
    }

    if (selection) {
      const p = sky.project(sky.targetVec(selection), width, height);
      if (p) {
        // In the eyepiece the ring frames the target instead of covering it.
        ctx.strokeStyle = scope ? 'rgba(255, 200, 80, 0.45)' : 'rgba(255, 200, 80, 0.9)';
        ctx.lineWidth = scope ? 1 : 1.5;
        ctx.beginPath();
        const r = Math.max(scope ? 30 : 12, Math.min(sky.discRadiusPx(selection, height), height * 0.42) + (scope ? 16 : 8));
        ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (scope) {
      this.drawEyepiece(sky, width, height);
      this.drawEyepieceCaption(sky, state);
    }
  }

  /** Symbols and names of deep-sky objects, scaled with zoom so the sky does not clutter. */
  private drawDeepSkyMarkers(sky: Sky, state: AppState, width: number, height: number, night: number): void {
    const ctx = this.ctx;
    const fov = sky.camera.fov;
    const scope = state.telescopeMode;
    // Wide views show only the brightest; zooming in reveals the rest of the catalogue.
    const magLimit = scope ? 99 : 4.5 + 4 * Math.log10(Math.max(1, 100 / fov));
    ctx.lineWidth = 1;
    sky.dso.forEach((o, i) => {
      if (o.mag > magLimit) return;
      const t: Target = { kind: 'dso', index: i };
      const v = sky.targetVec(t);
      if (state.showGround && v[1] < -0.002) return;
      const p = sky.project(v, width, height);
      if (!p || p[0] < -50 || p[0] > width + 50 || p[1] < -50 || p[1] > height + 50) return;
      const rgb = DSO_COLOR[o.kind];
      const r = Math.max(5, Math.min(sky.discRadiusPx(t, height), height * 0.4));
      if (!scope) {
        ctx.strokeStyle = `rgba(${rgb}, ${0.55 * night})`;
        this.symbol(o.kind, p[0], p[1], r);
      }
      const big = fov < 40 || o.mag < 5;
      if (!big && !scope) return;
      ctx.font = `500 11px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = `rgba(${rgb}, ${(scope ? 0.6 : 0.75) * night})`;
      const name = dsoName(o.id, o.name);
      const label = name && (fov < 25 || scope) ? `${o.id} · ${name}` : o.id;
      ctx.fillText(label, p[0] + Math.min(r, 160) * 0.75 + 6, p[1] + Math.min(r, 160) * 0.75 + 6);
    });
  }

  private symbol(kind: DsoKind, x: number, y: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    switch (kind) {
      case 'galaxy': ctx.ellipse(x, y, r, r * 0.5, -0.5, 0, Math.PI * 2); break;
      case 'nebula': ctx.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6); break;
      case 'open': ctx.setLineDash([2, 3]); ctx.arc(x, y, r, 0, Math.PI * 2); break;
      case 'globular':
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
        break;
      case 'planetary':
        ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2;
          ctx.moveTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7);
          ctx.lineTo(x + Math.cos(a) * r * 1.2, y + Math.sin(a) * r * 1.2);
        }
        break;
      default: ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /**
   * What the optics add around bright points: the four diffraction spikes of a Newtonian's
   * secondary-mirror vanes and the violet halo of an achromatic refractor.
   */
  private drawOpticalEffects(sky: Sky, state: AppState, width: number, height: number): void {
    const ctx = this.ctx;
    const f = sky.frame;
    const spikes = state.telescope.design === 'newtonian';
    const ca = chromaticAberration(state.telescope);
    if (!spikes && ca < 0.05) return;
    const points: [number, number, number][] = []; // x, y, how many magnitudes above the limit
    const add = (v: [number, number, number], mag: number) => {
      const rel = f.limitMag - mag;
      if (rel < 3.5) return;
      const p = sky.project(v, width, height);
      if (p && p[0] > -40 && p[0] < width + 40 && p[1] > -40 && p[1] < height + 40) points.push([p[0], p[1], rel]);
    };
    sky.stars.forEach((s, i) => { if (s.mag < f.limitMag - 3.5) add(sky.targetVec({ kind: 'star', index: i }), s.mag); });
    for (const p of PLANETS) {
      if (sky.discRadiusPx({ kind: 'planet', id: p.id }, height) < 4) add(sky.targetVec({ kind: 'planet', id: p.id }), f.planets.get(p.id)!.mag);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [x, y, rel] of points) {
      const k = Math.min(1, (rel - 3.5) / 6);
      if (spikes) {
        const len = 10 + 70 * k;
        // The vanes are aligned with the tube, so in the eyepiece the spikes follow the screen axes.
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const g = ctx.createLinearGradient(x - dx * len, y - dy * len, x + dx * len, y + dy * len);
          g.addColorStop(0, 'rgba(255,255,255,0)');
          g.addColorStop(0.5, `rgba(235,240,255,${0.25 + 0.45 * k})`);
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.strokeStyle = g;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x - dx * len, y - dy * len);
          ctx.lineTo(x + dx * len, y + dy * len);
          ctx.stroke();
        }
      }
      if (ca > 0.05 && rel > 5) {
        // Only bright stars show the halo; it grows with their brightness.
        const kk = Math.min(1, (rel - 5) / 5);
        const r = 5 + 16 * kk;
        const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r);
        g.addColorStop(0, `rgba(150, 90, 255, ${0.22 * ca * (0.3 + kk)})`);
        g.addColorStop(1, 'rgba(120, 60, 255, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // An achromat's violet fringe also shows on the limb of the Moon and big planets.
    if (ca > 0.05) {
      const limb: Target[] = [{ kind: 'moon' }, { kind: 'planet', id: 'jupiter' }, { kind: 'planet', id: 'venus' }, { kind: 'planet', id: 'saturn' }, { kind: 'planet', id: 'mars' }];
      for (const t of limb) {
        const r = sky.discRadiusPx(t, height) / (t.kind === 'planet' && t.id === 'saturn' ? 2.27 : 1);
        if (r < 4) continue;
        const p = sky.project(sky.targetVec(t), width, height);
        if (!p) continue;
        const g = ctx.createRadialGradient(p[0], p[1], r * 0.98, p[0], p[1], r * 1.08 + 3);
        g.addColorStop(0, 'rgba(140, 80, 255, 0)');
        g.addColorStop(0.4, `rgba(150, 90, 255, ${0.35 * ca})`);
        g.addColorStop(1, 'rgba(120, 60, 255, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p[0], p[1], r * 1.08 + 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawEyepieceCaption(sky: Sky, state: AppState): void {
    const ctx = this.ctx;
    const f = sky.frame;
    const s = telescopeStats(state.telescope);
    const e = state.equipment;
    const model = findTelescope(e.telescopeId);
    ctx.textAlign = 'center';
    ctx.font = `600 13px ${FONT}`;
    ctx.fillStyle = 'rgba(200, 205, 220, 0.9)';
    const { cx, cy, r, left, right } = sky.scopeView;
    const room = (right - left) - 24;
    const top = cy - r - 8;
    const native = state.telescope.nativeFocalLength ?? state.telescope.focalLength;
    const name = model ? modelName(model.id, model.name) : `${state.telescope.aperture} mm f/${num(native / state.telescope.aperture, 1)}`;
    const eyepiece = model?.fixed ? '' : ` · ${EYEPIECES.find((x) => x.id === e.eyepieceId)?.focalLength ?? state.telescope.eyepieceFocalLength} mm${e.barlow > 1 ? ` ${t('cap.barlow', { n: e.barlow })}` : ''}`;
    const optics = `${name}${eyepiece} · ${num(s.magnification)}×`;
    const note = ` ${t('cap.catalogue')}`;
    const field = t('cap.field', { field: num(s.trueFov, 2), mag: num(f.limitMag, 1) }) + (f.limitMag > 6.6 ? note : '');
    const oneLine = `${optics} · ${field}`;
    if (ctx.measureText(oneLine).width <= room) {
      ctx.fillText(oneLine, cx, Math.max(14, top));
    } else {
      // Narrow screens: two lines, and drop the catalogue note if it still does not fit.
      const second = ctx.measureText(field).width <= room ? field : field.replace(note, '');
      ctx.fillText(optics, cx, Math.max(14, top - 16));
      ctx.fillText(second, cx, Math.max(30, top));
    }
    // Safety first: the Sun anywhere near the eyepiece field.
    const sun = sky.targetVec({ kind: 'sun' });
    const view = sky.camera.getWorldDirection(sky.camera.position.clone());
    const sep = Math.acos(Math.min(1, sun[0] * view.x + sun[1] * view.y + sun[2] * view.z)) * (180 / Math.PI);
    if (sep < s.trueFov * 2 && f.sunAlt > -1) {
      ctx.font = `700 15px ${FONT}`;
      ctx.fillStyle = '#ff6b5a';
      ctx.fillText(t('cap.sun'), cx, cy);
    }
  }

  /** Black mask with a circular hole: the field of view of the eyepiece. */
  private drawEyepiece(sky: Sky, width: number, height: number): void {
    const ctx = this.ctx;
    const { cx, cy, r } = sky.scopeView;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
    ctx.fillStyle = '#000';
    ctx.fill('evenodd');
    const edge = ctx.createRadialGradient(cx, cy, r * 0.92, cx, cy, r);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = edge;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90, 90, 100, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}
