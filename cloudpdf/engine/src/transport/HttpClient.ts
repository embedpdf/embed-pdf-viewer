import {
  AbortError,
  EngineError,
  EngineErrorCode,
  type SerializedEngineError,
} from '@embedpdf/engine-core/runtime';
import {
  applyCdnAccess,
  EngineErrorPayloadSchema,
  type CdnAccessInfoForApply,
} from '@embedpdf/engine-core/wire';

export interface HttpClientOptions {
  baseUrl: string;
  /**
   * Optional bearer token. Either a string or a function that
   * returns a fresh token on every call (so callers can rotate
   * without re-creating the engine). When absent, requests go out
   * without an `Authorization` header — useful for the public-share
   * scenario where the doc-scoped token is provided per-`open` and
   * the engine itself has no engine-level credentials.
   */
  token?: string | (() => string | Promise<string>);
  /**
   * Engine-instance session id, sent as `X-Engine-Session-Id` on every
   * request. The server stores it on mutation audit rows so this
   * instance's SSE stream can drop its own echoes (exactly-once events).
   */
  sessionId?: string;
  /** Replace the global fetch (e.g. in Node tests with undici). */
  fetch?: typeof globalThis.fetch;
}

/**
 * Per-document binding for CDN URL rewriting. `CloudDocumentHandle`
 * calls `setCdnAccess` after `/v1/access` succeeds; the HttpClient
 * then runs every outgoing request through `applyCdnAccess` so
 * granted resources are routed to the CDN with the matching signed
 * query params (or cookies/auth header for the cookie/header
 * adapter modes).
 *
 * Set to `null` when the session is reset or when `/access` was
 * never called (public-share with no CDN configured).
 */
export interface CdnBinding {
  readonly cdn: CdnAccessInfoForApply | null;
  readonly docId: string;
  readonly layerName: string;
}

/**
 * A raw-bytes response plus its headers. The attachment-file leaves carry
 * their metadata as headers (`Content-Type`, `X-EmbedPDF-File-Name`), so
 * unlike `getBytes` the caller needs the `Headers` object back.
 */
export interface HttpFileResponse {
  bytes: Uint8Array;
  headers: Headers;
}

export class HttpClient {
  private readonly base: string;
  private readonly tokenFn: (() => string | Promise<string>) | null;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly sessionId: string | null;
  private cdnBinding: CdnBinding | null = null;

  constructor(opts: HttpClientOptions) {
    this.base = opts.baseUrl.replace(/\/$/, '');
    const token = opts.token;
    this.tokenFn = token === undefined ? null : typeof token === 'function' ? token : () => token;
    this.sessionId = opts.sessionId ?? null;
    this.fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** Normalized server base URL (no trailing slash). */
  get baseUrl(): string {
    return this.base;
  }

  /**
   * The fetch implementation this client sends requests through (injected
   * or global). Exposed so sibling transports spawned per-open — the
   * share-session exchange, most of all — ride the same fetch the engine
   * was configured with (test doubles, SSR `Origin`-attaching wrappers).
   */
  get fetchImpl(): typeof globalThis.fetch {
    return this.fetchFn;
  }

  /**
   * Return a clone of this client bound to a different bearer. Used
   * by `CloudEngine.open` to mint a per-handle client carrying the
   * per-open token, so each opened document's RPCs go out under
   * the right authorization without disturbing the engine-level
   * token.
   */
  withToken(token: string | (() => string | Promise<string>)): HttpClient {
    return new HttpClient({
      baseUrl: this.baseUrl,
      token,
      ...(this.sessionId ? { sessionId: this.sessionId } : {}),
      fetch: this.fetchFn,
    });
  }

  /**
   * Raw streaming GET (the SSE channel). Same auth/session headers and
   * error mapping as every other request; the caller owns the body stream.
   */
  async stream(
    path: string,
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<Response> {
    return this.request(path, {
      method: 'GET',
      headers: new Headers({ Accept: 'text/event-stream', ...headers }),
      signal,
    });
  }

  /**
   * Install (or clear) the per-session CDN binding. Pass `null` to
   * route everything to origin again — useful on session close or
   * when an adapter swap happens mid-session (rare).
   *
   * The HttpClient stays dumb about WHEN to do this; the cloud
   * document handle pushes the binding in after /access succeeds.
   *
   * Side effect: in the browser, signedCookies are written to
   * `document.cookie` once per setCdnAccess call so the CDN edge
   * receives them on subsequent fetches. Node side ignores cookies
   * for now (cookie jar wiring deferred until needed for tests).
   */
  setCdnAccess(binding: CdnBinding | null): void {
    this.cdnBinding = binding;
    if (binding?.cdn?.signedCookies && typeof globalThis.document !== 'undefined') {
      for (const cookie of binding.cdn.signedCookies) {
        const parts = [`${cookie.name}=${cookie.value}`];
        parts.push(`Path=${cookie.path ?? '/'}`);
        if (cookie.domain) parts.push(`Domain=${cookie.domain}`);
        if (cookie.expires) parts.push(`Expires=${new Date(cookie.expires * 1000).toUTCString()}`);
        parts.push('SameSite=None', 'Secure');
        globalThis.document.cookie = parts.join('; ');
      }
    }
  }

  /** Current CDN binding (or null). Exposed for diagnostics/tests. */
  get currentCdnBinding(): CdnBinding | null {
    return this.cdnBinding;
  }

  absoluteUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  async getBlob(path: string, signal: AbortSignal): Promise<Blob> {
    const res = await this.request(path, { method: 'GET', signal });
    if (!res.ok) await this.throwFromBody(res);
    return await res.blob();
  }

  async getBytes(path: string, signal: AbortSignal): Promise<Uint8Array> {
    const res = await this.request(path, {
      method: 'GET',
      headers: new Headers({ Accept: 'application/pdf' }),
      signal,
    });
    if (!res.ok) await this.throwFromBody(res);
    return new Uint8Array(await res.arrayBuffer());
  }

  /**
   * Resolve the current bearer token. Awaits the user-supplied
   * token factory if it returns a promise. Used by the cloud
   * engine to read doc-scoped claims **without** verifying — the
   * server is the verifier of record. Throws when no token is
   * configured.
   */
  async currentToken(): Promise<string> {
    if (!this.tokenFn) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'http client has no token configured');
    }
    return await this.tokenFn();
  }

