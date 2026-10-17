import { AbortError } from '@embedpdf/engine-core/runtime';

/**
 * Throw if the AbortSignal has been aborted. Service code calls this between
 * PDFium calls. It only sees an abort the thread has received, and a worker
 * thread receives messages only while it awaits: work that never pauses (see
 * `Slices`) sees an abort sent while it ran only when it is done.
 */
export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const reason = signal.reason;
    if (reason instanceof Error) throw reason;
    throw new AbortError(reason);
  }
}
