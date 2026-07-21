import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEnvFile } from 'node:process';

import { neon } from '@neondatabase/serverless';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

try {
  loadEnvFile(path.resolve(scriptDirectory, '../.env.local'));
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const optional = process.argv.includes('--if-configured');
const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!connectionString) {
  if (optional) {
    process.stdout.write('Feedback database is not configured; skipping migrations.\n');
    process.exit(0);
  }
  throw new Error('Set DATABASE_URL or POSTGRES_URL before running feedback migrations.');
}

const migrationsDirectory = path.resolve(scriptDirectory, '../db/migrations');
const sql = neon(connectionString);

await sql`
  CREATE TABLE IF NOT EXISTS docs_feedback_migrations (
    name text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`;

const migrationNames = (await readdir(migrationsDirectory))
  .filter((name) => name.endsWith('.sql'))
  .sort();

const appliedRows = await sql`SELECT name, checksum FROM docs_feedback_migrations`;
const applied = new Map(appliedRows.map((row) => [row.name, row.checksum]));

for (const name of migrationNames) {
  const migration = await readFile(path.join(migrationsDirectory, name), 'utf8');
  const checksum = createHash('sha256').update(migration).digest('hex');
  const previousChecksum = applied.get(name);

  if (previousChecksum === checksum) continue;
  if (previousChecksum) {
    throw new Error(`Migration ${name} changed after it was applied.`);
  }

  const statements = migration
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);

  await sql.transaction((transaction) => [
    ...statements.map((statement) => transaction`${transaction.unsafe(statement)}`),
    transaction`
      INSERT INTO docs_feedback_migrations (name, checksum)
      VALUES (${name}, ${checksum})
    `,
  ]);

  process.stdout.write(`Applied ${name}.\n`);
}

process.stdout.write('Feedback database migrations are current.\n');
