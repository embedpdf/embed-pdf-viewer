#!/usr/bin/env node
/* eslint-disable no-console */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildApp } from '../app/buildApp';
import { loadFallbackFontsFromEnv } from '../runtime/loadFallbackFontsFromEnv';
import { createSqliteDb, type CreateSqliteDbOptions } from '../db/drivers/sqlite';
import { createPostgresDb, type CreatePostgresDbOptions } from '../db/drivers/postgres';
import { PostgresRealtimeBus } from '../realtime/PostgresRealtimeBus';
import {
  migrate,
  migrateDown,
  status,
  validate,
  type MigrationSource,
} from '../db/migrator/runner';
import { sqliteMigrations } from '../db/migrations/sqlite/index';
import { postgresMigrations } from '../db/migrations/postgres/index';
import type { Database as Schema } from '../db/schema';
import { EventLogService } from '../services/EventLogService';
import type { ObjectStore } from '../storage/ObjectStore';
import { createObjectStore } from '../storage/createObjectStore';
import { loadObjectStoreConfigFromEnv } from '../storage/config/loadObjectStoreConfigFromEnv';
import { createCdnSigner } from '../cdn/createCdnSigner';
import { loadCdnConfigFromEnv } from '../cdn/config/loadCdnConfigFromEnv';
import { createKmsKeyring } from '../security/kms/createKmsKeyring';
import { loadKmsConfigFromEnv } from '../security/kms/config/loadKmsConfigFromEnv';
import type { KmsKeyring } from '../security/kms/KmsKeyring';
import { createSecretsProviderRegistry } from '../security/secrets/createSecretsProvider';
import { createSecretResolver, type SecretResolver } from '../security/secrets/SecretResolver';
import { loadSecretsConfigFromEnv } from '../security/secrets/config/loadSecretsConfigFromEnv';
import type { Kysely } from 'kysely';
import { LicenseRuntime } from '../licensing/LicenseRuntime';
import { ConnectedUsageReporter } from '../licensing/ConnectedUsageReporter';
import { UsageMeters } from '../licensing/UsageMeters';

/**
 * Multi-command CLI:
 *
 *   cloudpdf-server                          → serve (default)
 *   cloudpdf-server serve
 *   cloudpdf-server migrate status
 *   cloudpdf-server migrate up [--dry-run]
 *   cloudpdf-server migrate down [--to NNN | --steps N | --all] [--dry-run] [--yes] [--force]
 *   cloudpdf-server migrate validate [--strict]
 *   cloudpdf-server db doctor
 *   cloudpdf-server audit export --day yesterday
 *   cloudpdf-server license request [--output cloudpdf-license-request.json]
 *   cloudpdf-server license install --file cloudpdf-license.lic
 *   cloudpdf-server license status
 *   cloudpdf-server --help
 *
 * Config is read from env (12-factor friendly). `serve` runs the full
 * adapter bootstrap (secrets -> storage -> CDN -> KMS, see ADAPTERS.md)
 * so the same binary scales from zero-config SQLite + filesystem to
 * Postgres + S3/GCS/Azure purely by changing env:
 *   CLOUDPDF_DB_DRIVER     sqlite|postgres   (default: sqlite)
 *   CLOUDPDF_DB_SQLITE_PATH                  (default: ./data/cloudpdf.db)
 *   CLOUDPDF_DB_URL         postgres://...    (required for postgres)
 *   CLOUDPDF_REALTIME       in-process        (opt OUT of LISTEN/NOTIFY; postgres
 *                                              defaults to cross-replica delivery)
 *   CLOUDPDF_JWT_SECRET    (default: dev secret; warn at startup)
 *   CLOUDPDF_STORAGE_KIND  fs|s3|gcs|azure-blob   (default: fs)
 *   CLOUDPDF_STORAGE_FS_ROOT                (default: ./data/objects)
 *   CLOUDPDF_CACHE_ROOT                      (default: ./data/cache; enables /v1/docs/*)
 *   CLOUDPDF_CDN_KIND       none|bunny|...    (default: none)
 *   CLOUDPDF_KMS_KIND       static|aws-kms|... (opt-in; encrypted-PDF sessions)
 *   CLOUDPDF_SECRETS_PROVIDERS  registry names (default: env)
 *   CLOUDPDF_AUTO_MIGRATE=0|1    apply migrations on boot (default: on for sqlite)
 *   CLOUDPDF_FAIL_ON_PENDING=1   refuse to start with pending migrations
 *   CLOUDPDF_AUTO_PROVISION_TENANT=1   lazily create tenant rows (dev)
 *   PORT                   (default: 3000)
 *   HOST                   (default: 0.0.0.0)
 *   CLOUDPDF_WORKER_POOL_SIZE  int|max  (default: min(2, cpus))
 *   CLOUDPDF_FALLBACK_FONTS  JSON [{key,path,familyName?,...}]  (default: none)
 *   CLOUDPDF_LICENSE_MODE     connected|air-gapped
 *   CLOUDPDF_LICENSE_KEY      required for connected mode
 *   CLOUDPDF_LICENSE_REPORTING_TOKEN     required for connected usage reporting
 *
 * Exit codes:
 *   0  success
 *   1  user error / drift / failed command
 *   2  missing required config
 */

