/**
 * A timestamp authority over HTTP (RFC 3161 §3.4). The ASN.1 code is imported inside the call,
 * like the other signers', so configuring an authority loads nothing until someone signs.
 */
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { DigestAlgorithm } from '@embedpdf/engine-core/runtime';

import type { CompletionRefusal } from '../gate';
import type { CmsSigner } from '../sign';

export interface HttpTimestampAuthorityOptions {
  /** The authority's address, or your own route in front of it. */
  url: string;
  /** The hash the authority prefers: what `sign()` stamps with. Default `'sha256'`. */
  hash?: Exclude<DigestAlgorithm, 'sha1'>;
  /** The policy to ask for (an OID), for an authority that offers several. */
  policy?: string;
  /** Sent with each request: an API key, basic authentication. */
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
 * A timestamp authority reached over HTTP: the `timestampAuthority` of a signature, and the
 * `key` of a document timestamp. It asks for exactly the algorithm it is called with, with a
 * nonce and the authority's certificate, and checks that the reply answers this request: a
 * granted status, a token, the nonce echoed, and the digest, algorithm and policy asked for.
 * The token's own signature is checked by whoever uses it.
 *
 * It tries again only when no answer came: a network failure, a timeout, or an HTTP 5xx or
 * 429. What the authority said fails at once.
 *
 * Every error it raises carries the authority's `url` in `details.authority`: `Network` when no
 * answer came; `SignatureRefused` when the authority said no (`details.httpStatus`,
 * `details.failInfo`) or answered something else than was asked (`details.reason`);
 * `InvalidArg` when it is asked for a signature, which an authority can't make.
 */
export function httpTimestampAuthority(options: HttpTimestampAuthorityOptions): CmsSigner {
  const { url, policy, timeoutMs = 10_000, retries = 1 } = options;
  const details = (more: Record<string, unknown> = {}) => ({ authority: url, ...more });
  const refused = (message: string, more: Record<string, unknown>, cause?: unknown) =>
    new EngineError(EngineErrorCode.SignatureRefused, message, { details: details(more), cause });
  const wrongAnswer = (reason: CompletionRefusal, what: string) =>
    refused(`the timestamp authority at ${url} ${what}`, { reason });

  /** One request: the reply's bytes, or a `Network` error when no answer came. */
  async function ask(query: Uint8Array): Promise<Uint8Array> {
    const send = options.fetch ?? globalThis.fetch;
    const noAnswer = (why: string, cause?: unknown) =>
      new EngineError(
        EngineErrorCode.Network,
        `the timestamp authority at ${url} did not answer: ${why}`,
        { details: details(), cause },
      );
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    try {
      let response: Response;
      try {
        response = await send(url, {
          method: 'POST',
          headers: { 'content-type': 'application/timestamp-query', ...options.headers },
          body: new Uint8Array(query),
          signal: timeout.signal,
        });
      } catch (error) {
        if (timeout.signal.aborted) throw noAnswer(`no reply within ${timeoutMs} ms`, error);
        // A browser reports a refused cross-origin call as a bare network error.
        const hint =
          'document' in globalThis
            ? '. In a browser most authorities cannot be called directly: call yours through a route on your own server'
            : '';
        throw noAnswer(`${(error as Error).message}${hint}`, error);
      }
      if (response.status >= 500 || response.status === 429) {
        throw noAnswer(`HTTP ${response.status}`);
      }
      if (!response.ok) {
        throw refused(
          `the timestamp authority at ${url} refused the request: HTTP ${response.status}`,
          { httpStatus: response.status },
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
    kind: 'cms',
    hash: options.hash ?? 'sha256',
    async sign({ digest, algorithm, subFilter }) {
      if (subFilter !== 'ETSI.RFC3161') {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          "a timestamp authority can't sign a document: pass it as `timestampAuthority`, or sign with `kind: 'timestamp'`",
          { details: details() },
        );
      }
      const [protocol, parse, timestamp, engine] = await Promise.all([
        import('../cms/timestamp-protocol'),
        import('../cms/parse'),
        import('../cms/timestamp'),
        import('../cms/engine'),
      ]);
      const nonce = globalThis.crypto.getRandomValues(new Uint8Array(8));
      // Positive, and without a leading zero octet, so it reads back as it was sent.
      nonce[0] = (nonce[0]! & 0x7f) | 0x40;
      const query = protocol.buildTimestampRequest({ digest, algorithm, policy, nonce });

      let reply: Uint8Array;
      for (let attempt = 0; ; attempt++) {
        try {
          reply = await ask(query);
          break;
        } catch (error) {
          const noAnswer = EngineError.is(error, EngineErrorCode.Network);
          if (!noAnswer || attempt >= retries) throw error;
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }

      let response;
      try {
        response = protocol.readTimestampResponse(reply);
      } catch (error) {
        throw refused(
          `the timestamp authority at ${url} sent a reply that can't be read: ${(error as Error).message}`,
          { reason: 'malformed' },
          error,
        );
      }
      if (!response.granted) {
        const said = [response.failInfo, response.statusText].filter(Boolean).join(': ');
        throw refused(
          `the timestamp authority at ${url} refused the request${said ? ` (${said})` : ''}`,
          { failInfo: response.failInfo },
        );
      }
      if (!response.token) throw wrongAnswer('malformed', 'granted the request but sent no token');

      let info;
      try {
        info = timestamp.readTimestampInfo(
          parse.readCmsParts(response.token, 'tst-info').eContent!,
        );
      } catch (error) {
        throw refused(
          `the timestamp authority at ${url} sent a token that can't be read: ${(error as Error).message}`,
          { reason: 'malformed' },
          error,
        );
      }
      if (info.imprintAlgorithm !== algorithm) {
        throw wrongAnswer(
          'algorithm-mismatch',
          `stamped a ${info.imprintAlgorithm} digest where ${algorithm} was asked for`,
        );
      }
      if (!engine.bytesEqual(info.imprint, digest)) {
        throw wrongAnswer('digest-mismatch', 'stamped another digest than the one it was sent');
      }
      if (!info.nonce || !engine.bytesEqual(info.nonce, timestamp.withoutLeadingZeros(nonce))) {
        throw wrongAnswer(
          'profile-violation',
          "sent a token that doesn't answer this request: its nonce is not the one sent",
        );
      }
      if (policy && info.policy !== policy) {
        throw wrongAnswer(
          'profile-violation',
          `issued the token under policy ${info.policy} where ${policy} was asked for`,
        );
      }
      return response.token;
    },
  };
}
