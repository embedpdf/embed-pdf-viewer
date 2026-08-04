import { sql, type Kysely } from 'kysely';

import type { Database } from '../db/schema';
import type { LicenseGate, RuntimeMeterPolicy } from './LicenseRuntime';

export type UsageMetric = RuntimeMeterPolicy['metric'];

export interface LicenseUsageSnapshot {
  metrics: Record<UsageMetric, number>;
  periodEnd: string;
  periodStart: string;
}

export class UsageLimitError extends Error {
  readonly code = 'LicenseUsageLimit';
  readonly status = 403;

  constructor(
    readonly metric: UsageMetric,
    readonly limit: string,
  ) {
    super(`The licensed ${metric} limit of ${limit} has been reached`);
    this.name = 'UsageLimitError';
  }
}

/**
 * Deployment-wide usage accounting. Counters intentionally live in the
 * customer's database: both connected and air-gapped installations enforce
 * the same limits locally, while reporting is a separate connected-only job.
 */
export class UsageMeters {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly licenseGate: LicenseGate,
  ) {}

  async recordView(): Promise<number> {
    return this.consumeCounter('pdf.views', 1);
  }

  async assertUploadAllowed(): Promise<void> {
    await this.assertCounterAllowed('pdf.uploads', 1);
  }

  async recordUpload(eventId: string, occurredAt = Date.now()): Promise<number> {
    const periodStart = monthPeriod(new Date(occurredAt)).periodStart;
    const policy = this.policyFor('pdf.uploads');
    return this.db.transaction().execute(async (tx) => {
      const inserted = await tx
        .insertInto('license_usage_event')
        .values({
          metric: 'pdf.uploads',
          event_id: eventId,
          period_start: periodStart,
          created_at: Date.now(),
        })
        .onConflict((conflict) => conflict
          .columns(['metric', 'event_id'])
          .doNothing())
        .returning('event_id')
        .executeTakeFirst();
      if (!inserted) {
        const row = await tx
          .selectFrom('license_usage_counter')
          .select('value')
          .where('metric', '=', 'pdf.uploads')
          .where('period_start', '=', periodStart)
          .executeTakeFirst();
        return safeNumber(row?.value ?? 0, 'pdf.uploads');
      }
      return this.incrementCounter(tx, 'pdf.uploads', periodStart, 1, policy);
    });
  }

  async assertStorageAllowed(incomingBytes: number): Promise<void> {
    const policy = this.policyFor('storage.bytes');
    if (!policy || policy.enforcement !== 'hard-limit') return;
    const current = await this.currentStorageBytes();
    if (BigInt(current) + BigInt(incomingBytes) > BigInt(policy.limit)) {
      throw new UsageLimitError('storage.bytes', policy.limit);
    }
  }

  async snapshot(now = new Date()): Promise<LicenseUsageSnapshot> {
    const { periodStart, periodEnd } = monthPeriod(now);
    const rows = await this.db
      .selectFrom('license_usage_counter')
      .select(['metric', 'value'])
      .where('period_start', '=', periodStart)
      .execute();
    const counters: Record<'pdf.uploads' | 'pdf.views', number> = {
      'pdf.uploads': 0,
      'pdf.views': 0,
    };
    for (const row of rows) counters[row.metric] = safeNumber(row.value, row.metric);

    return {
      metrics: {
        ...counters,
        'storage.bytes': await this.currentStorageBytes(),
      },
      periodEnd,
      periodStart,
    };
  }

  private async assertCounterAllowed(
    metric: 'pdf.uploads' | 'pdf.views',
    increment: number,
  ): Promise<void> {
    const policy = this.policyFor(metric);
    if (!policy || policy.enforcement !== 'hard-limit') return;
    const { periodStart } = monthPeriod(new Date());
    const row = await this.db
      .selectFrom('license_usage_counter')
      .select('value')
      .where('metric', '=', metric)
      .where('period_start', '=', periodStart)
      .executeTakeFirst();
    if (BigInt(row?.value ?? 0) + BigInt(increment) > BigInt(policy.limit)) {
      throw new UsageLimitError(metric, policy.limit);
    }
  }

  private async consumeCounter(
    metric: 'pdf.uploads' | 'pdf.views',
    increment: number,
  ): Promise<number> {
    const policy = this.policyFor(metric);
    const { periodStart } = monthPeriod(new Date());

    return this.db.transaction().execute((tx) =>
      this.incrementCounter(tx, metric, periodStart, increment, policy));
  }

  private async incrementCounter(
    executor: Kysely<Database>,
    metric: 'pdf.uploads' | 'pdf.views',
    periodStart: string,
    increment: number,
    policy: RuntimeMeterPolicy | undefined,
  ): Promise<number> {
    const now = Date.now();
    const row = await executor
      .insertInto('license_usage_counter')
      .values({ metric, period_start: periodStart, value: increment, updated_at: now })
      .onConflict((conflict) => conflict
        .columns(['metric', 'period_start'])
        .doUpdateSet({
          value: sql`license_usage_counter.value + excluded.value`,
          updated_at: now,
        }))
      .returning('value')
      .executeTakeFirstOrThrow();
    const value = safeNumber(row.value, metric);
    if (
      policy?.enforcement === 'hard-limit' &&
      BigInt(value) > BigInt(policy.limit)
    ) {
      // Throwing from the transaction rolls the increment back, making
      // concurrent replicas enforce the counter limit atomically.
      throw new UsageLimitError(metric, policy.limit);
    }
    return value;
  }

  private policyFor(metric: UsageMetric): RuntimeMeterPolicy | undefined {
    return this.licenseGate.getStatus().meters.find((policy) => policy.metric === metric);
  }

  private async currentStorageBytes(): Promise<number> {
    const result = await sql<{ total: number | string | null }>`
      select coalesce(sum(storage_size_bytes), 0) as total
      from documents
      where state = 'ready'
    `.execute(this.db);
    return safeNumber(result.rows[0]?.total ?? 0, 'storage.bytes');
  }
}

export function monthPeriod(now: Date): { periodEnd: string; periodStart: string } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    periodStart: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
    periodEnd: new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 10),
  };
}

function safeNumber(value: number | string, metric: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${metric} usage is outside JavaScript's safe integer range`);
  }
  return parsed;
}
