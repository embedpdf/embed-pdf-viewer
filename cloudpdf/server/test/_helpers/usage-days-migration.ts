/**
 * Migration 051, on either database: tenant usage counts per UTC day and
 * takes modules' meters. A month counted before keeps its total, on its
 * first day. Rolling back adds the days up into their months again and drops
 * the modules' meters, which the old table has no place for.
 */
import { sql, type Kysely } from 'kysely';
import { expect } from 'vitest';

import { migrate, migrateDown, type DbSchema, type MigrationSource } from '../../src/index';

const TENANT = 'tenant-051';

export async function checkUsageDaysMigration(
  db: Kysely<DbSchema>,
  migrations: ReadonlyArray<MigrationSource>,
): Promise<void> {
  const upTo050 = migrations.filter((m) => m.version < '051');
  expect(upTo050.at(-1)?.version).toBe('050');
  // Up to 051 and no further, so later migrations leave this one on top.
  const source = {
    kind: 'inline' as const,
    migrations: migrations.filter((m) => m.version <= '051'),
  };
  await migrate(db, { source: { kind: 'inline', migrations: upTo050 } });
  await sql`
    INSERT INTO tenant_usage_counter (tenant_id, metric, period_start, value, updated_at)
    VALUES (${TENANT}, 'pdf.views', '2026-10-01', 40, 1)
  `.execute(db);

  await migrate(db, { source });
  const counters = () =>
    db
      .selectFrom('tenant_usage_counter')
      .select(['metric', 'day', 'value'])
      .orderBy('metric')
      .orderBy('day')
      .execute();
  expect(await counters()).toEqual([{ metric: 'pdf.views', day: '2026-10-01', value: 40 }]);

  const row = (metric: string, day: string, value: number) => ({
    tenant_id: TENANT,
    metric,
    day,
    value,
    updated_at: 2,
  });
  await db
    .insertInto('tenant_usage_counter')
    .values([
      row('pdf.views', '2026-11-03', 2),
      row('pdf.views', '2026-11-04', 3),
      row('protected-display.views', '2026-11-04', 7),
    ])
    .execute();
  await db
    .insertInto('tenant_usage_once')
    .values({
      tenant_id: TENANT,
      metric: 'protected-display.views',
      day: '2026-11-04',
      key_hash: 'ab',
    })
    .execute();

  await migrateDown(db, { source, to: '050' });
  const months = await sql<{ metric: string; period_start: string; value: number | string }>`
    SELECT metric, period_start, value FROM tenant_usage_counter ORDER BY period_start
  `.execute(db);
  expect(months.rows.map((r) => ({ ...r, value: Number(r.value) }))).toEqual([
    { metric: 'pdf.views', period_start: '2026-10-01', value: 40 },
    { metric: 'pdf.views', period_start: '2026-11-01', value: 5 },
  ]);
}
