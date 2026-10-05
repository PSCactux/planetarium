/**
 * Approximate RGB (0..1) of a star from its B-V colour index:
 * B-V -> effective temperature (Ballesteros 2012), then a blackbody-to-RGB fit
 * (Tanner Helland). The result is softened towards white, as the eye sees it.
 */
export function bvToRgb(bv: number): [number, number, number] {
  const b = Math.max(-0.4, Math.min(2.0, bv));
  const t = 4600 * (1 / (0.92 * b + 1.7) + 1 / (0.92 * b + 0.62));
  const k = t / 100;
  let r: number, g: number, bl: number;
  if (k <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(k) - 161.1195681661;
    bl = k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(k - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(k - 60, -0.0755148492);
    bl = 255;
  }
  const clamp = (x: number) => Math.max(0, Math.min(255, x)) / 255;
  const soften = (x: number) => 0.35 + 0.65 * x;
  return [soften(clamp(r)), soften(clamp(g)), soften(clamp(bl))];
}
