import * as THREE from 'three';
import type { Constellation, Dso, Star } from '../data';
import { type AppState, SKY_QUALITY } from '../state';
import { type Mat3, type Vec3, mulMatVec, sphericalToVec } from '../astro/math';
import { altAzToHorizonVec, eclipticToEquatorial, horizonVecToAltAz, j2000ToHorizonMatrix } from '../astro/coords';
import { julianDate, lstDeg, ttFromUt } from '../astro/time';
import {
  type BodyPosition,
  type PlanetId,
  PLANETS,
  SUN_RADIUS_KM,
  angularRadiusDeg,
  heliocentricEcliptic,
  moonPosition,
  observerPosition,
  planetPosition,
  sunPosition,
} from '../astro/solarsystem';
import { bodyFlattening, bodyRadiusKm } from '../astro/bodies';
import { EYE_PUPIL_MM, nakedEyeLimitingMagnitude, telescopeStats } from '../astro/optics';
import { bvToRgb } from './colors';
import { skyFragment, skyVertex, starFragment, starVertex } from './shaders';
import { MilkyWay } from './milkyway';
import { DeepSky } from './deepsky';
import { SolarSystemBodies } from './bodies';

// Radii of the concentric spheres everything is drawn on (camera at the centre).
const R_STARS = 1000;
const R_DSO = 990;
const R_BODIES = 950;
const R_GROUND = 800;
const R_MILKY_WAY = 1200;
const R_SKY = 1500;

export type Target =
  | { kind: 'star'; index: number }
  | { kind: 'planet'; id: PlanetId }
  | { kind: 'sun' }
  | { kind: 'moon' }
  | { kind: 'dso'; index: number };

/** Everything derived from the state for one frame. */
export interface Frame {
  jdUT: number;
  jdTT: number;
  lst: number;
  /** J2000 equatorial -> local horizon (renderer frame). */
  matrix: Mat3;
  sun: BodyPosition;
  moon: BodyPosition;
  planets: Map<PlanetId, BodyPosition>;
  /** Angular radius of each planet in degrees (equatorial). */
  planetRadius: Map<PlanetId, number>;
  sunAlt: number;
  /** Faintest magnitude currently drawn. */
  limitMag: number;
  /** Visible fraction of daylight, 0 (night) .. 1 (day). */
  daylight: number;
  /** Angular radius (deg) the Sun and Moon are drawn with. */
  sunRadius: number;
  moonRadius: number;
  /** Brightness of extended objects through the eyepiece relative to the naked eye, 0..1. */
  surfaceBrightness: number;
  /** Image orientation on screen: 'normal', 'rotated' (180°) or 'mirrored' (left-right). */
  orientation: 'normal' | 'rotated' | 'mirrored';
}

function mat3ToMatrix4(m: Mat3): THREE.Matrix4 {
  return new THREE.Matrix4().set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
}

