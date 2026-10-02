import { describe, expect, it } from 'vitest';
import {
  FLING_STOP,
  easeOutCubic,
  glideStep,
  rubberIn,
  rubberOut,
  springStep,
  zoomLerp,
} from '../src/motion';

describe('rubber-band resistance curve', () => {
  it('is invisible at zero and exactly invertible everywhere it is defined', () => {
    expect(rubberOut(0, 800)).toBe(0);
    for (const dimension of [320, 800, 1440]) {
      for (const distance of [1, 10, 50, 200, 1000, 5000]) {
        const stretch = rubberOut(distance, dimension);
        expect(rubberIn(stretch, dimension)).toBeCloseTo(distance, 6);
      }
    }
  });

  it('is monotone with diminishing returns, asymptotic to the viewport dimension', () => {
    const dimension = 800;
    let previous = 0;
    let previousGain = Infinity;
    for (let distance = 100; distance <= 4000; distance += 100) {
      const stretch = rubberOut(distance, dimension);
      expect(stretch).toBeGreaterThan(previous); // always some give
      expect(stretch).toBeLessThan(dimension); // never past the screen
      const gain = stretch - previous; // equal 100px finger increments…
      expect(gain).toBeLessThan(previousGain); // …buy ever less stretch
      previous = stretch;
      previousGain = gain;
    }
    expect(rubberOut(1e9, dimension)).toBeLessThan(dimension); // asymptote holds absurdly far out
  });
});

describe('glide (fling decay)', () => {
  it('decays exponentially and declares rest below the stop threshold', () => {
    let position = 0;
    let velocity = 1.2; // px/ms ≈ a real flick
    let done = false;
    let ms = 0;
    while (!done && ms < 60000) {
      ({ position, velocity, done } = glideStep(position, velocity, 16));
      ms += 16;
    }
    expect(done).toBe(true);
    expect(velocity).toBe(0);
    expect(position).toBeGreaterThan(0); // it travelled
    // UIScrollView's projection: total distance ≈ v0 / (1 − decay) — the
    // stop-threshold truncation forfeits only the sub-perceptual tail
    expect(position).toBeCloseTo(1.2 / (1 - 0.998), -2);
  });

  it('is frame-rate independent (two 8ms steps ≈ one 16ms step)', () => {
    const one = glideStep(0, 1, 16);
    const firstHalf = glideStep(0, 1, 8);
    const secondHalf = glideStep(firstHalf.position, firstHalf.velocity, 8);
    expect(secondHalf.velocity).toBeCloseTo(one.velocity, 12); // velocity decay is exact
    expect(secondHalf.position).toBeCloseTo(one.position, 2); // position via midpoint integral (≈, not =)
  });
});

describe('spring (critically damped return)', () => {
  it('converges from a displacement to EXACTLY the edge, without crossing it', () => {
    let position = 120;
    let velocity = 0;
    let done = false;
    let ms = 0;
    while (!done && ms < 10000) {
      ({ position, velocity, done } = springStep(position, velocity, 0, 16));
      expect(position).toBeGreaterThanOrEqual(0); // critical damping: no oscillation
      ms += 16;
    }
    expect(done).toBe(true);
    expect(position).toBe(0); // snapped, not merely near
    expect(ms).toBeLessThan(1500); // settles on the ~400ms scale, not seconds
  });

  it('carries incoming velocity into a bounce: overshoots once, then settles home', () => {
    let position = 0;
    let velocity = -1.5; // arrives at the edge with glide velocity
    let done = false;
    let minPosition = 0;
    let ms = 0;
    while (!done && ms < 10000) {
      ({ position, velocity, done } = springStep(position, velocity, 0, 16));
      minPosition = Math.min(minPosition, position);
      ms += 16;
    }
    expect(minPosition).toBeLessThan(-5); // a visible bounce grew out of the velocity
    expect(position).toBe(0); // and it still lands exactly on the clamp
  });
});

describe('tween interpolators', () => {
  it('easeOutCubic hits both endpoints and is monotone', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    let previous = -1;
    for (let progress = 0; progress <= 1.001; progress += 0.05) {
      const eased = easeOutCubic(Math.min(1, progress));
      expect(eased).toBeGreaterThan(previous);
      previous = eased;
    }
  });

  it('zoomLerp interpolates geometrically: the midpoint is the geometric mean', () => {
    expect(zoomLerp(1, 4, 0)).toBe(1);
    expect(zoomLerp(1, 4, 1)).toBeCloseTo(4, 12);
    expect(zoomLerp(1, 4, 0.5)).toBeCloseTo(2, 12); // √(1·4), not 2.5
    expect(zoomLerp(4, 1, 0.5)).toBeCloseTo(2, 12); // symmetric in direction
  });
});

describe('constants stay in the perceptual ranges the laws were tuned for', () => {
  it('FLING_STOP reads as "stopped" (≈20 px/s)', () => {
    expect(FLING_STOP * 1000).toBeCloseTo(20, 6);
  });
});
