import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import type { Kysely, Transaction } from 'kysely';
import {
  AuditLogRepo,
  type AuditDocKey,
  type AppendAuditLogInput,
  type AuditLogRow,
} from '../db/repos/audit_log.repo';
import { AuditExportsRepo, type AuditExportClaimResult } from '../db/repos/audit_exports.repo';
import type { Database as Schema } from '../db/schema';
import type { ObjectStore } from '../storage/ObjectStore';
import { StorageKeys } from '../storage/keys';

export type AuditEvent = AppendAuditLogInput;

export interface EventLogServiceOptions {
  storage?: ObjectStore;
}

export interface ExportDocDayInput {
  tenantId: string;
  docId: string;
  day: string;
  /**
   * Default false. Normal exports are closed-day only so the archive is
   * complete and immutable. This exists for tests / manual debugging.
   */
  allowOpenDay?: boolean;
  /** Default false. Rebuilds a previously-succeeded archive. */
  force?: boolean;
  /** Safety lag after UTC midnight before a day is considered closed. */
  closedDayLagMs?: number;
  /** Test hook / deterministic jobs. */
  now?: number;
  /** DB lease duration for this export claim. Defaults to 15 minutes. */
  leaseMs?: number;
}

export interface ExportDocDayResult {
  key: string;
  count: number;
  status: 'exported' | 'already-succeeded' | 'already-running' | 'empty';
}

export interface ExportDayInput {
  day: string;
  allowOpenDay?: boolean;
  force?: boolean;
  closedDayLagMs?: number;
  now?: number;
  leaseMs?: number;
}

export interface ExportDayResult {
  day: string;
  targets: number;
  exported: number;
  skipped: number;
  alreadyRunning: number;
  empty: number;
  results: ExportDocDayResult[];
}

type DbExecutor = Kysely<Schema> | Transaction<Schema>;

/**
 * Audit is intentionally split:
 *   - DB row: transactional operational index, written on mutation.
 *   - JSONL object: explicit batch archive exported from DB rows.
 */
export class EventLogService {
  private readonly storage?: ObjectStore;

  constructor(opts: EventLogServiceOptions = {}) {
    this.storage = opts.storage;
  }

  /** Append inside the caller's transaction; returns the row's monotonic id
   *  (the realtime cursor — see `layers.last_audit_id`). */
  async appendDb(db: DbExecutor, event: AuditEvent): Promise<number> {
    return new AuditLogRepo(db).append(event);
  }

  async exportDocDayJsonl(
    db: Kysely<Schema>,
    input: ExportDocDayInput,
  ): Promise<ExportDocDayResult> {
    if (!this.storage) {
      throw new Error('EventLogService.exportDocDayJsonl: storage is not configured');
    }
    validateDay(input.day);
    assertClosedDay(input.day, {
      now: input.now ?? Date.now(),
      allowOpenDay: input.allowOpenDay ?? false,
      closedDayLagMs: input.closedDayLagMs ?? 30 * 60 * 1000,
    });
    const leaseId = randomUUID();
    const now = input.now ?? Date.now();
    const claim = await new AuditExportsRepo(db).claim({
      tenantId: input.tenantId,
      docId: input.docId,
      day: input.day,
      leaseId,
      now,
      leaseExpiresAt: now + (input.leaseMs ?? 15 * 60 * 1000),
      force: input.force ?? false,
    });
    if (claim.status !== 'claimed') {
      return resultFromClaim(claim);
    }

    const [startTs, endTs] = dayRangeUtc(input.day);
    const key = StorageKeys.eventsDay(input.tenantId, input.docId, input.day);
    try {
      const rows = await new AuditLogRepo(db).findForDocTimeRange({
        tenantId: input.tenantId,
        docId: input.docId,
        startTs,
        endTs,
      });
      const body = Buffer.from(
        rows.length === 0
          ? ''
          : rows.map((row) => JSON.stringify(toJsonlEvent(row))).join('\n') + '\n',
      );
      const checksum = createHash('sha256').update(body).digest('hex');
      if (rows.length > 0) {
        await this.storage.put(key, body, {
          contentLength: body.byteLength,
          contentType: 'application/x-ndjson',
        });
      }
      await new AuditExportsRepo(db).markSucceeded({
        tenantId: input.tenantId,
        docId: input.docId,
        day: input.day,
        leaseId,
        now: Date.now(),
        storageKey: key,
        eventCount: rows.length,
        checksum,
      });
      return {
        key,
        count: rows.length,
        status: rows.length === 0 ? 'empty' : 'exported',
      };
    } catch (err) {
      await new AuditExportsRepo(db).markFailed({
        tenantId: input.tenantId,
        docId: input.docId,
        day: input.day,
        leaseId,
        now: Date.now(),
        error: err,
      });
      throw err;
    }
  }

