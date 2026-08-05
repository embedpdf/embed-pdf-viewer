/**
 * @license FCL-1.0-ALv2
 *
 * WARNING: This file is part of CloudPDF's license-key functionality. Removing
 * or modifying this code to disable or circumvent license enforcement, enable
 * protected functionality without a valid license key, or remove protected
 * functionality is a breach of FCL-1.0-ALv2 while this release is governed by
 * that license. See cloudpdf/server/LICENSE.md.
 */
import { randomUUID } from 'node:crypto';

import type { Kysely, Selectable } from 'kysely';

import type { LicenseUsageSnapshot } from './UsageMeters';
import { UsageMeters } from './UsageMeters';
import { parseSecretRefUri } from '../config/secrets/parseSecretRefUri';
import type { Database, LicenseReportingStateTable } from '../db/schema';
import type { SecretResolver } from '../security/secrets/SecretResolver';

const productionControlPlaneUrl = 'https://api.cloudpdf.com';

interface UsageReportPayload extends LicenseUsageSnapshot {
  installationId: string;
  sequence: number;
}

interface PendingReport {
  licenseId: string;
  payload: UsageReportPayload;
}

export interface ConnectedReporterStatus {
  lastAttemptAt: string | null;
  lastError: string | null;
  lastStatus: 'never' | 'success' | 'failed';
  lastSuccessAt: string | null;
  pendingReport: PendingReport | null;
  sequence: number;
}

type ReportingState = Selectable<LicenseReportingStateTable>;

/**
 * Sends cumulative, aggregated deployment usage to CloudPDF. This class is
 * constructed only for connected licenses; the air-gapped boot path never
 * resolves a reporting credential and never creates an outbound timer.
 */
export class ConnectedUsageReporter {
  private readonly ownerId = randomUUID();
  private timer?: NodeJS.Timeout;

  private constructor(
    private readonly db: Kysely<Database>,
    private readonly meters: UsageMeters,
    private readonly cloudPdfLicenseId: string,
    private readonly controlPlaneUrl: string,
    private readonly reportingToken: string,
  ) {}

  static async create(input: {
    cloudPdfLicenseId: string;
    db: Kysely<Database>;
    meters: UsageMeters;
    reportingToken?: string;
    secretResolver?: SecretResolver;
  }): Promise<ConnectedUsageReporter> {
    return this.createWithControlPlane(input, productionControlPlaneUrl);
  }

  /** Internal test seam. Not exported by the npm package. */
  static async createForTesting(input: {
    cloudPdfLicenseId: string;
    controlPlaneUrl: string;
    db: Kysely<Database>;
    meters: UsageMeters;
    reportingToken?: string;
    secretResolver?: SecretResolver;
  }): Promise<ConnectedUsageReporter> {
    return this.createWithControlPlane(
      input,
      requireHttpsUrl(input.controlPlaneUrl.trim(), 'controlPlaneUrl'),
    );
  }

  private static async createWithControlPlane(
    input: {
      cloudPdfLicenseId: string;
      db: Kysely<Database>;
      meters: UsageMeters;
      reportingToken?: string;
      secretResolver?: SecretResolver;
    },
    controlPlaneUrl: string,
  ): Promise<ConnectedUsageReporter> {
    const reportingToken = await resolveSecret(
      input.reportingToken,
      input.secretResolver,
      'CLOUDPDF_LICENSE_REPORTING_TOKEN',
    );
    const cloudPdfLicenseId = input.cloudPdfLicenseId.trim();
    if (!cloudPdfLicenseId) {
      throw new Error('A signed CloudPDF reporting license ID is required');
    }
    return new ConnectedUsageReporter(
      input.db,
      input.meters,
      cloudPdfLicenseId,
      controlPlaneUrl,
      reportingToken,
    );
  }

