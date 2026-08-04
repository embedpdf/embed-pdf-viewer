import type { LicenseGate, LicenseGateStatus } from './LicenseRuntime';

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
