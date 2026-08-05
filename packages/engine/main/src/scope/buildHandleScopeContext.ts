import {
  MissingIdentity,
  decodePdfBits,
  parseScope,
  validateScopeArray,
  type IdentityClaims,
} from '@embedpdf/engine-core/runtime';

import type { HandleScopeContext } from './HandleScopeContext';

/**
 * Default scope when the caller omits the `scope` option on
 * `LocalEngine.open()`. Wildcard grants every capability and bypasses
 * every collab check — the right default for "I just want to open a
 * PDF and try things out" prototyping, but not what cloud JWTs look
 * like. A one-time console warning fires the first time this default
 * is used per process, pointing developers at the realistic-testing
 * pattern.
 */
const DEFAULT_LOCAL_SCOPE: ReadonlyArray<string> = ['*'];

export interface BuildHandleScopeContextInput {
  /** Raw scope array from `OpenOptions.scope`; defaults to `['*']`. */
  scope?: ReadonlyArray<string>;
  /** Identity claims from `OpenOptions.identity`; defaults to `{}`. */
  identity?: IdentityClaims;
  /**
   * Raw PDF permission bits from `FPDF_GetDocPermissions` (or `null`
   * for unencrypted documents with no bits set). Decoded into the
   * typed `PdfBits` view inside this builder.
   */
  pdfPermissionsBits: number | null;
}

/**
 * Build the per-handle scope context that drives `ScopeGuard` for
 * every operation on this `LocalDocumentHandle`.
 *
 * Validation performed up front so misconfiguration surfaces at
 * `open()` time:
 *   - every scope string parses (throws `InvalidScope` on bad strings)
 *   - if the scope contains collab filters that need identity
 *     (`:self`, `:group=X`), the identity must carry the matching
 *     field (throws `MissingIdentity` on a config that would always
 *     deny)
 *
 * Behaviour mirrors what `jwt-plugin.ts` does on the cloud side at
 * request time — we just move the same checks to engine-local's
 * open-time so they fire once rather than per call.
 */
export function buildHandleScopeContext(input: BuildHandleScopeContextInput): HandleScopeContext {
  const scope = input.scope ?? DEFAULT_LOCAL_SCOPE;
  if (input.scope === undefined) warnDefaultScopeOnce();

  // Strict validation: any unknown string (including removed legacy
  // names like `doc.read`) throws InvalidScope here.
  validateScopeArray(scope);

  const identity = input.identity ?? {};
  assertIdentityForCollabScopes(scope, identity);

  return {
    scope,
    identity,
    pdfBits: decodePdfBits(input.pdfPermissionsBits),
  };
}

/**
 * Walk the scope array; for every collab filter that consumes an
 * identity field, verify the field is present. Throws `MissingIdentity`
 * on the first mismatch — better to fail at open than to silently deny
 * every mutation.
 *
 * Rules:
 *   - `annotations:*:self` needs `identity.user_id`
 *   - `annotations:*:group=X` needs `identity.groups` to include `X`
 *     (matching the resolver's group-membership check)
 *   - `annotations:*:createdBy=Y` is row-scoped, not caller-scoped, so
 *     no identity field is required at open time.
 */
function assertIdentityForCollabScopes(
  scope: ReadonlyArray<string>,
  identity: IdentityClaims,
): void {
  for (const s of scope) {
    const parsed = parseScope(s);
    if (parsed.kind !== 'collab') continue;
    if (parsed.filter.kind === 'self' && !identity.user_id) {
      throw new MissingIdentity(s);
    }
    if (parsed.filter.kind === 'group') {
      if (!identity.groups?.includes(parsed.filter.groupId)) {
        throw new MissingIdentity(s);
      }
    }
  }
}

let warnedDefaultScope = false;

function warnDefaultScopeOnce(): void {
  if (warnedDefaultScope) return;
  warnedDefaultScope = true;

  console.warn(
    '[engine-local] open() called without `scope`; defaulting to ["*"] (admin). ' +
      'Set `scope` explicitly to test realistic permissions matching your cloud deployment.',
  );
}