type Dialect = 'sqlite' | 'postgres';

interface DbContext {
  dialect: Dialect;
  db: Kysely<Schema>;
  migrations: ReadonlyArray<MigrationSource>;
  describe: string;
}

function readDbConfig(): {
  dialect: Dialect;
  sqliteOpts?: CreateSqliteDbOptions;
  pgOpts?: CreatePostgresDbOptions;
  describe: string;
} {
  const driver = (process.env['CLOUDPDF_DB_DRIVER'] ?? 'sqlite').toLowerCase() as Dialect;
  if (driver === 'postgres') {
    const url = process.env['CLOUDPDF_DB_URL'];
    if (!url) {
      fail(2, 'CLOUDPDF_DB_DRIVER=postgres requires CLOUDPDF_DB_URL=postgres://...');
    }
    return {
      dialect: 'postgres',
      pgOpts: { connectionString: url! },
      describe: `postgres ${redact(url!)}`,
    };
  }
  if (driver !== 'sqlite') {
    fail(2, `CLOUDPDF_DB_DRIVER must be 'sqlite' or 'postgres' (got ${driver!})`);
  }
  const path = process.env['CLOUDPDF_DB_SQLITE_PATH'] ?? './data/cloudpdf.db';
  return { dialect: 'sqlite', sqliteOpts: { path }, describe: `sqlite ${path}` };
}

function openDb(): DbContext {
  const cfg = readDbConfig();
  if (cfg.dialect === 'postgres') {
    return {
      dialect: 'postgres',
      db: createPostgresDb(cfg.pgOpts!),
      migrations: postgresMigrations,
      describe: cfg.describe,
    };
  }
  return {
    dialect: 'sqlite',
    db: createSqliteDb(cfg.sqliteOpts!),
    migrations: sqliteMigrations,
    describe: cfg.describe,
  };
}

/**
 * Build the secrets resolver from env (`CLOUDPDF_SECRETS_*`). Defaults
 * to a single `env` provider with 1h caching, so this is safe with no
 * extra config. Adapter factories use it to resolve `secret://` refs.
 */
function buildSecretResolver(): SecretResolver {
  return createSecretResolver(createSecretsProviderRegistry(loadSecretsConfigFromEnv(process.env)));
}

async function openObjectStore(): Promise<ObjectStore> {
  try {
    return await createObjectStore(loadObjectStoreConfigFromEnv(process.env), {
      resolver: buildSecretResolver(),
    });
  } catch (err) {
    fail(2, err instanceof Error ? err.message : String(err));
  }
}

/**
 * Build a KMS keyring only when explicitly configured. KMS powers
 * encrypted-PDF password-session persistence; without it the server
 * still serves normal documents (that feature just stays off). Static
 * KMS requires CLOUDPDF_KMS_STATIC_KEK, so we never call the loader
 * unless the operator opted in via CLOUDPDF_KMS_*.
 */
async function buildKms(resolver: SecretResolver): Promise<KmsKeyring | null> {
  const configured =
    process.env['CLOUDPDF_KMS_KIND'] !== undefined ||
    process.env['CLOUDPDF_KMS_STATIC_KEK'] !== undefined;
  if (!configured) return null;
  try {
    return await createKmsKeyring(loadKmsConfigFromEnv(process.env), { resolver });
  } catch (err) {
    fail(2, err instanceof Error ? err.message : String(err));
  }
}

