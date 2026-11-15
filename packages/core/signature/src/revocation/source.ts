/**
 * One question for a certificate authority, as it goes over the wire: an OCSP request for a
 * responder, or an address to fetch a CRL or an issuer's certificate from. The address comes
 * from the certificate being asked about.
 */
export type RevocationRequest =
  | { kind: 'ocsp'; url: string; body: Uint8Array }
  | { kind: 'crl'; url: string }
  | { kind: 'issuer'; url: string };

/**
 * Where revocation answers come from. A web page cannot ask a certificate authority itself, so
 * an app answers through a route of its own; a test answers from memory. Whatever comes back is
 * checked before it is used: a source is asked, never trusted.
 */
export interface RevocationSource {
  /** The bytes that answer `request`: an OCSP response, a CRL, or a certificate, each in DER. */
  fetch(request: RevocationRequest): Promise<Uint8Array>;
}
