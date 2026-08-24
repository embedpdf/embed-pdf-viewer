import type { Kysely, Selectable, Transaction } from 'kysely';
import type { AuditExportStatus, Database as Schema } from '../schema';

export type { AuditExportStatus } from '../schema';

export interface AuditExportScope {
  tenantId: string;
  docId: string;
  day: string;
}

export interface AuditExportRow extends AuditExportScope {
  id: number;
  status: AuditExportStatus;
  storageKey: string | null;
  eventCount: number;
  checksum: string | null;
  leaseId: string | null;
  leaseExpiresAt: number | null;
  startedAt: number;
  finishedAt: number | null;
  error: unknown | null;
  updatedAt: number;
}

export type AuditExportClaimResult =
  | { status: 'claimed'; row: AuditExportRow }
  | { status: 'already-succeeded'; row: AuditExportRow }
  | { status: 'already-running'; row: AuditExportRow };

type DbExecutor = Kysely<Schema> | Transaction<Schema>;

export class AuditExportsRepo {
  constructor(private readonly db: DbExecutor) {}

  async claim(
    input: AuditExportScope & {
      leaseId: string;
      leaseExpiresAt: number;
      now: number;
      force?: boolean;
    },
  ): Promise<AuditExportClaimResult> {
    const existing = await this.find(input);
    if (existing) {
      if (!input.force && existing.status === 'succeeded') {
        return { status: 'already-succeeded', row: existing };
      }
      if (
        !input.force &&
        existing.status === 'running' &&
        existing.leaseExpiresAt !== null &&
        existing.leaseExpiresAt > input.now
      ) {
        return { status: 'already-running', row: existing };
      }
      await this.db
        .updateTable('audit_exports')
        .set({
          status: 'running',
          storage_key: null,
          event_count: 0,
          checksum: null,
          lease_id: input.leaseId,
          lease_expires_at: input.leaseExpiresAt,
          started_at: input.now,
          finished_at: null,
          error_json: null,
          updated_at: input.now,
        })
        .where('tenant_id', '=', input.tenantId)
        .where('doc_id', '=', input.docId)
        .where('day', '=', input.day)
        .execute();
      return { status: 'claimed', row: (await this.find(input))! };
    }

    try {
      await this.db
        .insertInto('audit_exports')
        .values({
          tenant_id: input.tenantId,
          doc_id: input.docId,
          day: input.day,
          status: 'running',
          storage_key: null,
          event_count: 0,
          checksum: null,
          lease_id: input.leaseId,
          lease_expires_at: input.leaseExpiresAt,
          started_at: input.now,
          finished_at: null,
          error_json: null,
          updated_at: input.now,
        })
        .execute();
      return { status: 'claimed', row: (await this.find(input))! };
    } catch (err) {
      if (!isUniqueViolation(err)) {
        throw err;
      }
      return this.claim(input);
    }
  }

  async markSucceeded(
    input: AuditExportScope & {
      leaseId: string;
      now: number;
      storageKey: string;
      eventCount: number;
      checksum: string;
    },
  ): Promise<void> {
    await this.db
      .updateTable('audit_exports')
      .set({
        status: 'succeeded',
        storage_key: input.storageKey,
        event_count: input.eventCount,
        checksum: input.checksum,
        lease_id: null,
        lease_expires_at: null,
        finished_at: input.now,
        error_json: null,
        updated_at: input.now,
      })
      .where('tenant_id', '=', input.tenantId)
      .where('doc_id', '=', input.docId)
      .where('day', '=', input.day)
      .where('lease_id', '=', input.leaseId)
      .execute();
  }

  async markFailed(
    input: AuditExportScope & {
      leaseId: string;
      now: number;
      error: unknown;
    },
  ): Promise<void> {
    await this.db
      .updateTable('audit_exports')
      .set({
        status: 'failed',
        lease_id: null,
        lease_expires_at: null,
        finished_at: input.now,
        error_json: JSON.stringify(toErrorJson(input.error)),
        updated_at: input.now,
      })
      .where('tenant_id', '=', input.tenantId)
      .where('doc_id', '=', input.docId)
      .where('day', '=', input.day)
      .where('lease_id', '=', input.leaseId)
      .execute();
  }

  async find(input: AuditExportScope): Promise<AuditExportRow | null> {
    const row = await this.db
      .selectFrom('audit_exports')
      .selectAll()
      .where('tenant_id', '=', input.tenantId)
      .where('doc_id', '=', input.docId)
      .where('day', '=', input.day)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }
}

function toRow(row: Selectable<Schema['audit_exports']>): AuditExportRow {
  return {
    id: Number(row.id),
    tenantId: row.tenant_id,
    docId: row.doc_id,
    day: row.day,
    status: row.status,
    storageKey: row.storage_key,
    eventCount: Number(row.event_count),
    checksum: row.checksum,
    leaseId: row.lease_id,
    leaseExpiresAt: row.lease_expires_at === null ? null : Number(row.lease_expires_at),
    startedAt: Number(row.started_at),
    finishedAt: row.finished_at === null ? null : Number(row.finished_at),
    error: row.error_json ? (JSON.parse(row.error_json) as unknown) : null,
    updatedAt: Number(row.updated_at),
  };
}

function toErrorJson(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

function isUniqueViolation(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  return err.code === '23505' || /unique/i.test(err.message ?? '');
}
