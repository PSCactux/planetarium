import * as THREE from 'three';

/**
 * The Milky Way: NASA/GSFC Deep Star Maps 2020 (diffuse light only, the stars are drawn
 * separately) on a sphere in the J2000 frame. The map is a plate carrée centred on
 * RA 0h with RA increasing to the left, as seen from inside.
 */
export class MilkyWay {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  constructor(radius: number, url: string) {
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, intensity: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position; // J2000 frame: the parent group rotates it to the horizon
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform float intensity;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float ra = atan(d.y, d.x);
          vec2 uv = vec2(fract(0.5 - ra / 6.2831853), 0.5 + asin(clamp(d.z, -1.0, 1.0)) / 3.1415927);
          vec3 c = texture2D(map, uv).rgb;
          // Square the stored (gamma-encoded) values: keeps the faint outer glow subtle. The eye
          // sees the Milky Way with little colour, so most of the photo's saturation goes.
          c *= c;
          c = mix(vec3(dot(c, vec3(0.3, 0.5, 0.2))), c, 0.45);
          gl_FragColor = vec4(c * intensity, 1.0);
        }`,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 48), this.material);
    this.mesh.renderOrder = -9;
    this.mesh.frustumCulled = false;
    new THREE.TextureLoader().load(url, (tex) => {
      // No mipmaps: the RA seam of the plate carrée would show as a line.
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      this.material.uniforms.map.value = tex;
    });
  }

  set intensity(v: number) {
    this.material.uniforms.intensity.value = this.material.uniforms.map.value ? v : 0;
    this.mesh.visible = v > 0.002;
  }
}
