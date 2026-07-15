import type { Kysely, Transaction } from 'kysely';
import type { Database as Schema } from '../schema';

export type AuditMutationKind =
  | 'annot.create'
  | 'annot.update'
  | 'annot.delete'
  | 'annot.move'
  | 'pages.move'
  | 'pages.rotate'
  | 'pages.delete'
  | 'pages.flatten'
  | 'metadata.update'
  | 'form.setValue'
  | 'form.reset'
  | 'form.import'
  | 'form.repair'
  | 'form.createField'
  | 'form.updateField'
  | 'form.deleteField'
  | 'form.attachWidget'
  | 'form.detachWidget'
  | 'form.applyEffects';

export interface AppendAuditLogInput {
  tenantId: string;
  docId: string;
  layerId: string;
  layerName: string;
  ts: number;
  sub: string;
  kind: AuditMutationKind;
  pageObjectNumber: number | null;
  affectedPages: number[];
  artifactVersion: number;
  artifactKey: string;
  artifactSha: string;
  artifactSize: number;
  idempotencyKey?: string | null;
  payload: unknown;
  /** Engine-instance session id of the mutating client (X-Engine-Session-Id).
   *  SSE subscribers drop rows whose origin matches their own session — their
   *  local publish already covered them (exactly-once). */
  originSessionId?: string | null;
}

export interface AuditLogRow extends AppendAuditLogInput {
  id: number;
}

export interface AuditDocKey {
  tenantId: string;
  docId: string;
}

type DbExecutor = Kysely<Schema> | Transaction<Schema>;

export class AuditLogRepo {
  constructor(private readonly db: DbExecutor) {}

  /** Append one event row and return its monotonic id — the same-transaction
   *  caller advances `layers.last_audit_id` with it and the realtime bus
   *  signals it after commit. */
  async append(input: AppendAuditLogInput): Promise<number> {
    const row = await this.db
      .insertInto('audit_log')
      .values({
        tenant_id: input.tenantId,
        doc_id: input.docId,
        layer_id: input.layerId,
        layer_name: input.layerName,
        ts: input.ts,
        sub: input.sub,
        kind: input.kind,
        page_object_number: input.pageObjectNumber,
        affected_pages_json: JSON.stringify(input.affectedPages),
        artifact_version: input.artifactVersion,
        artifact_key: input.artifactKey,
        artifact_sha: input.artifactSha,
        artifact_size: input.artifactSize,
        idempotency_key: input.idempotencyKey ?? null,
        payload_json: JSON.stringify(input.payload),
        origin_session_id: input.originSessionId ?? null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return Number(row.id);
  }

  async findForDocTimeRange(input: {
    tenantId: string;
    docId: string;
    startTs: number;
    endTs: number;
  }): Promise<AuditLogRow[]> {
    const rows = await this.db
      .selectFrom('audit_log')
      .selectAll()
      .where('tenant_id', '=', input.tenantId)
      .where('doc_id', '=', input.docId)
      .where('ts', '>=', input.startTs)
      .where('ts', '<', input.endTs)
      .orderBy('ts', 'asc')
      .orderBy('id', 'asc')
      .execute();
    return rows.map(mapAuditRow);
  }

  /**
   * The realtime backfill/drain query: every row for a doc+layer strictly
   * after `afterId`, oldest first, capped. The SSE handler calls this on
   * every doorbell ring and on connect with the client's `Last-Event-ID`.
   */
  async findSince(input: {
    tenantId: string;
    docId: string;
    layerName: string;
    afterId: number;
    limit: number;
  }): Promise<AuditLogRow[]> {
    const rows = await this.db
      .selectFrom('audit_log')
      .selectAll()
      .where('tenant_id', '=', input.tenantId)
      .where('doc_id', '=', input.docId)
      .where('layer_name', '=', input.layerName)
      .where('id', '>', input.afterId)
      .orderBy('id', 'asc')
      .limit(input.limit)
      .execute();
    return rows.map(mapAuditRow);
  }

  async findDocKeysForTimeRange(input: { startTs: number; endTs: number }): Promise<AuditDocKey[]> {
    const rows = await this.db
      .selectFrom('audit_log')
      .select(['tenant_id', 'doc_id'])
      .where('ts', '>=', input.startTs)
      .where('ts', '<', input.endTs)
      .groupBy(['tenant_id', 'doc_id'])
      .orderBy('tenant_id', 'asc')
      .orderBy('doc_id', 'asc')
      .execute();
    return rows.map((row) => ({
      tenantId: row.tenant_id,
      docId: row.doc_id,
    }));
  }
}

function parseNumberArray(json: string): number[] {
  const value = JSON.parse(json) as unknown;
  return Array.isArray(value) ? value.map((item) => Number(item)) : [];
}

interface AuditLogDbRow {
  id: number | bigint;
  tenant_id: string;
  doc_id: string;
  layer_id: string;
  layer_name: string;
  ts: number | bigint;
  sub: string;
  kind: string;
  page_object_number: number | bigint | null;
  affected_pages_json: string;
  artifact_version: number | bigint;
  artifact_key: string;
  artifact_sha: string;
  artifact_size: number | bigint;
  idempotency_key: string | null;
  payload_json: string;
  origin_session_id: string | null;
}

function mapAuditRow(row: AuditLogDbRow): AuditLogRow {
  return {
    id: Number(row.id),
    tenantId: row.tenant_id,
    docId: row.doc_id,
    layerId: row.layer_id,
    layerName: row.layer_name,
    ts: Number(row.ts),
    sub: row.sub,
    kind: row.kind as AuditMutationKind,
    pageObjectNumber: row.page_object_number === null ? null : Number(row.page_object_number),
    affectedPages: parseNumberArray(row.affected_pages_json),
    artifactVersion: Number(row.artifact_version),
    artifactKey: row.artifact_key,
    artifactSha: row.artifact_sha,
    artifactSize: Number(row.artifact_size),
    idempotencyKey: row.idempotency_key,
    originSessionId: row.origin_session_id ?? null,
    payload: JSON.parse(row.payload_json) as unknown,
  };
}
