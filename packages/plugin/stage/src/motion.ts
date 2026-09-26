/**
 * The camera's motion vocabulary, every formula pure.
 *
 * The capability owns the impure drivers (scheduler frames, state writes,
 * gesture state); the laws those drivers integrate live here, parameterized
 * by elapsed time with no state and no scheduler, so they are unit-testable in
 * isolation and have no plugin dependencies.
 *
 * Two families:
 *   • ballistic — one per-axis law for every free motion: `glideStep` (the
 *     touch fling, decaying on UIScrollView's curve) and `springStep` (a
 *     critically-damped return to the clamp). A glide that reaches a content
 *     edge converts to a spring with its velocity carried in, so the bounce
 *     grows out of physics rather than a scripted overshoot.
 *   • resistance — the iOS rubber-band curve `rubberOut` and its exact inverse
 *     `rubberIn`: dragging past an edge displays an asymptotically bounded
 *     stretch, and re-entering a gesture over a stretched camera (catching it
 *     mid-bounce) reconstructs the finger-integrated position the curve came
 *     from.
 * Plus the tween interpolators: `easeOutCubic` for coordinate tweens and
 * `zoomLerp`, a geometric zoom interpolation (zoom is multiplicative: equal
 * ratios per unit time, not equal deltas).
 */

// ── constants ──
/** Resistance coefficient of the rubber-band curve (the iOS feel). */
export const RUBBER = 0.55;
/** Glide decay per ms: UIScrollView's normal deceleration rate. */
export const FLING_DECAY = 0.998;
/** px/ms; below about 20 px/s the eye reads "stopped". */
export const FLING_STOP = 0.02;
/** rad/ms; critically damped, settling in about 400 ms. */
export const SPRING_OMEGA = 0.015;

// ── resistance (rubber-band) ──
/**
 * Overshoot distance → displayed stretch, asymptotic to the viewport
 * dimension, so the content never leaves the screen however far the finger
 * travels. `rubberOut(0) === 0`: inside the bounds the curve is invisible.
 */
export const rubberOut = (distance: number, dimension: number): number =>
  (1 - 1 / ((distance * RUBBER) / dimension + 1)) * dimension;
/** The exact inverse of `rubberOut` (defined for `stretch < dimension`). */
export const rubberIn = (stretch: number, dimension: number): number =>
  (stretch * dimension) / (RUBBER * (dimension - stretch));

// ── ballistic (one axis, one frame) ──
/** The state one integration step hands back; `done` means "at rest". */
export interface MotionStep {
  position: number;
  velocity: number;
  done: boolean;
}
/**
 * One frame of free glide: exponential velocity decay, the position advanced
 * by the midpoint integral of the decay over `elapsedMs` (exact for the
 * exponential, so frame-rate independent).
 */
export const glideStep = (position: number, velocity: number, elapsedMs: number): MotionStep => {
  const decay = Math.pow(FLING_DECAY, elapsedMs);
  const nextPosition = position + velocity * ((elapsedMs * (1 + decay)) / 2);
  const nextVelocity = velocity * decay;
  return Math.abs(nextVelocity) < FLING_STOP
    ? { position: nextPosition, velocity: 0, done: true }
    : { position: nextPosition, velocity: nextVelocity, done: false };
};
/**
 * One frame of a critically-damped spring toward `edge`: semi-implicit Euler
 * on x'' = −ω²(x−e) − 2ωx'. Lands exactly on the edge (position snapped,
 * velocity zeroed) once within half a pixel at negligible speed.
 */
export const springStep = (
  position: number,
  velocity: number,
  edge: number,
  elapsedMs: number,
): MotionStep => {
  const nextVelocity =
    velocity +
    (-SPRING_OMEGA * SPRING_OMEGA * (position - edge) - 2 * SPRING_OMEGA * velocity) * elapsedMs;
  const nextPosition = position + nextVelocity * elapsedMs;
  if (Math.abs(nextPosition - edge) < 0.5 && Math.abs(nextVelocity) < 0.01) {
    return { position: edge, velocity: 0, done: true };
  }
  return { position: nextPosition, velocity: nextVelocity, done: false };
};

// ── tween interpolators ──
export const easeOutCubic = (progress: number): number => 1 - Math.pow(1 - progress, 3);
/**
 * Geometric zoom interpolation: `from·(to/from)^progress`. Zoom is
 * multiplicative, so a constant-rate zoom moves equal ratios per unit time;
 * interpolating the level linearly makes the start rush and the end crawl
 * (and, under a focal anchor, swings the anchored point along a curve).
 */
export const zoomLerp = (from: number, to: number, progress: number): number =>
  from * Math.pow(to / from, progress);
