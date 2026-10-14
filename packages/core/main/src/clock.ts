/**
 * Time, as the host keeps it. Plugins never read timers or frames from the
 * environment: they ask their context (`ctx.clock`), and the host that built
 * the kernel says what a timer and a frame are (`createKernel({ clock })`).
 *
 * - A browser host passes `browserClock()` from `@embedpdf/web`: timers, and
 *   frames from `requestAnimationFrame`. The framework viewers do this.
 * - Without one, the kernel uses {@link timerClock}: timers only, no frames.
 *   Every JavaScript runtime has timers, so a kernel in Node, a worker or a
 *   test needs no setup.
 * - Tests that step time pass `manualClock()` from `@embedpdf/core/testing`.
 *
 * What an instance schedules belongs to it ({@link instanceClock}): it is
 * cancelled when the instance closes, and nothing runs after that.
 *
 * This file is the one place in the kernel and the plugins that touches the
 * environment's timers (the lint rule in `eslint.config.js` says so).
 */

/** Cancels what a clock call scheduled. Does nothing once it ran or was cancelled. */
export type Cancel = () => void;

/** What a host provides: the kernel's only source of time. */
export interface HostClock {
  /** Milliseconds on a clock that only goes forward. */
  now(): number;
  /** Run `run` once, `ms` milliseconds from now. */
  after(ms: number, run: () => void): Cancel;
  /**
   * Run `run` once, just before the host next paints, with the frame's time
   * on the `now()` clock. Absent on a host that never paints.
   */
  nextFrame?(run: (timeMs: number) => void): Cancel;
}

/** A plugin instance's clock: `ctx.clock`. */
export interface PluginClock {
  /** Run `run` once, `ms` milliseconds from now. */
  after(ms: number, run: () => void): Cancel;
  /**
   * Run `run` once, just before the host next paints, with the frame's time in
   * milliseconds. On a host that never paints: as soon as possible.
   */
  nextFrame(run: (timeMs: number) => void): Cancel;
  /** False on a host that never paints (Node, a worker, most tests): animations jump to their end. */
  readonly hasFrames: boolean;
}

/** Timers only, no frames: the kernel's default. */
export const timerClock: HostClock = {
  now: () => performance.now(),
  after(ms, run) {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
};

/**
 * The clock of one plugin instance, over the host's. What it schedules is
 * cancelled when `lifetime` aborts (the instance closes), and nothing it
 * schedules after that runs.
 */
export function instanceClock(host: HostClock, lifetime: AbortSignal): PluginClock {
  const pending = new Set<Cancel>();
  lifetime.addEventListener(
    'abort',
    () => {
      for (const cancel of [...pending]) cancel();
    },
    { once: true },
  );

  /** Schedules `run` with the host and keeps it until it runs or is cancelled. */
  const own = <Args extends unknown[]>(
    schedule: (fire: (...args: Args) => void) => Cancel,
    run: (...args: Args) => void,
  ): Cancel => {
    if (lifetime.aborted) return () => {};
    let done = false;
    let cancelWithHost: Cancel = () => {};
    const cancel: Cancel = () => {
      if (done) return;
      done = true;
      pending.delete(cancel);
      cancelWithHost();
    };
    pending.add(cancel);
    cancelWithHost = schedule((...args) => {
      if (done) return;
      done = true;
      pending.delete(cancel);
      run(...args);
    });
    return cancel;
  };

  // A host that never paints has no frame to wait for: the callback runs as
  // soon as the current work is done.
  const nextFrameOfHost = (run: (timeMs: number) => void): Cancel =>
    host.nextFrame ? host.nextFrame(run) : host.after(0, () => run(host.now()));

  return {
    after: (ms, run) => own((fire) => host.after(ms, fire), run),
    nextFrame: (run) => own(nextFrameOfHost, run),
    hasFrames: host.nextFrame !== undefined,
  };
}
