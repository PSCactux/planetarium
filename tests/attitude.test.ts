import { describe, expect, it } from 'vitest';
import { fromVectors, pointing } from '../src/astro/attitude';

const angle = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('phone pointing', () => {
  it('looks at the horizon to the north when held upright facing north', () => {
    const p = pointing(0, 90, 0);
    expect(p.alt).toBeCloseTo(0, 6);
    expect(angle(p.az, 0)).toBeLessThan(1e-6);
    expect(p.roll).toBeCloseTo(0, 6);
  });

  it('follows the compass: alpha counts counter-clockwise from north', () => {
    // Turning the phone to the east lowers alpha to 270.
    expect(angle(pointing(270, 90, 0).az, 90)).toBeLessThan(1e-6);
    expect(angle(pointing(90, 90, 0).az, 270)).toBeLessThan(1e-6);
  });

  it('tilts up with beta', () => {
    expect(pointing(0, 135, 0).alt).toBeCloseTo(45, 6);
  });

  it('looks straight down when lying flat, screen up', () => {
    expect(pointing(0, 0, 0).alt).toBeCloseTo(-90, 6);
  });

  it('keeps the horizon level for a phone held in landscape', () => {
    // Rotated a quarter turn counter-clockwise, back camera to the north: the device's right edge
    // points up and the screen shows the picture turned by 90°.
    const p = pointing(90, 0, -90, 90);
    expect(p.alt).toBeCloseTo(0, 6);
    expect(angle(p.az, 0)).toBeLessThan(1e-6);
    expect(p.roll).toBeCloseTo(0, 6);
  });

  it('rolls the picture when the phone is tilted sideways', () => {
    // Looking north at the horizon with the top of the screen leaning 20° to the east or west.
    const tilt = (20 * Math.PI) / 180;
    const east = fromVectors([0, 1, 0], [Math.sin(tilt), 0, Math.cos(tilt)]).roll;
    const west = fromVectors([0, 1, 0], [-Math.sin(tilt), 0, Math.cos(tilt)]).roll;
    expect(Math.abs(east)).toBeCloseTo(tilt, 6);
    expect(west).toBeCloseTo(-east, 6);
  });

  it('reports the roll of an upright phone turned to landscape', () => {
    // Upright, facing north, screen turned so its top points west (left): the picture rolls by 90°.
    const p = pointing(0, 90, 0, 90);
    expect(Math.abs(p.roll)).toBeCloseTo(Math.PI / 2, 6);
    expect(p.alt).toBeCloseTo(0, 6);
  });
});
