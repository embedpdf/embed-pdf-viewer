import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type {
  DigestAlgorithm,
  DocumentHandle,
  SignatureCompleteResult,
  SignaturePrepareInput,
  SignaturePrepared,
  SignatureSubFilter,
} from '@embedpdf/engine-core/runtime';

import { attachSignatureTimestamp } from './cms/attach';
import { buildDetachedCms, type RawSigner, type SignatureProfile } from './cms/build';
import { verifyForCompletion, type CompletionProfile } from './gate';
import { signingRefused } from './refusal';
import type { TrustPort } from './trust';

/**
 * A service that turns a digest into a finished CMS: a signing service (a detached
 * signature), or a timestamp authority (an RFC 3161 token). An object is one or the other,
 * and says so when it is asked for what it can't make.
 */
export interface CmsSigner {
  readonly kind: 'cms';
  /** The hash this key prefers: the default digest of `sign()`. The `algorithm` of a call always wins. */
  readonly hash?: Exclude<DigestAlgorithm, 'sha1'>;
  /**
   * The CMS for a digest: a detached signature, or for `'ETSI.RFC3161'` (a
   * document timestamp) the RFC 3161 token a timestamp authority returns.
   */
  sign(input: {
    digest: Uint8Array;
    algorithm: Exclude<DigestAlgorithm, 'sha1'>;
    subFilter: SignatureSubFilter | 'ETSI.RFC3161';
  }): Promise<Uint8Array>;
}

export type SignerPort = CmsSigner | RawSigner;

/**
 * What `prepare` takes, plus the key that signs the digest. For a document
 * timestamp (`kind: 'timestamp'`) the key is a timestamp authority: a CMS
 * key that returns an RFC 3161 token.
 */
export type SignInput = SignaturePrepareInput & {
  key: SignerPort;
  /** Timestamp the signature: the authority stamps its signature value. Not for `kind: 'timestamp'`. */
  timestampAuthority?: CmsSigner;
  /** Who may timestamp: a token from an authority this port doesn't trust fails the signing. */
  timestampTrust?: TrustPort;
};

/** The room `sign()` reserves for a signature that will carry a timestamp token. */
const TIMESTAMPED_CONTENTS_SIZE = 16384;

/**
 * The CMS shape a `/SubFilter` promises (`'timestamp'` for an RFC 3161
 * token); `InvalidArg` for one this package doesn't know.
 */
export function profileFor(subFilter: SignatureSubFilter): SignatureProfile;
export function profileFor(subFilter: SignatureSubFilter | 'ETSI.RFC3161'): CompletionProfile;
export function profileFor(subFilter: SignatureSubFilter | 'ETSI.RFC3161'): CompletionProfile {
  switch (subFilter) {
    case 'adbe.pkcs7.detached':
      return 'pkcs7';
    case 'ETSI.CAdES.detached':
      return 'cades-b';
    case 'ETSI.RFC3161':
      return 'timestamp';
    default:
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `unknown subFilter '${String(subFilter)}'`,
        {
          details: { field: 'subFilter' },
        },
      );
  }
}

/**
 * Sign a field in one call: `prepare` on the engine, the key turns the
 * digest into a CMS (or a raw signature this package wraps), and
 * {@link completeSignature} checks it, timestamps it when a
 * `timestampAuthority` is given, and installs it. Any failure cancels the
 * candidate and rethrows; the document is never left with a pending
 * signing. A timestamp that was asked for and can't be had fails the
 * signing: it never signs without one.
 */
export async function sign(
  doc: DocumentHandle,
  input: SignInput,
): Promise<SignatureCompleteResult> {
  const { key, timestampAuthority, timestampTrust, ...rest } = input;
  const timestamp = rest.kind === 'timestamp';
  if (timestamp && key.kind !== 'cms') {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'a document timestamp needs a timestamp authority: a CMS key that returns an RFC 3161 token',
      { details: { field: 'key' } },
    );
  }
  assertTimestampOptions(timestamp, timestampAuthority, timestampTrust);
  const subFilter = timestamp ? 'ETSI.RFC3161' : (rest.subFilter ?? 'ETSI.CAdES.detached');
  const profile = profileFor(subFilter);
  const prepared = await doc.signatures.prepare({
    ...rest,
    ...(timestamp ? {} : { subFilter: subFilter as SignatureSubFilter }),
    digest: rest.digest ?? key.hash ?? 'sha256',
    // A token is commonly 1.5 to 6 KB: the default reserve would fail late, after the key signed.
    ...(timestampAuthority && rest.contentsSizeBytes === undefined
      ? { contentsSizeBytes: TIMESTAMPED_CONTENTS_SIZE }
      : {}),
  });
  try {
    const cms = await cmsFor(key, prepared, subFilter, profile);
    return await completePrepared(doc, { prepared, cms, timestampAuthority, timestampTrust });
  } catch (error) {
    await doc.signatures.cancel(prepared.signingId).catch(() => undefined);
    throw error;
  }
}

