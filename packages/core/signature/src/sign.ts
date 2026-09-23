import type {
  DigestAlgorithm,
  DocumentHandle,
  SignatureCompleteResult,
  SignaturePrepareInput,
  SignatureSubFilter,
} from '@embedpdf/engine-core/runtime';

import { buildDetachedCms, type RawSigner, type SignatureProfile } from './cms/build';
import { verifyForCompletion, type CompletionRefusal } from './gate';

/** A service that turns a digest into a finished detached CMS (most hosted signing APIs). */
export interface CmsSigner {
  readonly kind: 'cms';
  sign(input: {
    digest: Uint8Array;
    algorithm: Exclude<DigestAlgorithm, 'sha1'>;
    subFilter: SignatureSubFilter;
  }): Promise<Uint8Array>;
}

export type SignerPort = CmsSigner | RawSigner;

export type SignInput = Omit<SignaturePrepareInput, 'kind'> & { signer: SignerPort };

export class SigningError extends Error {
  constructor(
    readonly reason: CompletionRefusal,
    detail: string,
  ) {
    super(`signing refused (${reason}): ${detail}`);
    this.name = 'SigningError';
  }
}

export function profileFor(subFilter: SignatureSubFilter): SignatureProfile {
  return subFilter === 'adbe.pkcs7.detached' ? 'pkcs7' : 'cades-b';
}

/**
 * Sign a field in one call: `prepare` on the engine, the signer turns the
 * digest into a CMS (or a raw signature this package wraps), the gate
 * checks the CMS matches what was prepared, `complete` installs it. Any
 * failure aborts the candidate and rethrows; the document is never left
 * with a pending signing.
 */
export async function sign(
  doc: DocumentHandle,
  input: SignInput,
): Promise<SignatureCompleteResult> {
  if (!doc.signatures) throw new Error('this engine does not implement signatures');
  const { signer, ...rest } = input;
  const subFilter: SignatureSubFilter = rest.subFilter ?? 'ETSI.CAdES.detached';
  const profile = profileFor(subFilter);
  const digest = rest.digest ?? (signer.kind === 'raw' ? signer.hash : 'sha256');
  const prepared = await doc.signatures.prepare({ ...rest, subFilter, digest });
  try {
    const cms =
      signer.kind === 'cms'
        ? await signer.sign({ digest: prepared.digest, algorithm: prepared.algorithm, subFilter })
        : await buildDetachedCms({
            digest: prepared.digest,
            hash: prepared.algorithm,
            profile,
            signer,
            signingTime: profile === 'pkcs7' ? new Date() : undefined,
          });
    const gate = await verifyForCompletion({ cms, prepared, profile });
    if (!gate.ok) throw new SigningError(gate.reason, gate.detail);
    return await doc.signatures.complete({
      signingId: prepared.signingId,
      cms,
      expectedVersion: prepared.expectedVersion,
    });
  } catch (error) {
    await doc.signatures.abort(prepared.signingId).catch(() => undefined);
    throw error;
  }
}
