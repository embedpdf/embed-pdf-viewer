import {
  AbortablePromise,
  AbortError,
  EngineError,
  EngineErrorCode,
  type DocumentShare,
  type Identity,
  type ShareOpenRequest,
  shareOpenRequestOf,
  type VisitorAnswers,
  type VisitorIdentityRequest,
  visitorIdentityRequestOf,
} from '@embedpdf/engine-core/runtime';

import type { WriteGate } from './document/CloudWrites';

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
 * their layer). Unless the link gives a new copy every visit
 * (`visitor.keep`), the handle also waits in a {@link VisitorStore} for the
 * next visit.
 *
 * A link can ask its visitors who they are: on open (the exchange answers
 * `VisitorIdentityRequired` until they answer), or before their first change
 * (the session reads at once, and its writes wait for the answers). A
 * passphrase or questions on open that the link gets while a document is
 * open refuse its next renewal: the open asks the visitor once
 * (`openRequest`) and exchanges nothing more until they give it.
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
  layerMode: DocumentShare['layerMode'];
  visitor: {
    /** Send it back with the next exchange to stay the same visitor. */
    handle: string;
    /** Keep the handle for the next visit too: false only where every visit gets a new copy. */
    keep: boolean;
    /** What the link asks before this visitor's first change, unanswered; `null` when nothing. */
    identityRequest: VisitorIdentityRequest | null;
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
  /** The visitor's answers to what the link asks; an answer once given stays. */
  visitorIdentity?: VisitorAnswers;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

/**
 * Where a share link's visitor waits for the next visit: the handle of a
 * visitor the link keeps (`visitor.keep`), by share token. Calls may be async
 * (a native app's storage).
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
 * `VisitorIdentityRequired` (ask the link's questions, `details`, and retry
 * with the answers), `OriginNotAllowed` / `OriginRequired`, `ShareExpired`,
 * `NotFound` (unknown or revoked — indistinguishable by design), or
 * `TooManyRequests`.
 */
export class ShareExchangeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
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
      ...(opts.visitorIdentity ? { visitorIdentity: opts.visitorIdentity } : {}),
    }),
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  if (!res.ok) {
    let code = 'Unknown';
    let message = `share exchange failed with status ${res.status}`;
    let details: Record<string, unknown> | undefined;
    try {
      const payload = (await res.json()) as {
        error?: { code?: string; message?: string; details?: Record<string, unknown> };
      };
      if (payload.error?.code) code = payload.error.code;
      if (payload.error?.message) message = payload.error.message;
      details = payload.error?.details;
    } catch {
      // Non-JSON error body; keep the status-shaped message.
    }
    throw new ShareExchangeError(code, message, res.status, details);
  }
  return (await res.json()) as ShareSession;
}

/**
 * Lift a {@link ShareExchangeError} into the engine's error taxonomy, so
 * `open({ kind: 'share' })` and every later renewal fail with the same
 * `EngineError` family as all other engine calls. The wire code and HTTP
 * status survive in `details`; the original error rides as `cause`.
 *
 * `SharePasswordRequired` and `VisitorIdentityRequired` keep their own
 * engine codes — the outcomes callers branch on programmatically (prompt for
 * the passphrase or the link's questions, and retry); the latter's `details`
 * are the questions. Everything else maps by meaning, with the HTTP status as
 * the fallback discriminator.
 */
export function engineErrorFromShareExchange(error: ShareExchangeError): EngineError {
  const code =
    error.code === 'SharePasswordRequired'
      ? EngineErrorCode.SharePasswordRequired
      : error.code === 'VisitorIdentityRequired'
        ? EngineErrorCode.VisitorIdentityRequired
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
    details: { ...error.details, shareCode: error.code, status: error.status },
    cause: error,
  });
}

/** The exchange's failure as an engine error; any other error as it is. */
function asEngineError(error: unknown): unknown {
  return error instanceof ShareExchangeError ? engineErrorFromShareExchange(error) : error;
}

