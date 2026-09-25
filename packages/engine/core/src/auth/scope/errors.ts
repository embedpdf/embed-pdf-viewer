import { EngineError } from '../../errors/EngineError';
import { EngineErrorCode } from '../../errors/EngineErrorCode';

/**
 * Thrown by {@link parseScope} / {@link validateScopeArray} when a scope
 * string does not match any known grammar (capability, collab, virtual,
 * or wildcard). An `EngineError` with code `InvalidArg`.
 *
 * Carries the offending scope verbatim so route/JWT-layer error
 * handlers can echo it to the customer.
 */
export class InvalidScope extends EngineError {
  override readonly name: string = 'InvalidScope';

  constructor(
    public readonly scope: string,
    reason: string,
  ) {
    super(EngineErrorCode.InvalidArg, `invalid scope "${scope}": ${reason}`, {
      details: { scope, reason },
    });
  }
}

/**
 * Thrown by route guards and engine-local enforcement when a capability
 * or collab action is denied for the current request/handle. An
 * `EngineError` with code `Forbidden`, on both engines.
 *
 * `required` (also `details.required`) names what the caller needed (e.g.
 * "doc.render" or "annotations:update"). When any of several would have
 * done, `anyOf` (also `details.anyOf`) lists them and `required` is the
 * first. `context` is an optional label such as "engine-local" or a route.
 */
export class PermissionDenied extends EngineError {
  override readonly name: string = 'PermissionDenied';

  constructor(
    public readonly required: string,
    public readonly context?: string,
    public readonly anyOf?: readonly string[],
  ) {
    super(
      EngineErrorCode.Forbidden,
      `permission denied${context ? ` (${context})` : ''}: ${anyOf ? `one of ${anyOf.join(', ')}` : required}`,
      {
        details: {
          required,
          ...(context === undefined ? {} : { context }),
          ...(anyOf === undefined ? {} : { anyOf: [...anyOf] }),
        },
      },
    );
  }
}

/**
 * Thrown at engine-local open time when the supplied scope includes
 * collab filters (`:self`, `:group=...`) but the identity claims needed
 * to resolve them are missing. Fails loudly at open so the configuration
 * mistake is visible immediately instead of producing silent denies at
 * every annotation mutation. An `EngineError` with code `InvalidArg`.
 */
export class MissingIdentity extends EngineError {
  override readonly name: string = 'MissingIdentity';

  constructor(public readonly scope: string) {
    super(
      EngineErrorCode.InvalidArg,
      `scope "${scope}" requires an identity (userId and/or groups)`,
      {
        details: { scope },
      },
    );
  }
}
