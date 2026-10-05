// Small vector / matrix helpers. Matrices are 3x3, row-major, as plain arrays.

export type Vec3 = [number, number, number];
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/** Normalizes an angle in degrees to [0, 360). */
export function norm360(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Unit vector for spherical coordinates (longitude/RA and latitude/Dec in degrees). */
export function sphericalToVec(lonDeg: number, latDeg: number): Vec3 {
  const cl = Math.cos(latDeg * DEG);
  return [cl * Math.cos(lonDeg * DEG), cl * Math.sin(lonDeg * DEG), Math.sin(latDeg * DEG)];
}

/** Inverse of sphericalToVec: returns [lonDeg in 0..360, latDeg]. */
export function vecToSpherical(v: Vec3): [number, number] {
  const r = Math.hypot(v[0], v[1], v[2]);
  return [norm360(Math.atan2(v[1], v[0]) * RAD), Math.asin(v[2] / r) * RAD];
}

export function mulMatVec(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function mulMat(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}

export function transpose(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

/** Rotation about the x axis by `deg` (rotates vectors, right-handed). */
export function rotX(deg: number): Mat3 {
  const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}

/** Rotation about the z axis by `deg` (rotates vectors, right-handed). */
export function rotZ(deg: number): Mat3 {
  const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}
