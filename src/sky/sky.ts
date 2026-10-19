import * as THREE from 'three';
import type { Constellation, Star } from '../data';
import type { AppState } from '../state';
import { type Mat3, type Vec3, mulMatVec, sphericalToVec } from '../astro/math';
import { altAzToHorizonVec, horizonVecToAltAz, j2000ToHorizonMatrix } from '../astro/coords';
import { julianDate, lstDeg, ttFromUt } from '../astro/time';
import {
  type BodyPosition,
  type PlanetId,
  MOON_RADIUS_KM,
  PLANETS,
  SUN_RADIUS_KM,
  angularRadiusDeg,
  moonPosition,
  observerPosition,
  planetPosition,
  sunPosition,
} from '../astro/solarsystem';
import { nakedEyeLimitingMagnitude, telescopeStats } from '../astro/optics';
import { bvToRgb } from './colors';
import { skyFragment, skyVertex, starFragment, starVertex } from './shaders';

// Radii of the concentric spheres everything is drawn on (camera at the centre).
const R_STARS = 1000;
const R_BODIES = 950;
const R_GROUND = 800;
const R_SKY = 1500;

export type Target =
  | { kind: 'star'; index: number }
  | { kind: 'planet'; id: PlanetId }
  | { kind: 'sun' }
  | { kind: 'moon' };

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
  sunAlt: number;
  /** Faintest magnitude currently drawn. */
  limitMag: number;
  /** Visible fraction of daylight, 0 (night) .. 1 (day). */
  daylight: number;
  /** Angular radius (deg) the Sun and Moon are drawn with. */
  sunRadius: number;
  moonRadius: number;
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

