/**
 * The route a web page asks certificate authorities through. The addresses it is sent come
 * from certificates, and a PDF can carry any certificate, so the route decides where it may
 * go: who may call it is the app's own business. It parses no certificate and judges no
 * answer; that stays where the document is.
 */
import { validationInfoEntryProblem } from '@embedpdf/engine-core/runtime';

import type { RevocationRouteRequest } from '../revocation/http-source';
import type { RevocationRequest } from '../revocation/source';
import { forbiddenAddress, runtimeLookup, type HostLookup } from './public-address';

/** Where a route keeps answers between calls. */
export interface RevocationRouteCache {
  get(key: string): Promise<Uint8Array | null> | Uint8Array | null;
  /** Keep `answer` for at most `seconds`. */
  set(key: string, answer: Uint8Array, seconds: number): Promise<void> | void;
}

export interface RevocationRouteOptions {
  /** The `fetch` the authorities are called with. Default: the global one. */
  fetch?: typeof globalThis.fetch;
  /**
   * Resolves a host name to its addresses, so a name that leads to a private address is
   * refused. Default: the runtime's resolver where it has one (Node, Bun, Deno). `null` takes
   * names at their word.
   */
  lookup?: HostLookup | null;
  /** The largest answer passed on, in bytes. Default 2 MiB. */
  maxBytes?: number;
  /** How long an authority may take, in milliseconds. Default 10000. */
  timeoutMs?: number;
  /**
   * Where answers are kept for as long as their authority says they may be. Default: in the
   * memory of the process, up to 16 MiB. `false` keeps none.
   */
  cache?: RevocationRouteCache | false;
}

/** Why the route said no, in `reason` of its JSON answer. */
export type RevocationRouteRefusal =
  | 'bad-request'
  | 'not-allowed'
  | 'too-large'
  | 'wrong-type'
  | 'upstream-status'
  | 'no-answer';

const KINDS: readonly RevocationRequest['kind'][] = ['ocsp', 'crl', 'issuer'];
const ANSWER_TYPE: Record<RevocationRequest['kind'], string> = {
  ocsp: 'application/ocsp-response',
  crl: 'application/pkix-crl',
  issuer: 'application/pkix-cert',
};
/** The largest request the route reads: an OCSP request is a few hundred bytes. */
const MAX_REQUEST_BYTES = 64 * 1024;
/** How many redirects are followed, each one checked like the first address. */
const MAX_REDIRECTS = 3;
/** The longest an answer is kept, whatever its authority allows. */
const MAX_KEPT_SECONDS = 7 * 24 * 3600;

/**
 * A route for `httpRevocationSource()`, for any server that speaks the Fetch API:
 *
 * ```ts
 * export const POST = revocationRoute();
 * ```
 *
 * It asks only `http` and `https` addresses that are public: an address that is private or
 * local, a name that leads to one, and a redirect to either are refused. It gives an authority
 * `timeoutMs` to answer and passes on at most `maxBytes`. What comes back must be one DER
 * object of the kind asked for, so nobody can read a web page through the route. Answers are
 * kept for as long as their authority's own cache headers allow.
 *
 * One thing it does not close: a name is resolved once for the check and again for the call,
 * so a name that changes its answer in between is not caught. Where that matters, keep the
 * server it runs on from reaching your private network.
 *
 * It answers `200` with the authority's bytes, and otherwise JSON `{ reason, message }`:
 * `400` for a request it cannot read, `403` for an address it does not ask, `422` for an
 * answer that is too large or not what was asked for, `502` when the authority answered with
 * an error and `504` when it did not answer.
 */
