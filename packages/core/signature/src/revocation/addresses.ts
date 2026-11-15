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

function webAddress(name: pkijs.GeneralName): string | null {
  if (name.type !== URI || typeof name.value !== 'string') return null;
  return /^https?:\/\//i.test(name.value) ? name.value : null;
}
