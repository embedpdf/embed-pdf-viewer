import {
  EngineError,
  EngineErrorCode,
  type DocumentShareInfo,
} from '@embedpdf/engine-core/runtime';

/**
 * Share-session exchange: the client half of the no-backend embed flow.
 *
 * A share token (`shr_…`) is a reference to a stored grant on the
 * server, not a credential — `exchangeShareToken` trades it for an
 * ordinary short-lived doc JWT, and `shareSessionSource` wraps that in
 * a self-renewing token source. Because the engine's transport
 * invokes its token source on every request (and SSE reconnects call
 * it again), renewal is "exchange again when the cached session is
 * nearly out"; an open document also renews on a timer, so a visitor
 * who only reads still counts as seen.
 *
 * Every exchange names a visitor and answers their handle: sent back on
 * each renewal, it keeps the same visitor (and on a per-visitor link,
 * their layer). When the link keeps visitors' layers (`visitor.keep`),
 * the handle also waits in a {@link VisitorStore} for the next visit.
 *
 * The endpoint requires a browser `Origin` header (the server checks
 * it against the grant's allowlist). Browsers attach it automatically;
 * non-browser callers (tests, SSR) must supply a `fetch` that does.
 */

export interface ShareSession {
  /** Doc-scoped session JWT carrying the grant's capabilities. */
  token: string;
  docId: string;
  /** The layer the session reads and writes: the link's shared one, or this visitor's own. */
  layerName: string;
  layerMode: DocumentShareInfo['layerMode'];
  visitor: {
    /** Send it back with the next exchange to stay the same visitor. */
    handle: string;
    /** Keep the handle for the next visit too: the link keeps visitors' layers. */
    keep: boolean;
  };
  /** Unix seconds when `token` expires. */
  expiresAt: number;
}

export interface ShareExchangeOptions {
  /** Passphrase for protected grants (`SharePasswordRequired` otherwise). */
  password?: string;
  /** The `visitor.handle` an earlier exchange answered: the same visitor, and their layer. */
  visitorHandle?: string;
  /** With `visitorHandle` on a per-visitor link: delete that visitor's layer and start a new one. */
  restart?: boolean;
  fetch?: typeof globalThis.fetch;
}

/**
 * Where a share link's visitor waits for the next visit: the handle of a
 * link that keeps visitors' layers, by share token. Calls may be async (a
 * native app's storage).
 */
export interface VisitorStore {
  get(shareToken: string): string | null | Promise<string | null>;
  set(shareToken: string, handle: string): void | Promise<void>;
  delete(shareToken: string): void | Promise<void>;
}

/**
 * The browser's `localStorage` as a {@link VisitorStore} (keys
 * `cloudpdf.visitor.<shareToken>`), or `null` where there is none. A
 * browser that refuses storage (a private window, blocked site data)
 * keeps nothing: the visitor starts fresh next time.
 */
export function browserVisitorStore(): VisitorStore | null {
  let storage: Storage | undefined;
  try {
    storage = (globalThis as { localStorage?: Storage }).localStorage;
  } catch {
    return null;
  }
  if (!storage) return null;
  const key = (shareToken: string) => `cloudpdf.visitor.${shareToken}`;
  const quietly = <T>(run: () => T, fallback: T): T => {
    try {
      return run();
    } catch {
      return fallback;
    }
  };
  return {
    get: (shareToken) => quietly(() => storage.getItem(key(shareToken)), null),
    set: (shareToken, handle) => quietly(() => storage.setItem(key(shareToken), handle), undefined),
    delete: (shareToken) => quietly(() => storage.removeItem(key(shareToken)), undefined),
  };
}

/**
 * Thrown on a non-OK exchange. `code` is the server's wire code:
 * `SharePasswordRequired` (prompt and retry with a password),
 * `OriginNotAllowed` / `OriginRequired`, `ShareExpired`, `NotFound`
 * (unknown or revoked — indistinguishable by design), or
 * `TooManyRequests`.
 */
export class ShareExchangeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ShareExchangeError';
  }
}

