import { EngineError } from '@embedpdf/engine-core/runtime';
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
  /**
   * The permission the session lacks, named as the engine names it: a document capability
   * (`'doc.forms.fill'`) or an annotation action (`'annotations:update'`). Set on
   * `permission-denied` when the refusal names one, whether a plugin's own check refused
   * (`ctx.assertAllowed`) or the engine did; null otherwise.
   */
  readonly permission: string | null;
  readonly details: unknown;

  constructor(
    code: PluginErrorCode,
    capability: string,
    message: string,
    options: { cause?: unknown; details?: unknown; permission?: string | null } = {},
  ) {
    super(message);
    if (options.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
    this.code = code;
    this.capability = capability;
    this.permission = options.permission ?? null;
    this.details = options.details;
  }
}

/** The serializable summary of a PluginError, for state and event payloads. */
export interface PluginErrorInfo {
  readonly code: PluginErrorCode;
  readonly message: string;
  readonly capability: string;
  /** The permission the session lacks (see `PluginError.permission`), or null. */
  readonly permission: string | null;
}

export function toPluginErrorInfo(error: PluginError): PluginErrorInfo {
  return {
    code: error.code,
    message: error.message,
    capability: error.capability,
    permission: error.permission,
  };
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
  NotImplemented: 'unsupported',
  Aborted: 'operation-cancelled',
  LayerVersionConflict: 'conflict',
  StaleBase: 'conflict',
  SigningPending: 'conflict',
  SigningExpired: 'conflict',
  SigningVersionMismatch: 'conflict',
  ObjectNumberUnavailable: 'conflict',
  LayerFull: 'conflict',
};

/**
 * The permission an engine refusal names. `PermissionDenied` puts it in `details.required`
 * (the first of `details.anyOf` when any of several would have done), and `details` is what
 * survives the trip from a worker or the server, where the refusal arrives as a plain
 * `EngineError` with code `Forbidden`.
 */
function requiredPermissionOf(error: EngineError): string | null {
  const required = error.details?.required;
  return typeof required === 'string' ? required : null;
}

/**
 * The one boundary mapping from whatever an engine call threw to a
 * `PluginError`. Idempotent: an existing PluginError passes through.
 * Cancellation (the kernel's CancelledError, a DOM AbortError, or an engine
 * abort) is `operation-cancelled`, never `operation-failed`, so callers can
 * tell "nobody wanted this anymore" from "this broke". A refusal names the
 * missing permission in `permission`; `details` keeps the rest of what the
 * engine sent (`anyOf`, `context`).
 */
export function toPluginError(capability: string, error: unknown): PluginError {
  if (error instanceof PluginError) return error;
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
      permission: code === 'permission-denied' ? requiredPermissionOf(error) : null,
    });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new PluginError('operation-failed', capability, message, { cause: error });
}