  async getJson<T>(path: string, parser: (raw: unknown) => T, signal: AbortSignal): Promise<T> {
    const res = await this.request(path, { method: 'GET', signal });
    return await this.parseJsonResponse(res, parser);
  }

  /**
   * GET a versioned URL with transparent stale-version recovery. If
   * the server returns 404 (the well-known "this version is gone"
   * signal for content-addressed reads), call `onStaleVersion` (which
   * the caller wires to a manifest refresh), then re-resolve `buildPath`
   * and retry the GET exactly once. Any non-404 error propagates.
   *
   * The retry budget is hard-capped at 1: after a refresh, if the
   * server's idea of the current version is still ahead of the
   * client's view, the second request fails normally — this matches
   * the CDN cache invariant ("a versioned URL's bytes are immutable
   * for its lifetime").
   */
  async getJsonWithRefresh<T>(
    buildPath: (signal: AbortSignal) => Promise<string>,
    parser: (raw: unknown) => T,
    onStaleVersion: (signal: AbortSignal) => Promise<void>,
    signal: AbortSignal,
  ): Promise<T> {
    const initialPath = await buildPath(signal);
    try {
      return await this.getJson(initialPath, parser, signal);
    } catch (err) {
      if (!EngineError.is(err, EngineErrorCode.NotFound)) throw err;
      await onStaleVersion(signal);
      const retryPath = await buildPath(signal);
      return await this.getJson(retryPath, parser, signal);
    }
  }

  /**
   * GET a `multipart/form-data` body and parse it with the platform's
   * `Response.formData()` (works in browsers and undici). Text parts come
   * back as strings, parts with a filename as `Blob`s.
   */
  async getFormData(path: string, signal: AbortSignal): Promise<FormData> {
    const res = await this.request(path, {
      method: 'GET',
      headers: new Headers({ Accept: 'multipart/form-data' }),
      signal,
    });
    if (!res.ok) await this.throwFromBody(res);
    return await res.formData();
  }

  /**
   * `getFormData` with the same single-retry stale-version recovery as
   * {@link getJsonWithRefresh}: a 404 on a versioned URL triggers
   * `onStaleVersion` (a manifest refresh) and one re-resolve + retry.
   */
  async getFormDataWithRefresh(
    buildPath: (signal: AbortSignal) => Promise<string>,
    onStaleVersion: (signal: AbortSignal) => Promise<void>,
    signal: AbortSignal,
  ): Promise<FormData> {
    const initialPath = await buildPath(signal);
    try {
      return await this.getFormData(initialPath, signal);
    } catch (err) {
      if (!EngineError.is(err, EngineErrorCode.NotFound)) throw err;
      await onStaleVersion(signal);
      const retryPath = await buildPath(signal);
      return await this.getFormData(retryPath, signal);
    }
  }

