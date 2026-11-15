import * as pkijs from 'pkijs';

import { ensureEngine } from '../cms/engine';

/**
 * The OCSP request that asks about `certificate`, which `issuer` issued (RFC 6960 §4.1).
 *
 * The certificate is identified with SHA-1, as RFC 5019 has every responder accept: these are
 * names to look a certificate up by, not something a signature rests on. It carries no nonce,
 * so the same question always has the same bytes and an answer can be kept and served again,
 * which is how responders themselves work.
 */
export async function buildOcspRequest(
  certificate: pkijs.Certificate,
  issuer: pkijs.Certificate,
): Promise<Uint8Array> {
  ensureEngine();
  const request = new pkijs.OCSPRequest();
  await request.createForCertificate(certificate, {
    hashAlgorithm: 'SHA-1',
    issuerCertificate: issuer,
  });
  return new Uint8Array(request.toSchema(true).toBER(false));
}