function redact(url: string): string {
  return url.replace(/(:\/\/[^:]+:)[^@]+(@)/, '$1***$2');
}

function fail(code: number, msg: string): never {
  console.error(`cloudpdf-server: ${msg}`);
  process.exit(code);
}

function printHelp(): void {
  console.log(
    [
      'cloudpdf-server [command] [args]',
      '',
      'Commands:',
      '  serve                  (default) Start the HTTP server',
      '  migrate status         Show applied / pending / drift state',
      '  migrate up             Apply pending migrations',
      '  migrate up --dry-run   List what would be applied without changing the DB',
      '  migrate down           Roll back migrations (manual break-glass; destructive)',
      '    --to NNN               Roll back everything newer than version NNN',
      '    --steps N              Roll back the N highest applied (default 1)',
      '    --all                  Roll back every applied migration',
      '    --dry-run              Preview the rollback plan without touching the DB',
      '    --yes                  Required to actually run (containers are non-interactive)',
      '    --force                Roll back even if the up-checksum drifted from code',
      '  migrate validate       Refuse to exit 0 if drift is detected',
      '  migrate validate --strict  Treat pending migrations as drift too',
      '  db doctor              Connect, run validate, print version info',
      '  audit export --day yesterday',
      '                          Export closed-day audit_log rows to JSONL storage',
      '  license request [--output FILE] [--force]',
      '                          Create a machine-bound air-gap activation request',
      '  license install --file FILE',
      '                          Verify and install a signed air-gap certificate',
      '  license status         Validate and print the current license decision',
      '',
      'Environment:',
      '  Database',
      '    CLOUDPDF_DB_DRIVER     sqlite|postgres   (default: sqlite)',
      '    CLOUDPDF_DB_SQLITE_PATH                  (default: ./data/cloudpdf.db)',
      '    CLOUDPDF_DB_URL        postgres://...     (required for postgres)',
      '  Storage (object store)',
      '    CLOUDPDF_STORAGE_KIND  fs|s3|gcs|azure-blob   (default: fs)',
      '    CLOUDPDF_STORAGE_FS_ROOT                 (default: ./data/objects)',
      '    CLOUDPDF_STORAGE_S3_BUCKET, CLOUDPDF_STORAGE_S3_REGION, CLOUDPDF_STORAGE_S3_ENDPOINT',
      '  Auth',
      '    CLOUDPDF_JWT_SECRET    HS256 secret      (required in production)',
      '  Commercial license',
      '    CLOUDPDF_LICENSE_MODE   connected|air-gapped (explicit in production)',
      '    CLOUDPDF_LICENSE_KEY    required for connected mode',
      '  Engine cache (enables /v1/docs/* read+render routes)',
      '    CLOUDPDF_CACHE_ROOT                      (default: ./data/cache)',
      '    CLOUDPDF_CACHE_MAX_BYTES                 (default: 4 GiB)',
      '  Fonts',
      '    CLOUDPDF_FALLBACK_FONTS  JSON [{key,path,familyName?,...}]  (default: none)',
      '  Optional adapters (see ADAPTERS.md)',
      '    CLOUDPDF_CDN_KIND      none|bunny|cloud-cdn|cloudfront|azure-fd|custom-hmac (default: none)',
      '    CLOUDPDF_KMS_KIND      static|aws-kms|gcp-kms|azure-kv  (opt-in; needed for encrypted-PDF sessions)',
      '    CLOUDPDF_SECRETS_PROVIDERS  comma-separated provider registry (default: env)',
      '  Lifecycle',
      '    CLOUDPDF_AUTO_MIGRATE=0|1   apply migrations on boot (default: on for sqlite, off for postgres)',
      '    CLOUDPDF_FAIL_ON_PENDING=1  refuse to serve with pending migrations',
      '    CLOUDPDF_AUTO_PROVISION_TENANT=1  lazily create tenant rows (dev convenience)',
      '  Process',
      '    PORT (default: 3000), HOST (default: 0.0.0.0)',
      '    CLOUDPDF_WORKER_POOL_SIZE  int|max  (default: min(2, cpus))',
    ].join('\n'),
  );
}

// ------- commands -------