  /**
   * `getBlob` with the same single-retry stale-version recovery as
   * {@link getJsonWithRefresh}: a 404 on a versioned URL triggers
   * `onStaleVersion` (a manifest refresh) and one re-resolve + retry.
   * Render blobs ride this rail: a scope flip re-resolves the
   * doc-vs-layer path family instead of failing on a stale URL.
   */
  async getBlobWithRefresh(
    buildPath: (signal: AbortSignal) => Promise<string>,
    onStaleVersion: (signal: AbortSignal) => Promise<void>,
    signal: AbortSignal,
  ): Promise<Blob> {
    const initialPath = await buildPath(signal);
    try {
      return await this.getBlob(initialPath, signal);
    } catch (err) {
      if (!EngineError.is(err, EngineErrorCode.NotFound)) throw err;
      await onStaleVersion(signal);
      const retryPath = await buildPath(signal);
      return await this.getBlob(retryPath, signal);
    }
  }

  /** GET raw bytes plus the response headers (attachment-file leaves). */
  async getFile(path: string, signal: AbortSignal): Promise<HttpFileResponse> {
    const res = await this.request(path, { method: 'GET', signal });
    if (!res.ok) await this.throwFromBody(res);
    return { bytes: new Uint8Array(await res.arrayBuffer()), headers: res.headers };
  }

  /**
   * `getFile` with the same single-retry stale-version recovery as
   * {@link getJsonWithRefresh}: a 404 on a versioned URL triggers
   * `onStaleVersion` (a manifest refresh) and one re-resolve + retry.
   */
  async getFileWithRefresh(
    buildPath: (signal: AbortSignal) => Promise<string>,
    onStaleVersion: (signal: AbortSignal) => Promise<void>,
    signal: AbortSignal,
  ): Promise<HttpFileResponse> {
    const initialPath = await buildPath(signal);
    try {
      return await this.getFile(initialPath, signal);
    } catch (err) {
      if (!EngineError.is(err, EngineErrorCode.NotFound)) throw err;
      await onStaleVersion(signal);
      const retryPath = await buildPath(signal);
      return await this.getFile(retryPath, signal);
    }
  }

  async postMultipartJson<T>(
    path: string,
    body: FormData,
    parser: (raw: unknown) => T,
    signal: AbortSignal,
  ): Promise<T> {
    const res = await this.request(path, { method: 'POST', body, signal });
    return await this.parseJsonResponse(res, parser);
  }

  /** PATCH counterpart of {@link postMultipartJson} (binary-carrying mutations). */
  async patchMultipartJson<T>(
    path: string,
    body: FormData,
    parser: (raw: unknown) => T,
    signal: AbortSignal,
  ): Promise<T> {
    const res = await this.request(path, { method: 'PATCH', body, signal });
    return await this.parseJsonResponse(res, parser);
  }

  async postJson<T>(
    path: string,
    body: unknown,
    parser: (raw: unknown) => T,
    signal: AbortSignal,
  ): Promise<T> {
    const res = await this.requestJson(path, 'POST', body, signal);
    return await this.parseJsonResponse(res, parser);
  }

  /** POST a JSON body and return the raw binary response (pages.extract). */
  async postJsonBytes(path: string, body: unknown, signal: AbortSignal): Promise<Uint8Array> {
    const res = await this.requestJson(path, 'POST', body, signal);
    if (!res.ok) await this.throwFromBody(res);
    return new Uint8Array(await res.arrayBuffer());
  }

  /** POST a raw binary body (FDF/XFDF import) and parse the JSON response. */
  async postBytesJson<T>(
    path: string,
    bytes: Uint8Array,
    contentType: string,
    parser: (raw: unknown) => T,
    signal: AbortSignal,
  ): Promise<T> {
    const headers = new Headers({ 'Content-Type': contentType });
    // Copy into a fresh ArrayBuffer: `bytes` may be a view over a larger
    // (or SharedArrayBuffer-backed) buffer, which fetch bodies reject.
    const body = new Uint8Array(bytes).buffer as ArrayBuffer;
    const res = await this.request(path, { method: 'POST', body, headers, signal });
    return await this.parseJsonResponse(res, parser);
  }

  async patchJson<T>(
    path: string,
    body: unknown,
    parser: (raw: unknown) => T,
    signal: AbortSignal,
  ): Promise<T> {
    const res = await this.requestJson(path, 'PATCH', body, signal);
    return await this.parseJsonResponse(res, parser);
  }

  async deleteJson<T>(path: string, parser: (raw: unknown) => T, signal: AbortSignal): Promise<T> {
    const res = await this.request(path, { method: 'DELETE', signal });
    return await this.parseJsonResponse(res, parser);
  }

