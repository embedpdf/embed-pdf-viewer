import type { IdentityClaims } from '../auth/scope';

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
  /** Caller-supplied stable id; doubles as docId at the engine boundary. */
  id: string;
  bytes: Uint8Array | ArrayBuffer;
  password?: string | null;
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
  /** Caller-supplied stable id for this layer document handle. */
  id: string;
  /** Optional sharing key for the loaded base. Defaults to `id`. */
  baseKey?: string;
  baseBytes: Uint8Array | ArrayBuffer;
  layer?: OpenInputLayerSource;
  password?: string | null;
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
  password?: string | null;
}

/**
 * Cloud-engine: open the document referenced by the supplied
 * doc-scoped JWT's `doc_id` claim. The SDK decodes the unverified
 * payload to learn the routing key, then calls
 * `GET /v1/docs/:docId/head`. The returned handle is bound to this
 * token; subsequent operations on it carry that bearer.
 *
 * Use this for share-link / embed-link UX where the bearer of the
 * token is authorised for exactly one document (e.g. a third-party
 * reviewer the customer has shared a single doc with).
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
  password?: string | null;
}

export type OpenInput = OpenInputBytes | OpenInputLayerBytes | OpenInputById | OpenInputToken;

export interface OpenOptions {
  password?: string | null;

  /**
   * Engine-local only. The scope strings to enforce on this handle's
   * operations, mirroring what a doc-scoped JWT would carry in the
   * cloud. Same vocabulary as the cloud (`pdf.permissions`, `doc.*`,
   * `annotations:update:self`, `annotations:delete:group=X`,
   * `annotations:set-group:all`, etc.) — same enforcement, same
   * `PermissionDenied` errors.
   *
   * Defaults to `['*']` (admin wildcard) when omitted, with a one-time
   * console warning. Set explicitly to test realistic permissions
   * locally before pointing the same SDK code at the cloud.
   *
   * Cloud engines read scope from the JWT and IGNORE this option.
   */
  scope?: ReadonlyArray<string>;

  /**
   * Engine-local only. The identity claims to evaluate collab filters
   * against (`:self`, `:group=X`) and to stamp onto annotation
   * `/EMBD_Metadata` on create. Mirrors the JWT identity claims used
   * cloud-side.
   *
   * Required when `scope` contains collab scopes (`annotations:*:self`
   * etc.) — opening without it throws `MissingIdentity` so the config
   * mistake surfaces immediately instead of producing silent denies
   * at every mutation.
   *
   * Cloud engines read identity from the JWT and IGNORE this option.
   */
  identity?: IdentityClaims;
}
