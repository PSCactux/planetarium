// GLSL for star points and the sky dome.

export const starVertex = /* glsl */ `
attribute float mag;
attribute vec3 color;
uniform float limitMag;
uniform float pixelScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float rel = limitMag - mag; // how many magnitudes brighter than the limit
  if (rel < -0.3) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside the clip volume
    gl_PointSize = 0.0;
    return;
  }
  // Point size grows slowly with flux; faint stars fade out instead of shrinking.
  float flux = pow(10.0, 0.4 * max(rel, 0.0));
  gl_PointSize = pixelScale * clamp(2.6 * pow(flux, 0.27), 2.6, 32.0);
  vAlpha = clamp(0.35 + rel * 0.65, 0.0, 1.0);
  vColor = color;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const starFragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
  if (d > 1.0) discard;
  float core = 1.0 - smoothstep(0.12, 0.62, d); // smoothstep needs edge0 < edge1
  float halo = exp(-d * d * 3.5) * 0.45;
  float a = min(1.0, core + halo) * vAlpha;
  // Additive blending (SrcAlpha, One): the colour is weighted by alpha once.
  gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.4), a);
}
`;

export const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Cheap atmosphere: blends night, twilight and day gradients from the Sun's altitude.
export const skyFragment = /* glsl */ `
uniform vec3 sunDir;
uniform float enabled;
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  float h = max(dir.y, 0.0);
  float s = sunDir.y; // sine of the Sun's altitude
  float day = smoothstep(-0.10, 0.20, s);
  float twilight = smoothstep(-0.32, -0.04, s) * (1.0 - smoothstep(0.02, 0.30, s));
  float toSun = max(dot(dir, sunDir), 0.0);

  vec3 night = mix(vec3(0.012, 0.018, 0.045), vec3(0.0, 0.0, 0.012), pow(h, 0.5));
  vec3 dayCol = mix(vec3(0.62, 0.76, 0.92), vec3(0.16, 0.36, 0.74), pow(h, 0.45));
  vec3 col = mix(night, dayCol, day);

  // Twilight: deep blue overhead, orange glow low on the horizon towards the Sun.
  vec3 twiBlue = mix(vec3(0.22, 0.24, 0.42), vec3(0.04, 0.07, 0.2), pow(h, 0.5));
  col = mix(col, twiBlue, twilight * (1.0 - day) * 0.85);
  float horizonBand = pow(1.0 - h, 6.0);
  col += twilight * horizonBand * (0.25 + 0.75 * pow(toSun, 3.0)) * vec3(0.95, 0.45, 0.15);

  // Glare around the Sun in daylight.
  col += day * pow(toSun, 24.0) * vec3(0.5, 0.45, 0.35);

  vec3 off = vec3(0.0, 0.0, 0.008);
  gl_FragColor = vec4(mix(off, col, enabled), 1.0);
}
`;
