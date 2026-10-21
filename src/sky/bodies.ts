import * as THREE from 'three';
import { type Mat3, type Vec3, mulMatVec } from '../astro/math';
import { type BodyId, bodyAxes, bodyFlattening, cross, galileanMoons } from '../astro/bodies';

/**
 * Textured Moon and planets. Each body is a sphere oriented with its real pole and
 * prime meridian (IAU) and lit from the direction of the Sun as seen from that body,
 * so phases, the tilt of Jupiter's bands and of Saturn's rings come out right.
 */

const bodyVertex = /* glsl */ `
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const bodyFragment = /* glsl */ `
  uniform sampler2D map;
  uniform sampler2D normalMap;
  uniform float hasNormalMap;
  uniform vec3 sunLocal;   // direction to the Sun in the body frame
  uniform float brightness;
  uniform float limbDarkening;
  uniform vec3 viewLocal;  // direction to the observer in the body frame
  uniform float earthshine;
  uniform float exposure;
  varying vec3 vLocal;
  void main() {
    vec3 n = normalize(vLocal);
    // Same mapping as three's SphereGeometry: +x is longitude 0, -z longitude 90° east.
    float lon = atan(-n.z, n.x);
    vec2 uv = vec2(fract(0.5 + lon / 6.2831853), 0.5 + asin(clamp(n.y, -1.0, 1.0)) / 3.1415927);
    vec3 albedo = texture2D(map, uv).rgb;
    vec3 shading = n;
    if (hasNormalMap > 0.5) {
      vec3 e = cross(vec3(0.0, 1.0, 0.0), n);
      vec3 east = e / max(length(e), 1e-4);
      vec3 north = cross(n, east);
      vec3 t = texture2D(normalMap, uv).rgb * 2.0 - 1.0;
      shading = normalize(east * t.x + north * t.y + n * t.z);
    }
    float light = max(dot(shading, normalize(sunLocal)), 0.0);
    // Soften the terminator a little, like the real one seen through the air.
    light = smoothstep(0.0, 1.0, light) * 0.35 + light * 0.65;
    float mu = max(dot(n, normalize(viewLocal)), 0.0);
    float limb = mix(1.0, pow(mu, 0.45), limbDarkening);
    vec3 col = albedo * (light * limb * brightness * exposure + earthshine * vec3(0.55, 0.65, 0.9));
    // The textures are sampled as linear light; encode for the screen.
    gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
  }`;

const ringFragment = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 sunLocal;
  uniform float brightness;
  uniform float inner;
  uniform float outer;
  uniform float flattening;
  uniform vec3 viewLocal;
  varying vec3 vLocal;
  // Is p hidden behind (or shadowed by) the flattened globe along direction d?
  float blocked(vec3 p, vec3 d) {
    float along = dot(p, d);
    vec3 perp = p - along * d;
    perp.y /= (1.0 - flattening);
    return (along < 0.0 && length(perp) < 1.0) ? 1.0 : 0.0;
  }
  void main() {
    // The rings are drawn after the globe without a depth test (the two are far too close for
    // the depth buffer), so the part behind the planet is cut out here.
    if (blocked(vLocal, normalize(viewLocal)) > 0.5) discard;
    float r = length(vLocal.xz);
    float u = (r - inner) / (outer - inner);
    if (u < 0.0 || u > 1.0) discard;
    vec4 c = texture2D(map, vec2(u, 0.5));
    // The planet's shadow on the rings: points behind the globe as seen from the Sun.
    vec3 s = normalize(sunLocal);
    float shadow = 1.0 - 0.88 * blocked(vLocal, s);
    float lit = 0.25 + 0.75 * clamp(abs(s.y) * 4.0, 0.0, 1.0);
    gl_FragColor = vec4(pow(c.rgb * brightness * lit * shadow * 1.6, vec3(1.0 / 2.2)), c.a);
  }`;

interface Body {
  id: BodyId;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  ring?: THREE.Mesh;
  ringMaterial?: THREE.ShaderMaterial;
}

const PLANET_TEXTURES: Partial<Record<BodyId, string>> = {
  mercury: 'mercury.jpg', venus: 'venus.jpg', mars: 'mars.jpg', jupiter: 'jupiter.jpg',
  saturn: 'saturn.jpg', uranus: 'uranus.jpg', neptune: 'neptune.jpg', moon: 'moon.jpg',
};

