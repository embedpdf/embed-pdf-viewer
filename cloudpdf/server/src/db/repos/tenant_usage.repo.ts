import type { Kysely } from 'kysely';
import { sql } from 'kysely';

import { monthPeriod } from '../../licensing/UsageMeters';
import type { Database as Schema } from '../schema';

export interface TenantUsageSnapshot {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  metrics: {
    'pdf.views': number;
    'pdf.uploads': number;
    'storage.bytes': number;
  };
}

/**
 * Per-tenant usage FACTS — record and report, no opinions.
 *
 * This is deliberately not `UsageMeters`: that class answers "is this
 * deployment within its license" (deployment-wide counters, hard-limit
 * enforcement); this one answers "what did each tenant consume" for
 * whoever operates the deployment. It carries no limits by design —
 * enforcement above the license is the operator's judgment, expressed
 * through tenant suspension, never a number the engine second-guesses.
 *
 * A VIEW is a share exchange or an authorized `/v1/access` grant,
 * deduplicated: exchanged sessions carry `sub = share:<id>`, and
 * `/v1/access` skips those (they were counted at exchange).
 */
export class TenantUsageRepo {
  constructor(private readonly db: Kysely<Schema>) {}

  async recordView(tenantId: string, now = new Date()): Promise<void> {
    await this.increment(tenantId, 'pdf.views', now);
  }

  /**
   * Idempotency is the caller's: `UsageMeters.recordUpload` owns the
   * per-event dedupe (`license_usage_event`) and reports whether the
   * event was fresh — call this only when it was.
   */
  async recordUpload(tenantId: string, now = new Date()): Promise<void> {
    await this.increment(tenantId, 'pdf.uploads', now);
  }

  async snapshot(tenantId: string, now = new Date()): Promise<TenantUsageSnapshot> {
    const { periodStart, periodEnd } = monthPeriod(now);
    const rows = await this.db
      .selectFrom('tenant_usage_counter')
      .select(['metric', 'value'])
      .where('tenant_id', '=', tenantId)
      .where('period_start', '=', periodStart)
      .execute();
    const counters: Record<'pdf.uploads' | 'pdf.views', number> = {
      'pdf.uploads': 0,
      'pdf.views': 0,
    };
    for (const row of rows) counters[row.metric] = safeNumber(row.value, row.metric);
    return {
      tenantId,
      periodStart,
      periodEnd,
      metrics: {
        ...counters,
        'storage.bytes': await this.currentStorageBytes(tenantId),
      },
    };
  }

  async deleteForTenant(tenantId: string): Promise<void> {
    await this.db.deleteFrom('tenant_usage_counter').where('tenant_id', '=', tenantId).execute();
  }

  private async increment(
    tenantId: string,
    metric: 'pdf.uploads' | 'pdf.views',
    now: Date,
  ): Promise<void> {
    const { periodStart } = monthPeriod(now);
    const ts = now.getTime();
    await this.db
      .insertInto('tenant_usage_counter')
      .values({ tenant_id: tenantId, metric, period_start: periodStart, value: 1, updated_at: ts })
      .onConflict((conflict) =>
        conflict.columns(['tenant_id', 'metric', 'period_start']).doUpdateSet({
          value: sql`tenant_usage_counter.value + excluded.value`,
          updated_at: ts,
        }),
      )
      .execute();
  }

  private async currentStorageBytes(tenantId: string): Promise<number> {
    const result = await sql<{ total: number | string | null }>`
      select coalesce(sum(storage_size_bytes), 0) as total
      from documents
      where tenant_id = ${tenantId} and state = 'ready'
    `.execute(this.db);
    return safeNumber(result.rows[0]?.total ?? 0, 'storage.bytes');
  }
}

function safeNumber(value: number | string, metric: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${metric} usage is outside JavaScript's safe integer range`);
  }
  return parsed;
}