/** Renew this many seconds before `expiresAt` so in-flight requests never race expiry. */
const RENEW_MARGIN_SECONDS = 60;
/** After a renewal on the timer failed, try again this much later; a request says why meanwhile. */
const KEEP_ALIVE_RETRY_MS = 60_000;
/** While the link asks before an open goes on, its session serves until this close to `expiresAt`. */
const LAST_USE_MARGIN_SECONDS = 5;

export interface ShareSessionOptions {
  /** Passphrase for protected grants. */
  password?: string;
  /** Start over: the first exchange deletes the kept visitor's layer (see `OpenInputShare.restart`). */
  restart?: boolean;
  /** The visitor's answers, sent with the first exchange: what the page knows (`OpenOptions.identity`). */
  identity?: VisitorAnswers;
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
 *
 * When the link asks before the first change and the visitor hasn't
 * answered, the document's writes wait at {@link writeGate} while someone
 * listens (`share.onIdentityRequest`), until `share.identify` exchanges again
 * with the answers or `share.decline` lets them fail.
 *
 * When a renewal is refused for a passphrase or questions on open (the link
 * got them after this open), the open asks once (`share.onOpenRequest`) and
 * exchanges nothing more: the session serves until it runs out, then
 * requests wait while someone listens, until `share.resume` exchanges again
 * with what the visitor gave.
 */
export class ShareSessionSource {
  private session: ShareSession | null = null;
  private inflight: Promise<ShareSession> | null = null;
  /** The visitor to send: `undefined` until the store was read. */
  private handle: string | null | undefined;
  private restart: boolean;
  /** Answers given at open, sent until an exchange takes them. */
  private answers: VisitorAnswers | undefined;
  private lost: EngineError | null = null;
  /** The passphrase every exchange sends: the one given at open, or to `resume`. */
  private password: string | undefined;
  /** What the link asks before this open goes on, and the refusal that asked it; `null` while nothing is. */
  private asked: {
    readonly request: ShareOpenRequest;
    readonly refusal: EngineError;
    readonly resumed: Promise<void>;
    readonly resolve: () => void;
  } | null = null;
  private readonly openListeners = new Set<(request: ShareOpenRequest) => void>();
  /** What the link asks before the first change, unanswered: the gate is closed while set. */
  private request: VisitorIdentityRequest | null = null;
  private readonly listeners = new Set<(request: VisitorIdentityRequest) => void>();
  /** The writes waiting for the visitor's answers; `null` when none wait. */
  private waiting: {
    readonly answered: Promise<void>;
    readonly resolve: () => void;
    readonly reject: (error: unknown) => void;
  } | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly shareToken: string,
    private readonly opts: ShareSessionOptions = {},
  ) {
    this.restart = opts.restart === true;
    this.answers = opts.identity;
    this.password = opts.password;
  }

  /**
   * A session token that isn't about to expire, exchanging when it is. While
   * the link asks before this open goes on, the session serves until it runs
   * out, then waits for the visitor.
   */
  async token(): Promise<string> {
    if (this.lost) throw this.lost;
    if (!this.asked) {
      const session = this.session;
      if (session && session.expiresAt - Date.now() / 1000 > RENEW_MARGIN_SECONDS) {
        return session.token;
      }
      this.inflight ??= this.exchange().finally(() => {
        this.inflight = null;
      });
      try {
        return (await this.inflight).token;
      } catch (error) {
        if (!this.askOnRefusal(error)) throw error;
      }
    }
    return this.whileAsked();
  }

  /** The document's view of the session (`DocumentHandle.share`), once it has opened. */
  readonly share: DocumentShare = new SessionShare(this);

  /** The gate the document's writes pass: the visitor's answers, when the link asks for them. */
  readonly writeGate: WriteGate = {
    passed: (signal) => this.untilAnswered(signal),
    refused: (error) => {
      const request = visitorIdentityRequestOf(error);
      if (!request) return false;
      this.request = request;
      return true;
    },
  };

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
      // Nothing renews while the link asks: the timer goes on once the visitor gives it.
      if (this.asked) {
        void this.asked.resumed.then(() => schedule(this.untilRenewalMs()));
        return;
      }
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

