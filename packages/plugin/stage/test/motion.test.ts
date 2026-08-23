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
    for (const dim of [320, 800, 1440]) {
      for (const d of [1, 10, 50, 200, 1000, 5000]) {
        const out = rubberOut(d, dim);
        expect(rubberIn(out, dim)).toBeCloseTo(d, 6);
      }
    }
  });

  it('is monotone with diminishing returns, asymptotic to the viewport dimension', () => {
    const dim = 800;
    let prev = 0;
    let prevGain = Infinity;
    for (let d = 100; d <= 4000; d += 100) {
      const out = rubberOut(d, dim);
      expect(out).toBeGreaterThan(prev); // always some give
      expect(out).toBeLessThan(dim); // never past the screen
      const gain = out - prev; // equal 100px finger increments…
      expect(gain).toBeLessThan(prevGain); // …buy ever less stretch
      prev = out;
      prevGain = gain;
    }
    expect(rubberOut(1e9, dim)).toBeLessThan(dim); // asymptote holds absurdly far out
  });
});

describe('glide (fling decay)', () => {
  it('decays exponentially and declares rest below the stop threshold', () => {
    let p = 0;
    let v = 1.2; // px/ms ≈ a real flick
    let done = false;
    let ms = 0;
    while (!done && ms < 60000) {
      ({ p, v, done } = glideStep(p, v, 16));
      ms += 16;
    }
    expect(done).toBe(true);
    expect(v).toBe(0);
    expect(p).toBeGreaterThan(0); // it travelled
    // UIScrollView's projection: total distance ≈ v0 / (1 − decay) — the
    // stop-threshold truncation forfeits only the sub-perceptual tail
    expect(p).toBeCloseTo(1.2 / (1 - 0.998), -2);
  });

  it('is frame-rate independent (two 8ms steps ≈ one 16ms step)', () => {
    const one = glideStep(0, 1, 16);
    const a = glideStep(0, 1, 8);
    const b = glideStep(a.p, a.v, 8);
    expect(b.v).toBeCloseTo(one.v, 12); // velocity decay is exact
    expect(b.p).toBeCloseTo(one.p, 2); // position via midpoint integral (≈, not =)
  });
});

describe('spring (critically damped return)', () => {
  it('converges from a displacement to EXACTLY the edge, without crossing it', () => {
    let p = 120;
    let v = 0;
    let done = false;
    let ms = 0;
    while (!done && ms < 10000) {
      ({ p, v, done } = springStep(p, v, 0, 16));
      expect(p).toBeGreaterThanOrEqual(0); // critical damping: no oscillation
      ms += 16;
    }
    expect(done).toBe(true);
    expect(p).toBe(0); // snapped, not merely near
    expect(ms).toBeLessThan(1500); // settles on the ~400ms scale, not seconds
  });

  it('carries incoming velocity into a bounce: overshoots once, then settles home', () => {
    let p = 0;
    let v = -1.5; // arrives AT the edge with glide velocity
    let done = false;
    let minP = 0;
    let ms = 0;
    while (!done && ms < 10000) {
      ({ p, v, done } = springStep(p, v, 0, 16));
      minP = Math.min(minP, p);
      ms += 16;
    }
    expect(minP).toBeLessThan(-5); // a visible bounce grew out of the velocity
    expect(p).toBe(0); // and it still lands exactly on the clamp
  });
});

describe('tween interpolators', () => {
  it('easeOutCubic hits both endpoints and is monotone', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    let prev = -1;
    for (let t = 0; t <= 1.001; t += 0.05) {
      const k = easeOutCubic(Math.min(1, t));
      expect(k).toBeGreaterThan(prev);
      prev = k;
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
