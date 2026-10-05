/**
 * The browser's time, for the kernel: `createKernel({ clock: browserClock() })`.
 * Timers, and frames from `requestAnimationFrame`, so plugins can animate and
 * merge their wake-ups into one per painted frame. Structurally `HostClock`
 * from `@embedpdf/core`, declared here so this package stays dependency-free.
 */

/** Structural twin of `HostClock` (`@embedpdf/core`). */
export interface WebClock {
  now(): number;
  after(ms: number, run: () => void): () => void;
  nextFrame?(run: (timeMs: number) => void): () => void;
}

/**
 * The browser's clock. A page without `requestAnimationFrame` (some test
 * environments) gets a clock without frames, and plugins then skip animation.
 */
export function browserClock(): WebClock {
  const clock: WebClock = {
    now: () => performance.now(),
    after(ms, run) {
      const timer = setTimeout(run, ms);
      return () => clearTimeout(timer);
    },
  };
  if (typeof requestAnimationFrame === 'function') {
    clock.nextFrame = (run) => {
      const frame = requestAnimationFrame(run);
      return () => cancelAnimationFrame(frame);
    };
  }
  return clock;
}
