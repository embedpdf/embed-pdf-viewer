/**
 * Returns a function that lets the event loop run once, so the messages
 * waiting for this thread (an `abort`, above all) are received before the
 * caller goes on.
 *
 * The primitive that does that depends on where the engine runs. Measured
 * (Sep 2026) with 8 ms slices of work and an abort posted from the parent:
 * - Node worker thread: `setImmediate` receives the message within one slice,
 *   at 0.25 ms a yield. A `MessageChannel` never lets it in (2 s of slices),
 *   and `setTimeout(0)` costs about 1 ms a yield.
 * - Browser worker (Chromium): a `MessageChannel` receives it within one
 *   slice, at 0.06 ms a yield. `scheduler.yield()` never lets it in, and
 *   `setTimeout(0)` costs 0.7 ms a yield.
 */
export function createEventLoopYield(): () => Promise<void> {
  if (typeof setImmediate === 'function') {
    return () => new Promise<void>((resolve) => setImmediate(resolve));
  }
  if (typeof MessageChannel === 'function') {
    const channel = new MessageChannel();
    const waiting: Array<() => void> = [];
    channel.port1.onmessage = () => waiting.shift()?.();
    return () =>
      new Promise<void>((resolve) => {
        waiting.push(resolve);
        channel.port2.postMessage(null);
      });
  }
  return () => new Promise<void>((resolve) => setTimeout(resolve, 0));
}
