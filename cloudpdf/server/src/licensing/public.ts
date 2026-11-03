/**
 * @license FCL-1.0-ALv2
 *
 * Warning: This file is part of CloudPDF's license-key functionality. Removing
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

const madeByCreateLicenseRuntime: unique symbol = Symbol('CloudPdfLicenseRuntime');

/**
 * The deployment's license, as `createLicenseRuntime` made it. Sealed: its
 * methods can't be replaced, and what `buildApp` enforces is read from the
 * runtime behind it, never through this object.
 */
export interface CloudPdfLicenseRuntime extends LicenseGate {
  readonly [madeByCreateLicenseRuntime]: true;
  close(): Promise<void>;
  createActivationRequest(): Promise<AirGapActivationRequest>;
  installCertificate(certificate: string): Promise<VerifiedMachineCertificate>;
  refresh(): Promise<void>;
}

/** Each runtime handed out, and the runtime behind it. Module-private. */
const runtimes = new WeakMap<object, LicenseRuntime>();

/**
 * Creates the deployment's license runtime: the only license the public
 * `buildApp` API accepts. Product identity and verification keys are compiled
 * into the package; this takes nothing else that could replace them.
 */
export async function createLicenseRuntime(input: {
  db: Kysely<Database>;
  env?: NodeJS.ProcessEnv;
  secretResolver?: SecretResolver;
  startTimer?: boolean;
}): Promise<CloudPdfLicenseRuntime> {
  // Exactly these four: whatever else a caller passes never reaches the runtime.
  const runtime = await LicenseRuntime.create({
    db: input.db,
    ...(input.env !== undefined ? { env: input.env } : {}),
    ...(input.secretResolver !== undefined ? { secretResolver: input.secretResolver } : {}),
    ...(input.startTimer !== undefined ? { startTimer: input.startTimer } : {}),
  });
  const license: CloudPdfLicenseRuntime = Object.freeze({
    [madeByCreateLicenseRuntime]: true as const,
    getStatus: () => runtime.getStatus(),
    close: () => runtime.close(),
    createActivationRequest: () => runtime.createActivationRequest(),
    installCertificate: (certificate: string) => runtime.installCertificate(certificate),
    refresh: () => runtime.refresh(),
  });
  runtimes.set(license, runtime);
  return license;
}

/**
 * The runtime behind a license `createLicenseRuntime` made; throws for
 * anything else. Internal: the package entry doesn't export it.
 */
export function licenseRuntimeOf(license: unknown): LicenseRuntime {
  const runtime =
    typeof license === 'object' && license !== null ? runtimes.get(license) : undefined;
  if (!runtime) {
    throw new Error(
      'buildApp: license must be the runtime createLicenseRuntime from @cloudpdf/server made',
    );
  }
  return runtime;
}
