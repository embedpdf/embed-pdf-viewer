import type {
  DocumentProtection,
  Identity,
  PdfPermissionFlags,
  SignedDocumentPolicy,
} from '@embedpdf/engine-core/runtime';

/**
 * Per-handle authorization context built at `LocalEngine.open()` time
 * and threaded through every service the document handle exposes.
 *
 * Mirrors the cloud's per-request `{ jwt.scope, jwt.identity, permissionFlags }`
 * triple: same resolver, same denial errors, same effective scope. The
 * cloud derives all three from the JWT and the document's stored
 * permission bits; engine-local derives `scope` and `identity` from
 * `OpenOptions` and `permissionFlags` from the PDF itself (FPDF_GetDocPermissions
 * decoded into the typed view).
 */
export interface HandleScopeContext {
  readonly scope: ReadonlyArray<string>;
  readonly identity: Identity;
  readonly permissionFlags: PdfPermissionFlags;
  /**
   * What the document's signatures forbid, as probed at open. The second
   * document-derived input beside `permissionFlags`; `null` when unsigned or when
   * the engine runs with `signedDocumentPolicy: 'permit'`.
   */
  readonly protection: DocumentProtection | null;
  readonly signedDocumentPolicy: SignedDocumentPolicy;
}
