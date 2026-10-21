import * as THREE from 'three';
import type { Dso } from '../data';
import { sphericalToVec } from '../astro/math';

/**
 * Deep-sky objects drawn procedurally with their real size, shape and orientation, the
 * way they look through an eyepiece rather than on a long-exposure photograph: galaxies
 * as soft ovals, globular clusters that break into stars with magnification and aperture,
 * open clusters as loose groups, nebulae as faint wisps and planetary nebulae as rings.
 */

export const DSO_KINDS = ['galaxy', 'globular', 'open', 'nebula', 'planetary', 'double'] as const;

const vertex = /* glsl */ `
  attribute vec3 center;
  attribute vec2 corner;
  attribute vec2 axes;      // semi-axes, radians
  attribute float pa;       // position angle, radians, north through east
  attribute float kind;
  attribute float sb;       // mean surface brightness, mag / arcmin^2
  attribute float seed;
  uniform float pxPerRad;
  uniform float radius;
  varying vec2 vUv;
  varying float vKind;
  varying float vSb;
  varying float vSeed;
  varying float vSizePx;
  const float EXTENT = 1.6; // the quad reaches past the nominal size for the soft edges
  void main() {
    vec3 c = normalize(center);
    vec3 east = normalize(cross(vec3(0.0, 0.0, 1.0), c) + vec3(1e-6, 0.0, 0.0));
    vec3 north = cross(c, east);
    vec3 major = north * cos(pa) + east * sin(pa);
    vec3 minor = -north * sin(pa) + east * cos(pa);
    // Never smaller than a few pixels, so small objects still read as fuzzy spots.
    float minAxis = 2.5 / pxPerRad;
    vec2 a = max(axes, vec2(minAxis));
    vec3 p = c + (major * corner.x * a.x + minor * corner.y * a.y) * EXTENT;
    vUv = corner * EXTENT;
    vKind = kind;
    vSb = sb;
    vSeed = seed;
    vSizePx = a.x * pxPerRad;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p * radius, 1.0);
  }`;

const fragment = /* glsl */ `
  uniform float sbLimit;     // faintest visible surface brightness, mag / arcmin^2
  uniform float resolve;     // 0..1, how well the telescope resolves clusters into stars
  uniform float gain;
  varying vec2 vUv;
  varying float vKind;
  varying float vSb;
  varying float vSeed;
  varying float vSizePx;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + vSeed * 17.0) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  // Stars scattered over the object, denser where 'density' is high.
  float starField(float cells, float density) {
    vec2 g = vUv * cells;
    vec2 id = floor(g);
    float h = hash(id);
    if (h > density) return 0.0;
    vec2 pos = id + vec2(hash(id + 3.1), hash(id + 7.7)) * 0.8 + 0.1;
    float px = length(g - pos) / cells * vSizePx; // distance in screen pixels
    float bright = 0.35 + 0.65 * hash(id + 11.3);
    return bright * exp(-px * px * 1.2);
  }

  void main() {
    float r = length(vUv);
    if (r > 1.6) discard;
    // Objects with a mean surface brightness above the limit show; their bright cores already
    // do a little below it, so the fade starts half a magnitude early.
    float vis = smoothstep(-0.5, 2.0, sbLimit - vSb);
    if (vis <= 0.0) discard;
    vec3 col;
    float a;
    if (vKind < 0.5) {            // galaxy: exponential disc plus a bright core
      // Faint, soft disc with a small brighter core: no spiral arms by eye.
      float disc = exp(-2.8 * r * r);
      float core = exp(-30.0 * r * r);
      a = 0.32 * disc + 0.38 * core;
      col = vec3(1.0, 0.95, 0.86);
    } else if (vKind < 1.5) {     // globular cluster
      // A dense core that only breaks into stars at the edges, as in a real eyepiece.
      float glow = exp(-6.0 * r * r);
      float resolved = resolve * smoothstep(25.0, 110.0, vSizePx);
      // 'cells' counts grid cells per semi-axis: a few hundred stars at most across the cluster.
      float cells = clamp(vSizePx / 14.0, 4.0, 16.0);
      float halo = exp(-2.2 * r * r);
      float stars = (starField(cells, halo * 0.6) + 0.55 * starField(cells * 1.6, halo * 0.25)) * resolved;
      a = glow * (0.85 - 0.35 * resolved) + stars * 1.2;
      col = vec3(1.0, 0.94, 0.82);
    } else if (vKind < 2.5) {     // open cluster: a loose group of stars
      float density = 0.5 * exp(-1.6 * r * r);
      float cells = clamp(vSizePx / 22.0, 3.0, 10.0);
      a = starField(cells, density) * 1.6 + 0.08 * exp(-3.0 * r * r);
      col = vec3(0.92, 0.95, 1.0);
    } else if (vKind < 3.5) {     // emission / reflection nebula
      float n = fbm(vUv * 2.2 + vSeed * 10.0);
      float body = exp(-2.2 * r * r) * smoothstep(0.25, 0.85, n + 0.25 * exp(-3.0 * r * r));
      a = body * 0.9;
      col = mix(vec3(0.72, 0.86, 0.82), vec3(0.98, 0.7, 0.78), smoothstep(0.45, 0.8, n));
    } else if (vKind < 4.5) {     // planetary nebula: a ring with a faint middle
      float ring = exp(-pow((r - 0.62) / 0.24, 2.0));
      a = ring * 0.9 + 0.25 * exp(-10.0 * r * r);
      col = vec3(0.62, 0.92, 0.88);
    } else {                      // double star (M40): two points
      float s1 = exp(-pow(length(vUv - vec2(0.45, 0.0)) * vSizePx, 2.0) * 0.6);
      float s2 = exp(-pow(length(vUv + vec2(0.45, 0.0)) * vSizePx, 2.0) * 0.6);
      a = s1 + s2 * 0.8;
      col = vec3(1.0, 0.95, 0.85);
    }
    a *= vis * gain;
    gl_FragColor = vec4(col * a, a);
  }`;

