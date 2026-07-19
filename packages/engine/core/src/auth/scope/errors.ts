/**
 * Thrown by {@link parseScope} / {@link validateScopeArray} when a scope
 * string does not match any known grammar (capability, collab, virtual,
 * or wildcard).
 *
 * Carries the offending scope verbatim so route/JWT-layer error
 * handlers can echo it to the customer.
 */
export class InvalidScope extends Error {
  constructor(
    public readonly scope: string,
    reason: string,
  ) {
    super(`invalid scope "${scope}": ${reason}`);
    this.name = 'InvalidScope';
  }
}

/**
 * Thrown by route guards and engine-local enforcement when a capability
 * or collab action is denied for the current request/handle.
 *
 * `required` names what the caller needed (e.g., "doc.render" or
 * "annotations:update"). `context` is an optional label such as "local"
 * or "/v1/docs/.../pages/2/render".
 */
export class PermissionDenied extends Error {
  constructor(
    public readonly required: string,
    public readonly context?: string,
  ) {
    super(`permission denied${context ? ` (${context})` : ''}: ${required}`);
    this.name = 'PermissionDenied';
  }
}

/**
 * Thrown at engine-local open time when the supplied scope includes
 * collab filters (`:self`, `:group=...`) but the identity claims needed
 * to resolve them are missing. Fails loudly at open so the configuration
 * mistake is visible immediately instead of producing silent denies at
 * every annotation mutation.
 */
export class MissingIdentity extends Error {
  constructor(scope: string) {
    super(`scope "${scope}" requires identity claims (user_id and/or groups)`);
    this.name = 'MissingIdentity';
  }
}