  async exportDayJsonl(db: Kysely<Schema>, input: ExportDayInput): Promise<ExportDayResult> {
    validateDay(input.day);
    assertClosedDay(input.day, {
      now: input.now ?? Date.now(),
      allowOpenDay: input.allowOpenDay ?? false,
      closedDayLagMs: input.closedDayLagMs ?? 30 * 60 * 1000,
    });
    const [startTs, endTs] = dayRangeUtc(input.day);
    const targets: AuditDocKey[] = await new AuditLogRepo(db).findDocKeysForTimeRange({
      startTs,
      endTs,
    });
    const results: ExportDocDayResult[] = [];
    for (const target of targets) {
      results.push(
        await this.exportDocDayJsonl(db, {
          ...target,
          day: input.day,
          allowOpenDay: true,
          force: input.force,
          closedDayLagMs: input.closedDayLagMs,
          now: input.now,
          leaseMs: input.leaseMs,
        }),
      );
    }
    const alreadyRunning = results.filter((result) => result.status === 'already-running').length;
    return {
      day: input.day,
      targets: targets.length,
      exported: results.filter((result) => result.status === 'exported').length,
      skipped:
        results.filter((result) => result.status === 'already-succeeded').length + alreadyRunning,
      alreadyRunning,
      empty: results.filter((result) => result.status === 'empty').length,
      results,
    };
  }
}

export function toJsonlEvent(event: AuditLogRow): Record<string, unknown> {
  return {
    id: event.id,
    ts: event.ts,
    tenantId: event.tenantId,
    docId: event.docId,
    layerId: event.layerId,
    layerName: event.layerName,
    sub: event.sub,
    kind: event.kind,
    pageObjectNumber: event.pageObjectNumber,
    affectedPages: event.affectedPages,
    artifactVersion: event.artifactVersion,
    artifactKey: event.artifactKey,
    artifactSha: event.artifactSha,
    artifactSize: event.artifactSize,
    idempotencyKey: event.idempotencyKey ?? null,
    originSessionId: event.originSessionId ?? null,
    payload: event.payload,
  };
}

function validateDay(day: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error(`EventLogService.exportDocDayJsonl: bad YYYY-MM-DD "${day}"`);
  }
}

function dayRangeUtc(day: string): [number, number] {
  const start = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(start)) {
    throw new Error(`EventLogService.exportDocDayJsonl: invalid day "${day}"`);
  }
  return [start, start + 24 * 60 * 60 * 1000];
}

function assertClosedDay(
  day: string,
  opts: { now: number; allowOpenDay: boolean; closedDayLagMs: number },
): void {
  if (opts.allowOpenDay) {
    return;
  }
  const [, endTs] = dayRangeUtc(day);
  if (opts.now < endTs + opts.closedDayLagMs) {
    throw new Error(
      `EventLogService.exportDocDayJsonl: cannot export open audit day ${day}; ` +
        'run a closed day such as yesterday, or pass allowOpenDay for debugging',
    );
  }
}

function resultFromClaim(
  claim: Exclude<AuditExportClaimResult, { status: 'claimed' }>,
): ExportDocDayResult {
  return {
    key:
      claim.row.storageKey ??
      StorageKeys.eventsDay(claim.row.tenantId, claim.row.docId, claim.row.day),
    count: claim.row.eventCount,
    status: claim.status,
  };
}
