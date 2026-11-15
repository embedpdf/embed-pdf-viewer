/**
 * The route a web page asks a timestamp authority through. The authority is one the app
 * names, so there is nothing to guard about where it goes; the route adds what a page must not
 * hold, such as the authority's API key.
 */

export interface TimestampRouteOptions {
  /** The timestamp authority's address. */
  url: string;
  /** Sent to the authority with each request: an API key, basic authentication. */
  headers?: Record<string, string>;
  /** The `fetch` the authority is called with. Default: the global one. */
  fetch?: typeof globalThis.fetch;
  /** How long the authority may take, in milliseconds. Default 10000. */
  timeoutMs?: number;
}

/** A timestamp request is a digest and a few options, and a reply a token of a few kilobytes. */
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_REPLY_BYTES = 1024 * 1024;

/**
 * A route for `httpTimestampAuthority()`, for any server that speaks the Fetch API:
 *
 * ```ts
 * export const POST = timestampRoute({ url: 'https://timestamp.example.com' });
 * ```
 *
 * It passes an RFC 3161 request on to the authority and its reply back, with the authority's
 * own status, so the page sees what the authority said. It answers `504` when the authority
 * did not answer, and `413` or `502` for a request or a reply that is too large. Who may call
 * the route is the app's to decide.
 */
export function timestampRoute(
  options: TimestampRouteOptions,
): (request: Request) => Promise<Response> {
  const { url, timeoutMs = 10_000 } = options;
  const plain = (status: number, message: string) =>
    new Response(message, {
      status,
      headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' },
    });

  return async (request) => {
    if (request.method !== 'POST') return plain(405, 'send a POST');
    const query = await request.arrayBuffer().catch(() => null);
    if (!query) return plain(400, 'the request broke off');
    if (query.byteLength === 0 || query.byteLength > MAX_REQUEST_BYTES) {
      return plain(413, 'the request is empty or too large for a timestamp request');
    }
    const call = options.fetch ?? globalThis.fetch;
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    try {
      const response = await call(url, {
        method: 'POST',
        headers: { 'content-type': 'application/timestamp-query', ...options.headers },
        body: query,
        signal: timeout.signal,
      });
      const reply = await response.arrayBuffer();
      if (reply.byteLength > MAX_REPLY_BYTES) return plain(502, 'the reply is too large');
      return new Response(reply, {
        status: response.status,
        headers: {
          'content-type': response.headers.get('content-type') ?? 'application/timestamp-reply',
          'cache-control': 'no-store',
        },
      });
    } catch (error) {
      return plain(
        504,
        timeout.signal.aborted
          ? `the timestamp authority did not answer within ${timeoutMs} ms`
          : `the timestamp authority did not answer: ${(error as Error).message}`,
      );
    } finally {
      clearTimeout(timer);
    }
  };
}
