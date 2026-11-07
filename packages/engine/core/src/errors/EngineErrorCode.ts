export const EngineErrorCode = {
  Unknown: 'Unknown',
  InvalidArg: 'InvalidArg',
  DocNotOpen: 'DocNotOpen',
  DocOpenFailed: 'DocOpenFailed',
  DocPasswordRequired: 'DocPasswordRequired',
  DocPasswordIncorrect: 'DocPasswordIncorrect',
  /**
   * A grant exchange (`open({ kind: 'grant' })`) needs the grant's
   * passphrase: none was supplied, or the supplied one was rejected —
   * indistinguishable by design, mirroring the server. Prompt and retry
   * with `passphrase`. Distinct from `DocPasswordRequired`, which is
   * about the PDF's own encryption password.
   */
  GrantPassphraseRequired: 'GrantPassphraseRequired',
  Aborted: 'Aborted',
  Network: 'Network',
  Unauthenticated: 'Unauthenticated',
  Forbidden: 'Forbidden',
  NotFound: 'NotFound',
  WireFormat: 'WireFormat',
  RuntimeUnavailable: 'RuntimeUnavailable',
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
   * refused until `signatures.complete` or `signatures.cancel`.
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
   * certification's permission, or a FieldMDP or `/Lock`; the approval
   * baseline is judged, never refused). The message names the signature and
   * the restriction. The
   * engine option `signedDocumentPolicy: 'permit'` disables the guard.
   */
  ProtectedDocument: 'ProtectedDocument',
  /**
   * A payload passed one of its limits: an annotation bundle's bytes,
   * counts or image pixels. Nothing was read past the limit and nothing was
   * written. `details` has the `limit`, its `max` and the `value` found.
   */
  PayloadTooLarge: 'PayloadTooLarge',
  /**
   * A create named an object number it can't use. `details.objectNumber`
   * is the number; `details.reason` is `'not-held'` when the caller's
   * session doesn't hold it (never reserved, already spent, or lost to
   * another session) and `'taken'` when an object is already at it. Nothing
   * was written.
   */
  ObjectNumberUnavailable: 'ObjectNumberUnavailable',
  /**
   * The document would pass the highest object number a file should have
   * (`OBJECT_NUMBER_CEILING`): no more numbers are handed out, and a write
   * that needs more is refused. `details.lastObjectNumber` is the document's
   * last number. A compacted copy of the document starts afresh.
   */
  LayerFull: 'LayerFull',
  /**
   * An op's `expect` didn't match what the document holds: the change was
   * refused whole. `details.opIndex` names the op and `details.fields` the
   * fields that differ.
   */
  ChangeConflict: 'ChangeConflict',
  /**
   * `{ undoOf }` named a change that can no longer be undone.
   * `details.reason` says why: `'final-change'` (a redaction apply, flatten,
   * signing or form repair came after it), `'base-changed'` (a new version
   * was published since) or `'expired'` (past retention).
   */
  UndoUnavailable: 'UndoUnavailable',
  /**
   * An `opId` that already has an answer came again with a different
   * payload. Nothing ran; a retry must send the same change.
   */
  IdempotencyKeyReused: 'IdempotencyKeyReused',
  /**
   * The layer was deleted: what it held is gone, and its name is refused
   * from then on (its read URLs were cached as immutable). Work on another
   * layer name.
   */
  LayerDeleted: 'LayerDeleted',
  /**
   * The grant asks its visitors who they are, and this visitor hasn't
   * answered what it requires: opening (a grant that asks on open), or a
   * change (one that asks before the first change), waits for the answers.
   * `details` is a `VisitorIdentityRequest`: `fields` (what the grant asks,
   * each required or optional), `missing`, `invalid`, `purpose` and
   * `privacyUrl`. Answer by opening again with `visitor`, or with
   * `doc.grant.identify()`.
   */
  VisitorIdentityRequired: 'VisitorIdentityRequired',
  /**
   * The request conflicts with what the server holds: a name that's taken,
   * or a record in a state the request can't apply to. The message says
   * which; `details.reason` names it where a route has more than one.
   */
  Conflict: 'Conflict',
  /**
   * The server's engines are full and shed the request (HTTP 503). Nothing
   * ran: retry after the response's `Retry-After`.
   */
  EngineBusy: 'EngineBusy',
  /**
   * The engine serving the document restarted during the request (HTTP 503).
   * Nothing ran: retry after the response's `Retry-After`.
   */
  EngineRestarting: 'EngineRestarting',
  /**
   * The document crashed the engine more than once and is refused until its
   * quarantine ends (HTTP 422). The message says when.
   */
  DocumentQuarantined: 'DocumentQuarantined',
  /**
   * The document's thumbnail isn't there yet (HTTP 404). `details.state` is
   * `pending`, `locked` or `failed`, so a dashboard can draw the right tile.
   */
  ThumbnailNotReady: 'ThumbnailNotReady',
  /** Too many requests from this caller (HTTP 429). Retry later. */
  TooManyRequests: 'TooManyRequests',
  /** The grant expired (HTTP 410). */
  GrantExpired: 'GrantExpired',
  /** A grant exchange came without the page's `Origin` header. */
  OriginRequired: 'OriginRequired',
  /** The grant doesn't allow the page's origin (HTTP 403). */
  OriginNotAllowed: 'OriginNotAllowed',
  /**
   * A module's route, and the tenant's features don't hold the module
   * (HTTP 403). `details.feature` is the module's id.
   */
  FeatureNotEnabled: 'FeatureNotEnabled',
  /**
   * A module's route, and the tenant's features hold the module stopped
   * (HTTP 402). `details.feature` is the module's id and `details.stopped`
   * why: `'cap'` is a spending cap reached.
   */
  FeatureStopped: 'FeatureStopped',
  /**
   * The deployment's license doesn't allow the request (HTTP 403): no valid
   * license, or one that allows reading only. `details.licenseCode` is the
   * code the license status reports.
   */
  LicenseInvalid: 'LicenseInvalid',
  /**
   * The request would pass one of the license's usage limits (HTTP 403).
   * `details.metric` and `details.limit` name it.
   */
  LicenseUsageLimit: 'LicenseUsageLimit',
  /**
   * Reading the document from where it's imported from failed in a way
   * worth retrying (HTTP 502): the network, a timeout or the source's own
   * error. Retry with the same idempotency key.
   */
  UpstreamError: 'UpstreamError',
} as const;

export type EngineErrorCode = (typeof EngineErrorCode)[keyof typeof EngineErrorCode];

const ENGINE_ERROR_CODES: ReadonlySet<string> = new Set(Object.values(EngineErrorCode));

/** Whether `value` is a code in the list: what a server may send, and a client may read. */
export function isEngineErrorCode(value: unknown): value is EngineErrorCode {
  return typeof value === 'string' && ENGINE_ERROR_CODES.has(value);
}
