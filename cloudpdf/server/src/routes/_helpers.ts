import {
  EngineError,
  EngineErrorCode,
  decodePageKey,
  type PageRef,
  type SerializedEngineError,
} from '@embedpdf/engine-core/runtime';
import { SHAPES, type CachedReadKind, type TokenPin } from '@embedpdf/engine-core/wire';
import type { FastifyReply } from 'fastify';

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

/**
 * Long-cache headers for content-addressed versioned URLs: the bytes behind
 * `…@{version}` never change, so whoever may keep them keeps them a year
 * without asking again. Who may keep them is the deployment's:
 *
 *   - behind a CDN, the edge checks the signature before serving its copy,
 *     so shared caches may store it (`public`);
 *   - without one, nothing between the browser and the engine checks the
 *     token, so only the caller's own browser may (`private`) — `public`
 *     would let a proxy keep a response that needed a token and hand it to
 *     anyone asking for the URL.
 */
export const IMMUTABLE_CACHE_SHARED = 'public, max-age=31536000, immutable';
export const IMMUTABLE_CACHE_PRIVATE = 'private, max-age=31536000, immutable';
/** No-cache header for unversioned aliases, mutations, and error responses. */
export const NO_STORE = 'private, no-store';

declare module 'fastify' {
  interface FastifyInstance {
    /** The deployment's versioned-read header, chosen once by `buildApp` from its CDN. */
    immutableCache: typeof IMMUTABLE_CACHE_SHARED | typeof IMMUTABLE_CACHE_PRIVATE;
  }
}

/**
 * The response header that names this server's engine value when a request
 * named another one (see {@link readAtPins}): that answer is never cached.
 */
export const ENGINE_HEADER = 'EmbedPDF-Engine';

export function setImmutableCache(reply: FastifyReply): void {
  // An answer computed with another engine value than its URL names is not
  // the answer that URL stands for.
  if (reply.hasHeader(ENGINE_HEADER)) {
    setNoStore(reply);
    return;
  }
  reply.header('Cache-Control', reply.server.immutableCache);
}

export function setNoStore(reply: { header(name: 'Cache-Control', value: string): unknown }): void {
  reply.header('Cache-Control', NO_STORE);
}

/**
 * Reads the answer to a pinned request (`…@token`). It goes out `immutable`,
 * and every cache that keeps it serves it for a year, so it must be exactly
 * the state its pins name. Every pinned read goes through here:
 *
 * - `assertCurrent` runs before the read and again after it, so a write that
 *   committed meanwhile refuses the pins;
 * - a read that a layer write began during is refused too, since the layer's
 *   session may have shown that write before it committed. A write already
 *   in flight when the read starts is no reason: the read waits for it
 *   before it runs (`DocumentService.ensureLayerOnPool`);
 * - the token's shape must be one this server answers;
 * - a token that names another engine value than this server's is answered
 *   with this server's own answer, uncached, and its engine value in
 *   {@link ENGINE_HEADER}: nothing is cached under a value that doesn't
 *   describe it, and the request doesn't fail.
 *
 * A refusal is "no longer current" with `no-store`; the client reads its
 * manifest again.
 */
export async function readAtPins<T>(input: {
  documentService: {
    layerWriteMark(docId: string, layerName: string): number;
    readonly engineValues: { of(kind: CachedReadKind): Promise<string> };
  };
  reply: FastifyReply;
  docId: string;
  /** The layer whose session answers; `undefined` for the base, which no write changes in place. */
  layerName: string | undefined;
  /** Throws `NotFound` when a pin is no longer current. */
  assertCurrent: () => unknown;
  read: () => Promise<T>;
  /**
   * The kind of cached read and its token's pin. Without a token the read is
   * unpinned (`no-store`): it runs `assertCurrent` once and is never
   * refused for a write. A request that carries its pins in its body has no
   * pin: it is read at its pins, and answered uncached.
   */
  token: { kind: CachedReadKind; pin: TokenPin | undefined } | undefined;
}): Promise<T> {
  const { documentService, docId, layerName, token } = input;
  try {
    await input.assertCurrent();
    if (token === undefined) return await input.read();
    const { kind, pin } = token;
    if (pin && pin.shape > SHAPES[kind]) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `${kind} shape ${pin.shape} is newer than this server answers (${SHAPES[kind]})`,
      );
    }
    const mark = layerName === undefined ? 0 : documentService.layerWriteMark(docId, layerName);
    const body = await input.read();
    if (layerName !== undefined && documentService.layerWriteMark(docId, layerName) !== mark) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `layer ${layerName} of document ${docId} was written during this read; its pins are no longer current`,
      );
    }
    await input.assertCurrent();
    const engine = await documentService.engineValues.of(kind);
    if (pin && pin.engine !== engine) {
      input.reply.header(ENGINE_HEADER, engine);
      setNoStore(input.reply);
    }
    return body;
  } catch (err) {
    if (EngineError.is(err, EngineErrorCode.NotFound)) setNoStore(input.reply);
    throw err;
  }
}

/**
 * The body of every error response (`ErrorResponseSchema`): a code from the
 * one list, the message, and what the code carries.
 */
export function errorBody(
  code: EngineErrorCode,
  message: string,
  details?: Record<string, unknown>,
): { error: SerializedEngineError } {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

/** `429` with `Retry-After`: the caller is over a request budget for `retryAfterMs` more. */
export function tooManyRequests(reply: FastifyReply, retryAfterMs: number): FastifyReply {
  return reply
    .code(429)
    .header('retry-after', String(Math.ceil(retryAfterMs / 1000)))
    .send(errorBody(EngineErrorCode.TooManyRequests, 'rate limited; retry later'));
}

/**
 * Decode the `:pageKey` route parameter (`obj:12`, the page-plane sibling
 * of `:annotationKey` and `:fieldKey`) into a `PageRef`. Malformed keys answer
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

/**
 * The object numbers a create names, from its query string: `name` is one
 * number (`?objectNumber=42`) or a comma list (`?objectNumbers=42,43`). The
 * body stays the data. A value that isn't a positive whole number is
 * `InvalidArg` naming the parameter; an absent one is `undefined`.
 */
export function objectNumbersQuery(query: unknown, name: string): number[] | undefined {
  const raw = (query as Record<string, unknown> | undefined)?.[name];
  if (raw === undefined || raw === '') return undefined;
  const numbers = String(raw)
    .split(',')
    .map((part) => Number(part.trim()));
  if (!numbers.every((number) => Number.isSafeInteger(number) && number > 0)) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `${name} must be positive whole numbers, comma-separated`,
      { details: { field: name } },
    );
  }
  return numbers;
}

/** One object number a create names, from its query string (see {@link objectNumbersQuery}). */
export function objectNumberQuery(query: unknown, name: string): number | undefined {
  const numbers = objectNumbersQuery(query, name);
  if (numbers && numbers.length !== 1) {
    throw new EngineError(EngineErrorCode.InvalidArg, `${name} is one object number`, {
      details: { field: name },
    });
  }
  return numbers?.[0];
}
