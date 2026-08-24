/**
 * The camera's MOTION vocabulary — every formula, pure.
 *
 * The capability owns the impure drivers (scheduler frames, dispatch, gesture
 * state); the LAWS those drivers integrate live here, parameterized by dt/t
 * with no state, no scheduler, no dispatch — unit-testable in isolation, and
 * with zero plugin dependencies, liftable into stage-core if the native port
 * ever wants them.
 *
 * Two families:
 *   • ballistic — one per-axis law for every free motion: `glideStep` (the
 *     touch fling, decaying on UIScrollView's curve) and `springStep` (a
 *     critically-damped return to the clamp). A glide that reaches a content
 *     edge converts to a spring with its velocity carried in, so the bounce
 *     grows out of physics rather than a scripted overshoot.
 *   • resistance — the iOS rubber-band curve `rubberOut` and its exact
 *     inverse `rubberIn`: dragging `d` px past an edge displays an
 *     asymptotically-bounded stretch, and re-entering a gesture over a
 *     stretched camera (the mid-bounce catch) reconstructs the
 *     finger-integrated position the curve came from.
 * Plus the tween interpolators: `easeOutCubic` for coordinate tweens and
 * `zoomLerp` — GEOMETRIC zoom interpolation (zoom is multiplicative; equal
 * ratios per unit time, not equal deltas — the linear lerp's visible "dip").
 */

// ── constants ─────────────────────────────────────────────────────────────────
/** Resistance coefficient of the rubber-band curve (the iOS feel). */
export const RUBBER = 0.55;
/** Glide decay per ms — UIScrollView's normal deceleration rate. */
export const FLING_DECAY = 0.998;
/** px/ms — below ~20 px/s the eye reads "stopped". */
export const FLING_STOP = 0.02;
/** rad/ms — critically damped, ~400ms to settle. */
export const SPRING_OMEGA = 0.015;

// ── resistance (rubber-band) ──────────────────────────────────────────────────
/**
 * Overshoot distance → displayed stretch: asymptotic to the viewport
 * dimension `dim`, so the content never leaves the screen however far the
 * finger travels. `rubberOut(0) === 0` — inside the bounds the curve is
 * invisible.
 */
export const rubberOut = (d: number, dim: number): number => (1 - 1 / ((d * RUBBER) / dim + 1)) * dim;
/** Exact inverse of `rubberOut` (defined for `out < dim`). */
export const rubberIn = (out: number, dim: number): number => (out * dim) / (RUBBER * (dim - out));

// ── ballistic (one axis, one frame) ───────────────────────────────────────────
/** The state one integration step hands back; `done` means "at rest". */
export interface MotionStep {
  p: number;
  v: number;
  done: boolean;
}
/**
 * One frame of free glide: exponential velocity decay, position advanced by
 * the midpoint integral of the decay over `dt` (exact for the exponential —
 * frame-rate independent).
 */
export const glideStep = (p: number, v: number, dt: number): MotionStep => {
  const k = Math.pow(FLING_DECAY, dt);
  const np = p + v * ((dt * (1 + k)) / 2);
  const nv = v * k;
  return Math.abs(nv) < FLING_STOP ? { p: np, v: 0, done: true } : { p: np, v: nv, done: false };
};
/**
 * One frame of critically-damped spring toward `edge` — semi-implicit Euler
 * on x'' = −ω²(x−e) − 2ωx'. Lands exactly ON the edge (position snapped,
 * velocity zeroed) once inside half a pixel at negligible speed.
 */
export const springStep = (p: number, v: number, edge: number, dt: number): MotionStep => {
  const nv = v + (-SPRING_OMEGA * SPRING_OMEGA * (p - edge) - 2 * SPRING_OMEGA * v) * dt;
  const np = p + nv * dt;
  if (Math.abs(np - edge) < 0.5 && Math.abs(nv) < 0.01) return { p: edge, v: 0, done: true };
  return { p: np, v: nv, done: false };
};

// ── tween interpolators ───────────────────────────────────────────────────────
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
/**
 * Geometric zoom interpolation: `z0·(z1/z0)^k`. Zoom is multiplicative, so a
 * constant-RATE zoom moves equal ratios per unit time; interpolating the
 * level linearly instead makes the start rush and the end crawl (and, under
 * a focal anchor, swings the anchored point along a curved path).
 */
export const zoomLerp = (z0: number, z1: number, k: number): number => z0 * Math.pow(z1 / z0, k);
