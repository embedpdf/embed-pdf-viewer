import {
  EngineError,
  EngineErrorCode,
  decodePageKey,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

/**
 * Shared route helpers. Lives next to the route files (prefixed with
 * `_` so it's clearly internal to this directory and not meant to be
 * exported from the package).
 *
 * Route files must use these instead of local copies, so every route
 * gets the same "abort only on actual client disconnect" behaviour of
 * {@link abortSignalOf}.
 */

/**
 * Minimal structural view of zod's `safeParse` return so we don't need
 * `zod` as a direct dep of @cloudpdf/server. Schemas come through
 * @embedpdf/engine-core fully typed; we just need a shape we can
 * narrow on `success`.
 */
export type SafeParseLike<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: { issues: Array<{ message: string; path?: ReadonlyArray<string | number> }> };
    };

export interface SchemaLike<T> {
  safeParse(raw: unknown): SafeParseLike<T>;
}

/** Long-cache header for content-addressed versioned URLs. */
export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
/** No-cache header for unversioned aliases, mutations, and error responses. */
export const NO_STORE = 'private, no-store';

export function setImmutableCache(reply: {
  header(name: 'Cache-Control', value: string): unknown;
}): void {
  reply.header('Cache-Control', IMMUTABLE_CACHE);
}

export function setNoStore(reply: { header(name: 'Cache-Control', value: string): unknown }): void {
  reply.header('Cache-Control', NO_STORE);
}

/**
 * Decode the `:pageKey` route parameter (`obj:12`, the page-plane sibling
 * of `:annotKey` and `:fieldKey`) into a `PageRef`. Malformed keys answer
 * 400 InvalidArg. The segment arrives already URL-decoded.
 */
export function parsePageKey(raw: string): PageRef {
  const ref = decodePageKey(raw);
  if (!ref) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `pageKey '${raw}' is not a valid page key (expected 'obj:N')`,
    );
  }
  return ref;
}

/**
 * Unwrap a `PageRef` to its page object number. The wire address has one
 * kind — the canonical `objectNumber` — so this is a pure projection; the
 * guard only exists so a foreign kind can never reach number-keyed code
 * (DB rows, storage keys, audit rows) unnoticed.
 */
export function resolvePageRefToNumber(ref: PageRef): number {
  if (ref.kind !== 'objectNumber') {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `unsupported page address kind '${String((ref as { kind: unknown }).kind)}'`,
    );
  }
  return ref.objectNumber;
}

/** `parsePageKey` + `resolvePageRefToNumber` in one call, for route handlers. */
export function resolvePageKeyParam(raw: string): number {
  return resolvePageRefToNumber(parsePageKey(raw));
}

/**
 * An `AbortSignal` that aborts when the client goes away before its reply is
 * sent, so the worker pool stops work nobody waits for any more.
 *
 * The response tells, not the request: by the time a client disconnects, its
 * request has been read in full (`req.raw.complete` is true, for GET and POST
 * alike, so a request-side check never fires); only the response sees its
 * connection close before it finished.
 *
 * Locked behaviour (do not loosen): a request whose reply is sent never
 * aborts, whether its connection then closes or is kept alive.
 */
export function abortSignalOf(reply: {
  raw: {
    on(event: 'close', cb: () => void): unknown;
    readonly writableFinished: boolean;
    readonly destroyed: boolean;
  };
}): AbortSignal {
  const ctrl = new AbortController();
  // The client left before the handler ran.
  if (reply.raw.destroyed) {
    ctrl.abort();
    return ctrl.signal;
  }
  reply.raw.on('close', () => {
    if (!reply.raw.writableFinished) ctrl.abort();
  });
  return ctrl.signal;
}

/**
 * Run a Zod-shaped schema against `raw` and surface any failure as an
 * `EngineError(InvalidArg)` with the issues attached. The `where`
 * argument is interpolated into the message so the caller doesn't
 * have to compose a path manually.
 */
/**
 * `raw` checked against `schema`. A value it refuses is `InvalidArg` naming
 * the field (the first issue's path, as the engines' own checks name it).
 */
export function parseOrInvalidArg<T>(schema: SchemaLike<T>, raw: unknown, where: string): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const field = result.error.issues[0]?.path?.join('.') ?? '';
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `${where}: ${result.error.issues.map((i) => i.message).join('; ')}`,
      { details: { ...(field ? { field } : {}), issues: result.error.issues } },
    );
  }
  return result.data;
}

export function parseTokenOrInvalidArg<T>(
  decode: (raw: string) => T,
  raw: string,
  where: string,
): T {
  try {
    return decode(raw);
  } catch (error) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `${where}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
