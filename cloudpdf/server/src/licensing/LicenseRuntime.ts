import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { hostname, platform, arch } from 'node:os';

import type { Kysely } from 'kysely';

import {
  ConnectedLicenseError,
  validateConnectedLicense,
  verifyCachedConnectedValidation,
  type ConnectedValidation,
} from './connected-client';
import { deploymentFingerprint } from './fingerprint';
import type { KeygenResponseProof } from './keygen-response';
import { LicenseStateRepository } from './LicenseStateRepository';
import { verifyMachineCertificate, type VerifiedMachineCertificate } from './offline-certificate';
import { resolveCloudPdfLicenseIdentity, type CloudPdfLicenseIdentity } from './product';
import { markLicenseGateTrusted } from './trusted-license-gates';
import { parseSecretRefUri } from '../config/secrets/parseSecretRefUri';
import type { Database } from '../db/schema';
import type { SecretResolver } from '../security/secrets/SecretResolver';

export type LicenseMode = 'connected' | 'air-gapped';
export type LicenseAccess = 'full' | 'restricted' | 'none';

export interface RuntimeMeterPolicy {
  enforcement: 'hard-limit' | 'notify-only' | 'soft-limit';
  limit: string;
  metric: 'pdf.uploads' | 'pdf.views' | 'storage.bytes';
  period: 'current' | 'month';
  warningThresholds: number[];
}

export interface LicenseGateStatus {
  access: LicenseAccess;
  code: string;
  expiresAt: string | null;
  lastValidatedAt: string | null;
  /**
   * License purpose from the issuer ("subscription", "development",
   * "evaluation"), so operators and status endpoints can see at a glance
   * what kind of key a deployment runs on.
   */
  licenseKind: string | null;
  message: string;
  meters: RuntimeMeterPolicy[];
  mode: LicenseMode | null;
  telemetryProfile: string | null;
}

export interface LicenseGate {
  getStatus(): LicenseGateStatus;
}

export interface AirGapActivationRequest {
  accountId: string;
  createdAt: string;
  deploymentId: string;
  fingerprint: string;
  hostname: string;
  nonce: string;
  platform: string;
  productId: string;
  requestId: string;
  version: 1;
}

interface RuntimeSnapshot extends LicenseGateStatus {
  graceExpiresAt: number | null;
}

export class LicenseRuntime implements LicenseGate {
  private readonly ownerId = randomUUID();
  private connectedReportingLicenseId: string | null = null;
  private snapshot: RuntimeSnapshot = {
    access: 'none',
    code: 'LICENSE_NOT_CONFIGURED',
    expiresAt: null,
    graceExpiresAt: null,
    lastValidatedAt: null,
    licenseKind: null,
    message: 'CloudPDF Self-hosted requires a license',
    meters: [],
    mode: null,
    telemetryProfile: null,
  };
  private timer?: NodeJS.Timeout;

  private constructor(
    private readonly repository: LicenseStateRepository,
    private readonly identity: CloudPdfLicenseIdentity,
    private readonly mode: LicenseMode,
    private readonly key: string | undefined,
  ) {}

  static async create(input: {
    db: Kysely<Database>;
    env?: NodeJS.ProcessEnv;
    /** Internal test seam. Production callers use the compiled identity. */
    identity?: CloudPdfLicenseIdentity;
    secretResolver?: SecretResolver;
    startTimer?: boolean;
  }): Promise<LicenseRuntime> {
    const env = input.env ?? process.env;
    const key = await resolveLicenseKey(env['CLOUDPDF_LICENSE_KEY'], input.secretResolver);
    const rawMode = env['CLOUDPDF_LICENSE_MODE'] ?? (key ? 'connected' : 'air-gapped');
    if (rawMode !== 'connected' && rawMode !== 'air-gapped') {
      throw new Error('CLOUDPDF_LICENSE_MODE must be connected or air-gapped');
    }
    const runtime = new LicenseRuntime(
      new LicenseStateRepository(input.db),
      input.identity ?? resolveCloudPdfLicenseIdentity(env),
      rawMode,
      key,
    );
    await runtime.refresh();
    markLicenseGateTrusted(runtime);
    if (input.startTimer !== false) runtime.start();
    return runtime;
  }