export class Sky {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.1, 4000);
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
  private moon: THREE.Mesh;
  private sunLight = new THREE.DirectionalLight(0xffffff, 4.5);
  /** J2000 unit vectors of the stars, for picking and labels. */
  readonly starDirs: Float32Array;
  frame!: Frame;

  constructor(
    canvas: HTMLCanvasElement,
    readonly stars: Star[],
    readonly constellations: Constellation[],
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.celestial.matrixAutoUpdate = false;
    this.scene.add(this.celestial);

    // Sky dome (drawn first, behind everything).
    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      uniforms: { sunDir: { value: new THREE.Vector3(0, -1, 0) }, enabled: { value: 1 } },
      side: THREE.BackSide,
      depthWrite: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R_SKY, 64, 32), this.skyMaterial);
    dome.renderOrder = -10;
    this.scene.add(dome);

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

    // Planets: a handful of points in the horizon frame, updated every frame.
    this.planetGeometry = new THREE.BufferGeometry();
    this.planetGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PLANETS.length * 3), 3));
    this.planetGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(PLANETS.flatMap((p) => p.color)), 3));
    this.planetGeometry.setAttribute('mag', new THREE.BufferAttribute(new Float32Array(PLANETS.length), 1));
    const planetPoints = new THREE.Points(this.planetGeometry, this.starMaterial);
    planetPoints.frustumCulled = false;
    this.scene.add(planetPoints);

    // Sun: a bright disc plus a soft glow.
    this.sunDisc = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialTexture([[0, '#fffef8'], [0.8, '#fff6d8'], [1, 'rgba(255,240,200,0)']]),
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialTexture([[0, 'rgba(255,230,170,0.7)'], [0.25, 'rgba(255,200,120,0.25)'], [1, 'rgba(255,180,90,0)']]),
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.sunGlow, this.sunDisc);

    // Moon: a real sphere lit from the Sun's direction, so the phase comes for free.
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 24),
      new THREE.MeshLambertMaterial({ color: 0xe8e4dc, emissive: 0x0b0b0d }),
    );
    this.scene.add(this.moon, this.sunLight, this.sunLight.target);

    // Ground: the lower hemisphere, closer than the sky so it hides what is below the horizon.
    this.groundMaterial = new THREE.MeshBasicMaterial({ color: 0x050705, side: THREE.BackSide });
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
    // The eyepiece circle fills 90% of the smaller viewport side.
    return (tfov * height) / (0.9 * Math.min(width, height));
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
    for (const p of PLANETS) planets.set(p.id, planetPosition(p.id, jdTT));

    const sunWorld = mulMatVec(matrix, sun.dirJ2000);
    const sunAlt = horizonVecToAltAz(sunWorld).alt;
    const atmosphere = state.showAtmosphere;
    const naked = atmosphere ? nakedEyeLimitingMagnitude(sunAlt) : 6.5;
    const daylight = atmosphere ? Math.min(1, Math.max(0, (sunAlt + 12) / 14)) : 0;
    const fov = this.cameraFov(state, width, height);
    let limitMag: number;
    if (state.telescopeMode) {
      // The telescope gains the same magnitudes over the eye whatever the sky brightness.
      limitMag = telescopeStats(state.telescope).limitingMagnitude - (6.5 - naked);
    } else {
      // Zooming in a little helps, like looking more carefully (and keeps zoomed views lively).
      limitMag = naked + Math.min(2, Math.max(0, 1.5 * Math.log10(60 / fov)));
    }

    
    // Uniforms and per-frame objects.
    this.starMaterial.uniforms.limitMag.value = limitMag;
    this.starMaterial.uniforms.pixelScale.value = this.renderer.getPixelRatio();
    (this.skyMaterial.uniforms.sunDir.value as THREE.Vector3).set(...sunWorld);
    this.skyMaterial.uniforms.enabled.value = atmosphere ? 1 : 0;
    this.lines.visible = state.showLines;
    this.lineMaterial.opacity = (state.telescopeMode ? 0.25 : 0.55) * (1 - 0.85 * daylight);
    this.ground.visible = this.horizonLine.visible = state.showGround;
    const g = 0.025 + 0.2 * daylight * daylight; // stays dark through twilight
    this.groundMaterial.color.setRGB(g * 0.75, g, g * 0.7, THREE.SRGBColorSpace);

    const posAttr = this.planetGeometry.getAttribute('position') as THREE.BufferAttribute;
    const magAttr = this.planetGeometry.getAttribute('mag') as THREE.BufferAttribute;
    PLANETS.forEach((p, i) => {
      const body = planets.get(p.id)!;
      const w = mulMatVec(matrix, body.dirJ2000);
      posAttr.setXYZ(i, w[0] * R_BODIES, w[1] * R_BODIES, w[2] * R_BODIES);
      magAttr.setX(i, body.mag);
    });
    posAttr.needsUpdate = magAttr.needsUpdate = true;

    // Sun and Moon are drawn larger than life when zoomed out so they stay visible.
    const minRadius = fov * 0.012;
    const sunR = Math.max(angularRadiusDeg(SUN_RADIUS_KM, sun.distanceAu), minRadius);
    const sunSize = 2 * R_BODIES * Math.tan(sunR * (Math.PI / 180));
    this.sunDisc.position.set(...sunWorld).multiplyScalar(R_BODIES);
    this.sunDisc.scale.setScalar(sunSize * 1.1);
    this.sunGlow.position.copy(this.sunDisc.position);
    this.sunGlow.scale.setScalar(sunSize * 8);
    this.sunLight.position.set(...sunWorld).multiplyScalar(10);

    const moonWorld = mulMatVec(matrix, moon.dirJ2000);
    const moonR = Math.max(angularRadiusDeg(MOON_RADIUS_KM, moon.distanceAu), minRadius);
    this.moon.position.set(...moonWorld).multiplyScalar(R_BODIES);
    this.moon.scale.setScalar(R_BODIES * Math.tan(moonR * (Math.PI / 180)));

    this.frame = { jdUT, jdTT, lst, matrix, sun, moon, planets, sunAlt, limitMag, daylight, sunRadius: sunR, moonRadius: moonR };

    // Camera.
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    const dir = altAzToHorizonVec(state.alt, state.az);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(dir[0], dir[1], dir[2]);
    if (state.telescopeMode && state.invertImage) this.camera.rotateZ(Math.PI);
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
    }
  }

  /** On-screen radius in pixels of a target's disc (0 for point-like objects). */
  discRadiusPx(t: Target, height: number): number {
    const r = t.kind === 'sun' ? this.frame.sunRadius : t.kind === 'moon' ? this.frame.moonRadius : 0;
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
  pick(x: number, y: number, width: number, height: number, groundOn: boolean, radius = 14): Target | null {
    const f = this.frame;
    let best: Target | null = null;
    let bestScore = Infinity;
    const consider = (t: Target, v: Vec3, mag: number) => {
      if (groundOn && v[1] < 0) return;
      const s = this.project(v, width, height);
      if (!s) return;
      const d = Math.hypot(s[0] - x, s[1] - y);
      if (d > radius) return;
      const score = d + mag * 1.5; // prefer brighter objects at similar distances
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    };
    const solar: Target[] = [{ kind: 'sun' }, { kind: 'moon' }, ...PLANETS.map((p) => ({ kind: 'planet' as const, id: p.id }))];
    for (const t of solar) {
      const mag = t.kind === 'planet' ? f.planets.get(t.id)!.mag : -10;
      if (t.kind !== 'planet' || mag < f.limitMag + 0.3) consider(t, this.targetVec(t), Math.max(mag, -3) - 6);
    }
    for (let i = 0; i < this.stars.length; i++) {
      if (this.stars[i].mag > f.limitMag + 0.3) continue;
      consider({ kind: 'star', index: i }, this.targetVec({ kind: 'star', index: i }), this.stars[i].mag);
    }
    return best;
  }
}
