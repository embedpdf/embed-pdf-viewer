import type { Kysely } from 'kysely';
import type { Database as Schema } from '../schema';

export interface TenantRow {
  id: string;
  name: string;
  config: Record<string, unknown> | null;
  /** True when the namespace materialized on first use rather than via explicit create. */
  autoProvisioned: boolean;
  createdAt: number;
}

export interface TenantListOptions {
  limit?: number;
  /**
   * Keyset cursor: only rows strictly after this (created_at, id)
   * position in `created_at DESC, id DESC` order — same shape as the
   * documents list.
   */
  before?: { createdAt: number; id: string };
}

/**
 * Tenants are the isolation boundary. Rows arrive two ways, both
 * first-class: explicit create (`tenants.create`, ensure-style) and
 * auto-provision on first use (`CLOUDPDF_AUTO_PROVISION_TENANT`) —
 * `auto_provisioned` records which, so the list can audit namespaces
 * that materialized from typos instead of hiding them.
 */
export class TenantsRepo {
  constructor(private readonly db: Kysely<Schema>) {}

  async findById(id: string): Promise<TenantRow | null> {
    const r = await this.db
      .selectFrom('tenants')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return r ? mapRow(r) : null;
  }

  /**
   * Insert if absent. Returns the row. Race-safe via ON CONFLICT DO
   * NOTHING (both dialects).
   */
  async ensure(input: {
    id: string;
    name?: string;
    autoProvisioned?: boolean;
  }): Promise<TenantRow> {
    const existing = await this.findById(input.id);
    if (existing) return existing;
    await this.db
      .insertInto('tenants')
      .values({
        id: input.id,
        name: input.name ?? input.id,
        config_json: null,
        created_at: Date.now(),
        auto_provisioned: input.autoProvisioned ? 1 : 0,
      })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute();
    const row = await this.findById(input.id);
    if (!row) throw new Error(`tenants.ensure: row vanished after insert: ${input.id}`);
    return row;
  }

  /**
   * Explicit ensure-style create. `created: false` means the tenant
   * already existed (its record — including a pre-existing
   * auto_provisioned marker — is returned untouched). Two racing
   * creates may both report `created: true`; harmless under ensure
   * semantics.
   */
  async ensureExplicit(input: {
    id: string;
    name?: string;
  }): Promise<{ tenant: TenantRow; created: boolean }> {
    const existing = await this.findById(input.id);
    if (existing) return { tenant: existing, created: false };
    const tenant = await this.ensure({ ...input, autoProvisioned: false });
    return { tenant, created: true };
  }

  async list(opts: TenantListOptions = {}): Promise<TenantRow[]> {
    let q = this.db
      .selectFrom('tenants')
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc');
    if (opts.before) {
      const { createdAt, id } = opts.before;
      // OR-spelled keyset comparison, planned against idx_tenants_created_id.
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
   * Remove every DB row in the tenant's namespace, children before
   * parents, ending with the tenant row itself. Storage bytes are the
   * caller's job (one `deletePrefix(tenantRoot)` sweep) — kept out of
   * the repo so the DB pass stays retryable if the sweep fails.
   * Returns false when the tenant row did not exist.
   */
  async deleteCascadeDb(tenantId: string): Promise<boolean> {
    const existing = await this.findById(tenantId);

    await this.db
      .deleteFrom('weak_annotation_session_pages')
      .where('session_id', 'in', (eb) =>
        eb.selectFrom('weak_annotation_sessions').select('id').where('tenant_id', '=', tenantId),
      )
      .execute();
    await this.db
      .deleteFrom('weak_annotation_sessions')
      .where('tenant_id', '=', tenantId)
      .execute();
    await this.db
      .deleteFrom('layer_pages')
      .where('layer_id', 'in', (eb) =>
        eb.selectFrom('layers').select('id').where('tenant_id', '=', tenantId),
      )
      .execute();
    await this.db.deleteFrom('layers').where('tenant_id', '=', tenantId).execute();
    await this.db
      .deleteFrom('document_pages')
      .where('doc_id', 'in', (eb) =>
        eb.selectFrom('documents').select('id').where('tenant_id', '=', tenantId),
      )
      .execute();
    await this.db.deleteFrom('audit_exports').where('tenant_id', '=', tenantId).execute();
    await this.db.deleteFrom('audit_log').where('tenant_id', '=', tenantId).execute();
    await this.db
      .deleteFrom('pdf_password_sessions')
      .where('tenant_id', '=', tenantId)
      .execute();
    await this.db
      .deleteFrom('pdf_password_verifications')
      .where('tenant_id', '=', tenantId)
      .execute();
    await this.db.deleteFrom('revoked_jtis').where('tenant_id', '=', tenantId).execute();
    await this.db.deleteFrom('documents').where('tenant_id', '=', tenantId).execute();
    await this.db.deleteFrom('tenants').where('id', '=', tenantId).execute();

    return existing !== null;
  }
}

function mapRow(r: {
  id: string;
  name: string;
  config_json: string | null;
  created_at: number;
  auto_provisioned: number;
}): TenantRow {
  return {
    id: r.id,
    name: r.name,
    config: r.config_json ? (JSON.parse(r.config_json) as Record<string, unknown>) : null,
    autoProvisioned: r.auto_provisioned !== 0,
    createdAt: r.created_at,
  };
}