  getStatus(): LicenseGateStatus {
    const now = Date.now();
    if (
      this.snapshot.access === 'full' &&
      this.snapshot.graceExpiresAt !== null &&
      now > this.snapshot.graceExpiresAt
    ) {
      return publicStatus({
        ...this.snapshot,
        code: this.mode === 'connected' ? 'LICENSE_OFFLINE_GRACE_EXPIRED' : 'LICENSE_EXPIRED',
        message:
          this.mode === 'connected'
            ? 'CloudPDF could not revalidate the license before the offline grace period expired'
            : 'The installed air-gapped certificate has expired',
        access: 'restricted',
      });
    }
    return publicStatus(this.snapshot);
  }

  /** Internal server bootstrap value sourced only from verified license metadata. */
  getConnectedReportingLicenseId(): string | null {
    return this.connectedReportingLicenseId;
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
  }

  async createActivationRequest(): Promise<AirGapActivationRequest> {
    const state = await this.repository.getOrCreate();
    return {
      accountId: this.identity.accountId,
      createdAt: new Date().toISOString(),
      deploymentId: state.deployment_id,
      fingerprint: deploymentFingerprint(state.deployment_id),
      hostname: hostname(),
      nonce: randomBytes(24).toString('base64url'),
      platform: `${platform()}/${arch()}`,
      productId: this.identity.productId,
      requestId: randomUUID(),
      version: 1,
    };
  }

  async installCertificate(certificate: string): Promise<VerifiedMachineCertificate> {
    const state = await this.repository.getOrCreate();
    const verified = verifyMachineCertificate({
      certificate,
      expectedFingerprint: deploymentFingerprint(state.deployment_id),
      identity: this.identity,
    });
    await this.repository.installCertificate(certificate, verified);
    await this.refresh();
    return verified;
  }

  async refresh(): Promise<void> {
    const state = await this.repository.getOrCreate();
    const now = Date.now();
    if (now + 5 * 60 * 1_000 < state.last_observed_time) {
      const prior =
        this.mode === 'connected'
          ? this.cachedConnectedValidation(state.validation_data_json, state.deployment_id)
          : this.priorAirGapValidation(state);
      this.connectedReportingLicenseId =
        this.mode === 'connected' ? optionalString(prior?.metadata['cloudpdfLicenseId']) : null;
      this.snapshot = {
        access: prior ? 'restricted' : 'none',
        code: 'SYSTEM_CLOCK_ROLLBACK',
        expiresAt: prior
          ? 'expiresAt' in prior
            ? prior.expiresAt
            : prior.artifactExpiresAt
          : null,
        graceExpiresAt: null,
        lastValidatedAt: prior
          ? new Date(
              'validatedAt' in prior ? prior.validatedAt : prior.artifactIssuedAt,
            ).toISOString()
          : null,
        licenseKind: optionalString(prior?.metadata['purpose']),
        message: 'The system clock moved backwards; license validation is blocked',
        meters: parseMeters(prior?.metadata ?? {}),
        mode: this.mode,
        telemetryProfile:
          this.mode === 'connected' ? optionalString(prior?.metadata['telemetryProfile']) : 'none',
      };
      return;
    }

    if (this.mode === 'air-gapped') {
      this.connectedReportingLicenseId = null;
      await this.refreshAirGapped(state);
      return;
    }

    await this.refreshConnected(state);
  }

  private start(): void {
    this.timer = setInterval(
      () => {
        void this.refresh();
      },
      5 * 60 * 1_000,
    );
    this.timer.unref();
  }

