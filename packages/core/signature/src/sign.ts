import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type {
  DigestAlgorithm,
  DocumentHandle,
  SignatureCompleteResult,
  SignaturePrepareInput,
  SignaturePrepared,
  SignatureSubFilter,
} from '@embedpdf/engine-core/runtime';

import { buildDetachedCms, type RawSigner, type SignatureProfile } from './cms/build';
import { verifyForCompletion, type CompletionProfile, type CompletionRefusal } from './gate';

/** A service that turns a digest into a finished detached CMS (most hosted signing APIs). */
export interface CmsSigner {
  readonly kind: 'cms';
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
export type SignInput = SignaturePrepareInput & { key: SignerPort };

/**
 * The gate refused the key's answer: `SignatureRefused`, with the gate's
 * reason in `details.reason`.
 */
function signingRefused(reason: CompletionRefusal, detail: string): EngineError {
  return new EngineError(
    EngineErrorCode.SignatureRefused,
    `signing refused (${reason}): ${detail}`,
    {
      details: { reason },
    },
  );
}

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
 * digest into a CMS (or a raw signature this package wraps), the gate
 * checks the CMS matches what was prepared, `complete` installs it. Any
 * failure cancels the candidate and rethrows; the document is never left
 * with a pending signing.
 */
export async function sign(
  doc: DocumentHandle,
  input: SignInput,
): Promise<SignatureCompleteResult> {
  const { key, ...rest } = input;
  const timestamp = rest.kind === 'timestamp';
  if (timestamp && key.kind !== 'cms') {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'a document timestamp needs a timestamp authority: a CMS key that returns an RFC 3161 token',
      { details: { field: 'key' } },
    );
  }
  const subFilter = timestamp ? 'ETSI.RFC3161' : (rest.subFilter ?? 'ETSI.CAdES.detached');
  const profile = profileFor(subFilter);
  const digest = rest.digest ?? (key.kind === 'raw' ? key.hash : 'sha256');
  const prepared = await doc.signatures.prepare({
    ...rest,
    ...(timestamp ? {} : { subFilter: subFilter as SignatureSubFilter }),
    digest,
  });
  try {
    const cms = await cmsFor(key, prepared, subFilter, profile);
    const gate = await verifyForCompletion({ cms, prepared, profile });
    if (!gate.ok) throw signingRefused(gate.reason, gate.detail);
    return await doc.signatures.complete({
      signingId: prepared.signingId,
      cms,
      expectedVersion: prepared.expectedVersion,
    });
  } catch (error) {
    await doc.signatures.cancel(prepared.signingId).catch(() => undefined);
    throw error;
  }
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
    signingTime: profile === 'pkcs7' ? new Date() : undefined,
  });
}
