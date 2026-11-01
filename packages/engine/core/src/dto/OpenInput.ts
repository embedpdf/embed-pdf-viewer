import type { Identity } from '../auth/scope';

/**
 * Per-call token source. Either a literal JWT or a factory that
 * returns a fresh one (used by the cloud SDK to support tokens that
 * the caller fetches lazily / rotates without restarting the
 * engine).
 */
export type TokenSource = string | (() => string | Promise<string>);

/**
 * Local-engine open input. The caller hands the engine the full
 * PDF bytes and a stable id that doubles as the engine-side docId.
 * Rejected by `@cloudpdf/engine` (use `'id'` or `'token'`
 * instead).
 */
export interface OpenInputBytes {
  kind: 'bytes';
  /**
   * A stable id of your own for the document; doubles as docId at the
   * engine boundary. Generated when omitted.
   */
  id?: string;
  bytes: Uint8Array | ArrayBuffer;
}

export type OpenInputLayerSource =
  | { kind: 'fresh' }
  | { kind: 'artifact'; bytes: Uint8Array | ArrayBuffer };

/**
 * Local-engine layer open. Browser/local callers hand us the base bytes
 * once per open request; worker-side PDFium loads them as an
 * EPDF_BASE_DOCUMENT and then opens a layer document over that base.
 *
 * Multiple local layer handles can share one loaded base by using the same
 * `baseKey` with different `id`s. The layer artifact is intentionally small
 * and memory-backed.
 *
 * Rejected by `@cloudpdf/engine`.
 */
export interface OpenInputLayerBytes {
  kind: 'layerBytes';
  /** A stable id of your own for this layer document handle. Generated when omitted. */
  id?: string;
  /** Optional sharing key for the loaded base. Defaults to the handle's id (no sharing). */
  baseKey?: string;
  baseBytes: Uint8Array | ArrayBuffer;
  layer?: OpenInputLayerSource;
}

/**
 * Cloud-engine: open a document the caller already knows the id of.
 * The engine pings `GET /v1/docs/:id/head`, authenticating with
 * either the engine-level token (typical: a tenant JWT) or a
 * per-call override.
 *
 * Use this when your frontend has a tenant session (e.g. minted at
 * login by your auth backend) and just needs to open one of many
 * documents the tenant owns.
 *
 * Rejected by `@embedpdf/engine`.
 */
export interface OpenInputById {
  kind: 'id';
  /** docId of a document already known to the cloud server. */
  id: string;
  /**
   * Cloud layer namespace to bind the handle to. Omitted means the
   * server/client default layer, never the immutable base.
   */
  layerName?: string;
  /**
   * Optional per-open token override. Without this, the cloud engine
   * uses the token supplied at construction time. Most callers leave
   * this empty.
   */
  token?: TokenSource;
}

/**
 * Cloud-engine: open the document referenced by the supplied
 * doc-scoped JWT's `doc_id` claim. The SDK decodes the unverified
 * payload to learn the routing key, then calls
 * `GET /v1/docs/:docId/head`. The returned handle is bound to this
 * token; subsequent operations on it carry that bearer.
 *
 * Use this when your backend mints doc-scoped JWTs itself (e.g. a
 * logged-in reviewer authorised for exactly one document). For the
 * no-backend grant flow, use `kind: 'grant'` instead.
 *
 * Rejected by `@embedpdf/engine`.
 */
export interface OpenInputToken {
  kind: 'token';
  /**
   * Doc-scoped JWT carrying the document's identity in its `doc_id`
   * claim. Each `open({ kind: 'token', token })` is independent —
   * one cloud engine can open many docs concurrently, each with
   * its own per-doc token.
   */
  token: TokenSource;
}

/**
 * Cloud-engine: open a grant (`grt_…`) from the dashboard's embed code.
 * A grant's id is a reference to access stored on the server, not a
 * credential — the engine exchanges it for a short-lived doc-scoped
 * session JWT and silently re-exchanges near expiry, so ending or
 * editing the grant retargets every link and embed at the next renewal.
 * No backend required; the engine itself may be constructed with no
 * engine-level token at all.
 *
 * Rejected by `@embedpdf/engine`.
 */
