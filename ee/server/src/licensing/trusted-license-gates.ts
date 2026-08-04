import type { LicenseGate } from './LicenseRuntime';

const trustedLicenseGates = new WeakSet<object>();

export function markLicenseGateTrusted(gate: LicenseGate): void {
  trustedLicenseGates.add(gate);
}

export function isLicenseGateTrusted(gate: LicenseGate | undefined): boolean {
  return Boolean(gate) && trustedLicenseGates.has(gate as object);
}
