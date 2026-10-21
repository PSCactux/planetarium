// "Point your phone at the sky": follows the device's orientation sensors.
import { type Pointing, pointing } from '../astro/attitude';
import { DEG } from '../astro/math';

type OrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };
type PermissionApi = { requestPermission?: () => Promise<'granted' | 'denied'> };

export function gyroAvailable(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window && matchMedia('(pointer: coarse)').matches;
}

/**
 * Smoothed pointing of the back camera. Android gives an absolute orientation; iOS gives a
 * relative one plus a compass heading, which fixes the offset around the vertical.
 */
export class GyroControl {
  private active = false;
  private eventName: 'deviceorientationabsolute' | 'deviceorientation' = 'deviceorientation';
  private view: [number, number, number] | null = null;
  private up: [number, number, number] | null = null;
  private headingOffset: number | null = null;
  private handler = (e: Event) => this.onOrientation(e as OrientationEvent);

  constructor(private onPointing: (p: Pointing) => void) {}

  get running(): boolean {
    return this.active;
  }

  /** Must be called from a user gesture (iOS asks for permission). Resolves to false if refused. */
  async start(): Promise<boolean> {
    const api = (window.DeviceOrientationEvent as unknown as PermissionApi);
    if (typeof api.requestPermission === 'function') {
      try {
        if ((await api.requestPermission()) !== 'granted') return false;
      } catch {
        return false;
      }
    }
    this.eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    this.view = this.up = null;
    this.headingOffset = null;
    window.addEventListener(this.eventName, this.handler);
    this.active = true;
    return true;
  }

  stop(): void {
    window.removeEventListener(this.eventName, this.handler);
    this.active = false;
  }

  private onOrientation(e: OrientationEvent): void {
    if (e.alpha === null || e.beta === null || e.gamma === null) return;
    const screenAngle = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number;
    const raw = pointing(e.alpha, e.beta, e.gamma, screenAngle);
    // Back to vectors to smooth them: angles jump at 0/360 and near the zenith.
    const k = 0.25;
    const v = toVec(raw.alt, raw.az);
    this.view = this.view ? normalise(lerp(this.view, v, k)) : v;
    const rollVec: [number, number, number] = [Math.cos(raw.roll), Math.sin(raw.roll), 0];
    this.up = this.up ? normalise(lerp(this.up, rollVec, k)) : rollVec;
    let az = Math.atan2(this.view[0], this.view[1]) / DEG;
    const alt = Math.asin(Math.max(-1, Math.min(1, this.view[2]))) / DEG;
    // iOS: alpha is relative; the compass heading (valid with the phone fairly upright) sets the offset.
    if (typeof e.webkitCompassHeading === 'number' && !e.absolute) {
      if (alt > -50) {
        const offset = wrap(e.webkitCompassHeading - az);
        this.headingOffset = this.headingOffset === null ? offset : wrap(this.headingOffset + wrap(offset - this.headingOffset) * 0.1);
      }
      az += this.headingOffset ?? 0;
    }
    this.onPointing({ alt, az: (az + 360) % 360, roll: Math.atan2(this.up[1], this.up[0]) });
  }
}

const wrap = (a: number) => ((a + 540) % 360) - 180;
const toVec = (alt: number, az: number): [number, number, number] => {
  const ca = Math.cos(alt * DEG);
  return [ca * Math.sin(az * DEG), ca * Math.cos(az * DEG), Math.sin(alt * DEG)];
};
const lerp = (a: number[], b: number[], k: number): [number, number, number] => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const normalise = (v: [number, number, number]): [number, number, number] => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
