import { EngineErrorCode } from './EngineErrorCode';

export interface EngineErrorOptions {
  cause?: unknown;
  details?: Record<string, unknown>;
}

/**
 * Single error class shared across engine implementations. Has a stable
 * machine-readable `code` (see EngineErrorCode) so callers can match without
 * sniffing message strings. Every failure the engine reports is one: the
 * named subclasses (`PermissionDenied`, `InvalidScope`, `MissingIdentity`,
 * `AbortError`) only preset the code and keep their name for stack traces.
 */
export class EngineError extends Error {
  override readonly name: string = 'EngineError';
  readonly code: EngineErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: EngineErrorCode, message?: string, options: EngineErrorOptions = {}) {
    super(message ?? code, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.details = options.details;
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

  toJSON(): SerializedEngineError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/** An error as it crosses a wire: the `error` of an error response, a refused change. */
export interface SerializedEngineError {
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
    return { code, message: err.message };
  }
  return {
    code: EngineErrorCode.Unknown,
    message: String(err ?? 'unknown error'),
  };
}

export function deserializeError(payload: SerializedEngineError): EngineError {
  return new EngineError(payload.code, payload.message, { details: payload.details });
}
