/**
 * RSA-SHA1 signing helper for AWS CloudFront. CloudFront's signer
 * mandates RSA-SHA1 — even though SHA1 is otherwise deprecated, the
 * key pair group at the edge only verifies SHA1 signatures, so we use
 * what the provider accepts.
 *
 * Private key MUST be a PEM-encoded RSA key (the kind you upload to
 * a CloudFront key group). Other key types (ECDSA, Ed25519) won't be
 * accepted by CloudFront's edge verifier.
 */

import { createSign } from 'node:crypto';

export function rsaSha1Sign(privateKeyPem: string | Buffer, message: Buffer | string): Buffer {
  const signer = createSign('RSA-SHA1');
  signer.update(message);
  signer.end();
  return signer.sign(
    typeof privateKeyPem === 'string' ? privateKeyPem : privateKeyPem.toString('utf8'),
  );
}
