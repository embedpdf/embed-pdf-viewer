/**
 * @license FCL-1.0-ALv2
 *
 * WARNING: This file is part of CloudPDF's license-key functionality. Removing
 * or modifying this code to disable or circumvent license enforcement, enable
 * protected functionality without a valid license key, or remove protected
 * functionality is a breach of FCL-1.0-ALv2 while this release is governed by
 * that license. See cloudpdf/server/LICENSE.
 */
import type { LicenseGate } from './LicenseRuntime';

const trustedLicenseGates = new WeakSet<object>();

export function markLicenseGateTrusted(gate: LicenseGate): void {
  trustedLicenseGates.add(gate);
}

export function isLicenseGateTrusted(gate: LicenseGate | undefined): boolean {
  return Boolean(gate) && trustedLicenseGates.has(gate as object);
}
