import { randomBytes } from 'node:crypto';

import type { Identity } from '@embedpdf/engine-core/runtime';
import { DEFAULT_LAYER_NAME } from '@embedpdf/engine-core/wire';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

import type { VisitorIdentityConfig } from '../../auth/visitor-identity';
import type { Database as Schema } from '../schema';

export interface GrantRow {
  /** What a page holds to open it: `grt_…` (`shr_…` for grants made before the rename). */
  id: string;
  tenantId: string;
  docId: string;
  /** What it's called; null when unnamed. */
  name: string | null;
  layerMode: GrantLayerMode;
  /** The layer every visitor shares; null for a per-visitor grant. */
  layerName: string | null;
  /** A visitor's browser keeps its layer for the next visit (per-visitor grants). */
  keepVisitorLayers: boolean;
  /** Delete a visitor and their layer after this long unseen; null keeps them until deleted on purpose. */
  visitorIdleSeconds: number | null;
  /** What the grant asks its visitors; null asks nothing. */
  visitorIdentity: VisitorIdentityConfig | null;
  /** Who the grant's visitors are, when the grant says so: it prevails over their answers. */
  identity: Identity | null;
  scope: ReadonlyArray<string>;
  /** Origin allowlist; null = any origin. */
  origins: ReadonlyArray<string> | null;
  /** scrypt envelope; null = no passphrase. The phrase itself never leaves this shape. */
  passphraseHash: string | null;
  sessionTtlSeconds: number;
  disabled: boolean;
  /** Unix epoch ms the grant was archived: it exchanges no more, for good. Null while it works. */
  archivedAt: number | null;
  expiresAt: number | null;
  exchangeCount: number;
  lastExchangedAt: number | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

/** Whose layer a grant's visitors write into. */
export type GrantLayerMode = 'shared' | 'per-visitor';

export interface GrantCreateInput {
  tenantId: string;
  docId: string;
  name?: string | null;
  /** The shared layer, when `layerMode` is `'shared'` (the default). */
  layerName?: string;
  layerMode?: GrantLayerMode;
  keepVisitorLayers?: boolean;
  /** Omitted or null: visitors stay until deleted on purpose. */
  visitorIdleSeconds?: number | null;
  visitorIdentity?: VisitorIdentityConfig | null;
  identity?: Identity | null;
  scope: ReadonlyArray<string>;
  origins?: ReadonlyArray<string>;
  passphraseHash?: string;
  sessionTtlSeconds?: number;
  expiresAt?: number;
  createdBy: string;
}

export interface GrantUpdateInput {
  /** null removes the name. */
  name?: string | null;
  /** The mode and its layer move together: a shared grant names its layer, a per-visitor grant none. */
  layer?: { mode: 'shared'; name: string } | { mode: 'per-visitor' };
  keepVisitorLayers?: boolean;
  /** null stops deleting visitors who go unseen. */
  visitorIdleSeconds?: number | null;
  /** null stops asking visitors who they are. */
  visitorIdentity?: VisitorIdentityConfig | null;
  /** null: the visitors are whoever they answer. */
  identity?: Identity | null;
  scope?: ReadonlyArray<string>;
  /** null clears the allowlist (any origin). */
  origins?: ReadonlyArray<string> | null;
  /** null removes the passphrase. */
  passphraseHash?: string | null;
  sessionTtlSeconds?: number;
  disabled?: boolean;
  /** null removes the expiry. */
  expiresAt?: number | null;
}

export interface GrantListOptions {
  tenantId: string;
  docId?: string;
  /** true lists the archived grants only; otherwise only the ones that still work. */
  archived?: boolean;
  limit?: number;
  /** Keyset cursor, same shape as the documents/tenants lists. */
  before?: { createdAt: number; id: string };
}

/** `grt_` + 24 url-safe chars ≈ 143 bits of randomness. */
export function newGrantId(): string {
  return `grt_${randomBytes(18).toString('base64url')}`;
}

/**
 * Grants: the stored decisions behind the public embed flow.
 * Lookup by primary key is the token check — a row that exists and is
 * enabled authorizes exchange; deleting the row is revocation.
 */
export class GrantsRepo {
  constructor(private readonly db: Kysely<Schema>) {}

  async findById(id: string): Promise<GrantRow | null> {
    const r = await this.db
      .selectFrom('grants')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return r ? mapRow(r) : null;
  }

