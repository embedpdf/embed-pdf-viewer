import { EngineError, PermissionDenied } from '@embedpdf/engine-core/runtime';
import { isCancelled } from './scope';

/**
 * The one error vocabulary a plugin capability rejects with. Stable codes so
 * callers match on `code`, never on message text; the engine's error stays
 * reachable as `cause`.
 */
export type PluginErrorCode =
  | 'permission-denied'
  | 'unsupported'
  | 'not-found'
  | 'not-ready'
  | 'invalid-input'
  | 'conflict'
  | 'instance-closed'
  | 'operation-cancelled'
  | 'operation-failed';

export class PluginError extends Error {
  override readonly name = 'PluginError';
  readonly code: PluginErrorCode;
  /** The capability (plugin id) that produced the error. */
  readonly capability: string;
  readonly details: unknown;

  constructor(
    code: PluginErrorCode,
    capability: string,
    message: string,
    options: { cause?: unknown; details?: unknown } = {},
  ) {
    super(message);
    if (options.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
    this.code = code;
    this.capability = capability;
    this.details = options.details;
  }
}

/** The serializable summary of a PluginError, for state and event payloads. */
export interface PluginErrorInfo {
  readonly code: PluginErrorCode;
  readonly message: string;
  readonly capability: string;
}

export function toPluginErrorInfo(error: PluginError): PluginErrorInfo {
  return { code: error.code, message: error.message, capability: error.capability };
}

export function isPluginError(value: unknown, code?: PluginErrorCode): value is PluginError {
  if (!(value instanceof PluginError)) return false;
  return code === undefined || value.code === code;
}

const ENGINE_CODE_MAP: Readonly<Record<string, PluginErrorCode>> = {
  InvalidArg: 'invalid-input',
  MalformedPdf: 'invalid-input',
  PayloadTooLarge: 'invalid-input',
  WireFormat: 'invalid-input',
  DocNotOpen: 'not-ready',
  DocPasswordRequired: 'permission-denied',
  DocPasswordIncorrect: 'permission-denied',
  SharePasswordRequired: 'permission-denied',
  Unauthenticated: 'permission-denied',
  Forbidden: 'permission-denied',
  ProtectedDocument: 'permission-denied',
  NotFound: 'not-found',
  InvalidReference: 'not-found',
  NotImplemented: 'unsupported',
  Aborted: 'operation-cancelled',
  WeakAnnotationSessionConflict: 'conflict',
  LayerVersionConflict: 'conflict',
  StaleBase: 'conflict',
  SigningPending: 'conflict',
  SigningExpired: 'conflict',
  SigningVersionMismatch: 'conflict',
};

/**
 * The one boundary mapping from whatever an engine call threw to a
 * `PluginError`. Idempotent: an existing PluginError passes through.
 * Cancellation (the kernel's CancelledError, a DOM AbortError, or an engine
 * abort) is `operation-cancelled`, never `operation-failed`, so callers can
 * tell "nobody wanted this anymore" from "this broke".
 */
export function toPluginError(capability: string, error: unknown): PluginError {
  if (error instanceof PluginError) return error;
  if (error instanceof PermissionDenied) {
    // `details` carries `required` (and `anyOf`, `context`), as the engine sent it.
    return new PluginError('permission-denied', capability, error.message, {
      cause: error,
      details: error.details,
    });
  }
  if (isCancelled(error) || (error instanceof Error && error.name === 'AbortError')) {
    return new PluginError('operation-cancelled', capability, 'operation cancelled', {
      cause: error,
    });
  }
  if (EngineError.is(error)) {
    const code = ENGINE_CODE_MAP[String(error.code)] ?? 'operation-failed';
    return new PluginError(code, capability, error.message, {
      cause: error,
      details: error.details,
    });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new PluginError('operation-failed', capability, message, { cause: error });
}