export interface OpenInputGrant {
  kind: 'grant';
  /** The grant's id (`grt_…`; older grants are `shr_…`). */
  grant: string;
  /**
   * The grant's passphrase, when it has one. Checked by the exchange
   * endpoint — not the PDF's encryption password, which goes in
   * `OpenOptions.password` like every other kind.
   */
  passphrase?: string;
  /**
   * Start over: on a grant that gives each visitor their own layer and keeps
   * it for their next visit, delete the layer this browser kept and open a
   * fresh one as a new visitor (the document's `grant.keep` says when that
   * applies). Elsewhere it changes nothing.
   */
  restart?: boolean;
}

export type OpenInputLayerFileSource =
  | { kind: 'fresh' }
  | { kind: 'artifact'; bytes: Uint8Array | ArrayBuffer }
  | { kind: 'artifact-file'; path: string };

/**
 * Local-engine layer open over a base file (Node runtimes only): the base
 * is range-read from disk by PDFium and never loaded into JS, and a
 * signing candidate for such a session is written beside it rather than
 * held in memory. What a server does for every document; useful locally
 * for large files.
 *
 * Rejected by `@cloudpdf/engine` and by the wasm runtime.
 */
export interface OpenInputLayerFile {
  kind: 'layerFile';
  /** A stable id of your own for this layer document handle. Generated when omitted. */
  id?: string;
  /** Optional sharing key for the loaded base. Defaults to the path. */
  baseKey?: string;
  basePath: string;
  /** A verified SHA-256 (hex) of the base file, when the caller has one. */
  baseSha256?: string;
  layer?: OpenInputLayerFileSource;
}

export type OpenInput =
  | OpenInputBytes
  | OpenInputLayerBytes
  | OpenInputLayerFile
  | OpenInputById
  | OpenInputToken
  | OpenInputGrant;

export interface OpenOptions {
  /**
   * The PDF's own password (user or owner), for every input kind. Without
   * one a password-protected file opens locked (see
   * `security.passwordPrompt`); with a wrong one it opens locked too, and
   * the prompt's `incorrect` is `true`.
   */
  password?: string | null;

  /**
   * Engine-local only. The scope strings to enforce on this handle's
   * operations, mirroring what a doc-scoped JWT would carry in the
   * cloud. Same vocabulary as the cloud (`pdf.permissions`, `doc.*`,
   * `annotations:update:self`, `annotations:delete:group=X`,
   * `annotations:set-group:all`, etc.) — same enforcement, the same
   * `Forbidden` errors.
   *
   * Defaults to `['*']` (admin wildcard) when omitted, with a one-time
   * console warning. Set explicitly to test realistic permissions
   * locally before pointing the same SDK code at the cloud.
   *
   * The cloud engine takes what the session may do from the document's
   * token, so it doesn't use this option, and says so in development.
   */
  scope?: ReadonlyArray<string>;

  /**
   * Who your page knows the user is. Who the session acts for, read back as
   * `doc.security.identity`, is decided by whoever stands behind the session:
   *
   * - The local engine has no server, so this is the session's identity:
   *   collab filters (`:self`, `:group=X`) are evaluated against it, and
   *   what it writes is attributed to it. Required when `scope` contains
   *   collab scopes (`annotations:*:self` etc.): opening without it fails
   *   with `InvalidArg` instead of producing silent denies at every
   *   mutation.
   * - The cloud engine with a document token: the token's `identity` claim
   *   decides.
   * - The cloud engine with a grant: it goes with the first exchange as
   *   the visitor's answers, the same as the visitor typing them. Only the
   *   fields the grant asks count (never `userId` or `groupId`), an answer
   *   once given stays, and a grant that says who its visitors are prevails.
   *
   * In development the cloud engine says which fields it didn't use.
   */
  identity?: Identity;
}
