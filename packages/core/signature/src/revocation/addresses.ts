import type * as pkijs from 'pkijs';

import { OID } from '../cms/oids';

/** The `http` and `https` addresses a certificate names for asking about it. */
export interface RevocationAddresses {
  /** Its issuer's OCSP responders. */
  ocsp: string[];
  /** Where its issuer publishes the list of withdrawn certificates. */
  crl: string[];
  /** Where its issuer's own certificate can be had. */
  issuer: string[];
}

/** A general name that is a URI (RFC 5280 §4.2.1.6). */
const URI = 6;

/**
 * Read the addresses a certificate names. Only `http` and `https` ones come back: an `ldap`
 * address is not something a web page or a route can ask. A CRL address that covers only some
 * reasons, or names another issuer, is left out: such a list cannot say a certificate is good.
 */
export function revocationAddresses(certificate: pkijs.Certificate): RevocationAddresses {
  const out: RevocationAddresses = { ocsp: [], crl: [], issuer: [] };
  const extension = (id: string) =>
    certificate.extensions?.find((candidate) => candidate.extnID === id)?.parsedValue;

  const access = extension(OID.authorityInfoAccess) as pkijs.InfoAccess | undefined;
  for (const description of access?.accessDescriptions ?? []) {
    const address = webAddress(description.accessLocation);
    if (!address) continue;
    if (description.accessMethod === OID.accessOcsp) out.ocsp.push(address);
    if (description.accessMethod === OID.accessIssuers) out.issuer.push(address);
  }

  const points = extension(OID.crlDistributionPoints) as pkijs.CRLDistributionPoints | undefined;
  for (const point of points?.distributionPoints ?? []) {
    if (point.reasons || point.cRLIssuer) continue;
    // A full name: a list of general names, any of which leads to the same CRL.
    const names = Array.isArray(point.distributionPoint) ? point.distributionPoint : [];
    for (const name of names) {
      const address = webAddress(name as pkijs.GeneralName);
      if (address) out.crl.push(address);
    }
  }
  return out;
}

/**
 * Whether a certificate says of itself that it can't be withdrawn, so that nobody needs to be
 * asked about it. A signing service that issues a certificate for one signature, valid for
 * minutes, runs no revocation service for it, and the certificate carries one of two
 * extensions that say so:
 *
 * - "validity assured, short term" (ETSI's standard 319 412-1): the issuer assures the
 *   certificate's validity for its whole, short, life;
 * - `noRevAvail` (RFC 9608): no revocation information is published for it.
 *
 * Either one speaks for the certificate that carries it and for no other, so it counts only
 * on a certificate that issues nothing: the certificates above it are asked about as ever.
 * RFC 9608 forbids `noRevAvail` beside an address to ask at. A certificate that has both
 * contradicts itself, and is asked about like any other.
 */
export function cannotBeRevoked(certificate: pkijs.Certificate): boolean {
  const extension = (id: string) =>
    certificate.extensions?.find((candidate) => candidate.extnID === id);
  const constraints = extension(OID.basicConstraints)?.parsedValue as
    | pkijs.BasicConstraints
    | undefined;
  if (constraints?.cA) return false;
  if (extension(OID.validityAssuredShortTerm)) return true;
  if (!extension(OID.noRevAvail)) return false;
  const access = extension(OID.authorityInfoAccess)?.parsedValue as pkijs.InfoAccess | undefined;
  const namesWhereToAsk =
    extension(OID.crlDistributionPoints) !== undefined ||
    extension(OID.freshestCrl) !== undefined ||
    (access?.accessDescriptions ?? []).some(
      (description) => description.accessMethod === OID.accessOcsp,
    );
  return !namesWhereToAsk;
}

function webAddress(name: pkijs.GeneralName): string | null {
  if (name.type !== URI || typeof name.value !== 'string') return null;
  return /^https?:\/\//i.test(name.value) ? name.value : null;
}
