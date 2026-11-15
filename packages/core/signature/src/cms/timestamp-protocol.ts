/**
 * The two messages of the RFC 3161 protocol, as bytes: the request a client sends a timestamp
 * authority, and the response it reads back. The token inside a response is checked elsewhere
 * ({@link checkTimestampToken}); this only says what the authority answered.
 */
import type { DigestAlgorithm } from '@embedpdf/engine-core/runtime';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

import { toArrayBuffer } from './engine';
import { CmsError } from './error';
import { OID_BY_DIGEST } from './oids';
import { childrenOf, readElement } from './splice';

/**
 * A TimeStampReq (RFC 3161 §2.4.1) for `digest`. It asks for the authority's certificate in
 * the token (`certReq`), and carries `nonce` so the answer can be matched to this request.
 */
export function buildTimestampRequest(input: {
  digest: Uint8Array;
  algorithm: DigestAlgorithm;
  /** The policy to ask for (an OID); left out, the authority uses its default. */
  policy?: string;
  nonce: Uint8Array;
}): Uint8Array {
  const request = new pkijs.TimeStampReq({
    version: 1,
    messageImprint: new pkijs.MessageImprint({
      hashAlgorithm: new pkijs.AlgorithmIdentifier({
        algorithmId: OID_BY_DIGEST[input.algorithm],
      }),
      hashedMessage: new asn1js.OctetString({ valueHex: toArrayBuffer(input.digest) }),
    }),
    ...(input.policy ? { reqPolicy: input.policy } : {}),
    nonce: new asn1js.Integer({ valueHex: toArrayBuffer(input.nonce) }),
    certReq: true,
  });
  return new Uint8Array(request.toSchema().toBER(false));
}

/** The failures an authority can name (PKIFailureInfo, RFC 3161 §2.4.2), by bit. */
const FAILURES: Record<number, string> = {
  0: 'badAlg',
  2: 'badRequest',
  5: 'badDataFormat',
  14: 'timeNotAvailable',
  15: 'unacceptedPolicy',
  16: 'unacceptedExtension',
  17: 'addInfoNotAvailable',
  25: 'systemFailure',
};

export interface TimestampResponse {
  /** The authority issued a token: PKIStatus `granted` or `grantedWithMods`. */
  granted: boolean;
  /** The PKIStatus number. */
  status: number;
  /** The first failure the authority names, such as `badAlg`; null when it names none. */
  failInfo: string | null;
  /** What the authority says in words, when it says anything. */
  statusText: string | null;
  /** The token, in the bytes the authority wrote; null when the response carries none. */
  token: Uint8Array | null;
}

/** Read a TimeStampResp (RFC 3161 §2.4.2). Throws `CmsError` for bytes that aren't one. */
export function readTimestampResponse(bytes: Uint8Array): TimestampResponse {
  let response: pkijs.TimeStampResp;
  let token: Uint8Array | null;
  try {
    const asn1 = asn1js.fromBER(toArrayBuffer(bytes));
    if (asn1.offset === -1) throw new Error('not valid BER');
    response = new pkijs.TimeStampResp({ schema: asn1.result });
    // TimeStampResp ::= sequence { status, timeStampToken optional }: the token is handed on as
    // the authority wrote it, not as it would be written again.
    const members = childrenOf(bytes, readElement(bytes, 0, bytes.byteLength));
    token = members[1] ? bytes.slice(members[1].start, members[1].end) : null;
  } catch (error) {
    throw new CmsError(
      'malformed',
      `the reply is not a timestamp response: ${(error as Error).message}`,
    );
  }
  const status = Number(response.status.status);
  const failed = response.status.failInfo;
  let failInfo: string | null = null;
  if (failed) {
    const bits = new Uint8Array(failed.valueBlock.valueHexView);
    for (let bit = 0; bit < bits.byteLength * 8 && failInfo === null; bit++) {
      if (bits[bit >> 3]! & (0x80 >> (bit & 7))) failInfo = FAILURES[bit] ?? `failure ${bit}`;
    }
  }
  const statusText =
    (response.status.statusStrings ?? [])
      .map((text) => text.valueBlock.value)
      .filter(Boolean)
      .join('; ') || null;
  return { granted: status === 0 || status === 1, status, failInfo, statusText, token };
}
