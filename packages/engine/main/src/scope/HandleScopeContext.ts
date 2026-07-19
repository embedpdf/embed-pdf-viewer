import type { IdentityClaims, PdfBits } from '@embedpdf/engine-core/runtime';

/**
 * Per-handle authorization context built at `LocalEngine.open()` time
 * and threaded through every service the document handle exposes.
 *
 * Mirrors the cloud's per-request `{ jwt.scope, jwt.identity, pdfBits }`
 * triple: same resolver, same denial errors, same effective scope. The
 * cloud derives all three from the JWT and the document's stored
 * permission bits; engine-local derives `scope` and `identity` from
 * `OpenOptions` and `pdfBits` from the PDF itself (FPDF_GetDocPermissions
 * decoded into the typed view).
 */
export interface HandleScopeContext {
  readonly scope: ReadonlyArray<string>;
  readonly identity: IdentityClaims;
  readonly pdfBits: PdfBits;
}