async function cmdMigrateStatus(): Promise<void> {
  const ctx = openDb();
  try {
    const rows = await status(ctx.db, ctx.migrations);
    console.log(`db: ${ctx.describe}`);
    if (rows.length === 0) {
      console.log('(no migrations registered)');
      return;
    }
    for (const r of rows) {
      const when = r.appliedAt ? new Date(r.appliedAt).toISOString() : '-';
      console.log(`  ${r.version}  ${pad(r.state, 8)}  ${pad(r.name, 32)}  ${when}`);
      if (r.drift) {
        console.log(
          `      drift db=${r.drift.dbChecksum.slice(0, 12)}.. code=${r.drift.codeChecksum.slice(0, 12)}..`,
        );
      }
    }
    const hasDrift = rows.some((r) => r.state === 'drift' || r.state === 'orphan');
    process.exit(hasDrift ? 1 : 0);
  } finally {
    await ctx.db.destroy();
  }
}

async function cmdMigrateUp(args: string[]): Promise<void> {
  const dryRun = args.includes('--dry-run');
  const ctx = openDb();
  try {
    if (dryRun) {
      const rows = await status(ctx.db, ctx.migrations);
      const pending = rows.filter((r) => r.state === 'pending');
      console.log(`db: ${ctx.describe}`);
      if (pending.length === 0) {
        console.log('no pending migrations');
        return;
      }
      console.log(`${pending.length} pending migration(s):`);
      for (const p of pending) {
        console.log(`  ${p.version}  ${p.name}`);
      }
      console.log('(dry-run: nothing applied)');
      return;
    }
    const applied = await migrate(ctx.db, {
      source: { kind: 'inline', migrations: ctx.migrations },
      onApply: (m) => console.log(`applying ${m.version} ${m.name}`),
    });
    if (applied.length === 0) {
      console.log('nothing to apply (db up to date)');
    } else {
      console.log(`applied ${applied.length} migration(s)`);
    }
  } finally {
    await ctx.db.destroy();
  }
}

async function cmdMigrateDown(args: string[]): Promise<void> {
  const dryRun = args.includes('--dry-run');
  const yes = args.includes('--yes');
  const force = args.includes('--force');
  const all = args.includes('--all');
  const to = readFlagValue(args, '--to');
  const steps = readOptionalNumberFlag(args, '--steps');

  if (to !== undefined && steps !== undefined) {
    fail(2, 'migrate down: pass either --to or --steps, not both');
  }
  if (all && (to !== undefined || steps !== undefined)) {
    fail(2, 'migrate down: --all cannot be combined with --to or --steps');
  }

  const ctx = openDb();
  try {
    // Build the human-readable plan from status (read-only). The runner
    // recomputes + validates the same set; this is just the preview.
    const rows = await status(ctx.db, ctx.migrations);
    const appliedDesc = rows
      .filter((r) => r.state === 'applied' || r.state === 'drift')
      .sort((a, b) => (a.version < b.version ? 1 : a.version > b.version ? -1 : 0));

    let planned: typeof appliedDesc;
    if (all) {
      planned = appliedDesc;
    } else if (to !== undefined) {
      planned = appliedDesc.filter((r) => r.version > to);
    } else {
      planned = appliedDesc.slice(0, steps ?? 1);
    }

    console.log(`db: ${ctx.describe}`);
    if (planned.length === 0) {
      console.log('nothing to roll back');
      return;
    }

    console.log(`${planned.length} migration(s) will be rolled back (newest first):`);
    for (const p of planned) {
      const flag = p.reversible === false ? '  [IRREVERSIBLE — will fail]' : '';
      const drift = p.state === 'drift' ? '  [up-checksum drift]' : '';
      console.log(`  ${p.version}  ${p.name}${flag}${drift}`);
    }

    if (dryRun) {
      console.log('(dry-run: nothing rolled back)');
      return;
    }
    if (!yes) {
      fail(
        1,
        'refusing to roll back without --yes (down migrations are destructive and ' +
          'restore structure, not data). Re-run with --yes, or use --dry-run to preview.',
      );
    }

    const reverted = await migrateDown(ctx.db, {
      source: { kind: 'inline', migrations: ctx.migrations },
      ...(all ? { all: true } : {}),
      ...(to !== undefined ? { to } : {}),
      ...(steps !== undefined ? { steps } : {}),
      force,
      onRevert: (m) => console.log(`reverting ${m.version} ${m.name}`),
    });
    console.log(`rolled back ${reverted.length} migration(s)`);
  } finally {
    await ctx.db.destroy();
  }
}

