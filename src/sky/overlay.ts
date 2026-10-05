import type { AppState } from '../state';
import { PLANETS } from '../astro/solarsystem';
import { telescopeStats } from '../astro/optics';
import { altAzToHorizonVec } from '../astro/coords';
import { mulMatVec, sphericalToVec } from '../astro/math';
import type { Sky, Target } from './sky';

const CARDINALS: [string, number, boolean][] = [
  ['N', 0, true], ['NE', 45, false], ['E', 90, true], ['SE', 135, false],
  ['S', 180, true], ['SW', 225, false], ['W', 270, true], ['NW', 315, false],
];

/** 2D canvas on top of the WebGL view: labels, selection marker and the eyepiece mask. */
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
    const visible = (v: [number, number, number]) => !state.showGround || v[1] > -0.002;

    if (state.showConstellationNames && !state.telescopeMode) {
      ctx.font = '600 11px system-ui, sans-serif';
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

    ctx.textAlign = 'left';
    if (state.showStarNames) {
      // More names appear as you zoom in.
      const labelLimit = Math.min(f.limitMag, 1.6 + 2.5 * Math.log10(Math.max(1, 90 / fov)));
      ctx.font = '12px system-ui, sans-serif';
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
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 214, 140, 0.95)';
    const solar: [string, Target][] = [
      ['Sun', { kind: 'sun' }],
      ['Moon', { kind: 'moon' }],
      ...PLANETS.map((p) => [p.name, { kind: 'planet', id: p.id }] as [string, Target]),
    ];
    for (const [name, t] of solar) {
      if (t.kind === 'planet' && f.planets.get(t.id)!.mag > f.limitMag) continue;
      const v = sky.targetVec(t);
      if (!visible(v)) continue;
      const p = sky.project(v, width, height);
      const r = sky.discRadiusPx(t, height) * 0.7;
      if (p) ctx.fillText(name, p[0] + 9 + r, p[1] + 10 + r);
    }

    if (state.showGround && !state.telescopeMode) {
      for (const [label, az, major] of CARDINALS) {
        const p = sky.project(altAzToHorizonVec(-2.5, az), width, height);
        if (!p) continue;
        ctx.textAlign = 'center';
        ctx.font = major ? '700 18px system-ui, sans-serif' : '600 13px system-ui, sans-serif';
        ctx.fillStyle = major ? 'rgba(240, 120, 90, 0.95)' : 'rgba(200, 170, 150, 0.8)';
        ctx.fillText(label, p[0], p[1]);
      }
    }

    if (selection) {
      const p = sky.project(sky.targetVec(selection), width, height);
      if (p) {
        // In the eyepiece the ring frames the target instead of covering it.
        const scope = state.telescopeMode;
        ctx.strokeStyle = scope ? 'rgba(255, 200, 80, 0.45)' : 'rgba(255, 200, 80, 0.9)';
        ctx.lineWidth = scope ? 1 : 1.5;
        ctx.beginPath();
        ctx.arc(p[0], p[1], Math.max(scope ? 30 : 12, sky.discRadiusPx(selection, height) + (scope ? 16 : 8)), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (state.telescopeMode) {
      this.drawEyepiece(width, height);
      const s = telescopeStats(state.telescope);
      ctx.textAlign = 'center';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(200, 205, 220, 0.9)';
      const top = height / 2 - 0.45 * Math.min(width, height) - 4;
      const optics = `${state.telescope.focalLength}/${state.telescope.aperture} mm · ${state.telescope.eyepieceFocalLength} mm eyepiece · ` +
        `${s.magnification.toFixed(0)}×`;
      const field = `field ${s.trueFov.toFixed(2)}° · stars to mag ${f.limitMag.toFixed(1)}` +
        (f.limitMag > 6.6 ? ' (catalogue complete to ~6.5)' : '');
      const oneLine = `${optics} · ${field}`;
      if (ctx.measureText(oneLine).width <= width - 24) {
        ctx.fillText(oneLine, width / 2, Math.max(14, top));
      } else {
        // Narrow screens: two lines, and drop the catalogue note if it still does not fit.
        const second = ctx.measureText(field).width <= width - 24 ? field : field.replace(' (catalogue complete to ~6.5)', '');
        ctx.fillText(optics, width / 2, Math.max(14, top - 16));
        ctx.fillText(second, width / 2, Math.max(30, top));
      }
      // Safety first: the Sun anywhere near the eyepiece field.
      const sun = sky.targetVec({ kind: 'sun' });
      const view = sky.camera.getWorldDirection(sky.camera.position.clone());
      const sep = Math.acos(Math.min(1, sun[0] * view.x + sun[1] * view.y + sun[2] * view.z)) * (180 / Math.PI);
      if (sep < s.trueFov * 2 && f.sunAlt > -1) {
        ctx.font = '700 15px system-ui, sans-serif';
        ctx.fillStyle = '#ff6b5a';
        ctx.fillText('Never point a telescope at the Sun without a certified solar filter!', width / 2, height / 2);
      }
    }
  }

  /** Black mask with a circular hole: the field of view of the eyepiece. */
  private drawEyepiece(width: number, height: number): void {
    const ctx = this.ctx;
    const r = 0.45 * Math.min(width, height);
    const cx = width / 2, cy = height / 2;
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
