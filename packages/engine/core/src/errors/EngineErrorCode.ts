export const EngineErrorCode = {
  Unknown: 'Unknown',
  InvalidArg: 'InvalidArg',
  DocNotOpen: 'DocNotOpen',
  DocOpenFailed: 'DocOpenFailed',
  DocPasswordRequired: 'DocPasswordRequired',
  DocPasswordIncorrect: 'DocPasswordIncorrect',
  /**
   * A share-token exchange (`open({ kind: 'share' })`) needs the grant's
   * passphrase: none was supplied, or the supplied one was rejected —
   * indistinguishable by design, mirroring the server. Prompt and retry
   * with `sharePassword`. Distinct from `DocPasswordRequired`, which is
   * about the PDF's own encryption password.
   */
  SharePasswordRequired: 'SharePasswordRequired',
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
   * A layer write lost its optimistic-concurrency check: the layer's
   * durable version advanced (another writer — typically another server
   * replica — committed) between the operation's prepare and its commit,
   * and the server exhausted its rebase-and-retry budget. Retryable: the
   * operation was not applied; re-issue it against the new state.
   */
  LayerVersionConflict: 'LayerVersionConflict',
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
  /**
   * A signing candidate is parked on this session: every mutation is
   * refused until `signatures.complete` or `signatures.abort`.
   */
  SigningPending: 'SigningPending',
  /** The candidate's TTL elapsed; prepare again. */
  SigningExpired: 'SigningExpired',
  /**
   * `complete` presented a version the candidate was not built on (the
   * document or the layer moved since `prepare`). The CMS cannot be
   * reused: it signs a digest of bytes that will never be the head.
   * Prepare again on the current version.
   */
  SigningVersionMismatch: 'SigningVersionMismatch',
  /**
   * The engine refused to author the signature: the field is signed,
   * read-only, or locked by an earlier signature; a certification is
   * requested after a signature exists; the seed value requires what the
   * engine does not implement; the request is inconsistent. The message
   * names the reason.
   */
  SignatureRefused: 'SignatureRefused',
  /**
   * A signature already in the document forbids this change (a
   * certification's permission, a FieldMDP or `/Lock`, or the approval
   * baseline). The message names the signature and the restriction. The
   * engine option `signedDocumentPolicy: 'permit'` disables the guard.
   */
  ProtectedDocument: 'ProtectedDocument',
  /**
   * The layer is built on a base version that is no longer the
   * document's head (another signing completed); it can be read and
   * edited but not signed from.
   */
  StaleBase: 'StaleBase',
  /**
   * A payload passed one of its limits: an annotation bundle's bytes,
   * counts or image pixels. Nothing was read past the limit and nothing was
   * written. `details` has the `limit`, its `max` and the `value` found.
   */
  PayloadTooLarge: 'PayloadTooLarge',
} as const;

export type EngineErrorCode = (typeof EngineErrorCode)[keyof typeof EngineErrorCode];
