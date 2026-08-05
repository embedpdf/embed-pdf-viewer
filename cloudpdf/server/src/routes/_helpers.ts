import { EngineError, EngineErrorCode, type PageState } from '@embedpdf/engine-core/runtime';
import type { ManifestPage } from '@embedpdf/engine-core/wire';

/**
 * Shared route helpers. Lives next to the route files (prefixed with
 * `_` so it's clearly internal to this directory and not meant to be
 * exported from the package).
 *
 * History note: these helpers used to be copy-pasted across
 * `annotations.ts`, `pages.ts`, and `metadata.ts`. The
 * `abortSignalFromRequest` variant in `metadata.ts` was the original,
 * naive version that aborts on every `close` event — which silently
 * fires for body-bearing requests (POST/PATCH) the moment Fastify
 * finishes consuming the JSON body. Consolidating to one
 * implementation here ensures every route file gets the fixed
 * "abort only on actual client disconnect" behaviour.
 */

/**
 * Minimal structural view of zod's `safeParse` return so we don't need
 * `zod` as a direct dep of @cloudpdf/server. Schemas come through
 * @embedpdf/engine-core fully typed; we just need a shape we can
 * narrow on `success`.
 */
export type SafeParseLike<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: Array<{ message: string }> } };

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

export function parsePageObjectNumber(raw: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `pageObjectNumber must be a positive integer, got '${raw}'`,
    );
  }
  return n;
}

export function toPageState(page: ManifestPage): PageState {
  return page.state;
}

/**
 * Convert a Fastify request's lifecycle into an `AbortSignal` the
 * worker pool can react to.
 *
 * Locked behaviour (do not loosen without re-reading the abort-on-body
 * debug session in the v3 mutations slice):
 *
 *   - For body-bearing requests (POST/PATCH), Fastify finishes
 *     consuming the request stream BEFORE our handler runs. Node
 *     emits `close` on the IncomingMessage immediately after that.
 *     If we abort unconditionally on `close`, every request appears
 *     "aborted" to the worker, even when the client is happily
 *     awaiting the response.
 *
 *   - The fix: only abort when the request stream did NOT finish
 *     reading (`req.raw.complete === false`). That distinguishes a
 *     real client disconnect from a normal end-of-body signal.
 *
 *   - `req.raw.aborted` is checked up front for the rare case where
 *     the client tore down the connection before the handler started.
 */
export function abortSignalFromRequest(req: {
  raw: {
    on(event: 'close', cb: () => void): void;
    readonly complete: boolean;
    readonly aborted?: boolean;
  };
}): AbortSignal {
  const ctrl = new AbortController();
  if (req.raw.aborted) {
    ctrl.abort();
    return ctrl.signal;
  }
  req.raw.on('close', () => {
    if (!req.raw.complete) ctrl.abort();
  });
  return ctrl.signal;
}

/**
 * Run a Zod-shaped schema against `raw` and surface any failure as an
 * `EngineError(InvalidArg)` with the issues attached. The `where`
 * argument is interpolated into the message so the caller doesn't
 * have to compose a path manually.
 */
export function parseOrInvalidArg<T>(schema: SchemaLike<T>, raw: unknown, where: string): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `${where}: ${result.error.issues.map((i) => i.message).join('; ')}`,
      { details: { issues: result.error.issues } },
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
