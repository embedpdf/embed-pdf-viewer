import {
  MissingIdentity,
  decodePdfBits,
  parseScope,
  validateScopeArray,
  type DocumentProtection,
  type Identity,
  type SignedDocumentPolicy,
} from '@embedpdf/engine-core/runtime';

import type { HandleScopeContext } from './HandleScopeContext';

/**
 * The scope of a document opened without one: what the file itself allows, as Acrobat reads its
 * permission flags (`pdf.permissions`), and what no flag governs: downloading, importing
 * annotations and form data, running a form's scripts and submitting it, certifying the
 * document, and putting annotations and fields in any group. An unprotected PDF allows everything; a protected one
 * keeps its restrictions, as it does in Acrobat. An app that wants more (`'*'`) or less passes
 * its own scope.
 */
const DEFAULT_LOCAL_SCOPE: ReadonlyArray<string> = [
  'pdf.permissions',
  'doc.download',
  'doc.download.flattened',
  'doc.annotate.import',
  'doc.forms.import',
  'doc.forms.script',
  'doc.forms.submit',
  'doc.sign.certify',
  'annotations:set-group:all',
  'fields:set-group:all',
];

export interface BuildHandleScopeContextInput {
  /** Raw scope array from `OpenOptions.scope`; defaults to what the file allows ({@link DEFAULT_LOCAL_SCOPE}). */
  scope?: ReadonlyArray<string>;
  /** Identity claims from `OpenOptions.identity`; defaults to `{}`. */
  identity?: Identity;
  /**
   * Raw PDF permission bits from `FPDF_GetDocPermissions` (or `null`
   * for unencrypted documents with no bits set). Decoded into the
   * typed `PdfBits` view inside this builder.
   */
  pdfPermissionsBits: number | null;
  /** What the document's signatures forbid, from the open probe; `null` when unsigned or unknown. */
  protection?: DocumentProtection | null;
  /** Default `protect`. */
  signedDocumentPolicy?: SignedDocumentPolicy;
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

  // Strict validation: any unknown string (including removed legacy
  // names like `doc.read`) throws InvalidScope here.
  validateScopeArray(scope);

  const identity = input.identity ?? {};
  assertIdentityForCollabScopes(scope, identity);

  return {
    scope,
    identity,
    pdfBits: decodePdfBits(input.pdfPermissionsBits),
    protection: input.protection ?? null,
    signedDocumentPolicy: input.signedDocumentPolicy ?? 'protect',
  };
}

/**
 * Walk the scope array; for every collab filter that consumes an
 * identity field, verify the field is present. Throws `MissingIdentity`
 * on the first mismatch — better to fail at open than to silently deny
 * every mutation.
 *
 * Rules:
 *   - `annotations:*:self` needs `identity.userId`
 *   - every other filter compares a fact on the record with the value the
 *     scope names (`group=X`, `createdBy=Y`, `all`), so it needs no
 *     identity field.
 */
function assertIdentityForCollabScopes(scope: ReadonlyArray<string>, identity: Identity): void {
  for (const s of scope) {
    const parsed = parseScope(s);
    if (parsed.kind !== 'collab') continue;
    if (parsed.filter.kind === 'self' && !identity.userId) {
      throw new MissingIdentity(s);
    }
  }
}