export async function exchangeShareToken(
  baseUrl: string,
  shareToken: string,
  opts: ShareExchangeOptions = {},
): Promise<ShareSession> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const res = await doFetch(`${baseUrl.replace(/\/$/, '')}/v1/share-sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      shareToken,
      ...(opts.password !== undefined ? { password: opts.password } : {}),
      ...(opts.visitorHandle !== undefined ? { visitorHandle: opts.visitorHandle } : {}),
      ...(opts.restart ? { restart: true } : {}),
    }),
  });
  if (!res.ok) {
    let code = 'Unknown';
    let message = `share exchange failed with status ${res.status}`;
    try {
      const payload = (await res.json()) as { error?: { code?: string; message?: string } };
      if (payload.error?.code) code = payload.error.code;
      if (payload.error?.message) message = payload.error.message;
    } catch {
      // Non-JSON error body; keep the status-shaped message.
    }
    throw new ShareExchangeError(code, message, res.status);
  }
  return (await res.json()) as ShareSession;
}

/**
 * Lift a {@link ShareExchangeError} into the engine's error taxonomy, so
 * `open({ kind: 'share' })` and every later renewal fail with the same
 * `EngineError` family as all other engine calls. The wire code and HTTP
 * status survive in `details`; the original error rides as `cause`.
 *
 * `SharePasswordRequired` gets its own engine code — it is the one outcome
 * callers branch on programmatically (prompt for the grant passphrase and
 * retry). Everything else maps by meaning, with the HTTP status as the
 * fallback discriminator.
 */
export function engineErrorFromShareExchange(error: ShareExchangeError): EngineError {
  const code =
    error.code === 'SharePasswordRequired'
      ? EngineErrorCode.SharePasswordRequired
      : error.code === 'NotFound'
        ? EngineErrorCode.NotFound
        : error.code === 'ShareExpired' ||
            error.code === 'OriginNotAllowed' ||
            error.code === 'OriginRequired'
          ? EngineErrorCode.Forbidden
          : error.status === 401
            ? EngineErrorCode.Unauthenticated
            : error.status === 400
              ? EngineErrorCode.InvalidArg
              : EngineErrorCode.Unknown;
  return new EngineError(code, `share exchange failed: ${error.message}`, {
    details: { shareCode: error.code, status: error.status },
    cause: error,
  });
}

/** Renew this many seconds before `expiresAt` so in-flight requests never race expiry. */
const RENEW_MARGIN_SECONDS = 60;
/** After a renewal on the timer failed, try again this much later; a request says why meanwhile. */
const KEEP_ALIVE_RETRY_MS = 60_000;

export interface ShareSessionOptions {
  /** Passphrase for protected grants. */
  password?: string;
  /** Start over: the first exchange deletes the kept visitor's layer (see `OpenInputShare.restart`). */
  restart?: boolean;
  /** Where a kept visitor waits for the next visit; none keeps the visitor for this session only. */
  visitorStore?: VisitorStore | null;
  fetch?: typeof globalThis.fetch;
}

/**
 * One open's share session: exchanges and renews, as one visitor. The first
 * exchange brings the visitor the store kept (and starts over when asked);
 * each later one sends the handle the last answered. A renewal that lands
 * on another layer (the visitor's layer was deleted, or the link changed
 * whose layer it gives) can't serve this open, which was made on the first:
 * from then on it refuses, and opening again picks the new layer up.
 */
export class ShareSessionSource {
  private session: ShareSession | null = null;
  private inflight: Promise<ShareSession> | null = null;
  /** The visitor to send: `undefined` until the store was read. */
  private handle: string | null | undefined;
  private restart: boolean;
  private lost: EngineError | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly shareToken: string,
    private readonly opts: ShareSessionOptions = {},
  ) {
    this.restart = opts.restart === true;
  }

  /** A session token that isn't about to expire, exchanging when it is. */
  async token(): Promise<string> {
    if (this.lost) throw this.lost;
    const session = this.session;
    if (session && session.expiresAt - Date.now() / 1000 > RENEW_MARGIN_SECONDS) {
      return session.token;
    }
    this.inflight ??= this.exchange().finally(() => {
      this.inflight = null;
    });
    return (await this.inflight).token;
  }

  /** How the session reaches its layer, as of the last exchange; `null` before the first. */
  info(): DocumentShareInfo | null {
    const session = this.session;
    return session ? { layerMode: session.layerMode, keep: session.visitor.keep } : null;
  }

  /**
   * Renew shortly before each expiry until stopped, so an open document
   * nobody touches still renews (and its visitor counts as seen). Returns
   * the stop.
   */
  keepAlive(): () => void {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (delayMs: number) => {
      if (stopped || this.lost) return;
      timer = setTimeout(renew, delayMs);
      (timer as { unref?: () => void }).unref?.();
    };
    const renew = () => {
      this.token().then(
        () => schedule(this.untilRenewalMs()),
        () => schedule(KEEP_ALIVE_RETRY_MS),
      );
    };
    schedule(this.untilRenewalMs());
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }

  /** A second into the renewal margin: when `token()` exchanges again. */
  private untilRenewalMs(): number {
    const session = this.session;
    if (!session) return 0;
    const renewAt = (session.expiresAt - RENEW_MARGIN_SECONDS + 1) * 1000;
    return Math.max(1_000, renewAt - Date.now());
  }

  private async exchange(): Promise<ShareSession> {
    const store = this.opts.visitorStore ?? null;
    if (this.handle === undefined) {
      this.handle = store ? await store.get(this.shareToken) : null;
    }
    const next = await exchangeShareToken(this.baseUrl, this.shareToken, {
      ...(this.opts.password !== undefined ? { password: this.opts.password } : {}),
      ...(this.handle ? { visitorHandle: this.handle } : {}),
      ...(this.restart ? { restart: true } : {}),
      ...(this.opts.fetch ? { fetch: this.opts.fetch } : {}),
    });
    this.restart = false;
    const opened = this.session;
    if (opened && next.layerName !== opened.layerName) {
      // The store isn't touched: when another tab started over, its new
      // visitor stays the one this browser comes back as.
      this.lost = new EngineError(
        EngineErrorCode.Forbidden,
        `the share link now opens layer ${next.layerName}, not ${opened.layerName}: open it again`,
        { details: { reason: 'layer-changed', layerName: next.layerName } },
      );
      throw this.lost;
    }
    this.handle = next.visitor.handle;
    if (store) {
      if (next.visitor.keep) await store.set(this.shareToken, next.visitor.handle);
      else await store.delete(this.shareToken);
    }
    this.session = next;
    return next;
  }
}

/**
 * A caching, self-renewing token source over the exchange — the callable
 * member of the engine's `TokenSource` union, assignable wherever one is
 * taken. Renewals keep the visitor; `visitorStore` keeps them for the next
 * visit when the link says so.
 * Concurrent callers share one in-flight exchange; a failed exchange
 * clears it so the next request retries rather than caching the error.
 */
export function shareSessionSource(
  baseUrl: string,
  shareToken: string,
  opts: ShareSessionOptions = {},
): () => Promise<string> {
  const source = new ShareSessionSource(baseUrl, shareToken, opts);
  return () => source.token();
}
