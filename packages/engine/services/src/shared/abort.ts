import { AbortError } from '@embedpdf/engine-core/runtime';

/**
 * Throw if the AbortSignal has been aborted. Service code peppers calls to
 * this between PDFium calls so cooperative cancellation works without
 * needing async/await.
 */
export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const reason = signal.reason;
    if (reason instanceof Error) throw reason;
    throw new AbortError(reason);
  }
}