function radialTexture(stops: [number, string][]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

export class Sky {
  readonly renderer: THREE.WebGLRenderer;
  // Everything sits 800-1500 units away: a far near plane keeps the depth buffer precise.
  readonly camera = new THREE.PerspectiveCamera(70, 1, 50, 4000);
  private scene = new THREE.Scene();
  private celestial = new THREE.Group();
  private starMaterial: THREE.ShaderMaterial;
  private planetGeometry: THREE.BufferGeometry;
  private lineMaterial: THREE.LineBasicMaterial;
  private lines: THREE.LineSegments;
  private skyMaterial: THREE.ShaderMaterial;
  private ground: THREE.Mesh;
  private groundMaterial: THREE.MeshBasicMaterial;
  private horizonLine: THREE.LineLoop;
  private sunDisc: THREE.Sprite;
  private sunGlow: THREE.Sprite;
  private milkyWay: MilkyWay;
  readonly deepSky: DeepSky;
  readonly bodies: SolarSystemBodies;
  /** J2000 unit vectors of the stars, for picking and labels. */
  readonly starDirs: Float32Array;
  frame!: Frame;
  /** Where the eyepiece circle goes on screen (CSS pixels); see setScopeArea(). */
  scopeView = { cx: 0, cy: 0, r: 100, left: 0, right: 0 };
  private scopeArea = { top: 0, bottom: 0, left: 0, right: 0 };

  /** The free part of the screen, between the header, the side panels and the controls, for the eyepiece. */
  setScopeArea(top: number, bottom: number, left: number, right: number): void {
    this.scopeArea = { top, bottom, left, right };
  }

  constructor(
    canvas: HTMLCanvasElement,
    readonly stars: Star[],
    readonly constellations: Constellation[],
    readonly dso: Dso[],
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.celestial.matrixAutoUpdate = false;
    this.scene.add(this.celestial);
    const base = `${import.meta.env.BASE_URL}textures/`;

    // Sky dome (drawn first, behind everything). Double-sided materials keep working when
    // the image is mirrored, which flips the winding of every triangle.
    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      uniforms: { sunDir: { value: new THREE.Vector3(0, -1, 0) }, enabled: { value: 1 } },
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R_SKY, 64, 32), this.skyMaterial);
    dome.renderOrder = -10;
    this.scene.add(dome);

    this.milkyWay = new MilkyWay(R_MILKY_WAY, `${base}milkyway.jpg`);
    this.celestial.add(this.milkyWay.mesh);
    this.deepSky = new DeepSky(dso, R_DSO);
    this.celestial.add(this.deepSky.mesh);

    // Stars.
    this.starDirs = new Float32Array(stars.length * 3);
    const pos = new Float32Array(stars.length * 3);
    const col = new Float32Array(stars.length * 3);
    const mag = new Float32Array(stars.length);
    stars.forEach((s, i) => {
      const v = sphericalToVec(s.ra, s.dec);
      this.starDirs.set(v, i * 3);
      pos.set([v[0] * R_STARS, v[1] * R_STARS, v[2] * R_STARS], i * 3);
      col.set(bvToRgb(s.bv), i * 3);
      mag[i] = s.mag;
    });
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    starGeometry.setAttribute('mag', new THREE.BufferAttribute(mag, 1));
    this.starMaterial = new THREE.ShaderMaterial({
      vertexShader: starVertex,
      fragmentShader: starFragment,
      uniforms: { limitMag: { value: 6.5 }, pixelScale: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const starPoints = new THREE.Points(starGeometry, this.starMaterial);
    starPoints.frustumCulled = false;
    this.celestial.add(starPoints);

    // Constellation lines: straight chords between stars project to great-circle arcs.
    const seg: number[] = [];
    for (const c of constellations)
      for (const poly of c.lines)
        for (let i = 1; i < poly.length; i++)
          for (const [ra, dec] of [poly[i - 1], poly[i]]) {
            const v = sphericalToVec(ra, dec);
            seg.push(v[0] * R_STARS, v[1] * R_STARS, v[2] * R_STARS);
          }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    this.lineMaterial = new THREE.LineBasicMaterial({ color: 0x4a78c2, transparent: true, opacity: 0.55, depthWrite: false });
    this.lines = new THREE.LineSegments(lineGeometry, this.lineMaterial);
    this.lines.frustumCulled = false;
    this.celestial.add(this.lines);

    // Planets as points when they are too small to show a disc.
    this.planetGeometry = new THREE.BufferGeometry();
    this.planetGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PLANETS.length * 3), 3));
    this.planetGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(PLANETS.flatMap((p) => p.color)), 3));
    this.planetGeometry.setAttribute('mag', new THREE.BufferAttribute(new Float32Array(PLANETS.length), 1));
    const planetPoints = new THREE.Points(this.planetGeometry, this.starMaterial);
    planetPoints.frustumCulled = false;
    this.scene.add(planetPoints);

    // Textured Moon and planets, and Jupiter's moons.
    this.bodies = new SolarSystemBodies(base, R_BODIES, this.starMaterial);
    this.scene.add(this.bodies.group);

    // Sun: a bright disc plus a soft glow.
    this.sunDisc = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialTexture([[0, '#fffef8'], [0.8, '#fff6d8'], [1, 'rgba(255,240,200,0)']]),
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialTexture([[0, 'rgba(255,230,170,0.7)'], [0.25, 'rgba(255,200,120,0.25)'], [1, 'rgba(255,180,90,0)']]),
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.scene.add(this.sunGlow, this.sunDisc);

    // Ground: the lower hemisphere, closer than the sky so it hides what is below the horizon.
    this.groundMaterial = new THREE.MeshBasicMaterial({ color: 0x050705, side: THREE.DoubleSide });
    this.ground = new THREE.Mesh(
      new THREE.SphereGeometry(R_GROUND, 64, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      this.groundMaterial,
    );
    this.scene.add(this.ground);
    const ring: number[] = [];
    for (let i = 0; i < 360; i++) ring.push(...altAzToHorizonVec(0, i).map((x) => x * (R_GROUND - 1)));
    this.horizonLine = new THREE.LineLoop(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(ring, 3)),
      new THREE.LineBasicMaterial({ color: 0x3d5a3d }),
    );
    this.scene.add(this.horizonLine);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Vertical field of view actually used by the camera (telescope mode fits the eyepiece circle). */
  cameraFov(state: AppState, width: number, height: number): number {
    if (!state.telescopeMode) return state.fov;
    const tfov = telescopeStats(state.telescope).trueFov;
    const a = this.scopeArea;
    const top = a.top, bottom = a.bottom > top + 120 ? a.bottom : height;
    const left = a.right > a.left + 240 ? a.left : 0, right = a.right > a.left + 240 ? a.right : width;
    const r = Math.max(60, Math.min(0.45 * height, (right - left) / 2 - 6, (bottom - top) / 2 - 4));
    this.scopeView = { cx: (left + right) / 2, cy: (top + bottom) / 2, r, left, right };
    // The true field fills the eyepiece circle.
    return (tfov * height) / (2 * r);
  }

  update(state: AppState, width: number, height: number): Frame {
    const jdUT = julianDate(new Date(state.time));
    const jdTT = ttFromUt(jdUT);
    const lst = lstDeg(jdUT, state.lon);
    const matrix = j2000ToHorizonMatrix(jdTT, state.lat, lst);
    this.celestial.matrix.copy(mat3ToMatrix4(matrix));
    this.celestial.matrixWorldNeedsUpdate = true;

    const sun = sunPosition(jdTT);
    const moon = moonPosition(jdTT, observerPosition(state.lat, lst));
    const planets = new Map<PlanetId, BodyPosition>();
    const planetRadius = new Map<PlanetId, number>();
    for (const p of PLANETS) {
      const pos = planetPosition(p.id, jdTT);
      planets.set(p.id, pos);
      planetRadius.set(p.id, angularRadiusDeg(bodyRadiusKm(p.id), pos.distanceAu));
    }

    const sunWorld = mulMatVec(matrix, sun.dirJ2000);
    const sunAlt = horizonVecToAltAz(sunWorld).alt;
    const atmosphere = state.showAtmosphere;
    const quality = SKY_QUALITY[state.skyQuality] ?? SKY_QUALITY[1];
    const naked = atmosphere ? Math.min(nakedEyeLimitingMagnitude(sunAlt), quality.limit) : 6.5;
    const daylight = atmosphere ? Math.min(1, Math.max(0, (sunAlt + 12) / 14)) : 0;
    const darkness = atmosphere ? 1 - Math.min(1, Math.max(0, (sunAlt + 18) / 12)) : 1; // 1 = astronomical night
    const fov = this.cameraFov(state, width, height);
    const scope = state.telescopeMode;
    const stats = telescopeStats(state.telescope);
    let limitMag: number;
    if (scope) {
      // The telescope gains the same magnitudes over the eye whatever the sky brightness.
      limitMag = stats.limitingMagnitude - (6.5 - naked);
    } else {
      // Zooming in a little helps, like looking more carefully (and keeps zoomed views lively).
      limitMag = naked + Math.min(2, Math.max(0, 1.5 * Math.log10(60 / fov)));
    }
    // Extended objects never look brighter through a telescope than to the eye; with a small
    // exit pupil they dim. Perceived brightness falls off more gently than the light does.
    const pupil = Math.min(stats.exitPupil, EYE_PUPIL_MM);
    const surfaceBrightness = scope ? Math.min(1, 0.32 + 0.68 * Math.sqrt(pupil / EYE_PUPIL_MM)) : 1;
    const pxPerDeg = height / fov;

    // Uniforms and per-frame objects.
    this.starMaterial.uniforms.limitMag.value = limitMag;
    this.starMaterial.uniforms.pixelScale.value = this.renderer.getPixelRatio();
    (this.skyMaterial.uniforms.sunDir.value as THREE.Vector3).set(...sunWorld);
    this.skyMaterial.uniforms.enabled.value = atmosphere ? 1 : 0;
    // No constellation lines in the eyepiece: they are not in the real view.
    this.lines.visible = state.showLines && !scope;
    this.lineMaterial.opacity = 0.55 * (1 - 0.85 * daylight);
    this.ground.visible = this.horizonLine.visible = state.showGround;
    const g = 0.025 + 0.2 * daylight * daylight; // stays dark through twilight
    this.groundMaterial.color.setRGB(g * 0.75, g, g * 0.7, THREE.SRGBColorSpace);

    // Milky Way: needs a dark sky; through the eyepiece it is just a faint background.
    const mwSky = atmosphere ? quality.milkyWay * darkness * darkness : 1;
    this.milkyWay.intensity = state.showMilkyWay ? 0.8 * mwSky * (scope ? 0.35 * surfaceBrightness : 1) : 0;

    // Deep-sky objects: faintest visible surface brightness for the sky and the instrument.
    let sbLimit = (atmosphere ? quality.surface : SKY_QUALITY[0].surface) - (1 - darkness) * 9;
    let resolve = 0;
    if (scope) {
      // Magnification darkens the sky background, which helps contrast; aperture resolves stars.
      sbLimit += 1.2 + 1.5 * Math.log10(Math.max(1, state.telescope.aperture / 50)) - 2.5 * Math.log10(1 / surfaceBrightness);
      resolve = Math.min(1, Math.max(0, (state.telescope.aperture - 60) / 180));
    }
    this.deepSky.mesh.visible = state.showDeepSky;
    this.deepSky.update(pxPerDeg * (180 / Math.PI), sbLimit, resolve, scope ? 1.25 : 1);

    // Planets: a textured disc once they are big enough on screen, otherwise a point.
    const posAttr = this.planetGeometry.getAttribute('position') as THREE.BufferAttribute;
    const magAttr = this.planetGeometry.getAttribute('mag') as THREE.BufferAttribute;
    PLANETS.forEach((p, i) => {
      const body = planets.get(p.id)!;
      const w = mulMatVec(matrix, body.dirJ2000);
      posAttr.setXYZ(i, w[0] * R_BODIES, w[1] * R_BODIES, w[2] * R_BODIES);
      const helio = heliocentricEcliptic(p.id, jdTT);
      const toSun = norm(mulMatVec(matrix, eclipticToEquatorial([-helio[0], -helio[1], -helio[2]])));
      const disc = w[1] > -0.2 && this.bodies.pose(p.id, { dir: w, radius: planetRadius.get(p.id)!, toSun }, matrix, jdTT, pxPerDeg, surfaceBrightness);
      magAttr.setX(i, disc ? 99 : body.mag);
      if (p.id === 'jupiter') {
        this.bodies.placeGalilean(w, planetRadius.get('jupiter')!, matrix, jdTT, bodyFlattening('jupiter'));
      }
    });
    posAttr.needsUpdate = magAttr.needsUpdate = true;

    // Sun and Moon are drawn larger than life when zoomed out so they stay visible.
    const minRadius = scope ? 0 : fov * 0.012;
    const sunR = Math.max(angularRadiusDeg(SUN_RADIUS_KM, sun.distanceAu), minRadius);
    const sunSize = 2 * R_BODIES * Math.tan(sunR * (Math.PI / 180));
    this.sunDisc.position.set(...sunWorld).multiplyScalar(R_BODIES);
    this.sunDisc.scale.setScalar(sunSize * 1.1);
    this.sunGlow.position.copy(this.sunDisc.position);
    this.sunGlow.scale.setScalar(sunSize * 8);

    const moonWorld = mulMatVec(matrix, moon.dirJ2000);
    const moonR = Math.max(angularRadiusDeg(bodyRadiusKm('moon'), moon.distanceAu), minRadius);
    this.bodies.pose(
      'moon',
      { dir: moonWorld, radius: moonR, toSun: sunWorld, earthshine: 0.05 * (1 - moon.illuminated) ** 2 },
      matrix, jdTT, pxPerDeg, surfaceBrightness * (1 - 0.35 * daylight), 0,
    );

    const orientation: Frame['orientation'] = !scope || !state.realOrientation || state.telescope.design === 'binocular'
      ? 'normal' : state.telescope.design === 'newtonian' ? 'rotated' : 'mirrored';

    this.frame = {
      jdUT, jdTT, lst, matrix, sun, moon, planets, planetRadius, sunAlt, limitMag, daylight,
      sunRadius: sunR, moonRadius: moonR, surfaceBrightness, orientation,
    };

    this.bodies.setMirrored(orientation === 'mirrored');

    // Camera. In the telescope view the image is centred on the eyepiece circle.
    this.camera.fov = fov;
    if (scope) this.camera.setViewOffset(width, height, width / 2 - this.scopeView.cx, height / 2 - this.scopeView.cy, width, height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    if (orientation === 'mirrored') {
      // A star diagonal swaps left and right.
      this.camera.projectionMatrix.elements[0] *= -1;
      this.camera.projectionMatrix.elements[8] *= -1;
      this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    }
    const dir = altAzToHorizonVec(state.alt, state.az);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(dir[0], dir[1], dir[2]);
    if (orientation === 'rotated') this.camera.rotateZ(Math.PI);
    if (state.roll) this.camera.rotateZ(state.roll);
    this.camera.updateMatrixWorld();
    return this.frame;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Horizon-frame unit vector of a target for the current frame. */
  targetVec(t: Target): Vec3 {
    const f = this.frame;
    switch (t.kind) {
      case 'star': {
        const i = t.index * 3;
        return mulMatVec(f.matrix, [this.starDirs[i], this.starDirs[i + 1], this.starDirs[i + 2]]);
      }
      case 'planet': return mulMatVec(f.matrix, f.planets.get(t.id)!.dirJ2000);
      case 'sun': return mulMatVec(f.matrix, f.sun.dirJ2000);
      case 'moon': return mulMatVec(f.matrix, f.moon.dirJ2000);
      case 'dso': return mulMatVec(f.matrix, this.deepSky.dirs[t.index]);
    }
  }

  /** On-screen radius in pixels of a target's disc or extent (0 for point-like objects). */
  discRadiusPx(t: Target, height: number): number {
    const f = this.frame;
    const r = t.kind === 'sun' ? f.sunRadius : t.kind === 'moon' ? f.moonRadius
      : t.kind === 'planet' ? f.planetRadius.get(t.id)! * (t.id === 'saturn' ? 2.27 : 1)
      : t.kind === 'dso' ? this.dso[t.index].major / 120 : 0;
    return (r / this.camera.fov) * height;
  }

  /** Projects a horizon-frame direction to CSS pixels, or null when behind the camera. */
  project(v: Vec3, width: number, height: number): [number, number] | null {
    const p = new THREE.Vector3(v[0], v[1], v[2]);
    const forward = this.camera.getWorldDirection(new THREE.Vector3());
    if (p.dot(forward) <= 0) return null;
    p.multiplyScalar(R_STARS).project(this.camera);
    return [((p.x + 1) / 2) * width, ((1 - p.y) / 2) * height];
  }

  /** Finds the object closest to a screen point (CSS pixels). */
  pick(x: number, y: number, width: number, height: number, groundOn: boolean, radius = 14, deepSky = true): Target | null {
    const f = this.frame;
    let best: Target | null = null;
    let bestScore = Infinity;
    const consider = (t: Target, v: Vec3, mag: number, reach = 0) => {
      if (groundOn && v[1] < 0) return;
      const s = this.project(v, width, height);
      if (!s) return;
      const d = Math.hypot(s[0] - x, s[1] - y);
      if (d > radius + reach) return;
      const score = Math.max(0, d - reach) + mag * 1.5; // prefer brighter objects at similar distances
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    };
    const solar: Target[] = [{ kind: 'sun' }, { kind: 'moon' }, ...PLANETS.map((p) => ({ kind: 'planet' as const, id: p.id }))];
    for (const t of solar) {
      const mag = t.kind === 'planet' ? f.planets.get(t.id)!.mag : -10;
      if (t.kind !== 'planet' || mag < f.limitMag + 0.3) consider(t, this.targetVec(t), Math.max(mag, -3) - 6, this.discRadiusPx(t, height));
    }
    for (let i = 0; i < this.stars.length; i++) {
      if (this.stars[i].mag > f.limitMag + 0.3) continue;
      consider({ kind: 'star', index: i }, this.targetVec({ kind: 'star', index: i }), this.stars[i].mag);
    }
    if (deepSky) {
      // Deep-sky objects lose to stars at the same spot, but their whole extent is clickable.
      this.dso.forEach((o, i) => {
        const t: Target = { kind: 'dso', index: i };
        consider(t, this.targetVec(t), o.mag + 2, Math.min(60, this.discRadiusPx(t, height) * 0.6));
      });
    }
    return best;
  }
}
