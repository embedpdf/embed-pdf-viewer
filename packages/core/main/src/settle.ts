/**
 * Settling a document: before something reads the whole file (a download), everything its
 * plugins hold back from the engine is sent, and the engine has answered. Each plugin registers
 * a flush with `ctx.onSettle()` for what it holds back: text typed a moment ago, a drawing waiting
 * for its next stroke, the writes on their way in its write queue. The rules are in
 * `docs/conventions/state-and-sync.md`.
 *
 * A flush that fails doesn't stop the read: the file is then what the engine has, and the plugin
 * reports its own failure.
 */
import { PluginError } from './errors';

/** Sends what a plugin holds back; resolves once the engine has it. */
export type SettleFlush = (signal: AbortSignal) => Promise<void> | void;

/**
 * Run every flush and wait for all of them. Rejects with `operation-cancelled` as soon as one of
 * `signals` aborts, such as the caller's or the document's own (it aborts when the document
 * closes).
 */
export async function settle(
  flushes: ReadonlySet<SettleFlush>,
  signals: readonly (AbortSignal | undefined)[],
  report: (error: unknown) => void,
): Promise<void> {
  const stop = new AbortController();
  const listening = signals.filter((signal): signal is AbortSignal => signal !== undefined);
  const abort = () => stop.abort();
  for (const signal of listening) {
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  }
  try {
    const work = (async () => {
      const running = [...flushes].map(async (flush) => flush(stop.signal));
      for (const outcome of await Promise.allSettled(running)) {
        if (outcome.status === 'rejected') report(outcome.reason);
      }
    })();
    await whileNotAborted(work, stop.signal);
  } finally {
    for (const signal of listening) signal.removeEventListener('abort', abort);
  }
}

/** `work`, or `operation-cancelled` as soon as `signal` aborts. */
async function whileNotAborted(work: Promise<void>, signal: AbortSignal): Promise<void> {
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () =>
      reject(new PluginError('operation-cancelled', 'documents', 'settling was cancelled'));
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    await Promise.race([work, aborted]);
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}
