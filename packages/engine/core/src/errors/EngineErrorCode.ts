export const EngineErrorCode = {
  Unknown: 'Unknown',
  InvalidArg: 'InvalidArg',
  DocNotOpen: 'DocNotOpen',
  DocOpenFailed: 'DocOpenFailed',
  DocPasswordRequired: 'DocPasswordRequired',
  DocPasswordIncorrect: 'DocPasswordIncorrect',
  Aborted: 'Aborted',
  Network: 'Network',
  Unauthenticated: 'Unauthenticated',
  Forbidden: 'Forbidden',
  NotFound: 'NotFound',
  WireFormat: 'WireFormat',
  RuntimeUnavailable: 'RuntimeUnavailable',
  /**
   * Annotation/page reference could not be resolved. Surfaced when:
   *   - `AnnotationRef.kind === 'objectNumber'` but the document has no
   *     annotation with that indirect object number on the addressed page
   *   - `AnnotationRef.kind === 'nm'` but no annotation on the page has
   *     that `/NM`
   *   - `AnnotationRef.kind === 'index'` but the supplied `RevisionToken`
   *     does not match the current per-page generation
   *   - `AnnotationRef.kind === 'index'` but `index` is out of range for
   *     the page's current annotation count
   */
  InvalidReference: 'InvalidReference',
  /**
   * A weak-annotation structural edit (delete/move) was attempted while the
   * caller does not have sole active edit presence for that page. This is a
   * collaboration guard for index-addressed annotations; stable pages and
   * non-shifting annotation updates do not use it.
   */
  WeakAnnotationSessionConflict: 'WeakAnnotationSessionConflict',
  /**
   * The requested operation is typed but not yet wired in this engine
   * version. The wire shape stays valid; clients can detect this with
   * `EngineError.is(err, EngineErrorCode.NotImplemented)` and degrade
   * gracefully.
   */
  NotImplemented: 'NotImplemented',
  /**
   * The PDF was loadable enough for PDFium to parse, but violates a
   * structural invariant the engine relies on. Surfaced for the rare
   * spec-violating PDF that ships a direct (non-indirect) page
   * dictionary in the /Pages tree — see `EPDFPage_GetObjectNumber`
   * returning `0`. PDFium creation paths (`FPDFPage_New`,
   * `EPDFPage_CreateAnnot`) always produce indirect objects, so this
   * error code is intentionally not used for engine-produced state;
   * it specifically signals "this input file is broken in a way we
   * cannot work around without compromising stable identity".
   *
   * Distinct from `DocOpenFailed` (PDFium refused to load the bytes
   * at all) and `NotFound` (a well-formed page/annotation/etc. simply
   * doesn't exist).
   */
  MalformedPdf: 'MalformedPdf',
} as const;

export type EngineErrorCode = (typeof EngineErrorCode)[keyof typeof EngineErrorCode];
