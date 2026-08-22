import { describe, expect, it } from 'vitest';
import { computeReleaseVelocity } from './stage-gestures';

describe('computeReleaseVelocity', () => {
  it('reads the mean velocity over the trailing window', () => {
    // 1 px/ms upward over the last 80ms
    const samples = Array.from({ length: 9 }, (_, i) => ({ t: i * 10, x: 0, y: -i * 10 }));
    const v = computeReleaseVelocity(samples, 80);
    expect(v).not.toBeNull();
    expect(v!.vx).toBeCloseTo(0, 6);
    expect(v!.vy).toBeCloseTo(-1000, 3); // px/s
  });

  it('ignores samples older than the window (drag, HOLD, then release = no fling)', () => {
    // fast motion long ago, then held still for 300ms
    const samples = [
      { t: 0, x: 0, y: 0 },
      { t: 20, x: 0, y: -200 },
      { t: 40, x: 0, y: -400 },
      { t: 340, x: 0, y: -400 },
    ];
    // only the final (stationary) sample is inside the 100ms window → null
    expect(computeReleaseVelocity(samples, 360)).toBeNull();
  });

  it('a stationary tail yields zero velocity, not a stale one', () => {
    const samples = [
      { t: 0, x: 0, y: -300 },
      { t: 40, x: 0, y: -400 },
      { t: 80, x: 0, y: -400 },
      { t: 120, x: 0, y: -400 },
    ];
    const v = computeReleaseVelocity(samples, 130);
    expect(v).not.toBeNull();
    expect(Math.abs(v!.vy)).toBeLessThan(1e-6);
  });

  it('too thin a trail is null (a plain tap must never fling)', () => {
    expect(computeReleaseVelocity([], 100)).toBeNull();
    expect(computeReleaseVelocity([{ t: 95, x: 0, y: 0 }], 100)).toBeNull();
    // two samples but nearly simultaneous — dt too small to trust
    expect(
      computeReleaseVelocity(
        [
          { t: 95, x: 0, y: 0 },
          { t: 99, x: 0, y: -40 },
        ],
        100,
      ),
    ).toBeNull();
  });
});