export function revocationRoute(
  options: RevocationRouteOptions = {},
): (request: Request) => Promise<Response> {
  const { maxBytes = 2 * 1024 * 1024, timeoutMs = 10_000 } = options;
  const cache = options.cache === false ? null : (options.cache ?? memoryCache(16 * 1024 * 1024));
  let lookup: Promise<HostLookup | null> | null = null;
  const lookupOf = () =>
    (lookup ??= options.lookup === undefined ? runtimeLookup() : Promise.resolve(options.lookup));

  return async (request) => {
    if (request.method !== 'POST') return refuse(405, 'bad-request', 'send a POST');
    const question = await readQuestion(request);
    if (typeof question === 'string') return refuse(400, 'bad-request', question);

    const key = `${question.kind} ${question.url} ${question.body ?? ''}`;
    const kept = cache ? await cache.get(key) : null;
    if (kept) return answer(question.kind, kept);

    let url = new URL(question.url);
    const call = options.fetch ?? globalThis.fetch;
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    try {
      let response: Response;
      for (let hop = 0; ; hop++) {
        const forbidden = await forbiddenAddress(url, await lookupOf());
        if (forbidden) return refuse(403, 'not-allowed', forbidden);
        try {
          response = await call(url, {
            method: question.kind === 'ocsp' ? 'POST' : 'GET',
            headers:
              question.kind === 'ocsp'
                ? { 'content-type': 'application/ocsp-request', accept: ANSWER_TYPE.ocsp }
                : { accept: `${ANSWER_TYPE[question.kind]}, */*;q=0.5` },
            ...(question.kind === 'ocsp'
              ? { body: new Uint8Array(fromBase64(question.body!)) }
              : {}),
            redirect: 'manual',
            signal: timeout.signal,
          });
        } catch (error) {
          return refuse(
            504,
            'no-answer',
            timeout.signal.aborted
              ? `${url.host} did not answer within ${timeoutMs} ms`
              : `${url.host} did not answer: ${(error as Error).message}`,
          );
        }
        const moved = redirectOf(response, url, question.kind);
        if (moved === null) break;
        if (typeof moved === 'string') return refuse(502, 'upstream-status', moved);
        if (hop >= MAX_REDIRECTS) {
          return refuse(
            502,
            'upstream-status',
            `${url.host} redirects more than ${MAX_REDIRECTS} times`,
          );
        }
        url = moved;
      }
      if (response.status !== 200) {
        return refuse(502, 'upstream-status', `${url.host} answered HTTP ${response.status}`);
      }
      const bytes = await readUpTo(response, maxBytes);
      if (bytes === 'too-large') {
        return refuse(422, 'too-large', `the answer from ${url.host} is over ${maxBytes} bytes`);
      }
      if (bytes === 'broke-off') {
        return refuse(504, 'no-answer', `the answer from ${url.host} broke off`);
      }
      const wrong = wrongAnswer(question.kind, bytes);
      if (wrong) return refuse(422, 'wrong-type', `the answer from ${url.host} ${wrong}`);

      const seconds = cache ? keptFor(response.headers) : 0;
      if (cache && seconds > 0) await cache.set(key, bytes, seconds);
      return answer(question.kind, bytes);
    } finally {
      clearTimeout(timer);
    }
  };
}

function refuse(status: number, reason: RevocationRouteRefusal, message: string): Response {
  return new Response(JSON.stringify({ reason, message }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function answer(kind: RevocationRequest['kind'], bytes: Uint8Array): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': ANSWER_TYPE[kind], 'cache-control': 'no-store' },
  });
}

/** The question a request carries, or why it cannot be read. */
async function readQuestion(request: Request): Promise<RevocationRouteRequest | string> {
  const body = await readUpTo(request, MAX_REQUEST_BYTES);
  if (typeof body === 'string') return 'the request is too large or broke off';
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return 'the request is not JSON';
  }
  const { kind, url, body: ocsp } = (parsed ?? {}) as Record<string, unknown>;
  if (typeof kind !== 'string' || !KINDS.includes(kind as RevocationRequest['kind'])) {
    return '`kind` must be "ocsp", "crl" or "issuer"';
  }
  if (typeof url !== 'string' || !URL.canParse(url)) return '`url` must be an address';
  if (kind === 'ocsp') {
    if (typeof ocsp !== 'string' || ocsp.length === 0) {
      return 'an OCSP question needs its request in `body`, in base64';
    }
    try {
      fromBase64(ocsp);
    } catch {
      return '`body` is not base64';
    }
  }
  return {
    kind: kind as RevocationRequest['kind'],
    url,
    ...(kind === 'ocsp' ? { body: ocsp as string } : {}),
  };
}

