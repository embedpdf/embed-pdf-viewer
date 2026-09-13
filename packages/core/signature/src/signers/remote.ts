import type { CmsSigner } from '../sign';

/**
 * A `CmsSigner` over the customer's own signing service or HSM: the engine's
 * digest goes out, a finished detached CMS comes back. Nothing but the
 * digest (and which hash and profile it is for) ever leaves the runtime.
 */
export function remoteSigner(input: {
  sign: (request: {
    digest: Uint8Array;
    algorithm: 'sha256' | 'sha384' | 'sha512';
    subFilter: 'adbe.pkcs7.detached' | 'ETSI.CAdES.detached';
  }) => Promise<Uint8Array>;
}): CmsSigner {
  return {
    kind: 'cms',
    sign: (request) => input.sign(request),
  };
}
