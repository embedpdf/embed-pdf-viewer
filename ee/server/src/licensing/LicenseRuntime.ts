import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hostname, platform, arch } from 'node:os';
import type { Kysely } from 'kysely';

import type { Database } from '../db/schema';
import { parseSecretRefUri } from '../config/secrets/parseSecretRefUri';
import type { SecretResolver } from '../security/secrets/SecretResolver';
import { ConnectedLicenseError, validateConnectedLicense } from './connected-client';
import { deploymentFingerprint } from './fingerprint';
import { LicenseStateRepository } from './LicenseStateRepository';
import { verifyMachineCertificate, type VerifiedMachineCertificate } from './offline-certificate';
import { resolveCloudPdfLicenseIdentity, type CloudPdfLicenseIdentity } from './product';

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
      resolveCloudPdfLicenseIdentity(env),
      rawMode,
      key,
    );
    await runtime.refresh();
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
        message: this.mode === 'connected'
          ? 'CloudPDF could not revalidate the license before the offline grace period expired'
          : 'The installed air-gapped certificate has expired',
        access: 'restricted',
      });
    }
    return publicStatus(this.snapshot);
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
      this.snapshot = {
        access: hasPriorValidation(state) ? 'restricted' : 'none',
        code: 'SYSTEM_CLOCK_ROLLBACK',
        expiresAt: null,
        graceExpiresAt: null,
        lastValidatedAt: state.last_validated_at
          ? new Date(state.last_validated_at).toISOString()
          : null,
        licenseKind: cachedLicenseKind(state.validation_data_json),
        message: 'The system clock moved backwards; license validation is blocked',
        meters: cachedMeters(state.validation_data_json),
        mode: this.mode,
        telemetryProfile: cachedTelemetryProfile(state.validation_data_json),
      };
      return;
    }

    if (this.mode === 'air-gapped') {
      await this.refreshAirGapped(state);
      return;
    }

    await this.refreshConnected(state);
  }

  private start(): void {
    this.timer = setInterval(() => {
      void this.refresh();
    }, 5 * 60 * 1_000);
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
      const cached = parseCachedAirGap(state.validation_data_json);
      const message = error instanceof Error ? error.message : 'Air-gapped certificate is invalid';
      this.snapshot = {
        access: hasPriorValidation(state) ? 'restricted' : 'none',
        code: /expired/i.test(message)
          ? 'AIR_GAP_CERTIFICATE_EXPIRED'
          : 'AIR_GAP_CERTIFICATE_INVALID',
        expiresAt: cached?.artifactExpiresAt ?? null,
        graceExpiresAt: null,
        lastValidatedAt: state.last_validated_at
          ? new Date(state.last_validated_at).toISOString()
          : null,
        licenseKind: optionalString(cached?.metadata['purpose']),
        message,
        meters: parseMeters(cached?.metadata ?? {}),
        mode: 'air-gapped',
        telemetryProfile: 'none',
      };
    }
  }

  private async refreshConnected(
    state: Awaited<ReturnType<LicenseStateRepository['load']>>,
  ): Promise<void> {
    if (!this.key) {
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
    const cachedAtStart = parseCachedValidation(state.validation_data_json);
    if (this.useConnectedCache({
      cached: cachedAtStart,
      code: 'VALID_CACHED',
      keyFingerprint,
      message: 'Connected license is valid; using the latest scheduled validation',
      requireCheckInFreshness: true,
      state,
    })) {
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
      const coordinatedCache = parseCachedValidation(coordinatedState.validation_data_json);
      if (this.useConnectedCache({
        cached: coordinatedCache,
        code: 'VALID_COORDINATED',
        keyFingerprint,
        message: 'Another replica is validating the connected license',
        requireCheckInFreshness: false,
        state: coordinatedState,
      })) {
        return;
      }
      this.snapshot = {
        access: hasPriorValidation(coordinatedState) ? 'restricted' : 'none',
        code: 'LICENSE_VALIDATION_IN_PROGRESS',
        expiresAt: coordinatedCache?.expiresAt ?? null,
        graceExpiresAt: null,
        lastValidatedAt: coordinatedState.last_validated_at
          ? new Date(coordinatedState.last_validated_at).toISOString()
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
      await this.repository.saveConnectedValidation({
        keyFingerprint,
        keygenLicenseId: validation.licenseId,
        validationData: validation,
      });
      const validatedAt = Date.now();
      const licenseExpiry = validation.expiresAt
        ? new Date(validation.expiresAt).getTime()
        : Number.POSITIVE_INFINITY;
      this.snapshot = {
        access: 'full',
        code: 'VALID',
        expiresAt: validation.expiresAt,
        graceExpiresAt: Math.min(
          validatedAt + offlineGraceHours * 60 * 60 * 1_000,
          licenseExpiry,
        ),
        lastValidatedAt: new Date(validatedAt).toISOString(),
        licenseKind: optionalString(validation.metadata['purpose']),
        message: 'Connected license is valid',
        meters: parseMeters(validation.metadata),
        mode: 'connected',
        telemetryProfile: optionalString(validation.metadata['telemetryProfile']),
      };
    } catch (error) {
      const cached = parseCachedValidation(state.validation_data_json);
      const graceHours = positiveNumber(cached?.metadata['offlineGraceHours']) ?? 72;
      const cacheMatches = state.license_key_fingerprint === keyFingerprint;
      const cachedLicenseExpiry = cached?.expiresAt
        ? new Date(cached.expiresAt).getTime()
        : Number.POSITIVE_INFINITY;
      const graceExpiresAt = state.last_validated_at
        ? Math.min(
            state.last_validated_at + graceHours * 60 * 60 * 1_000,
            cachedLicenseExpiry,
          )
        : 0;
      const mayUseOfflineGrace =
        error instanceof ConnectedLicenseError && error.retryable;
      if (
        mayUseOfflineGrace &&
        cacheMatches &&
        state.last_validated_at &&
        Date.now() <= graceExpiresAt
      ) {
        await this.repository.touchObservedTime();
        this.snapshot = {
          access: 'full',
          code: 'VALID_OFFLINE_GRACE',
          expiresAt: cached?.expiresAt ?? null,
          graceExpiresAt,
          lastValidatedAt: new Date(state.last_validated_at).toISOString(),
          licenseKind: optionalString(cached?.metadata['purpose']),
          message: 'Keygen is unavailable; using the connected license offline grace period',
          meters: parseMeters(cached?.metadata ?? {}),
          mode: 'connected',
          telemetryProfile: optionalString(cached?.metadata['telemetryProfile']),
        };
        return;
      }
      this.snapshot = {
        access: hasPriorValidation(state) ? 'restricted' : 'none',
        code: error instanceof ConnectedLicenseError
          ? error.code
          : 'CONNECTED_LICENSE_INVALID',
        expiresAt: null,
        graceExpiresAt: null,
        lastValidatedAt: state.last_validated_at
          ? new Date(state.last_validated_at).toISOString()
          : null,
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
    cached: ReturnType<typeof parseCachedValidation>;
    code: string;
    keyFingerprint: string;
    message: string;
    requireCheckInFreshness: boolean;
    state: Awaited<ReturnType<LicenseStateRepository['load']>>;
  }): boolean {
    const { cached, state } = input;
    if (
      !cached ||
      !state.last_validated_at ||
      state.license_key_fingerprint !== input.keyFingerprint
    ) return false;
    const now = Date.now();
    const checkInHours = positiveNumber(cached.metadata['checkInIntervalHours']) ?? 24;
    const graceHours = positiveNumber(cached.metadata['offlineGraceHours']) ?? 72;
    const licenseExpiry = cached.expiresAt
      ? new Date(cached.expiresAt).getTime()
      : Number.POSITIVE_INFINITY;
    const usableUntil = Math.min(
      state.last_validated_at + (
        input.requireCheckInFreshness ? checkInHours : graceHours
      ) * 60 * 60 * 1_000,
      licenseExpiry,
    );
    if (now > usableUntil) return false;
    this.snapshot = {
      access: 'full',
      code: input.code,
      expiresAt: cached.expiresAt,
      graceExpiresAt: Math.min(
        state.last_validated_at + graceHours * 60 * 60 * 1_000,
        licenseExpiry,
      ),
      lastValidatedAt: new Date(state.last_validated_at).toISOString(),
      licenseKind: optionalString(cached.metadata['purpose']),
      message: input.message,
      meters: parseMeters(cached.metadata),
      mode: 'connected',
      telemetryProfile: optionalString(cached.metadata['telemetryProfile']),
    };
    return true;
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

function hasPriorValidation(state: {
  last_validated_at: number | null;
  validation_data_json: string | null;
}): boolean {
  return state.last_validated_at !== null && state.validation_data_json !== null;
}

function cachedMeters(value: string | null): RuntimeMeterPolicy[] {
  return parseMeters(parseCachedValidation(value)?.metadata ?? {});
}

function cachedTelemetryProfile(value: string | null): string | null {
  return optionalString(parseCachedValidation(value)?.metadata['telemetryProfile']);
}

function cachedLicenseKind(value: string | null): string | null {
  return optionalString(parseCachedValidation(value)?.metadata['purpose']);
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

function parseCachedValidation(value: string | null): {
  expiresAt: string | null;
  metadata: Record<string, unknown>;
} | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    return {
      expiresAt: typeof record['expiresAt'] === 'string' ? record['expiresAt'] : null,
      metadata:
        record['metadata'] && typeof record['metadata'] === 'object' && !Array.isArray(record['metadata'])
          ? record['metadata'] as Record<string, unknown>
          : {},
    };
  } catch {
    return null;
  }
}

function parseCachedAirGap(value: string | null): {
  artifactExpiresAt: string | null;
  metadata: Record<string, unknown>;
} | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    return {
      artifactExpiresAt:
        typeof record['artifactExpiresAt'] === 'string' ? record['artifactExpiresAt'] : null,
      metadata:
        record['metadata'] && typeof record['metadata'] === 'object' && !Array.isArray(record['metadata'])
          ? record['metadata'] as Record<string, unknown>
          : {},
    };
  } catch {
    return null;
  }
}