export class DeepSky {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  /** J2000 unit vectors, in catalogue order. */
  readonly dirs: [number, number, number][];

  constructor(readonly objects: Dso[], radius: number) {
    const n = objects.length;
    const center = new Float32Array(n * 4 * 3);
    const corner = new Float32Array(n * 4 * 2);
    const axes = new Float32Array(n * 4 * 2);
    const pa = new Float32Array(n * 4);
    const kind = new Float32Array(n * 4);
    const sb = new Float32Array(n * 4);
    const seed = new Float32Array(n * 4);
    const index: number[] = [];
    const arcmin = Math.PI / (180 * 60);
    this.dirs = objects.map((o, i) => {
      const v = sphericalToVec(o.ra, o.dec);
      const area = Math.PI * (o.major / 2) * (o.minor / 2); // arcmin^2
      const surface = o.mag + 2.5 * Math.log10(Math.max(area, 0.05));
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      corners.forEach(([cx, cy], k) => {
        const j = i * 4 + k;
        center.set(v, j * 3);
        corner.set([cx, cy], j * 2);
        axes.set([(o.major / 2) * arcmin, (o.minor / 2) * arcmin], j * 2);
        pa[j] = o.pa * (Math.PI / 180);
        kind[j] = DSO_KINDS.indexOf(o.kind);
        sb[j] = surface;
        seed[j] = (i * 0.6180339) % 1;
      });
      const b = i * 4;
      index.push(b, b + 1, b + 2, b, b + 2, b + 3);
      return v;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(center, 3));
    geometry.setAttribute('center', new THREE.BufferAttribute(center, 3));
    geometry.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
    geometry.setAttribute('axes', new THREE.BufferAttribute(axes, 2));
    geometry.setAttribute('pa', new THREE.BufferAttribute(pa, 1));
    geometry.setAttribute('kind', new THREE.BufferAttribute(kind, 1));
    geometry.setAttribute('sb', new THREE.BufferAttribute(sb, 1));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    geometry.setIndex(index);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        pxPerRad: { value: 1000 },
        radius: { value: radius },
        sbLimit: { value: 14 },
        resolve: { value: 0 },
        gain: { value: 1 },
      },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -8;
  }

  update(pxPerRad: number, sbLimit: number, resolve: number, gain: number): void {
    const u = this.material.uniforms;
    u.pxPerRad.value = pxPerRad;
    u.sbLimit.value = sbLimit;
    u.resolve.value = resolve;
    u.gain.value = gain;
  }
}
