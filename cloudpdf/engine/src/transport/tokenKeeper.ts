import { decodeUnverifiedClaims } from './decodeUnverifiedClaims';

/** How long before a kept token's expiry its function runs again. */
const RENEW_BEFORE_MS = 60_000;
/** How long a renewal that failed in the background waits before the next one. */
const RETRY_AFTER_FAILURE_MS = 5_000;

/** Where a client's bearer comes from, request by request. */
export interface TokenKeeper {
  /** The token to send now. */
  token(): Promise<string>;
  /**
   * The server refused `token` (401): forget it if it's still the one kept, and say whether
   * sending the request again, with the next token, can help.
   */
  refused(token: string): boolean;
}

/** A literal token: the same one every time, and nothing to ask again. */
export function fixedToken(token: string): TokenKeeper {
  return { token: async () => token, refused: () => false };
}

/** A token function that keeps its own token (a grant session renews on a timer): asked every time. */
export function askedToken(source: () => string | Promise<string>): TokenKeeper {
  return { token: async () => await source(), refused: () => false };
}

/**
 * A token function's answer, kept. The function runs once, and its token goes on every request.
 * A minute before the expiry the token carries (halfway, for a token that lives less than two
 * minutes) the function runs again in the background, while the kept token still goes out, so
 * no request waits for it. Only a request without a working token waits: the first one, or one
 * after the kept token expired (a laptop waking from sleep). Calls that arrive while the
 * function runs share that one call. A call that fails isn't kept; a renewal that fails in the
 * background is tried again 5 seconds later, not on every request. A token that carries no expiry
 * is kept until the server refuses it.
 */
export function keptToken(
  source: () => string | Promise<string>,
  now: () => number = Date.now,
): TokenKeeper {
  let kept: { token: string; renewAt: number; expiresAt: number } | null = null;
  let pending: Promise<string> | null = null;
  let retryAt = 0;

  const ask = (): Promise<string> => {
    pending ??= Promise.resolve()
      .then(source)
      .then(
        (token) => {
          kept = { token, ...timesOf(token, now()) };
          pending = null;
          retryAt = 0;
          return token;
        },
        (error: unknown) => {
          pending = null;
          retryAt = now() + RETRY_AFTER_FAILURE_MS;
          throw error;
        },
      );
    return pending;
  };

  return {
    token: () => {
      const at = now();
      if (kept && at < kept.renewAt) return Promise.resolve(kept.token);
      if (kept && at < kept.expiresAt) {
        if (at >= retryAt) void ask().catch(() => {});
        return Promise.resolve(kept.token);
      }
      return ask();
    },
    refused: (token) => {
      if (kept?.token === token) kept = null;
      return true;
    },
  };
}

/** When a token received at `receivedAt` expires, and when it's asked for again. */
function timesOf(token: string, receivedAt: number): { renewAt: number; expiresAt: number } {
  let exp: number | undefined;
  try {
    exp = decodeUnverifiedClaims(token).exp;
  } catch {
    exp = undefined;
  }
  if (typeof exp !== 'number' || !Number.isFinite(exp)) {
    return { renewAt: Number.POSITIVE_INFINITY, expiresAt: Number.POSITIVE_INFINITY };
  }
  const expiresAt = exp * 1000;
  const early = Math.min(RENEW_BEFORE_MS, Math.max(0, expiresAt - receivedAt) / 2);
  return { renewAt: expiresAt - early, expiresAt };
}
