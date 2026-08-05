import type { Kysely } from 'kysely';

import { LicenseRuntime, type AirGapActivationRequest, type LicenseGate } from './LicenseRuntime';
import type { VerifiedMachineCertificate } from './offline-certificate';
import type { Database } from '../db/schema';
import type { SecretResolver } from '../security/secrets/SecretResolver';

export interface CloudPdfLicenseRuntime extends LicenseGate {
  close(): Promise<void>;
  createActivationRequest(): Promise<AirGapActivationRequest>;
  installCertificate(certificate: string): Promise<VerifiedMachineCertificate>;
  refresh(): Promise<void>;
}

/**
 * Creates the only license-gate implementation accepted by the public
 * `buildApp` API. Product identity and verification keys are compiled into the
 * package and cannot be replaced through this interface.
 */
export async function createLicenseRuntime(input: {
  db: Kysely<Database>;
  env?: NodeJS.ProcessEnv;
  secretResolver?: SecretResolver;
  startTimer?: boolean;
}): Promise<CloudPdfLicenseRuntime> {
  return LicenseRuntime.create(input);
}
