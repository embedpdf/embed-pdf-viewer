import { randomBytes } from 'node:crypto';

import type { Kysely } from 'kysely';
import { sql } from 'kysely';

import type { Database as Schema } from '../schema';

export interface ShareGrantRow {
  /** Doubles as the public share token (`shr_…`). */
  id: string;
  tenantId: string;
  docId: string;
  layerName: string;
  scope: ReadonlyArray<string>;
  /** Origin allowlist; null = any origin. */
  origins: ReadonlyArray<string> | null;
  /** scrypt envelope; null = no passphrase. The phrase itself never leaves this shape. */
  passwordHash: string | null;
  sessionTtlSeconds: number;
  disabled: boolean;
  expiresAt: number | null;
  exchangeCount: number;
  lastExchangedAt: number | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface ShareGrantCreateInput {
  tenantId: string;
  docId: string;
  layerName?: string;
  scope: ReadonlyArray<string>;
  origins?: ReadonlyArray<string>;
  passwordHash?: string;
  sessionTtlSeconds?: number;
  expiresAt?: number;
  createdBy: string;
}

export interface ShareGrantUpdateInput {
  scope?: ReadonlyArray<string>;
  /** null clears the allowlist (any origin). */
  origins?: ReadonlyArray<string> | null;
  /** null removes the passphrase. */
  passwordHash?: string | null;
  sessionTtlSeconds?: number;
  disabled?: boolean;
  /** null removes the expiry. */
  expiresAt?: number | null;
}

export interface ShareGrantListOptions {
  tenantId: string;
  docId?: string;
  limit?: number;
  /** Keyset cursor, same shape as the documents/tenants lists. */
  before?: { createdAt: number; id: string };
}

/** `shr_` + 24 url-safe chars ≈ 143 bits of randomness. */
export function newShareGrantId(): string {
  return `shr_${randomBytes(18).toString('base64url')}`;
}

/**
 * Share grants: the stored decisions behind the public embed flow.
 * Lookup by primary key IS the token check — a row that exists and is
 * enabled authorizes exchange; deleting the row is revocation.
 */
export class ShareGrantsRepo {
  constructor(private readonly db: Kysely<Schema>) {}

  async findById(id: string): Promise<ShareGrantRow | null> {
    const r = await this.db
      .selectFrom('share_grants')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return r ? mapRow(r) : null;
  }

  async create(input: ShareGrantCreateInput): Promise<ShareGrantRow> {
    const now = Date.now();
    const id = newShareGrantId();
    await this.db
      .insertInto('share_grants')
      .values({
        id,
        tenant_id: input.tenantId,
        doc_id: input.docId,
        layer_name: input.layerName ?? 'default',
        scope_json: JSON.stringify(input.scope),
        origins_json: input.origins ? JSON.stringify(input.origins) : null,
        password_hash: input.passwordHash ?? null,
        session_ttl_seconds: input.sessionTtlSeconds ?? 600,
        disabled: 0,
        expires_at: input.expiresAt ?? null,
        exchange_count: 0,
        last_exchanged_at: null,
        created_by: input.createdBy,
        created_at: now,
        updated_at: now,
      })
      .execute();
    const row = await this.findById(id);
    if (!row) throw new Error(`share_grants.create: row vanished after insert: ${id}`);
    return row;
  }

  /** Partial update; absent fields stay untouched. Returns null when the row is gone. */
  async update(
    id: string,
    tenantId: string,
    input: ShareGrantUpdateInput,
  ): Promise<ShareGrantRow | null> {
    const patch: Record<string, unknown> = { updated_at: Date.now() };
    if (input.scope !== undefined) patch['scope_json'] = JSON.stringify(input.scope);
    if (input.origins !== undefined) {
      patch['origins_json'] = input.origins === null ? null : JSON.stringify(input.origins);
    }
    if (input.passwordHash !== undefined) patch['password_hash'] = input.passwordHash;
    if (input.sessionTtlSeconds !== undefined) {
      patch['session_ttl_seconds'] = input.sessionTtlSeconds;
    }
    if (input.disabled !== undefined) patch['disabled'] = input.disabled ? 1 : 0;
    if (input.expiresAt !== undefined) patch['expires_at'] = input.expiresAt;
    const res = await this.db
      .updateTable('share_grants')
      .set(patch)
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .execute();
    if (Number(res[0]?.numUpdatedRows ?? 0) === 0) return null;
    return this.findById(id);
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const res = await this.db
      .deleteFrom('share_grants')
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .execute();
    return Number(res[0]?.numDeletedRows ?? 0) > 0;
  }

  async list(opts: ShareGrantListOptions): Promise<ShareGrantRow[]> {
    let q = this.db
      .selectFrom('share_grants')
      .selectAll()
      .where('tenant_id', '=', opts.tenantId)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc');
    if (opts.docId !== undefined) q = q.where('doc_id', '=', opts.docId);
    if (opts.before) {
      const { createdAt, id } = opts.before;
      q = q.where((eb) =>
        eb.or([
          eb('created_at', '<', createdAt),
          eb.and([eb('created_at', '=', createdAt), eb('id', '<', id)]),
        ]),
      );
    }
    if (opts.limit) q = q.limit(opts.limit);
    const rows = await q.execute();
    return rows.map(mapRow);
  }

  /** Bump the dashboard-convenience counters after a successful exchange. */
  async touchExchanged(id: string, now: number = Date.now()): Promise<void> {
    await this.db
      .updateTable('share_grants')
      .set({
        exchange_count: sql`exchange_count + 1`,
        last_exchanged_at: now,
        updated_at: now,
      })
      .where('id', '=', id)
      .execute();
  }

  async deleteByDoc(docId: string, tenantId: string): Promise<void> {
    await this.db
      .deleteFrom('share_grants')
      .where('doc_id', '=', docId)
      .where('tenant_id', '=', tenantId)
      .execute();
  }
}

function mapRow(r: {
  id: string;
  tenant_id: string;
  doc_id: string;
  layer_name: string;
  scope_json: string;
  origins_json: string | null;
  password_hash: string | null;
  session_ttl_seconds: number;
  disabled: number;
  expires_at: number | null;
  exchange_count: number;
  last_exchanged_at: number | null;
  created_by: string;
  created_at: number;
  updated_at: number;
}): ShareGrantRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    docId: r.doc_id,
    layerName: r.layer_name,
    scope: JSON.parse(r.scope_json) as string[],
    origins: r.origins_json ? (JSON.parse(r.origins_json) as string[]) : null,
    passwordHash: r.password_hash,
    sessionTtlSeconds: Number(r.session_ttl_seconds),
    disabled: Number(r.disabled) !== 0,
    expiresAt: r.expires_at === null ? null : Number(r.expires_at),
    exchangeCount: Number(r.exchange_count),
    lastExchangedAt: r.last_exchanged_at === null ? null : Number(r.last_exchanged_at),
    createdBy: r.created_by,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}
