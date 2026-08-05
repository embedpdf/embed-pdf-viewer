import type { Kysely } from 'kysely';
import type { Database as Schema } from '../schema';

export interface TenantRow {
  id: string;
  name: string;
  config: Record<string, unknown> | null;
  createdAt: number;
}

/**
 * Minimal tenant repo for Phase 1. We auto-provision a tenant row on
 * first admin call (so a fresh deploy + JWT immediately works without
 * a separate provisioning step). Phase 3+ will gate this behind an
 * explicit "tenant create" admin call.
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
   * Insert if absent. Returns the row. Race-safe: a duplicate insert
   * is swallowed and the existing row is returned.
   */
  async ensure(input: { id: string; name?: string }): Promise<TenantRow> {
    const existing = await this.findById(input.id);
    if (existing) return existing;
    try {
      await this.db
        .insertInto('tenants')
        .values({
          id: input.id,
          name: input.name ?? input.id,
          config_json: null,
          created_at: Date.now(),
        })
        .execute();
    } catch (err) {
      const e = err as { message?: string } | null;
      if (!e?.message?.includes('UNIQUE constraint failed')) throw err;
    }
    const row = await this.findById(input.id);
    if (!row) throw new Error(`tenants.ensure: row vanished after insert: ${input.id}`);
    return row;
  }
}

function mapRow(r: {
  id: string;
  name: string;
  config_json: string | null;
  created_at: number;
}): TenantRow {
  return {
    id: r.id,
    name: r.name,
    config: r.config_json ? (JSON.parse(r.config_json) as Record<string, unknown>) : null,
    createdAt: r.created_at,
  };
}
