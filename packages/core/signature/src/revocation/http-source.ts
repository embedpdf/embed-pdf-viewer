/**
 * A revocation source over HTTP: each question goes to a route of the app's own, which passes
 * it on to the certificate authority (`revocationRoute()` in `@embedpdf/core-signature/server`
 * is one). A web page cannot ask an authority itself, as it cannot ask a timestamp authority.
 */
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';

import type { RevocationRequest, RevocationSource } from './source';

export interface HttpRevocationSourceOptions {
  /** Your route's address. */
  url: string;
  /** Sent with each request: a session token, an API key. */
  headers?: Record<string, string>;
  /** The `fetch` to use, for what `headers` can't do. Default: the global one. */
  fetch?: typeof globalThis.fetch;
  /** How long one attempt may take, in milliseconds. Default 10000. */
  timeoutMs?: number;
  /** Further attempts when no answer came. Default 1. */
  retries?: number;
}

/** How long to wait before another attempt, in milliseconds. */
const RETRY_DELAY_MS = 250;

/**
 * What the route is sent, as JSON: the question's `kind`, the `url` of the authority to ask,
 * and for an OCSP question its request in base64 (`body`). The route answers with the bytes
 * the authority gave, or with an error status and `{ reason, message }`.
 */
export interface RevocationRouteRequest {
  kind: RevocationRequest['kind'];
  url: string;
  body?: string;
}

/**
 * A revocation source that asks through your route. It tries again only when no answer came:
 * a network failure, a timeout, or an HTTP 5xx or 429 from the route. What the route said
 * fails at once.
 *
 * Every error carries the authority's address in `details.source` and the route's in
 * `details.route`: `Network` when no answer came, `SignatureRefused` when the route refused
 * the question or the answer (`details.httpStatus`, `details.reason`). Whatever comes back is
 * checked by whoever asked: the source is asked, never trusted.
 */
export function httpRevocationSource(options: HttpRevocationSourceOptions): RevocationSource {
  const { url: route, timeoutMs = 10_000, retries = 1 } = options;

  /** One attempt: the answer's bytes, `Network` when none came, `SignatureRefused` when the route said no. */
  async function ask(request: RevocationRequest): Promise<Uint8Array> {
    const send = options.fetch ?? globalThis.fetch;
    const details = (more: Record<string, unknown> = {}) => ({
      source: request.url,
      route,
      ...more,
    });
    const noAnswer = (why: string, cause?: unknown) =>
      new EngineError(
        EngineErrorCode.Network,
        `${request.url} did not answer through ${route}: ${why}`,
        { details: details(), cause },
      );
    const payload: RevocationRouteRequest = {
      kind: request.kind,
      url: request.url,
      ...(request.kind === 'ocsp' ? { body: toBase64(request.body) } : {}),
    };
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    try {
      let response: Response;
      try {
        response = await send(route, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...options.headers },
          body: JSON.stringify(payload),
          signal: timeout.signal,
        });
      } catch (error) {
        if (timeout.signal.aborted) throw noAnswer(`no reply within ${timeoutMs} ms`, error);
        throw noAnswer((error as Error).message, error);
      }
      if (response.status >= 500 || response.status === 429) {
        throw noAnswer(`HTTP ${response.status}${await said(response)}`);
      }
      if (!response.ok) {
        const refusal = await refusalOf(response);
        throw new EngineError(
          EngineErrorCode.SignatureRefused,
          `the route at ${route} refused to ask ${request.url}: ${
            refusal.message ?? `HTTP ${response.status}`
          }`,
          { details: details({ httpStatus: response.status, reason: refusal.reason }) },
        );
      }
      try {
        return new Uint8Array(await response.arrayBuffer());
      } catch (error) {
        throw noAnswer(
          timeout.signal.aborted
            ? `no reply within ${timeoutMs} ms`
            : `the reply broke off: ${(error as Error).message}`,
          error,
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async fetch(request) {
      for (let attempt = 0; ; attempt++) {
        try {
          return await ask(request);
        } catch (error) {
          const noAnswer = EngineError.is(error, EngineErrorCode.Network);
          if (!noAnswer || attempt >= retries) throw error;
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    },
  };
}

/** What a route said with an error status: `{ reason, message }` when it is the shipped route's JSON. */
async function refusalOf(response: Response): Promise<{ reason?: string; message?: string }> {
  try {
    const said = (await response.json()) as { reason?: unknown; message?: unknown };
    return {
      ...(typeof said.reason === 'string' ? { reason: said.reason } : {}),
      ...(typeof said.message === 'string' ? { message: said.message } : {}),
    };
  } catch {
    return {};
  }
}

/** The route's own words after an error status, for the message; empty when it gave none. */
async function said(response: Response): Promise<string> {
  const { message } = await refusalOf(response);
  return message ? `: ${message}` : '';
}

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}
