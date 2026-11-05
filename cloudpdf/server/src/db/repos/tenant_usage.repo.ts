import { createHash } from 'node:crypto';

import type { Kysely } from 'kysely';
import { sql } from 'kysely';

import type { Database as Schema } from '../schema';

/** UTC days, `YYYY-MM-DD`: `from` is the first one counted, `to` the day after the last. */
export interface UsageWindow {
  from: string;
  to: string;
}

export interface TenantUsageSnapshot {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  /** The core's meters. */
  metrics: {
    pdfViews: number;
    pdfUploads: number;
    storageBytes: number;
  };
  /** Every module meter counted in the window or asked for, by its name. */
  moduleMeters: Record<string, number>;
}

/**
 * Per-tenant usage facts — record and report, no opinions.
 *
 * This is deliberately not `UsageMeters`: that class answers "is this
 * deployment within its license" (deployment-wide counters, hard-limit
 * enforcement); this one answers "what did each tenant consume" for
 * whoever operates the deployment. It carries no limits by design —
 * enforcement above the license is the operator's judgment, expressed
 * through tenant suspension and features, never a number the engine
 * second-guesses.
 *
 * Counters are per UTC day, so any window adds up: a calendar month, or a
 * billing period that starts mid-month. Modules count their own meters
 * here too (`protected-display.views`), next to the core's.
 *
 * A view is a grant exchange or an authorized `/v1/access` request,
 * deduplicated: exchanged sessions carry `sub = grant:<id>`, and
 * `/v1/access` skips those (they were counted at exchange).
 */
export class TenantUsageRepo {
  constructor(private readonly db: Kysely<Schema>) {}

  async recordView(tenantId: string, now = new Date()): Promise<void> {
    await this.increment(this.db, tenantId, 'pdf.views', utcDay(now), now);
  }

  /**
   * Idempotency is the caller's: `UsageMeters.recordUpload` owns the
   * per-event dedupe (`license_usage_event`) and reports whether the
   * event was fresh — call this only when it was.
   */
  async recordUpload(tenantId: string, now = new Date()): Promise<void> {
    await this.increment(this.db, tenantId, 'pdf.uploads', utcDay(now), now);
  }

  /**
   * Add one to a module's meter (`protected-display.views`) for today. With
   * `oncePerDay`, only the first count with that key each UTC day adds one;
   * the key is kept as its hash, for the day only. Reports whether it added.
   */
  async count(
    tenantId: string,
    metric: string,
    options: { oncePerDay?: string } = {},
    now = new Date(),
  ): Promise<boolean> {
    const day = utcDay(now);
    if (options.oncePerDay === undefined) {
      await this.increment(this.db, tenantId, metric, day, now);
      return true;
    }
    const keyHash = createHash('sha256').update(options.oncePerDay).digest('hex');
    return this.db.transaction().execute(async (tx) => {
      const fresh = await tx
        .insertInto('tenant_usage_once')
        .values({ tenant_id: tenantId, metric, day, key_hash: keyHash })
        .onConflict((conflict) =>
          conflict.columns(['tenant_id', 'metric', 'day', 'key_hash']).doNothing(),
        )
        .returning('key_hash')
        .executeTakeFirst();
      if (!fresh) return false;
      await this.increment(tx, tenantId, metric, day, now);
      return true;
    });
  }

  /**
   * The tenant's usage over `window`: each counter added up over its days,
   * and the storage it holds now. `meters` are module meters to report even
   * when nothing counted them, as 0.
   */
  async snapshot(
    tenantId: string,
    window: UsageWindow,
    meters: ReadonlyArray<string> = [],
  ): Promise<TenantUsageSnapshot> {
    const rows = await this.db
      .selectFrom('tenant_usage_counter')
      .select(['metric', (eb) => eb.fn.sum<number | string>('value').as('total')])
      .where('tenant_id', '=', tenantId)
      .where('day', '>=', window.from)
      .where('day', '<', window.to)
      .groupBy('metric')
      .execute();
    const counted: Record<string, number> = { 'pdf.uploads': 0, 'pdf.views': 0 };
    for (const meter of meters) counted[meter] = 0;
    for (const row of rows) counted[row.metric] = safeNumber(row.total, row.metric);
    const { 'pdf.uploads': uploads, 'pdf.views': views, ...moduleMeters } = counted;
    return {
      tenantId,
      periodStart: window.from,
      periodEnd: window.to,
      metrics: {
        pdfViews: views!,
        pdfUploads: uploads!,
        storageBytes: await this.currentStorageBytes(tenantId),
      },
      moduleMeters,
    };
  }

  /** Forget the once-a-day keys of days that are over: a day's keys matter only that day. */
  async sweepOnceKeys(now = new Date()): Promise<void> {
    await this.db.deleteFrom('tenant_usage_once').where('day', '<', utcDay(now)).execute();
  }

  async deleteForTenant(tenantId: string): Promise<void> {
    await this.db.deleteFrom('tenant_usage_counter').where('tenant_id', '=', tenantId).execute();
    await this.db.deleteFrom('tenant_usage_once').where('tenant_id', '=', tenantId).execute();
  }

  private async increment(
    executor: Kysely<Schema>,
    tenantId: string,
    metric: string,
    day: string,
    now: Date,
  ): Promise<void> {
    const ts = now.getTime();
    await executor
      .insertInto('tenant_usage_counter')
      .values({ tenant_id: tenantId, metric, day, value: 1, updated_at: ts })
      .onConflict((conflict) =>
        conflict.columns(['tenant_id', 'metric', 'day']).doUpdateSet({
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

/** The UTC day `date` falls on, `YYYY-MM-DD`. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The UTC month `date` falls in, as a window of days. */
export function monthWindow(date: Date): UsageWindow {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return {
    from: utcDay(new Date(Date.UTC(year, month, 1))),
    to: utcDay(new Date(Date.UTC(year, month + 1, 1))),
  };
}

function safeNumber(value: number | string, metric: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${metric} usage is outside JavaScript's safe integer range`);
  }
  return parsed;
}