/**
 * The second half of {@link sign}, for a signature made in two steps: check the CMS a key
 * returned against what was prepared, timestamp it when a `timestampAuthority` is given, check
 * it again with the token in it, and install it. The engine's own `complete()` checks none of
 * this.
 *
 * On failure nothing is written and the signing stays prepared: the caller prepared it, so the
 * caller decides. When the timestamp authority didn't answer, call this again with the same
 * `cms`. `SignatureRefused` means the same `cms` will be refused again: cancel the signing and
 * prepare again.
 *
 * Rejects with `SignatureRefused` (`details.reason`, or `details.trust` for an authority
 * `timestampTrust` doesn't trust), with `InvalidArg` for a `timestampAuthority` on a document
 * timestamp or on a CMS that already carries a timestamp, and with what the authority or the
 * engine's `complete()` throw.
 */
export async function completeSignature(
  doc: DocumentHandle,
  input: {
    prepared: SignaturePrepared;
    cms: Uint8Array;
    timestampAuthority?: CmsSigner;
    timestampTrust?: TrustPort;
  },
): Promise<SignatureCompleteResult> {
  assertTimestampOptions(
    input.prepared.subFilter === 'ETSI.RFC3161',
    input.timestampAuthority,
    input.timestampTrust,
  );
  try {
    return await completePrepared(doc, input);
  } catch (error) {
    if (EngineError.is(error, EngineErrorCode.SignatureRefused)) {
      throw new EngineError(
        EngineErrorCode.SignatureRefused,
        `${error.message}. The signing stays prepared, and this CMS will be refused again: cancel it and prepare again`,
        { details: error.details, cause: error },
      );
    }
    throw error;
  }
}

/** A timestamp can't be nested in a timestamp, and trust without an authority would judge nothing. */
function assertTimestampOptions(
  documentTimestamp: boolean,
  timestampAuthority: CmsSigner | undefined,
  timestampTrust: TrustPort | undefined,
): void {
  if (documentTimestamp && timestampAuthority) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'a document timestamp is already a timestamp; leave out `timestampAuthority`',
      { details: { field: 'timestampAuthority' } },
    );
  }
  if (timestampTrust && !timestampAuthority) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      "`timestampTrust` judges a timestamp's authority; pass `timestampAuthority` too",
      { details: { field: 'timestampTrust' } },
    );
  }
}

/**
 * The gate, then the timestamp, then the gate again, then `complete`. The gate runs before the
 * authority is asked, so a CMS it would refuse never costs a request, and again afterwards,
 * because the CMS that reaches the document is the one with the token in it.
 */
async function completePrepared(
  doc: DocumentHandle,
  input: {
    prepared: SignaturePrepared;
    cms: Uint8Array;
    timestampAuthority?: CmsSigner;
    timestampTrust?: TrustPort;
  },
): Promise<SignatureCompleteResult> {
  const { prepared, timestampAuthority } = input;
  const profile = profileFor(prepared.subFilter);
  const check = async (cms: Uint8Array) => {
    const gate = await verifyForCompletion({ cms, prepared, profile });
    if (!gate.ok) throw signingRefused(gate.reason, gate.detail);
  };
  let cms = input.cms;
  await check(cms);
  if (timestampAuthority) {
    cms = await attachSignatureTimestamp({
      cms,
      authority: timestampAuthority,
      trust: input.timestampTrust,
    });
    await check(cms);
  }
  return doc.signatures.complete({
    signingId: prepared.signingId,
    cms,
    expectedVersion: prepared.expectedVersion,
  });
}

/** The key's answer for the prepared digest: a service's CMS, or one built here around a raw signature. */
async function cmsFor(
  key: SignerPort,
  prepared: SignaturePrepared,
  subFilter: SignatureSubFilter | 'ETSI.RFC3161',
  profile: CompletionProfile,
): Promise<Uint8Array> {
  if (key.kind === 'cms') {
    return key.sign({ digest: prepared.digest, algorithm: prepared.algorithm, subFilter });
  }
  if (profile === 'timestamp') {
    throw new EngineError(EngineErrorCode.InvalidArg, 'a raw key cannot make a timestamp token');
  }
  return buildDetachedCms({
    digest: prepared.digest,
    hash: prepared.algorithm,
    profile,
    signer: key,
    signingTime: profile === 'pkcs7' ? new Date().toISOString() : undefined,
  });
}
