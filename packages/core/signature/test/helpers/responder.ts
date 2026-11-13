import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

import type { RawSigner } from '../../src/cms/build';
import { toArrayBuffer } from '../../src/cms/engine';
import { DIGEST_BY_OID } from '../../src/cms/oids';
import { encodeElement } from '../../src/cms/splice';
import { buildTestToken } from './tokens';

/** A timestamp request as an authority's HTTP endpoint receives it. */
export interface SeenRequest {
  url: string;
  headers: Record<string, string>;
  body: Uint8Array;
  /** The body read as an RFC 3161 TimeStampReq. */
  query: pkijs.TimeStampReq;
}

/**
 * A `fetch` that stands in for a timestamp authority's endpoint: each call is recorded and
 * answered by `answer`, which gets the request and how many came before it.
 */
export function fakeEndpoint(
  answer: (request: SeenRequest, before: number) => Promise<Response> | Response,
): { fetch: typeof globalThis.fetch; requests: SeenRequest[] } {
  const requests: SeenRequest[] = [];
  const fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const body = new Uint8Array(init!.body as Uint8Array);
    const headers: Record<string, string> = {};
    new Headers(init!.headers).forEach((value, name) => (headers[name] = value));
    const request: SeenRequest = {
      url: String(url),
      headers,
      body,
      query: new pkijs.TimeStampReq({ schema: asn1js.fromBER(toArrayBuffer(body)).result }),
    };
    requests.push(request);
    return answer(request, requests.length - 1);
  }) as typeof globalThis.fetch;
  return { fetch, requests };
}

const reply = (bytes: Uint8Array, status = 200) =>
  new Response(new Uint8Array(bytes), {
    status,
    headers: { 'content-type': 'application/timestamp-reply' },
  });

/** A response that grants the request, with `token` or, wrongly, without one. */
export function granted(token: Uint8Array | null): Response {
  const status = encodeElement(0x30, new Uint8Array([0x02, 0x01, 0x00]));
  return reply(encodeElement(0x30, new Uint8Array([...status, ...(token ?? [])])));
}

/** A response that rejects the request, naming the failure at `failureBit` (0 is `badAlg`). */
export function rejected(failureBit: number): Response {
  const bits = new Uint8Array(Math.floor(failureBit / 8) + 1);
  bits[failureBit >> 3]! |= 0x80 >> (failureBit & 7);
  const failInfo = encodeElement(0x03, new Uint8Array([0x00, ...bits]));
  const status = encodeElement(0x30, new Uint8Array([0x02, 0x01, 0x02, ...failInfo]));
  return reply(encodeElement(0x30, status));
}

/** A plain HTTP answer with no timestamp response in it. */
export function httpStatus(status: number): Response {
  return new Response('no', { status });
}

/**
 * What an honest authority answers: a token over the request's digest, with its nonce, under
 * the policy it asked for. `change` alters the token, for an authority that answers wrongly.
 */
export async function honestAnswer(
  authority: RawSigner,
  request: SeenRequest,
  change: Partial<Parameters<typeof buildTestToken>[0]> = {},
): Promise<Response> {
  const imprint = request.query.messageImprint;
  return granted(
    await buildTestToken({
      digest: new Uint8Array(imprint.hashedMessage.valueBlock.valueHexView),
      hash: DIGEST_BY_OID[imprint.hashAlgorithm.algorithmId] as 'sha256' | 'sha384' | 'sha512',
      authority,
      nonce: new Uint8Array(request.query.nonce!.valueBlock.valueHexView),
      ...(request.query.reqPolicy ? { policy: request.query.reqPolicy } : {}),
      ...change,
    }),
  );
}
