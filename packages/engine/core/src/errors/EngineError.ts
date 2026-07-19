import { EngineErrorCode } from './EngineErrorCode';

export interface EngineErrorOptions {
  cause?: unknown;
  details?: Record<string, unknown>;
}

/**
 * Single error class shared across engine implementations. Has a stable
 * machine-readable `code` (see EngineErrorCode) so callers can match without
 * sniffing message strings.
 */
export class EngineError extends Error {
  override readonly name = 'EngineError';
  readonly code: EngineErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: EngineErrorCode, message?: string, opts: EngineErrorOptions = {}) {
    super(message ?? code, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.code = code;
    this.details = opts.details;
  }

  static is(value: unknown, code?: EngineErrorCode): value is EngineError {
    if (
      !(value instanceof EngineError) &&
      (value as { name?: string } | null)?.name !== 'EngineError'
    ) {
      return false;
    }
    if (code === undefined) return true;
    return (value as EngineError).code === code;
  }

  toJSON(): {
    name: 'EngineError';
    code: EngineErrorCode;
    message: string;
    details?: Record<string, unknown>;
  } {
    return {
      name: 'EngineError',
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export interface SerializedEngineError {
  name: 'EngineError';
  code: EngineErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export function serializeError(err: unknown): SerializedEngineError {
  if (EngineError.is(err)) {
    return err.toJSON();
  }
  if (err instanceof Error) {
    const code: EngineErrorCode =
      err.name === 'AbortError' ? EngineErrorCode.Aborted : EngineErrorCode.Unknown;
    return { name: 'EngineError', code, message: err.message };
  }
  return {
    name: 'EngineError',
    code: EngineErrorCode.Unknown,
    message: String(err ?? 'unknown error'),
  };
}

export function deserializeError(payload: SerializedEngineError): EngineError {
  return new EngineError(payload.code, payload.message, { details: payload.details });
}