  private async refreshAirGapped(
    state: Awaited<ReturnType<LicenseStateRepository['load']>>,
  ): Promise<void> {
    const certificate = state.installed_certificate;
    if (!certificate) {
      this.snapshot = {
        access: 'none',
        code: 'AIR_GAP_CERTIFICATE_REQUIRED',
        expiresAt: null,
        graceExpiresAt: null,
        lastValidatedAt: null,
        licenseKind: null,
        message: 'Install a signed CloudPDF air-gapped certificate',
        meters: [],
        mode: 'air-gapped',
        telemetryProfile: 'none',
      };
      return;
    }

    try {
      const verified = verifyMachineCertificate({
        certificate,
        expectedFingerprint: deploymentFingerprint(state.deployment_id),
        identity: this.identity,
      });
      const now = Date.now();
      await this.repository.touchObservedTime(now);
      this.snapshot = {
        access: 'full',
        code: 'VALID',
        expiresAt: verified.artifactExpiresAt,
        graceExpiresAt: new Date(verified.artifactExpiresAt).getTime(),
        lastValidatedAt: new Date(now).toISOString(),
        licenseKind: optionalString(verified.metadata['purpose']),
        message: 'Air-gapped license certificate is valid',
        meters: parseMeters(verified.metadata),
        mode: 'air-gapped',
        telemetryProfile: 'none',
      };
    } catch (error) {
      const prior = this.priorAirGapValidation(state);
      const message = error instanceof Error ? error.message : 'Air-gapped certificate is invalid';
      this.snapshot = {
        access: prior ? 'restricted' : 'none',
        code: /expired/i.test(message)
          ? 'AIR_GAP_CERTIFICATE_EXPIRED'
          : 'AIR_GAP_CERTIFICATE_INVALID',
        expiresAt: prior?.artifactExpiresAt ?? null,
        graceExpiresAt: null,
        lastValidatedAt: prior ? new Date(prior.artifactIssuedAt).toISOString() : null,
        licenseKind: optionalString(prior?.metadata['purpose']),
        message,
        meters: parseMeters(prior?.metadata ?? {}),
        mode: 'air-gapped',
        telemetryProfile: 'none',
      };
    }
  }

