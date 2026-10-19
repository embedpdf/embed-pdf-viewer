import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';

/**
 * What a cancelled call rejects with: an `EngineError` with code `Aborted`,
 * named `AbortError` like the DOM's, so both `EngineError.is(err,
 * EngineErrorCode.Aborted)` and `err.name === 'AbortError'` recognise it.
 */
export class AbortError extends EngineError {
  override readonly name: string = 'AbortError';
  readonly reason: unknown;

  constructor(reason?: unknown) {
    super(EngineErrorCode.Aborted, reasonMessage(reason));
    this.reason = reason;
  }
}

export function isAbortError(value: unknown): value is AbortError {
  return value instanceof AbortError || (value as { name?: string } | null)?.name === 'AbortError';
}

function reasonMessage(reason: unknown): string {
  if (reason == null) return 'aborted';
  if (typeof reason === 'string') return reason;
  if (reason instanceof Error) return reason.message || 'aborted';
  try {
    return JSON.stringify(reason);
  } catch {
    return 'aborted';
  }
}
