// Where a phone is pointing, from the Device Orientation API angles.
import { DEG, RAD, norm360, type Vec3 } from './math';

export interface Pointing {
  /** Altitude and azimuth (from north through east) of the back camera's direction, degrees. */
  alt: number;
  az: number;
  /** Rotation of the screen around the view direction, radians; 0 when its top points to the zenith. */
  roll: number;
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Device frame (x right, y up the screen, z out of the screen) to the local east-north-up
 * frame, R = Rz(alpha) Rx(beta) Ry(gamma) as in the W3C specification. `alpha` must be
 * measured from north (an absolute orientation or a compass heading).
 */
export function deviceToEnu(alpha: number, beta: number, gamma: number): (v: Vec3) => Vec3 {
  const a = alpha * DEG, b = beta * DEG, g = gamma * DEG;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
  const m = [
    ca * cg - sa * sb * sg, -sa * cb, ca * sg + sa * sb * cg,
    sa * cg + ca * sb * sg, ca * cb, sa * sg - ca * sb * cg,
    -cb * sg, sb, cb * cg,
  ];
  return (v) => [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/**
 * Pointing of the back camera. `screenAngle` is the screen orientation (0, 90, 180, 270):
 * in landscape the top of the picture is a side of the device.
 */
export function pointing(alpha: number, beta: number, gamma: number, screenAngle = 0): Pointing {
  const toEnu = deviceToEnu(alpha, beta, gamma);
  const view = toEnu([0, 0, -1]);
  const s = screenAngle * DEG;
  const up = toEnu([Math.sin(s), Math.cos(s), 0]);
  return fromVectors(view, up);
}

/** Pointing from the view direction and the screen's up direction, both in east-north-up. */
export function fromVectors(view: Vec3, up: Vec3): Pointing {
  const alt = Math.asin(Math.max(-1, Math.min(1, view[2]))) * RAD;
  const az = norm360(Math.atan2(view[0], view[1]) * RAD);
  // Natural up: towards the zenith, square to the view. Looking straight up it is undefined,
  // so north stands in for it.
  let n: Vec3 = [-view[2] * view[0], -view[2] * view[1], 1 - view[2] * view[2]];
  if (Math.hypot(...n) < 1e-6) n = [0, 1, 0];
  const roll = -Math.atan2(dot(cross(n, up), view), dot(n, up));
  return { alt, az, roll };
}
