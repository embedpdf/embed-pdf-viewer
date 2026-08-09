import type { TokenSource } from '@embedpdf/engine-core/runtime';

/**
 * Share-session exchange: the client half of the no-backend embed flow.
 *
 * A share token (`shr_…`) is a REFERENCE to a stored grant on the
 * server, not a credential — `exchangeShareToken` trades it for an
 * ordinary short-lived doc JWT, and `shareSessionSource` wraps that in
 * a self-renewing {@link TokenSource}. Because the engine's transport
 * invokes its token source on every request (and SSE reconnects call
 * it again), renewal is nothing more than "exchange again when the
 * cached session is nearly out" — no timers, no listeners.
 *
 * The endpoint requires a browser `Origin` header (the server checks
 * it against the grant's allowlist). Browsers attach it automatically;
 * non-browser callers (tests, SSR) must supply a `fetch` that does.
 */

export interface ShareSession {
  /** Doc-scoped session JWT carrying the grant's capabilities. */
  token: string;
  docId: string;
  layerName: string;
  /** Unix seconds when `token` expires. */
  expiresAt: number;
}

export interface ShareExchangeOptions {
  /** Passphrase for protected grants (`SharePasswordRequired` otherwise). */
  password?: string;
  fetch?: typeof globalThis.fetch;
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

/** Renew this many seconds before `expiresAt` so in-flight requests never race expiry. */
const RENEW_MARGIN_SECONDS = 60;

/**
 * A caching, self-renewing {@link TokenSource} over the exchange.
 * Concurrent callers share one in-flight exchange; a failed exchange
 * clears it so the next request retries rather than caching the error.
 */
export function shareSessionSource(
  baseUrl: string,
  shareToken: string,
  opts: ShareExchangeOptions = {},
): TokenSource {
  let session: ShareSession | null = null;
  let inflight: Promise<string> | null = null;
  return async () => {
    if (session && session.expiresAt - Date.now() / 1000 > RENEW_MARGIN_SECONDS) {
      return session.token;
    }
    inflight ??= exchangeShareToken(baseUrl, shareToken, opts)
      .then((next) => {
        session = next;
        return next.token;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };
}
