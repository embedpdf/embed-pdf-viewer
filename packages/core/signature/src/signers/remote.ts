import type { CmsSigner } from '../sign';

/**
 * A `CmsSigner` over the customer's own signing service, HSM or timestamp
 * authority: the engine's digest goes out, a finished detached CMS (or, for
 * `'ETSI.RFC3161'`, an RFC 3161 token) comes back. Nothing but the digest
 * (and which hash and profile it is for) ever leaves the runtime.
 */
export function remoteSigner(input: {
  sign: (request: {
    digest: Uint8Array;
    algorithm: 'sha256' | 'sha384' | 'sha512';
    subFilter: 'adbe.pkcs7.detached' | 'ETSI.CAdES.detached' | 'ETSI.RFC3161';
  }) => Promise<Uint8Array>;
}): CmsSigner {
  return {
    kind: 'cms',
    sign: (request) => input.sign(request),
  };
}