  private async refreshConnected(
    state: Awaited<ReturnType<LicenseStateRepository['load']>>,
  ): Promise<void> {
    if (!this.key) {
      this.connectedReportingLicenseId = null;
      this.snapshot = {
        access: 'none',
        code: 'LICENSE_KEY_REQUIRED',
        expiresAt: null,
        graceExpiresAt: null,
        lastValidatedAt: null,
        licenseKind: null,
        message: 'CLOUDPDF_LICENSE_KEY is required for connected licensing',
        meters: [],
        mode: 'connected',
        telemetryProfile: null,
      };
      return;
    }

    const keyFingerprint = createHash('sha256').update(this.key).digest('hex');
    const cachedAtStart = this.cachedConnectedValidation(
      state.validation_data_json,
      state.deployment_id,
    );
    if (
      this.useConnectedCache({
        cached: cachedAtStart,
        code: 'VALID_CACHED',
        message: 'Connected license is valid; using the latest scheduled validation',
        requireCheckInFreshness: true,
      })
    ) {
      return;
    }

    const ownsValidationLease = await this.repository.acquireLease(
      'license-validation',
      this.ownerId,
      60_000,
    );
    if (!ownsValidationLease) {
      const coordinatedState = await waitForCoordinatedValidation(
        this.repository,
        state.last_validated_at,
      );
      const coordinatedCache = this.cachedConnectedValidation(
        coordinatedState.validation_data_json,
        coordinatedState.deployment_id,
      );
      if (
        this.useConnectedCache({
          cached: coordinatedCache,
          code: 'VALID_COORDINATED',
          message: 'Another replica is validating the connected license',
          requireCheckInFreshness: false,
        })
      ) {
        return;
      }
      this.connectedReportingLicenseId = optionalString(
        coordinatedCache?.metadata['cloudpdfLicenseId'],
      );
      this.snapshot = {
        access: coordinatedCache ? 'restricted' : 'none',
        code: 'LICENSE_VALIDATION_IN_PROGRESS',
        expiresAt: coordinatedCache?.expiresAt ?? null,
        graceExpiresAt: null,
        lastValidatedAt: coordinatedCache
          ? new Date(coordinatedCache.validatedAt).toISOString()
          : null,
        licenseKind: optionalString(coordinatedCache?.metadata['purpose']),
        message: 'Another replica is validating the license; no usable cached decision exists',
        meters: parseMeters(coordinatedCache?.metadata ?? {}),
        mode: 'connected',
        telemetryProfile: optionalString(coordinatedCache?.metadata['telemetryProfile']),
      };
      return;
    }

    try {
      const validation = await validateConnectedLicense({
        fingerprint: deploymentFingerprint(state.deployment_id),
        identity: this.identity,
        key: this.key,
      });
      const offlineGraceHours = positiveNumber(validation.metadata['offlineGraceHours']) ?? 72;
      this.connectedReportingLicenseId = optionalString(validation.metadata['cloudpdfLicenseId']);
      await this.repository.saveConnectedValidation({
        keyFingerprint,
        keygenLicenseId: validation.licenseId,
        validationData: encryptConnectedProof({
          fingerprint: deploymentFingerprint(state.deployment_id),
          key: this.key,
          proof: validation.proof,
        }),
      });
      const validatedAt = validation.validatedAt;
      const licenseExpiry = validation.expiresAt
        ? new Date(validation.expiresAt).getTime()
        : Number.POSITIVE_INFINITY;
      this.snapshot = {
        access: 'full',
        code: 'VALID',
        expiresAt: validation.expiresAt,
        graceExpiresAt: Math.min(validatedAt + offlineGraceHours * 60 * 60 * 1_000, licenseExpiry),
        lastValidatedAt: new Date(validatedAt).toISOString(),
        licenseKind: optionalString(validation.metadata['purpose']),
        message: 'Connected license is valid',
        meters: parseMeters(validation.metadata),
        mode: 'connected',
        telemetryProfile: optionalString(validation.metadata['telemetryProfile']),
      };
    } catch (error) {
      const cached = this.cachedConnectedValidation(
        state.validation_data_json,
        state.deployment_id,
      );
      const graceHours = positiveNumber(cached?.metadata['offlineGraceHours']) ?? 72;
      const cachedLicenseExpiry = cached?.expiresAt
        ? new Date(cached.expiresAt).getTime()
        : Number.POSITIVE_INFINITY;
      const graceExpiresAt = cached
        ? Math.min(cached.validatedAt + graceHours * 60 * 60 * 1_000, cachedLicenseExpiry)
        : 0;
      const mayUseOfflineGrace = error instanceof ConnectedLicenseError && error.retryable;
      this.connectedReportingLicenseId = optionalString(cached?.metadata['cloudpdfLicenseId']);
      if (mayUseOfflineGrace && cached && Date.now() <= graceExpiresAt) {
        await this.repository.touchObservedTime();
        this.snapshot = {
          access: 'full',
          code: 'VALID_OFFLINE_GRACE',
          expiresAt: cached?.expiresAt ?? null,
          graceExpiresAt,
          lastValidatedAt: new Date(cached.validatedAt).toISOString(),
          licenseKind: optionalString(cached?.metadata['purpose']),
          message: 'Keygen is unavailable; using the connected license offline grace period',
          meters: parseMeters(cached?.metadata ?? {}),
          mode: 'connected',
          telemetryProfile: optionalString(cached?.metadata['telemetryProfile']),
        };
        return;
      }
      this.snapshot = {
        access: cached ? 'restricted' : 'none',
        code: error instanceof ConnectedLicenseError ? error.code : 'CONNECTED_LICENSE_INVALID',
        expiresAt: null,
        graceExpiresAt: null,
        lastValidatedAt: cached ? new Date(cached.validatedAt).toISOString() : null,
        licenseKind: optionalString(cached?.metadata['purpose']),
        message: error instanceof Error ? error.message : 'Connected license validation failed',
        meters: parseMeters(cached?.metadata ?? {}),
        mode: 'connected',
        telemetryProfile: optionalString(cached?.metadata['telemetryProfile']),
      };
    } finally {
      await this.repository.releaseLease('license-validation', this.ownerId);
    }
  }

