/**
 * @license FCL-1.0-ALv2
 *
 * WARNING: This file is part of CloudPDF's license-key functionality. Removing
 * or modifying this code to disable or circumvent license enforcement, enable
 * protected functionality without a valid license key, or remove protected
 * functionality is a breach of FCL-1.0-ALv2 while this release is governed by
 * that license. See cloudpdf/server/LICENSE.
 */
import type { LicenseGate, LicenseGateStatus } from './LicenseRuntime';

/**
 * Test-only gate. Substituting this for the production license runtime outside
 * automated tests would circumvent the license-key functionality.
 */
export function createValidTestLicenseGate(): LicenseGate {
  const status: LicenseGateStatus = {
    access: 'full',
    code: 'VALID_TEST_LICENSE',
    expiresAt: null,
    lastValidatedAt: new Date(0).toISOString(),
    licenseKind: null,
    message: 'Test license gate',
    meters: [],
    mode: 'connected',
    telemetryProfile: 'license-only',
  };
  return { getStatus: () => ({ ...status }) };
}