async function cmdMigrateValidate(args: string[]): Promise<void> {
  const strict = args.includes('--strict');
  const ctx = openDb();
  try {
    const issues = await validate(ctx.db, ctx.migrations, { treatPendingAsDrift: strict });
    console.log(`db: ${ctx.describe}`);
    if (issues.length === 0) {
      console.log('ok (no drift)');
      return;
    }
    console.error(`drift detected (${issues.length} issue(s)):`);
    for (const i of issues) {
      console.error(`  - [${i.kind}] ${i.message}`);
    }
    process.exit(1);
  } finally {
    await ctx.db.destroy();
  }
}

async function cmdDbDoctor(): Promise<void> {
  const ctx = openDb();
  console.log(`db: ${ctx.describe}`);
  try {
    // 1. Connection check.
    await ctx.db.selectFrom('schema_migrations').select('version').limit(1).execute();
    console.log('  connection: ok');
  } catch (err) {
    console.error(`  connection: FAIL (${(err as Error).message})`);
    process.exit(1);
  }
  try {
    const issues = await validate(ctx.db, ctx.migrations);
    if (issues.length === 0) {
      console.log('  drift: none');
    } else {
      console.error(`  drift: ${issues.length} issue(s)`);
      for (const i of issues) console.error(`    - [${i.kind}] ${i.message}`);
      process.exit(1);
    }
    const rows = await status(ctx.db, ctx.migrations);
    const applied = rows.filter((r) => r.state === 'applied').length;
    const pending = rows.filter((r) => r.state === 'pending').length;
    console.log(`  migrations: ${applied} applied, ${pending} pending`);
  } finally {
    await ctx.db.destroy();
  }
}

async function cmdAuditExport(args: string[]): Promise<void> {
  const dayRaw = readFlagValue(args, '--day') ?? 'yesterday';
  const day = resolveAuditDay(dayRaw);
  const tenantId = readFlagValue(args, '--tenant');
  const docId = readFlagValue(args, '--doc');
  if ((tenantId && !docId) || (!tenantId && docId)) {
    fail(2, 'audit export requires --tenant and --doc together, or neither');
  }
  const force = args.includes('--force');
  const allowOpenDay = args.includes('--allow-open-day');
  const lagMinutes = readOptionalNumberFlag(args, '--lag-minutes') ?? 30;

  const dbCtx = openDb();
  const storage = await openObjectStore();
  const service = new EventLogService({ storage });
  try {
    console.log(`db: ${dbCtx.describe}`);
    console.log(`storage: ${storage.info.kind} ${storage.info.location}`);
    if (tenantId && docId) {
      const result = await service.exportDocDayJsonl(dbCtx.db, {
        tenantId,
        docId,
        day,
        force,
        allowOpenDay,
        closedDayLagMs: lagMinutes * 60 * 1000,
      });
      console.log(
        `audit export ${result.status}: day=${day} tenant=${tenantId} doc=${docId} ` +
          `events=${result.count} key=${result.key}`,
      );
      return;
    }
    const result = await service.exportDayJsonl(dbCtx.db, {
      day,
      force,
      allowOpenDay,
      closedDayLagMs: lagMinutes * 60 * 1000,
    });
    console.log(
      `audit export day=${day}: targets=${result.targets} exported=${result.exported} ` +
        `skipped=${result.skipped} alreadyRunning=${result.alreadyRunning} empty=${result.empty}`,
    );
  } finally {
    await dbCtx.db.destroy();
  }
}