  start(intervalMs = 5 * 60 * 1_000): void {
    void this.reportNow().catch(() => undefined);
    this.timer = setInterval(() => {
      void this.reportNow().catch(() => undefined);
    }, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async reportNow(): Promise<boolean> {
    if (!(await this.acquireLease('usage-report', 60_000))) return false;
    try {
      const pending = await this.pendingReport();
      await this.markAttempt();
      const response = await postWithRetry(
        `${this.controlPlaneUrl}/v1/licenses/${encodeURIComponent(pending.licenseId)}/usage`,
        this.reportingToken,
        pending.payload,
      );
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new Error(
          `CloudPDF usage endpoint returned ${response.status}${detail ? `: ${detail}` : ''}`,
        );
      }
      await this.markSuccess(pending.payload.sequence);
      return true;
    } catch (error) {
      await this.markFailure(error);
      throw error;
    } finally {
      await this.releaseLease('usage-report');
    }
  }

  async status(): Promise<ConnectedReporterStatus> {
    const state = await this.getOrCreateReportingState();
    return {
      lastAttemptAt: isoOrNull(state.last_attempt_at),
      lastError: state.last_error,
      lastStatus: state.last_status,
      lastSuccessAt: isoOrNull(state.last_success_at),
      pendingReport: parsePending(state.pending_payload_json),
      sequence: Number(state.sequence),
    };
  }

  private async pendingReport(): Promise<PendingReport> {
    const state = await this.getOrCreateReportingState();
    const existing = parsePending(state.pending_payload_json);
    if (existing) {
      if (existing.licenseId === this.cloudPdfLicenseId) return existing;
      const corrected = { ...existing, licenseId: this.cloudPdfLicenseId };
      await this.db
        .updateTable('license_reporting_state')
        .set({ pending_payload_json: JSON.stringify(corrected), updated_at: Date.now() })
        .where('singleton_id', '=', 1)
        .executeTakeFirstOrThrow();
      return corrected;
    }

    const runtime = await this.db
      .selectFrom('license_runtime_state')
      .select('deployment_id')
      .where('singleton_id', '=', 1)
      .executeTakeFirstOrThrow();
    const sequence = Number(state.sequence) + 1;
    if (!Number.isSafeInteger(sequence)) {
      throw new Error('License usage sequence exceeded JavaScript safe integer range');
    }
    const pending: PendingReport = {
      licenseId: this.cloudPdfLicenseId,
      payload: {
        ...(await this.meters.snapshot()),
        installationId: runtime.deployment_id,
        sequence,
      },
    };
    const now = Date.now();
    await this.db
      .updateTable('license_reporting_state')
      .set({
        pending_payload_json: JSON.stringify(pending),
        sequence,
        updated_at: now,
      })
      .where('singleton_id', '=', 1)
      .executeTakeFirstOrThrow();
    return pending;
  }

  private async getOrCreateReportingState(): Promise<ReportingState> {
    const now = Date.now();
    await this.db
      .insertInto('license_reporting_state')
      .values({
        singleton_id: 1,
        sequence: 0,
        pending_payload_json: null,
        last_attempt_at: null,
        last_success_at: null,
        last_status: 'never',
        last_error: null,
        updated_at: now,
      })
      .onConflict((conflict) => conflict.column('singleton_id').doNothing())
      .execute();
    return this.db
      .selectFrom('license_reporting_state')
      .selectAll()
      .where('singleton_id', '=', 1)
      .executeTakeFirstOrThrow();
  }

  private async markAttempt(): Promise<void> {
    const now = Date.now();
    await this.db
      .updateTable('license_reporting_state')
      .set({ last_attempt_at: now, updated_at: now })
      .where('singleton_id', '=', 1)
      .executeTakeFirstOrThrow();
  }

  private async markSuccess(sequence: number): Promise<void> {
    const now = Date.now();
    await this.db
      .updateTable('license_reporting_state')
      .set({
        last_error: null,
        last_status: 'success',
        last_success_at: now,
        pending_payload_json: null,
        updated_at: now,
      })
      .where('singleton_id', '=', 1)
      .where('sequence', '=', sequence)
      .executeTakeFirstOrThrow();
  }

  private async markFailure(error: unknown): Promise<void> {
    const now = Date.now();
    await this.getOrCreateReportingState();
    await this.db
      .updateTable('license_reporting_state')
      .set({
        last_error:
          error instanceof Error ? error.message.slice(0, 1_000) : String(error).slice(0, 1_000),
        last_status: 'failed',
        updated_at: now,
      })
      .where('singleton_id', '=', 1)
      .executeTakeFirstOrThrow();
  }

  private async acquireLease(name: string, durationMs: number): Promise<boolean> {
    const now = Date.now();
    await this.db
      .insertInto('license_operation_lease')
      .values({
        name,
        owner_id: this.ownerId,
        expires_at: now,
        updated_at: now,
      })
      .onConflict((conflict) => conflict.column('name').doNothing())
      .execute();
    const result = await this.db
      .updateTable('license_operation_lease')
      .set({
        owner_id: this.ownerId,
        expires_at: now + durationMs,
        updated_at: now,
      })
      .where('name', '=', name)
      .where((expression) =>
        expression.or([
          expression('owner_id', '=', this.ownerId),
          expression('expires_at', '<=', now),
        ]),
      )
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }

  private async releaseLease(name: string): Promise<void> {
    await this.db
      .deleteFrom('license_operation_lease')
      .where('name', '=', name)
      .where('owner_id', '=', this.ownerId)
      .execute();
  }
}

async function postWithRetry(
  url: string,
  token: string,
  payload: UsageReportPayload,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        body: JSON.stringify(payload),
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status < 500 || attempt === 2) return response;
      lastError = new Error(`CloudPDF usage endpoint returned ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw lastError;
}

async function resolveSecret(
  raw: string | undefined,
  resolver: SecretResolver | undefined,
  name: string,
): Promise<string> {
  const value = raw?.trim();
  if (!value) throw new Error(`${name} is required for connected usage reporting`);
  if (!value.startsWith('secret://')) return value;
  if (!resolver) throw new Error(`A SecretResolver is required when ${name} is a secret:// URI`);
  const resolved = await resolver.resolve({
    reportingToken: { as: 'string', ref: parseSecretRefUri(value) },
  });
  if (!resolved.reportingToken.trim()) throw new Error(`${name} resolved to an empty secret`);
  return resolved.reportingToken.trim();
}

function requireHttpsUrl(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required for connected usage reporting`);
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new Error(`${name} must use https`);
  }
  return url.toString().replace(/\/$/, '');
}

function parsePending(value: string | null): PendingReport | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as PendingReport;
    if (
      !parsed ||
      typeof parsed.licenseId !== 'string' ||
      !parsed.payload ||
      !Number.isSafeInteger(parsed.payload.sequence)
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}

function isoOrNull(value: number | null): string | null {
  return value === null ? null : new Date(Number(value)).toISOString();
}