  /** The session as of the last exchange. */
  opened(): ShareSession {
    if (!this.session) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'the share session has not opened yet');
    }
    return this.session;
  }

  /** What the link asks before the first change, unanswered; `null` when nothing. */
  get identityRequest(): VisitorIdentityRequest | null {
    return this.request;
  }

  /** Called when a write waits for the visitor's answers. Returns the unsubscriber. */
  onIdentityRequest(listener: (request: VisitorIdentityRequest) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** What the link asks before this open goes on; `null` while nothing is. */
  get openRequest(): ShareOpenRequest | null {
    return this.asked?.request ?? null;
  }

  /** Called when the link asks before this open goes on. Returns the unsubscriber. */
  onOpenRequest(listener: (request: ShareOpenRequest) => void): () => void {
    this.openListeners.add(listener);
    return () => {
      this.openListeners.delete(listener);
    };
  }

  /**
   * Exchange again with what the visitor gave the link: the same visitor goes
   * on, and the requests waiting go out. Refused, it still asks (with what
   * the refusal says) and rejects.
   */
  async resume(
    given: { readonly sharePassword?: string; readonly identity?: VisitorAnswers },
    signal?: AbortSignal,
  ): Promise<void> {
    const asked = this.asked;
    if (!asked) return;
    await this.inflight?.catch(() => undefined);
    if (given.sharePassword !== undefined) this.password = given.sharePassword;
    const exchanged = this.exchange(given.identity, signal).finally(() => {
      this.inflight = null;
    });
    this.inflight = exchanged;
    try {
      await exchanged;
    } catch (error) {
      const refusal = asEngineError(error);
      const request = shareOpenRequestOf(refusal, given.sharePassword !== undefined);
      if (request && refusal instanceof EngineError) this.asked = { ...asked, request, refusal };
      throw refusal;
    }
    this.asked = null;
    asked.resolve();
  }

  /**
   * A renewal the link refused for a passphrase or questions on open: ask the
   * visitor, once. Whether it asks; any other refusal is the request's to
   * report.
   */
  private askOnRefusal(error: unknown): boolean {
    if (this.asked) return true;
    if (!this.session) return false;
    const refusal = asEngineError(error);
    // A passphrase the visitor gave at open that no longer works is asked as new.
    const request = shareOpenRequestOf(refusal, false);
    if (!request || !(refusal instanceof EngineError)) return false;
    let resolve!: () => void;
    const resumed = new Promise<void>((res) => {
      resolve = res;
    });
    this.asked = { request, refusal, resumed, resolve };
    for (const listener of [...this.openListeners]) listener(request);
    return true;
  }

  /**
   * The token while the link asks: the session's own until it runs out, then
   * the one `resume` brings. Nobody to ask: the refusal.
   */
  private async whileAsked(): Promise<string> {
    const asked = this.asked;
    const session = this.session;
    if (!asked || !session) return this.token();
    if (session.expiresAt - Date.now() / 1000 > LAST_USE_MARGIN_SECONDS) return session.token;
    if (this.openListeners.size === 0) throw asked.refusal;
    await asked.resumed;
    return this.token();
  }

  /** A second into the renewal margin: when `token()` exchanges again. */
  private untilRenewalMs(): number {
    const session = this.session;
    if (!session) return 0;
    const renewAt = (session.expiresAt - RENEW_MARGIN_SECONDS + 1) * 1000;
    return Math.max(1_000, renewAt - Date.now());
  }

  /**
   * Exchange again with the visitor's answers. Writes waiting for them go
   * out once nothing is asked any more; answers the link can't take, or a
   * required one still missing, reject, and the writes keep waiting.
   */
  async identify(answers: VisitorAnswers, signal?: AbortSignal): Promise<void> {
    await this.inflight?.catch(() => undefined);
    const exchanged = this.exchange(answers, signal).finally(() => {
      this.inflight = null;
    });
    this.inflight = exchanged;
    try {
      await exchanged;
    } catch (error) {
      throw asEngineError(error);
    }
    // Answers it took, but something required is still missing: the writes keep waiting.
    if (this.request !== null) throw identityRequired(this.request);
    this.waiting?.resolve();
    this.waiting = null;
  }

  /** Not now: the writes waiting fail with `VisitorIdentityRequired`. */
  decline(): void {
    const request = this.request;
    if (request) this.waiting?.reject(identityRequired(request));
    this.waiting = null;
  }

  /** Resolves once a write may go out: at once, unless the visitor's answers are asked for. */
  private async untilAnswered(signal: AbortSignal): Promise<void> {
    const request = this.request;
    if (!request) return;
    // Nobody to ask: the write fails instead of waiting for nothing.
    if (this.listeners.size === 0) throw identityRequired(request);
    if (!this.waiting) {
      let resolve!: () => void;
      let reject!: (error: unknown) => void;
      const answered = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      answered.catch(() => undefined);
      this.waiting = { answered, resolve, reject };
      for (const listener of [...this.listeners]) listener(request);
    }
    await untilAbort(this.waiting.answered, signal);
  }

  private async exchange(answers?: VisitorAnswers, signal?: AbortSignal): Promise<ShareSession> {
    const store = this.opts.visitorStore ?? null;
    if (this.handle === undefined) {
      this.handle = store ? await store.get(this.shareToken) : null;
    }
    const visitorIdentity = answers ?? this.answers;
    const next = await exchangeShareToken(this.baseUrl, this.shareToken, {
      ...(this.password !== undefined ? { password: this.password } : {}),
      ...(this.handle ? { visitorHandle: this.handle } : {}),
      ...(this.restart ? { restart: true } : {}),
      ...(visitorIdentity ? { visitorIdentity } : {}),
      ...(this.opts.fetch ? { fetch: this.opts.fetch } : {}),
      ...(signal ? { signal } : {}),
    });
    this.restart = false;
    this.answers = undefined;
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
    this.request = next.visitor.identityRequest;
    return next;
  }
}