  async create(input: GrantCreateInput): Promise<GrantRow> {
    const now = Date.now();
    const id = newGrantId();
    await this.db
      .insertInto('grants')
      .values({
        id,
        tenant_id: input.tenantId,
        doc_id: input.docId,
        name: input.name ?? null,
        layer_mode: input.layerMode ?? 'shared',
        layer_name:
          (input.layerMode ?? 'shared') === 'shared'
            ? (input.layerName ?? DEFAULT_LAYER_NAME)
            : null,
        keep_visitor_layers: input.keepVisitorLayers === false ? 0 : 1,
        visitor_idle_seconds: input.visitorIdleSeconds ?? null,
        visitor_identity_json: input.visitorIdentity ? JSON.stringify(input.visitorIdentity) : null,
        identity_json: input.identity ? JSON.stringify(input.identity) : null,
        scope_json: JSON.stringify(input.scope),
        origins_json: input.origins ? JSON.stringify(input.origins) : null,
        passphrase_hash: input.passphraseHash ?? null,
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
    if (!row) throw new Error(`grants.create: row vanished after insert: ${id}`);
    return row;
  }

  /** Partial update; absent fields stay untouched. Returns null when the row is gone. */
  async update(id: string, tenantId: string, input: GrantUpdateInput): Promise<GrantRow | null> {
    const patch: Record<string, unknown> = { updated_at: Date.now() };
    if (input.name !== undefined) patch['name'] = input.name;
    if (input.layer !== undefined) {
      patch['layer_mode'] = input.layer.mode;
      patch['layer_name'] = input.layer.mode === 'shared' ? input.layer.name : null;
    }
    if (input.keepVisitorLayers !== undefined) {
      patch['keep_visitor_layers'] = input.keepVisitorLayers ? 1 : 0;
    }
    if (input.visitorIdentity !== undefined) {
      patch['visitor_identity_json'] =
        input.visitorIdentity === null ? null : JSON.stringify(input.visitorIdentity);
    }
    if (input.identity !== undefined) {
      patch['identity_json'] = input.identity === null ? null : JSON.stringify(input.identity);
    }
    if (input.visitorIdleSeconds !== undefined) {
      patch['visitor_idle_seconds'] = input.visitorIdleSeconds;
    }
    if (input.scope !== undefined) patch['scope_json'] = JSON.stringify(input.scope);
    if (input.origins !== undefined) {
      patch['origins_json'] = input.origins === null ? null : JSON.stringify(input.origins);
    }
    if (input.passphraseHash !== undefined) patch['passphrase_hash'] = input.passphraseHash;
    if (input.sessionTtlSeconds !== undefined) {
      patch['session_ttl_seconds'] = input.sessionTtlSeconds;
    }
    if (input.disabled !== undefined) patch['disabled'] = input.disabled ? 1 : 0;
    if (input.expiresAt !== undefined) patch['expires_at'] = input.expiresAt;
    const res = await this.db
      .updateTable('grants')
      .set(patch)
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .execute();
    if (Number(res[0]?.numUpdatedRows ?? 0) === 0) return null;
    return this.findById(id);
  }

  /**
   * End the grant for good: it exchanges no more, and keeps its row and what
   * its visitors made. Archiving an archived grant changes nothing. Returns
   * the row, or null when it is gone.
   */
  async archive(id: string, tenantId: string, now: number = Date.now()): Promise<GrantRow | null> {
    await this.db
      .updateTable('grants')
      .set({ archived_at: now, updated_at: now })
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .where('archived_at', 'is', null)
      .execute();
    const row = await this.findById(id);
    return row && row.tenantId === tenantId ? row : null;
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const res = await this.db
      .deleteFrom('grants')
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .execute();
    return Number(res[0]?.numDeletedRows ?? 0) > 0;
  }

  async list(opts: GrantListOptions): Promise<GrantRow[]> {
    let q = this.db
      .selectFrom('grants')
      .selectAll()
      .where('tenant_id', '=', opts.tenantId)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc');
    if (opts.docId !== undefined) q = q.where('doc_id', '=', opts.docId);
    q = q.where('archived_at', opts.archived ? 'is not' : 'is', null);
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

  /**
   * The working grants whose visitors land in the layer: deleting it would
   * leave them a dead grant. An archived grant gives no access any more.
   */
  async listByLayer(tenantId: string, docId: string, layerName: string): Promise<GrantRow[]> {
    const rows = await this.db
      .selectFrom('grants')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('doc_id', '=', docId)
      .where('layer_mode', '=', 'shared')
      .where('archived_at', 'is', null)
      .where('layer_name', '=', layerName)
      .execute();
    return rows.map(mapRow);
  }

  /** Bump the dashboard-convenience counters after a successful exchange. */
  async touchExchanged(id: string, now: number = Date.now()): Promise<void> {
    await this.db
      .updateTable('grants')
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
      .deleteFrom('grants')
      .where('doc_id', '=', docId)
      .where('tenant_id', '=', tenantId)
      .execute();
  }
}

function mapRow(r: {
  id: string;
  tenant_id: string;
  doc_id: string;
  name: string | null;
  layer_mode: GrantLayerMode;
  layer_name: string | null;
  keep_visitor_layers: number;
  visitor_idle_seconds: number | null;
  visitor_identity_json: string | null;
  identity_json: string | null;
  scope_json: string;
  origins_json: string | null;
  passphrase_hash: string | null;
  session_ttl_seconds: number;
  disabled: number;
  archived_at: number | null;
  expires_at: number | null;
  exchange_count: number;
  last_exchanged_at: number | null;
  created_by: string;
  created_at: number;
  updated_at: number;
}): GrantRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    docId: r.doc_id,
    name: r.name,
    layerMode: r.layer_mode,
    layerName: r.layer_name,
    keepVisitorLayers: Number(r.keep_visitor_layers) !== 0,
    visitorIdleSeconds: r.visitor_idle_seconds === null ? null : Number(r.visitor_idle_seconds),
    visitorIdentity: r.visitor_identity_json
      ? (JSON.parse(r.visitor_identity_json) as VisitorIdentityConfig)
      : null,
    identity: r.identity_json ? (JSON.parse(r.identity_json) as Identity) : null,
    scope: JSON.parse(r.scope_json) as string[],
    origins: r.origins_json ? (JSON.parse(r.origins_json) as string[]) : null,
    passphraseHash: r.passphrase_hash,
    sessionTtlSeconds: Number(r.session_ttl_seconds),
    disabled: Number(r.disabled) !== 0,
    archivedAt: r.archived_at === null ? null : Number(r.archived_at),
    expiresAt: r.expires_at === null ? null : Number(r.expires_at),
    exchangeCount: Number(r.exchange_count),
    lastExchangedAt: r.last_exchanged_at === null ? null : Number(r.last_exchanged_at),
    createdBy: r.created_by,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}