async function cmdLicenseRequest(args: string[]): Promise<void> {
  requireAirGappedMode();
  const outputPath = resolve(readFlagValue(args, '--output') ?? 'cloudpdf-license-request.json');
  const dbCtx = openDb();
  try {
    await assertLicenseSchemaCurrent(dbCtx);
    const runtime = await LicenseRuntime.create({
      db: dbCtx.db,
      env: process.env,
      secretResolver: buildSecretResolver(),
      startTimer: false,
    });
    try {
      const request = await runtime.createActivationRequest();
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(request, null, 2)}\n`, {
        encoding: 'utf8',
        flag: args.includes('--force') ? 'w' : 'wx',
        mode: 0o600,
      });
      console.log(`air-gap activation request written: ${outputPath}`);
    } finally {
      await runtime.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      fail(1, `${outputPath} already exists; pass --force to replace it`);
    }
    throw error;
  } finally {
    await dbCtx.db.destroy();
  }
}

async function cmdLicenseInstall(args: string[]): Promise<void> {
  requireAirGappedMode();
  const file = readFlagValue(args, '--file');
  if (!file) fail(2, 'license install requires --file FILE');
  const filePath = resolve(file);
  const certificate = await readFile(filePath, 'utf8');
  const dbCtx = openDb();
  try {
    await assertLicenseSchemaCurrent(dbCtx);
    const runtime = await LicenseRuntime.create({
      db: dbCtx.db,
      env: process.env,
      secretResolver: buildSecretResolver(),
      startTimer: false,
    });
    try {
      const verified = await runtime.installCertificate(certificate);
      console.log(`air-gap certificate installed: ${filePath}`);
      console.log(`  license: ${verified.licenseId}`);
      console.log(`  certificate expires: ${verified.artifactExpiresAt}`);
    } finally {
      await runtime.close();
    }
  } finally {
    await dbCtx.db.destroy();
  }
}

async function cmdLicenseStatus(): Promise<void> {
  const dbCtx = openDb();
  try {
    await assertLicenseSchemaCurrent(dbCtx);
    const runtime = await LicenseRuntime.create({
      db: dbCtx.db,
      env: process.env,
      secretResolver: buildSecretResolver(),
      startTimer: false,
    });
    try {
      console.log(JSON.stringify(runtime.getStatus(), null, 2));
    } finally {
      await runtime.close();
    }
  } finally {
    await dbCtx.db.destroy();
  }
}

async function assertLicenseSchemaCurrent(dbCtx: DbContext): Promise<void> {
  const rows = await status(dbCtx.db, dbCtx.migrations);
  const licenseMigration = rows.find((row) => row.version === '016');
  if (!licenseMigration || licenseMigration.state !== 'applied') {
    fail(2, 'licensing requires migration 016; run: cloudpdf-server migrate up');
  }
}

function requireAirGappedMode(): void {
  const mode =
    process.env['CLOUDPDF_LICENSE_MODE'] ??
    (process.env['CLOUDPDF_LICENSE_KEY'] ? 'connected' : 'air-gapped');
  if (mode !== 'air-gapped') {
    fail(2, 'this command requires CLOUDPDF_LICENSE_MODE=air-gapped');
  }
}

async function cmdServe(): Promise<void> {
  const PORT = Number(process.env['PORT'] ?? 3000);
  const HOST = process.env['HOST'] ?? '0.0.0.0';
  const JWT_SECRET = process.env['CLOUDPDF_JWT_SECRET'] ?? 'cloudpdf-dev-secret-change-me';
  if (JWT_SECRET === 'cloudpdf-dev-secret-change-me') {
    console.warn(
      '[cloudpdf-server] WARNING: CLOUDPDF_JWT_SECRET not set, using insecure dev secret',
    );
  }
  const FAIL_ON_PENDING = process.env['CLOUDPDF_FAIL_ON_PENDING'] === '1';
  const AUTO_PROVISION_TENANT = process.env['CLOUDPDF_AUTO_PROVISION_TENANT'] === '1';
  const CACHE_ROOT = process.env['CLOUDPDF_CACHE_ROOT'] ?? './data/cache';
  const CACHE_MAX_BYTES = process.env['CLOUDPDF_CACHE_MAX_BYTES']
    ? Number(process.env['CLOUDPDF_CACHE_MAX_BYTES'])
    : undefined;

  const WORKER_ENTRY_URL = new URL('../runtime/worker-entry.js', import.meta.url);

  // Database defaults to SQLite (see readDbConfig), so a bare `serve`
  // boots the full admin + document pipeline with zero external infra.
  const dbCtx = openDb();

  // Auto-migrate defaults ON for SQLite (frictionless local/try-it-out)
  // and OFF for Postgres (production runs `migrate up` explicitly and
  // sets CLOUDPDF_FAIL_ON_PENDING=1). Override with CLOUDPDF_AUTO_MIGRATE.
  const autoMigrateEnv = process.env['CLOUDPDF_AUTO_MIGRATE'];
  const autoMigrate =
    autoMigrateEnv !== undefined ? autoMigrateEnv === '1' : dbCtx.dialect === 'sqlite';
  if (autoMigrate) {
    const applied = await migrate(dbCtx.db, {
      source: { kind: 'inline', migrations: dbCtx.migrations },
      onApply: (m) => console.log(`applying ${m.version} ${m.name}`),
    });
    if (applied.length > 0) console.log(`auto-migrate: applied ${applied.length} migration(s)`);
  }

  // One resolver instance is shared by the license and infrastructure
  // adapters. This keeps secret:// license keys out of environment values
  // while preserving the same provider/cache behavior as every other secret.
  const resolver = buildSecretResolver();
  const licenseRuntime = await LicenseRuntime.create({
    db: dbCtx.db,
    secretResolver: resolver,
  });
  const initialLicense = licenseRuntime.getStatus();
  if (initialLicense.access === 'none') {
    await licenseRuntime.close();
    await dbCtx.db.destroy();
    fail(2, `${initialLicense.message} (${initialLicense.code})`);
  }
  if (initialLicense.access === 'restricted') {
    console.warn(
      `[cloudpdf-server] LICENSE RESTRICTED: ${initialLicense.message} (${initialLicense.code})`,
    );
  }
  if (initialLicense.licenseKind === 'development') {
    console.warn(
      '[cloudpdf-server] DEVELOPMENT LICENSE: this deployment runs on a ' +
        'development key with development-scale usage limits. Use your ' +
        'subscription license key for production and staging.',
    );
  }

  let usageReporter: ConnectedUsageReporter | undefined;
  if (
    initialLicense.mode === 'connected' &&
    initialLicense.telemetryProfile === 'aggregated-usage'
  ) {
    try {
      const cloudPdfLicenseId = licenseRuntime.getConnectedReportingLicenseId();
      if (!cloudPdfLicenseId) {
        throw new Error(
          'Connected license requires usage reporting but its signed metadata is missing cloudpdfLicenseId',
        );
      }
      usageReporter = await ConnectedUsageReporter.create({
        cloudPdfLicenseId,
        db: dbCtx.db,
        meters: new UsageMeters(dbCtx.db, licenseRuntime),
        reportingToken: process.env['CLOUDPDF_LICENSE_REPORTING_TOKEN'],
        secretResolver: resolver,
      });
    } catch (error) {
      await licenseRuntime.close();
      await dbCtx.db.destroy();
      fail(2, error instanceof Error ? error.message : String(error));
    }
  }

  // Adapter bootstrap (see ADAPTERS.md): secrets registry -> resolver,
  // then storage / CDN / KMS. Storage defaults to filesystem and CDN to
  // `none`, so this works with no extra env. KMS is opt-in.
  const objectStore = await createObjectStoreOrExit(resolver);
  const cdnSigner = await createCdnSigner(loadCdnConfigFromEnv(process.env), { resolver });
  const kms = await buildKms(resolver);

  // Cross-replica realtime doorbell. With Postgres the default is
  // LISTEN/NOTIFY — REQUIRED for multi-replica deployments (compose
  // --scale / Helm replicas), where in-process delivery would silently
  // hide other replicas' mutations from SSE subscribers. Opt out with
  // CLOUDPDF_REALTIME=in-process (single-replica Postgres only).
  const realtimeMode = (process.env['CLOUDPDF_REALTIME'] ?? '').toLowerCase();
  const realtimeBus =
    dbCtx.dialect === 'postgres' && realtimeMode !== 'in-process'
      ? new PostgresRealtimeBus(process.env['CLOUDPDF_DB_URL']!, (err) => {
          console.error('[cloudpdf] realtime bus error:', err);
        })
      : undefined;

  const bundle = await buildApp({
    licenseGate: licenseRuntime,
    ...(usageReporter ? { usageReporter } : {}),
    verifier: { mode: 'hs256', secret: JWT_SECRET },
    workerEntry: WORKER_ENTRY_URL,
    fallbackFonts: loadFallbackFontsFromEnv(),
    db: dbCtx.db,
    objectStore,
    cdnSigner,
    ...(kms ? { kms } : {}),
    cacheRoot: CACHE_ROOT,
    ...(CACHE_MAX_BYTES !== undefined ? { cacheMaxBytes: CACHE_MAX_BYTES } : {}),
    ...(AUTO_PROVISION_TENANT ? { autoProvisionTenant: true } : {}),
    expectedMigrations: dbCtx.migrations,
    failOnPending: FAIL_ON_PENDING,
    ...(realtimeBus ? { realtimeBus } : {}),
  });

  const onSignal = async (sig: string) => {
    bundle.app.log.info({ sig }, 'received signal, shutting down');
    try {
      await bundle.shutdown();
    } finally {
      usageReporter?.stop();
      try {
        await licenseRuntime.close();
      } finally {
        try {
          await dbCtx.db.destroy();
        } finally {
          process.exit(0);
        }
      }
    }
  };
  process.on('SIGINT', () => void onSignal('SIGINT'));
  process.on('SIGTERM', () => void onSignal('SIGTERM'));

  await bundle.app.listen({ port: PORT, host: HOST });
  usageReporter?.start();
  bundle.app.log.info(
    {
      port: PORT,
      host: HOST,
      db: dbCtx.describe,
      storage: objectStore.info.kind,
      cdn: cdnSigner.info.kind,
      kms: kms ? 'on' : 'off',
      cacheRoot: CACHE_ROOT,
    },
    'cloudpdf-server listening',
  );
}

async function createObjectStoreOrExit(resolver: SecretResolver): Promise<ObjectStore> {
  try {
    return await createObjectStore(loadObjectStoreConfigFromEnv(process.env), { resolver });
  } catch (err) {
    fail(2, err instanceof Error ? err.message : String(err));
  }
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

// ------- entrypoint -------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
    printHelp();
    return;
  }
  if (args.length === 0 || args[0] === 'serve') {
    await cmdServe();
    return;
  }
  if (args[0] === 'migrate') {
    const sub = args[1];
    const rest = args.slice(2);
    if (sub === 'status') return cmdMigrateStatus();
    if (sub === 'up') return cmdMigrateUp(rest);
    if (sub === 'down') return cmdMigrateDown(rest);
    if (sub === 'validate') return cmdMigrateValidate(rest);
    fail(2, `unknown subcommand: migrate ${sub ?? '(missing)'}\nrun: cloudpdf-server --help`);
  }
  if (args[0] === 'db') {
    const sub = args[1];
    if (sub === 'doctor') return cmdDbDoctor();
    fail(2, `unknown subcommand: db ${sub ?? '(missing)'}\nrun: cloudpdf-server --help`);
  }
  if (args[0] === 'audit') {
    const sub = args[1];
    const rest = args.slice(2);
    if (sub === 'export') return cmdAuditExport(rest);
    fail(2, `unknown subcommand: audit ${sub ?? '(missing)'}\nrun: cloudpdf-server --help`);
  }
  if (args[0] === 'license') {
    const sub = args[1];
    const rest = args.slice(2);
    if (sub === 'request') return cmdLicenseRequest(rest);
    if (sub === 'install') return cmdLicenseInstall(rest);
    if (sub === 'status') return cmdLicenseStatus();
    fail(2, `unknown subcommand: license ${sub ?? '(missing)'}\nrun: cloudpdf-server --help`);
  }
  fail(2, `unknown command: ${args[0]!}\nrun: cloudpdf-server --help`);
}

function readFlagValue(args: string[], name: string): string | undefined {
  const eq = args.find((arg) => arg.startsWith(`${name}=`));
  if (eq) {
    return eq.slice(name.length + 1);
  }
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    fail(2, `${name} requires a value`);
  }
  return value;
}

function readOptionalNumberFlag(args: string[], name: string): number | undefined {
  const raw = readFlagValue(args, name);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    fail(2, `${name} must be a non-negative number`);
  }
  return value;
}

function resolveAuditDay(value: string): string {
  if (value === 'yesterday') {
    return dayFromOffsetUtc(-1);
  }
  if (value === 'today') {
    return dayFromOffsetUtc(0);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(2, `--day must be YYYY-MM-DD, yesterday, or today (got ${value})`);
  }
  return value;
}

function dayFromOffsetUtc(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

main().catch((err) => {
  console.error('cloudpdf-server: failed:', err);
  process.exit(1);
});
