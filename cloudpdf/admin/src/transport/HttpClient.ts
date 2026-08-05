import { AdminError } from './AdminError';

/**
 * Narrow fetch body type. Covers the cases the admin SDK sends today.
 */
export type FetchBody = Uint8Array | string | null | undefined;

export interface HttpClientOptions {
  baseUrl: string;
  /**
   * Tenant-scoped admin credential. Either a string or a function returning a
   * fresh token, matching the `@cloudpdf/engine` client shape.
   */
  tenantToken: string | (() => string | Promise<string>);
  /** Optional `fetch` override for tests or non-global runtimes. */
  fetch?: typeof globalThis.fetch;
  /** Default request timeout in ms. */
  timeoutMs?: number;
}

export interface RequestOptions {
  signal?: AbortSignal;
  /** Per-request override; falls back to client default. */
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/**
 * Thin HTTP client for @cloudpdf/admin. It mirrors @cloudpdf/engine's transport shape:
 * endpoint methods pass a zod parser into `getJson`/`postJson`, while this
 * client owns auth, timeout, error mapping, and bad-response wrapping.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly tokenFn: () => string | Promise<string>;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly defaultTimeoutMs: number;

  constructor(opts: HttpClientOptions) {
    if (!opts.baseUrl) throw new Error('HttpClient: baseUrl required');
    if (!opts.tenantToken) throw new Error('HttpClient: tenantToken required');

    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    const token = opts.tenantToken;
    this.tokenFn = typeof token === 'function' ? token : () => token;
    this.fetchFn = opts.fetch ?? globalThis.fetch?.bind(globalThis);
    this.defaultTimeoutMs = opts.timeoutMs ?? 60_000;

    if (!this.fetchFn) {
      throw new Error('HttpClient: no fetch implementation available (pass `fetch` option)');
    }
  }

  async getJson<T>(
    path: string,
    parser: (raw: unknown) => T,
    opts: RequestOptions = {},
  ): Promise<T> {
    const res = await this.request(path, { method: 'GET' }, opts);
    return this.parseJsonResponse(res, parser);
  }

  async postJson<T>(
    path: string,
    body: unknown,
    parser: (raw: unknown) => T,
    opts: RequestOptions = {},
  ): Promise<T> {
    const res = await this.request(
      path,
      {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
        headers: { 'Content-Type': 'application/json' },
      },
      opts,
    );
    return this.parseJsonResponse(res, parser);
  }

  async postBytesJson<T>(
    path: string,
    body: Uint8Array,
    parser: (raw: unknown) => T,
    opts: RequestOptions = {},
  ): Promise<T> {
    const res = await this.request(
      path,
      {
        method: 'POST',
        body,
        headers: opts.headers,
      },
      opts,
    );
    return this.parseJsonResponse(res, parser);
  }

  async deleteEmpty(path: string, opts: RequestOptions = {}): Promise<void> {
    const res = await this.request(path, { method: 'DELETE' }, opts);
    if (res.status === 204) return;
    if (!res.ok) throw await AdminError.fromResponse(res);
  }

  async getResponse(path: string, opts: RequestOptions = {}): Promise<Response> {
    const res = await this.request(path, { method: 'GET' }, opts);
    if (!res.ok) throw await AdminError.fromResponse(res);
    return res;
  }

  /** One-off PUT to a presigned URL. No tenant auth is attached. */
  async putPresigned(
    url: string,
    body: Uint8Array,
    headers: Record<string, string>,
    opts: RequestOptions = {},
  ): Promise<void> {
    const res = await this.request(url, { method: 'PUT', body, headers }, opts, {
      auth: false,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new AdminError({
        code: 'PresignedUploadFailed',
        status: res.status,
        message: `presigned PUT failed: ${res.status} ${res.statusText} ${text}`.trim(),
      });
    }
  }

  private async request(
    path: string,
    init: RequestInit,
    opts: RequestOptions = {},
    requestOpts: { auth?: boolean } = {},
  ): Promise<Response> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutMs = opts.timeoutMs ?? this.defaultTimeoutMs;
    const timer =
      timeoutMs > 0
        ? setTimeout(
            () => controller.abort(new Error(`request timed out after ${timeoutMs}ms`)),
            timeoutMs,
          )
        : null;

    const onAbort = () => controller.abort(opts.signal?.reason);
    if (opts.signal) {
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    try {
      const headers = new Headers(init.headers ?? {});
      for (const [key, value] of Object.entries(opts.headers ?? {})) {
        headers.set(key, value);
      }
      if (requestOpts.auth !== false) {
        headers.set('Authorization', `Bearer ${await this.tokenFn()}`);
      }
      if (!headers.has('Accept')) {
        headers.set('Accept', 'application/json');
      }

      return await this.fetchFn(url, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new AdminError({
          code: 'Aborted',
          status: 0,
          message: (controller.signal.reason as Error | undefined)?.message ?? 'request aborted',
        });
      }
      throw new AdminError({
        code: 'Network',
        status: 0,
        message: `network error: ${(err as Error)?.message ?? err}`,
      });
    } finally {
      if (timer) clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
    }
  }

  private async parseJsonResponse<T>(res: Response, parser: (raw: unknown) => T): Promise<T> {
    if (!res.ok) throw await AdminError.fromResponse(res);
    if (res.status === 204) return undefined as T;

    const json: unknown = await res.json().catch(() => ({}));
    try {
      return parser(json);
    } catch (err) {
      throw new AdminError({
        code: 'BadServerResponse',
        status: res.status,
        message: `unexpected response shape: ${(err as Error)?.message ?? err}`,
      });
    }
  }
}