/** `DocumentHandle.share` for a share session: what the document's user may do with it. */
class SessionShare implements DocumentShare {
  constructor(private readonly source: ShareSessionSource) {}

  get layerMode(): DocumentShare['layerMode'] {
    return this.source.opened().layerMode;
  }

  get keep(): boolean {
    return this.source.opened().visitor.keep;
  }

  get identityRequest(): VisitorIdentityRequest | null {
    return this.source.identityRequest;
  }

  identify(answers: VisitorAnswers): AbortablePromise<void> {
    return AbortablePromise.run((signal) => this.source.identify(answers, signal));
  }

  onIdentityRequest(listener: (request: VisitorIdentityRequest) => void): () => void {
    return this.source.onIdentityRequest(listener);
  }

  decline(): void {
    this.source.decline();
  }

  get openRequest(): ShareOpenRequest | null {
    return this.source.openRequest;
  }

  onOpenRequest(listener: (request: ShareOpenRequest) => void): () => void {
    return this.source.onOpenRequest(listener);
  }

  resume(given: {
    readonly sharePassword?: string;
    readonly identity?: VisitorAnswers;
  }): AbortablePromise<void> {
    return AbortablePromise.run((signal) => this.source.resume(given, signal));
  }
}

/** The fields a share link can ask its visitors. */
const VISITOR_FIELDS = [
  'displayName',
  'email',
  'title',
  'organization',
  'organizationalUnit',
] as const satisfies readonly (keyof VisitorAnswers)[];

/**
 * What a page's `identity` answers on a share link: the fields a link can ask,
 * never `userId` or `groupId` (the server gives a visitor theirs). `undefined`
 * when it answers nothing.
 */
export function visitorAnswersOf(identity: Identity | undefined): VisitorAnswers | undefined {
  if (!identity) return undefined;
  const answers: Partial<Record<keyof VisitorAnswers, string>> = {};
  for (const field of VISITOR_FIELDS) {
    const value = identity[field];
    if (value !== undefined) answers[field] = value;
  }
  return Object.keys(answers).length > 0 ? answers : undefined;
}

function identityRequired(request: VisitorIdentityRequest): EngineError {
  return new EngineError(
    EngineErrorCode.VisitorIdentityRequired,
    "answer the share link's questions before making changes",
    { details: { ...request } },
  );
}

/** `promise`, or an `AbortError` once `signal` aborts. */
function untilAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new AbortError(signal.reason ?? 'aborted'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new AbortError(signal.reason ?? 'aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
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