/**
 * Where a response sends the caller on, null when it does not, or why the redirect is not
 * followed. An OCSP question is a POST: only a redirect that keeps it one is followed.
 */
function redirectOf(
  response: Response,
  from: URL,
  kind: RevocationRequest['kind'],
): URL | string | null {
  if (response.type === 'opaqueredirect') {
    return `${from.host} redirects, and this runtime does not say where to`;
  }
  if (![301, 302, 303, 307, 308].includes(response.status)) return null;
  const location = response.headers.get('location');
  if (!location || !URL.canParse(location, from)) {
    return `${from.host} redirects to no address`;
  }
  if (kind === 'ocsp' && response.status !== 307 && response.status !== 308) {
    return `${from.host} redirects an OCSP question with HTTP ${response.status}, which drops it`;
  }
  return new URL(location, from);
}

/** The body, read up to `limit` bytes: its bytes, or which way it failed. */
async function readUpTo(
  message: Request | Response,
  limit: number,
): Promise<Uint8Array | 'too-large' | 'broke-off'> {
  const declared = Number(message.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) return 'too-large';
  if (!message.body) return new Uint8Array();
  const reader = message.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return 'too-large';
      }
      chunks.push(value);
    }
  } catch {
    return 'broke-off';
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

/**
 * Why `bytes` is not an answer of `kind`, or null when it is: one DER object, whose first
 * element is what that kind begins with. An OCSP response begins with its status, a CRL and a
 * certificate with what was signed, and a bundle of certificates with its type.
 */
function wrongAnswer(kind: RevocationRequest['kind'], bytes: Uint8Array): string | null {
  const problem = validationInfoEntryProblem(bytes);
  if (problem) return `is not one DER object: ${problem}`;
  // Past the outer identifier and its length, which may take several bytes.
  const first = bytes[1]! & 0x80 ? bytes[2 + (bytes[1]! & 0x7f)] : bytes[2];
  const ENUMERATED = 0x0a;
  const SEQUENCE = 0x30;
  const OBJECT_IDENTIFIER = 0x06;
  if (kind === 'ocsp') return first === ENUMERATED ? null : 'is not an OCSP response';
  if (kind === 'crl') return first === SEQUENCE ? null : 'is not a list of withdrawn certificates';
  return first === SEQUENCE || first === OBJECT_IDENTIFIER ? null : 'is not a certificate';
}

/** How many seconds an authority lets its answer be kept: `max-age`, else `Expires`; 0 for none. */
function keptFor(headers: Headers): number {
  const control = (headers.get('cache-control') ?? '').toLowerCase();
  if (/\b(no-store|no-cache|private)\b/.test(control)) return 0;
  const maxAge = /\bmax-age=(\d+)/.exec(control);
  let seconds = 0;
  if (maxAge) {
    seconds = Number(maxAge[1]);
  } else {
    const expires = Date.parse(headers.get('expires') ?? '');
    if (!Number.isNaN(expires)) seconds = Math.floor((expires - Date.now()) / 1000);
  }
  return Math.max(0, Math.min(seconds, MAX_KEPT_SECONDS));
}

/** A cache in the memory of the process: the oldest answers go when it holds more than `limit` bytes. */
function memoryCache(limit: number): RevocationRouteCache {
  const kept = new Map<string, { answer: Uint8Array; until: number }>();
  let size = 0;
  const drop = (key: string) => {
    const entry = kept.get(key);
    if (!entry) return;
    size -= entry.answer.byteLength;
    kept.delete(key);
  };
  return {
    get(key) {
      const entry = kept.get(key);
      if (!entry) return null;
      if (entry.until <= Date.now()) {
        drop(key);
        return null;
      }
      return entry.answer;
    },
    set(key, answer, seconds) {
      drop(key);
      if (answer.byteLength > limit) return;
      kept.set(key, { answer, until: Date.now() + seconds * 1000 });
      size += answer.byteLength;
      // A Map keeps its keys in the order they were set: the first is the oldest.
      for (const oldest of kept.keys()) {
        if (size <= limit) break;
        drop(oldest);
      }
    },
  };
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