const EXPOSURE: Partial<Record<BodyId, number>> = { moon: 2.4, venus: 1.3, jupiter: 1.6, saturn: 1.7, mars: 1.5 };

const SATURN_RING_INNER = 1.239; // C ring inner edge, Saturn radii
const SATURN_RING_OUTER = 2.27; // A ring outer edge

export interface BodyPose {
  /** Horizon-frame unit vector to the body. */
  dir: Vec3;
  /** Angular radius in degrees (equatorial). */
  radius: number;
  /** Horizon-frame unit vector from the body to the Sun. */
  toSun: Vec3;
  /** Extra light on the dark side (earthshine on the Moon). */
  earthshine?: number;
}

export class SolarSystemBodies {
  readonly group = new THREE.Group();
  private bodies = new Map<BodyId, Body>();
  private moonPoints: THREE.Points;
  private moonGeometry = new THREE.BufferGeometry();
  /** Screen data of the Galilean moons for labels, horizon-frame directions. */
  galilean: { name: string; dir: Vec3; visible: boolean }[] = [];

  constructor(base: string, distance: number, starMaterial: THREE.ShaderMaterial) {
    const loader = new THREE.TextureLoader();
    const load = (file: string, srgb = true) => {
      const t = loader.load(base + file);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 4;
      return t;
    };
    const sphere = new THREE.SphereGeometry(1, 96, 48);
    for (const [id, file] of Object.entries(PLANET_TEXTURES) as [BodyId, string][]) {
      const material = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: load(file) },
          normalMap: { value: id === 'moon' ? load('moon-normal.jpg', false) : null },
          hasNormalMap: { value: id === 'moon' ? 1 : 0 },
          sunLocal: { value: new THREE.Vector3(1, 0, 0) },
          viewLocal: { value: new THREE.Vector3(0, 0, 1) },
          brightness: { value: 1 },
          limbDarkening: { value: id === 'jupiter' || id === 'saturn' || id === 'uranus' || id === 'neptune' ? 1 : id === 'venus' ? 0.6 : 0.1 },
          earthshine: { value: 0 },
          // The Moon is dazzling in a telescope; the planets' maps are already bright.
          exposure: { value: EXPOSURE[id] ?? 1.5 },
        },
        vertexShader: bodyVertex,
        fragmentShader: bodyFragment,
      });
      const mesh = new THREE.Mesh(sphere, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      const body: Body = { id, mesh, material };
      if (id === 'saturn') {
        const ringMaterial = new THREE.ShaderMaterial({
          uniforms: {
            map: { value: load('saturn-ring.png') },
            sunLocal: { value: new THREE.Vector3(1, 0, 0) },
            brightness: { value: 1 },
            inner: { value: SATURN_RING_INNER },
            outer: { value: SATURN_RING_OUTER },
            flattening: { value: bodyFlattening('saturn') },
            viewLocal: { value: new THREE.Vector3(0, 0, 1) },
          },
          vertexShader: bodyVertex,
          fragmentShader: ringFragment,
          transparent: true,
          depthWrite: false,
          depthTest: false,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(new THREE.RingGeometry(SATURN_RING_INNER, SATURN_RING_OUTER, 256, 1).rotateX(-Math.PI / 2), ringMaterial);
        ring.frustumCulled = false;
        ring.renderOrder = 5;
        mesh.add(ring);
        body.ring = ring;
        body.ringMaterial = ringMaterial;
      }
      this.bodies.set(id, body);
    }
    this.distance = distance;

    // Jupiter's moons as four star-like points.
    this.moonGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    this.moonGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 0.95, 0.85, 1, 1, 0.95, 0.9, 0.9, 0.85, 0.85, 0.8, 0.75]), 3));
    this.moonGeometry.setAttribute('mag', new THREE.BufferAttribute(new Float32Array(4).fill(99), 1));
    this.moonPoints = new THREE.Points(this.moonGeometry, starMaterial);
    this.moonPoints.frustumCulled = false;
    this.group.add(this.moonPoints);
  }

  private distance: number;
  private mirrored = false;

  /**
   * A mirrored image flips the winding of every triangle. The spheres are far too small for
   * the depth buffer to separate their front and back faces, so instead of drawing both
   * sides the culled side is swapped.
   */
  setMirrored(mirrored: boolean): void {
    if (mirrored === this.mirrored) return;
    this.mirrored = mirrored;
    for (const b of this.bodies.values()) {
      b.material.side = mirrored ? THREE.BackSide : THREE.FrontSide;
      b.material.needsUpdate = true;
    }
  }

  /**
   * Places and lights one body. `matrix` takes J2000 vectors to the horizon frame.
   * Returns whether it is drawn as a disc (larger than `minRadiusPx` on screen).
   */
  pose(id: BodyId, p: BodyPose, matrix: Mat3, jdTT: number, pxPerDeg: number, brightness: number, minRadiusPx = 1.6): boolean {
    const body = this.bodies.get(id)!;
    const radiusPx = p.radius * pxPerDeg;
    const show = radiusPx >= minRadiusPx;
    body.mesh.visible = show;
    if (!show) return false;
    const axes = bodyAxes(id, jdTT);
    // Body frame in the horizon frame: x -> prime meridian, y -> north pole, z -> -east.
    const x = mulMatVec(matrix, axes.prime);
    const y = mulMatVec(matrix, axes.pole);
    const z = mulMatVec(matrix, cross(axes.prime, axes.pole)); // = -east
    const rot = new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z));
    const size = this.distance * Math.tan(p.radius * (Math.PI / 180));
    body.mesh.position.set(p.dir[0] * this.distance, p.dir[1] * this.distance, p.dir[2] * this.distance);
    body.mesh.quaternion.setFromRotationMatrix(rot);
    body.mesh.scale.set(size, size * (1 - bodyFlattening(id)), size);
    // Directions in the body frame (inverse rotation = transpose).
    const toLocal = (v: Vec3) => new THREE.Vector3(
      v[0] * x[0] + v[1] * x[1] + v[2] * x[2],
      v[0] * y[0] + v[1] * y[1] + v[2] * y[2],
      v[0] * z[0] + v[1] * z[1] + v[2] * z[2],
    );
    const u = body.material.uniforms;
    u.sunLocal.value.copy(toLocal(p.toSun));
    u.viewLocal.value.copy(toLocal([-p.dir[0], -p.dir[1], -p.dir[2]]));
    u.brightness.value = brightness;
    u.earthshine.value = p.earthshine ?? 0;
    if (body.ringMaterial) {
      body.ringMaterial.uniforms.sunLocal.value.copy(u.sunLocal.value);
      body.ringMaterial.uniforms.brightness.value = brightness;
      body.ringMaterial.uniforms.viewLocal.value.copy(u.viewLocal.value);
    }
    return true;
  }

  hide(id: BodyId): void {
    this.bodies.get(id)!.mesh.visible = false;
  }

  /** Places Io, Europa, Ganymede and Callisto around Jupiter (horizon frame). */
  placeGalilean(jupiterDir: Vec3, jupiterRadiusDeg: number, matrix: Mat3, jdTT: number, flattening: number): void {
    const pole = mulMatVec(matrix, bodyAxes('jupiter', jdTT).pole);
    const s = jupiterDir;
    const d = pole[0] * s[0] + pole[1] * s[1] + pole[2] * s[2];
    let north: Vec3 = [pole[0] - d * s[0], pole[1] - d * s[1], pole[2] - d * s[2]];
    const nl = Math.hypot(...north);
    north = [north[0] / nl, north[1] / nl, north[2] / nl];
    const west = cross(s, north);
    const k = Math.tan(jupiterRadiusDeg * (Math.PI / 180));
    const pos = this.moonGeometry.getAttribute('position') as THREE.BufferAttribute;
    const mag = this.moonGeometry.getAttribute('mag') as THREE.BufferAttribute;
    this.galilean = galileanMoons(jdTT).map((m, i) => {
      const v: Vec3 = [s[0] + (m.x * west[0] + m.y * north[0]) * k, s[1] + (m.x * west[1] + m.y * north[1]) * k, s[2] + (m.x * west[2] + m.y * north[2]) * k];
      const l = Math.hypot(...v);
      const dir: Vec3 = [v[0] / l, v[1] / l, v[2] / l];
      const hidden = m.behind && m.x * m.x + (m.y / (1 - flattening)) ** 2 < 1;
      pos.setXYZ(i, dir[0] * this.distance * 0.999, dir[1] * this.distance * 0.999, dir[2] * this.distance * 0.999);
      mag.setX(i, hidden ? 99 : m.mag);
      return { name: m.name, dir, visible: !hidden };
    });
    pos.needsUpdate = mag.needsUpdate = true;
  }
}