  private useConnectedCache(input: {
    cached: ConnectedValidation | null;
    code: string;
    message: string;
    requireCheckInFreshness: boolean;
  }): boolean {
    const { cached } = input;
    if (!cached) return false;
    const now = Date.now();
    const checkInHours = positiveNumber(cached.metadata['checkInIntervalHours']) ?? 24;
    const graceHours = positiveNumber(cached.metadata['offlineGraceHours']) ?? 72;
    const licenseExpiry = cached.expiresAt
      ? new Date(cached.expiresAt).getTime()
      : Number.POSITIVE_INFINITY;
    const usableUntil = Math.min(
      cached.validatedAt +
        (input.requireCheckInFreshness ? checkInHours : graceHours) * 60 * 60 * 1_000,
      licenseExpiry,
    );
    if (now > usableUntil) return false;
    this.connectedReportingLicenseId = optionalString(cached.metadata['cloudpdfLicenseId']);
    this.snapshot = {
      access: 'full',
      code: input.code,
      expiresAt: cached.expiresAt,
      graceExpiresAt: Math.min(cached.validatedAt + graceHours * 60 * 60 * 1_000, licenseExpiry),
      lastValidatedAt: new Date(cached.validatedAt).toISOString(),
      licenseKind: optionalString(cached.metadata['purpose']),
      message: input.message,
      meters: parseMeters(cached.metadata),
      mode: 'connected',
      telemetryProfile: optionalString(cached.metadata['telemetryProfile']),
    };
    return true;
  }

  private cachedConnectedValidation(
    value: string | null,
    deploymentId: string,
  ): ConnectedValidation | null {
    if (!this.key) return null;
    const proof = decryptConnectedProof({
      fingerprint: deploymentFingerprint(deploymentId),
      key: this.key,
      value,
    });
    if (!proof) return null;
    try {
      return verifyCachedConnectedValidation({
        fingerprint: deploymentFingerprint(deploymentId),
        identity: this.identity,
        key: this.key,
        proof,
      });
    } catch {
      return null;
    }
  }

  private priorAirGapValidation(
    state: Awaited<ReturnType<LicenseStateRepository['load']>>,
  ): VerifiedMachineCertificate | null {
    if (!state.installed_certificate) return null;
    try {
      return verifyMachineCertificate({
        allowExpired: true,
        certificate: state.installed_certificate,
        expectedFingerprint: deploymentFingerprint(state.deployment_id),
        identity: this.identity,
      });
    } catch {
      return null;
    }
  }
}

function publicStatus(snapshot: RuntimeSnapshot): LicenseGateStatus {
  return {
    access: snapshot.access,
    code: snapshot.code,
    expiresAt: snapshot.expiresAt,
    lastValidatedAt: snapshot.lastValidatedAt,
    licenseKind: snapshot.licenseKind,
    message: snapshot.message,
    meters: snapshot.meters.map((meter) => ({
      ...meter,
      warningThresholds: [...meter.warningThresholds],
    })),
    mode: snapshot.mode,
    telemetryProfile: snapshot.telemetryProfile,
  };
}

async function waitForCoordinatedValidation(
  repository: LicenseStateRepository,
  previousValidatedAt: number | null,
): Promise<Awaited<ReturnType<LicenseStateRepository['load']>>> {
  let state = await repository.load();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (state.last_validated_at !== previousValidatedAt) return state;
    await new Promise((resolve) => setTimeout(resolve, 100));
    state = await repository.load();
  }
  return state;
}