  async deleteEmpty(path: string, signal: AbortSignal): Promise<void> {
    const res = await this.request(path, { method: 'DELETE', signal });
    if (res.status === 204) return;
    if (!res.ok) await this.throwFromBody(res);
  }

  async postEmpty(path: string, body: unknown, signal: AbortSignal): Promise<void> {
    const res = await this.requestJson(path, 'POST', body, signal);
    if (res.status === 204) return;
    if (!res.ok) await this.throwFromBody(res);
  }

  private requestJson(
    path: string,
    method: 'POST' | 'PATCH' | 'PUT',
    body: unknown,
    signal: AbortSignal,
  ): Promise<Response> {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    return this.request(path, {
      method,
      body: JSON.stringify(body ?? {}),
      headers,
      signal,
    });
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const { url, extraHeader } = this.resolveOutgoing(path);
    const headers = new Headers(init.headers ?? {});
    if (this.tokenFn) {
      const token = await this.tokenFn();
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (this.sessionId) headers.set('X-Engine-Session-Id', this.sessionId);
    if (extraHeader) headers.set(extraHeader.name, extraHeader.value);
    try {
      return await this.fetchFn(url, { ...init, headers });
    } catch (err) {
      // undici's fetch propagates whatever was passed to AbortController.abort().
      // Anything that arrives while signal.aborted is true is an abort, regardless
      // of the wire-shape (DOMException, plain Error, string, ...).
      if (init.signal?.aborted) {
        throw new AbortError(init.signal.reason ?? err);
      }
      if ((err as { name?: string } | null)?.name === 'AbortError') {
        throw new AbortError((err as Error).message);
      }
      throw new EngineError(
        EngineErrorCode.Network,
        `network error: ${(err as Error)?.message ?? err}`,
        {
          cause: err,
        },
      );
    }
  }

  private async parseJsonResponse<T>(res: Response, parser: (raw: unknown) => T): Promise<T> {
    if (!res.ok) await this.throwFromBody(res);
    const json: unknown = await res.json().catch(() => ({}));
    try {
      return parser(json);
    } catch (err) {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected response shape: ${(err as Error)?.message ?? err}`,
        {
          cause: err,
        },
      );
    }
  }

  /**
   * Decide where this request actually goes. With no CDN binding (or
   * binding's `cdn` is null) every request stays on origin. Otherwise
   * `applyCdnAccess` decides per-request based on the resource the
   * path resolves to (and whether the caller's scope granted CDN
   * access to it).
   */
  private resolveOutgoing(path: string): {
    url: string;
    extraHeader: { name: string; value: string } | null;
  } {
    if (!this.cdnBinding || !this.cdnBinding.cdn) {
      return { url: `${this.baseUrl}${path}`, extraHeader: null };
    }
    const applied = applyCdnAccess({
      path,
      originUrl: this.baseUrl,
      docId: this.cdnBinding.docId,
      layerName: this.cdnBinding.layerName,
      cdn: this.cdnBinding.cdn,
    });
    return {
      url: applied.url,
      extraHeader: applied.routedToCdn && applied.authHeader ? applied.authHeader : null,
    };
  }

  private async throwFromBody(res: Response): Promise<never> {
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    const code = mapStatusToCode(res.status);
    if (payload && typeof payload === 'object' && 'error' in payload) {
      const inner = (payload as { error: unknown }).error;
      const parsed = trySerialized(inner);
      if (parsed) throw new EngineError(parsed.code, parsed.message, { details: parsed.details });
      const msg =
        typeof inner === 'object' && inner && 'message' in inner
          ? String((inner as { message: unknown }).message)
          : `HTTP ${res.status}`;
      throw new EngineError(code, msg, { details: { status: res.status } });
    }
    throw new EngineError(code, `HTTP ${res.status}`, { details: { status: res.status } });
  }
}

function mapStatusToCode(status: number): EngineErrorCode {
  if (status === 401) return EngineErrorCode.Unauthenticated;
  if (status === 403) return EngineErrorCode.Forbidden;
  if (status === 409) return EngineErrorCode.WeakAnnotationSessionConflict;
  if (status === 404) return EngineErrorCode.NotFound;
  if (status === 422) return EngineErrorCode.DocOpenFailed;
  if (status === 499) return EngineErrorCode.Aborted;
  if (status === 400) return EngineErrorCode.InvalidArg;
  return EngineErrorCode.Unknown;
}

function trySerialized(value: unknown): SerializedEngineError | null {
  const result = EngineErrorPayloadSchema.safeParse(value);
  return result.success ? result.data : null;
}
