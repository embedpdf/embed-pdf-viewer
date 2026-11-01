/**
 * A `fetch` that sends requests to this server without leaving its process:
 * each one runs through the server's own routes, guards and hooks
 * (`app.inject`), exactly as a request from outside would.
 */
import { Buffer } from 'node:buffer';

import type { FastifyInstance, InjectOptions } from 'fastify';

/** The origin in-process URLs carry; only their path and query reach the server. */
export const IN_PROCESS_BASE_URL = 'http://cloudpdf.in-process';

/** Statuses whose responses carry no body. */
const BODYLESS = new Set([101, 204, 205, 304]);

export function inProcessFetch(app: FastifyInstance): typeof globalThis.fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    // A live event stream never ends, so an injected one would never answer.
    // A 403 is what the cloud engine's stream client takes as final.
    if (request.headers.get('accept')?.includes('text/event-stream')) {
      return Response.json(
        {
          error: {
            code: 'Forbidden',
            message: "a module's connection to the server has no live event stream",
          },
        },
        { status: 403 },
      );
    }
    request.signal.throwIfAborted();

    // Only this server is reachable in process. A request for another host
    // (a CDN the server offered, any outside URL) would otherwise land on
    // this server's routes by its path alone.
    const url = new URL(request.url);
    if (url.origin !== IN_PROCESS_BASE_URL) {
      return Response.json(
        {
          error: {
            name: 'EngineError',
            code: 'Network',
            message: `a module's connection reaches only its own server, not ${url.origin}`,
          },
        },
        { status: 502 },
      );
    }
    const headers: Record<string, string> = {};
    request.headers.forEach((value, name) => {
      // The response is handed back as it is, so it must not come compressed.
      if (name !== 'accept-encoding') headers[name] = value;
    });
    const payload = request.body === null ? undefined : Buffer.from(await request.arrayBuffer());
    const reply = await app.inject({
      method: request.method as InjectOptions['method'],
      url: url.pathname + url.search,
      headers,
      ...(payload !== undefined ? { payload } : {}),
    });

    const responseHeaders = new Headers();
    for (const [name, value] of Object.entries(reply.headers)) {
      if (value === undefined) continue;
      for (const each of Array.isArray(value) ? value : [value]) {
        responseHeaders.append(name, String(each));
      }
    }
    const bodyless = BODYLESS.has(reply.statusCode) || request.method === 'HEAD';
    return new Response(bodyless ? null : Uint8Array.from(reply.rawPayload), {
      status: reply.statusCode,
      headers: responseHeaders,
    });
  };
}