async function resolveLicenseKey(
  raw: string | undefined,
  resolver: SecretResolver | undefined,
): Promise<string | undefined> {
  const value = raw?.trim();
  if (!value) return undefined;
  if (!value.startsWith('secret://')) return value;
  if (!resolver) {
    throw new Error('A SecretResolver is required when CLOUDPDF_LICENSE_KEY is a secret:// URI');
  }
  const resolved = await resolver.resolve({
    licenseKey: { as: 'string', ref: parseSecretRefUri(value) },
  });
  const key = resolved.licenseKey.trim();
  if (!key) throw new Error('CLOUDPDF_LICENSE_KEY resolved to an empty secret');
  return key;
}

function parseMeters(metadata: Record<string, unknown>): RuntimeMeterPolicy[] {
  const encoded = metadata['metersJson'];
  let meters: unknown = metadata['meters'];
  if (typeof encoded === 'string') {
    try {
      meters = JSON.parse(encoded);
    } catch {
      throw new Error('License meter metadata is invalid');
    }
  }
  if (!Array.isArray(meters)) return [];
  const result: RuntimeMeterPolicy[] = [];
  for (const item of meters) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const meter = item as Record<string, unknown>;
    const metric = meter['metric'];
    const period = meter['period'];
    const enforcement = meter['enforcement'];
    const limit = meter['limit'];
    if (
      !['pdf.uploads', 'pdf.views', 'storage.bytes'].includes(String(metric)) ||
      !['month', 'current'].includes(String(period)) ||
      !['hard-limit', 'notify-only', 'soft-limit'].includes(String(enforcement)) ||
      !/^\d+$/.test(String(limit))
    ) {
      continue;
    }
    result.push({
      enforcement: enforcement as RuntimeMeterPolicy['enforcement'],
      limit: String(limit),
      metric: metric as RuntimeMeterPolicy['metric'],
      period: period as RuntimeMeterPolicy['period'],
      warningThresholds: Array.isArray(meter['warningThresholds'])
        ? meter['warningThresholds'].filter(
            (value): value is number => typeof value === 'number' && Number.isFinite(value),
          )
        : [],
    });
  }
  return result;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

interface EncryptedConnectedProof {
  ciphertext: string;
  iv: string;
  kind: 'keygen-signed-validation-encrypted-v1';
  tag: string;
}

function decryptConnectedProof(input: {
  fingerprint: string;
  key: string;
  value: string | null;
}): KeygenResponseProof | null {
  const encrypted = parseEncryptedConnectedProof(input.value);
  if (!encrypted) return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      connectedProofEncryptionKey(input.key),
      Buffer.from(encrypted.iv, 'base64'),
    );
    decipher.setAAD(Buffer.from(input.fingerprint));
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return parseKeygenResponseProof(JSON.parse(plaintext.toString('utf8')));
  } catch {
    return null;
  }
}

function parseEncryptedConnectedProof(value: string | null): EncryptedConnectedProof | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (
      record['kind'] !== 'keygen-signed-validation-encrypted-v1' ||
      typeof record['ciphertext'] !== 'string' ||
      typeof record['iv'] !== 'string' ||
      typeof record['tag'] !== 'string'
    )
      return null;
    return record as unknown as EncryptedConnectedProof;
  } catch {
    return null;
  }
}

function parseKeygenResponseProof(value: unknown): KeygenResponseProof | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate['version'] !== 1 ||
    typeof candidate['bodyBase64'] !== 'string' ||
    typeof candidate['date'] !== 'string' ||
    typeof candidate['digest'] !== 'string' ||
    typeof candidate['keygenSignature'] !== 'string'
  )
    return null;
  return candidate as unknown as KeygenResponseProof;
}

function encryptConnectedProof(input: {
  fingerprint: string;
  key: string;
  proof: KeygenResponseProof;
}): EncryptedConnectedProof {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', connectedProofEncryptionKey(input.key), iv);
  cipher.setAAD(Buffer.from(input.fingerprint));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(input.proof))),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    kind: 'keygen-signed-validation-encrypted-v1',
    tag: cipher.getAuthTag().toString('base64'),
  };
}

function connectedProofEncryptionKey(licenseKey: string): Buffer {
  return createHash('sha256')
    .update('cloudpdf/connected-license-proof/v1\0')
    .update(licenseKey)
    .digest();
}
