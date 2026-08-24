/**
 * @license FCL-1.0-ALv2
 *
 * WARNING: This file is part of CloudPDF's license-key functionality. Removing
 * or modifying this code to disable or circumvent license enforcement, enable
 * protected functionality without a valid license key, or remove protected
 * functionality is a breach of FCL-1.0-ALv2 while this release is governed by
 * that license. See cloudpdf/server/LICENSE.
 */
import { createHmac } from 'node:crypto';

/**
 * Connected reporting credential, version 1.
 *
 * The usage-reporting bearer credential is derived from the license key
 * instead of being a separately issued secret, so a connected deployment is
 * configured with the license key alone. The derivation is one-way and
 * domain-separated: possession of the wire credential proves nothing about
 * the license key, and the value can never collide with the plain
 * SHA-256 license-key fingerprints stored elsewhere.
 *
 *   cpr_v1_ + base64url( HMAC-SHA256(
 *     key     = UTF-8(trim(licenseKey)),
 *     message = UTF-8("cloudpdf/usage-reporting/v1\0" + trim(cloudpdfLicenseId)),
 *   ) )
 *
 * The signed control-plane license ID is bound into the message so a
 * credential can never be replayed against another license record. The
 * control plane derives the same value at issuance and stores only its
 * SHA-256 digest. Both sides pin identical fixed test vectors; changing
 * either implementation without the other breaks usage reporting.
 */
const REPORTING_CREDENTIAL_DOMAIN = 'cloudpdf/usage-reporting/v1\0';

export const REPORTING_CREDENTIAL_PREFIX = 'cpr_v1_';

export function deriveConnectedReportingCredential(input: {
  cloudpdfLicenseId: string;
  licenseKey: string;
}): string {
  const licenseKey = input.licenseKey.trim();
  const cloudpdfLicenseId = input.cloudpdfLicenseId.trim();
  if (!licenseKey) {
    throw new Error('A license key is required to derive the reporting credential');
  }
  if (!cloudpdfLicenseId) {
    throw new Error('A CloudPDF license ID is required to derive the reporting credential');
  }
  const mac = createHmac('sha256', Buffer.from(licenseKey, 'utf8'))
    .update(Buffer.from(REPORTING_CREDENTIAL_DOMAIN + cloudpdfLicenseId, 'utf8'))
    .digest('base64url');
  return `${REPORTING_CREDENTIAL_PREFIX}${mac}`;
}
