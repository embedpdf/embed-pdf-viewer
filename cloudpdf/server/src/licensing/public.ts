/**
 * @license FCL-1.0-ALv2
 *
 * WARNING: This file is part of CloudPDF's license-key functionality. Removing
 * or modifying this code to disable or circumvent license enforcement, enable
 * protected functionality without a valid license key, or remove protected
 * functionality is a breach of FCL-1.0-ALv2 while this release is governed by
 * that license. See cloudpdf/server/LICENSE.
 */
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
