# Database migrations & rollback

`@cloudpdf/server` ships its schema as an ordered set of SQL migrations
(`NNN_name.sql`) for both SQLite and Postgres, applied by the migrator in
[`src/db/migrator/runner.ts`](src/db/migrator/runner.ts). Each applied
migration is recorded in `schema_migrations` with a SHA-256 checksum of
its `up` SQL, so editing an already-applied migration is detected as
drift and refused at boot.

Every migration also ships an inverse `NNN_name.down.sql`. Forward
(`up`) is routine; backward (`down`) is a **manual break-glass tool**.

## Commands

```sh
cloudpdf-server migrate status                 # applied / pending / drift
cloudpdf-server migrate up                      # apply pending (forward)
cloudpdf-server migrate up --dry-run            # preview forward plan
cloudpdf-server migrate down --dry-run          # preview rollback plan
cloudpdf-server migrate down --steps 1 --yes    # roll back the newest migration
cloudpdf-server migrate down --to 011 --yes     # roll back everything newer than 011
cloudpdf-server migrate down --all --yes        # roll back the entire history
cloudpdf-server migrate validate [--strict]     # CI / boot drift gate
```

`migrate down` selection:

- `--steps N` — roll back the `N` highest applied migrations (default 1).
- `--to NNN` — roll back every applied migration **newer than** `NNN`,
  leaving `NNN` and everything below it applied.
- `--all` — roll back everything (down to an empty schema; the
  runner-owned `schema_migrations` table is preserved).

Safety:

- `migrate down` is destructive, so a real run **requires `--yes`**
  (containers are non-interactive). Use `--dry-run` to print the exact
  versions and order first.
- The whole revert set is validated **before** any DB change: each
  target must exist in code, its stored up-checksum must still match the
  code (otherwise pass `--force`), and it must declare non-empty `down`
  SQL. If any target is irreversible the command aborts without touching
  the database.
- `down` restores **structure, not data**. Re-creating a dropped column
  or table cannot bring back the rows/values that were in it. This is the
  standard rollback caveat and is harmless pre-launch.

## Rollback runbook (Docker / Helm)

Rollback is operator-initiated and runs as a one-shot, not via a Helm
hook:

```sh
# Preview first.
docker run --rm \
  -e CLOUDPDF_DB_DRIVER=postgres \
  -e CLOUDPDF_DB_URL=postgres://user:pass@host:5432/cloudpdf \
  ghcr.io/<org>/cloudpdf-server:<tag> \
  migrate down --to 011 --dry-run

# Then execute.
docker run --rm \
  -e CLOUDPDF_DB_DRIVER=postgres \
  -e CLOUDPDF_DB_URL=postgres://user:pass@host:5432/cloudpdf \
  ghcr.io/<org>/cloudpdf-server:<tag> \
  migrate down --to 011 --yes
```

**Ordering rule:** roll the application image back to a version that is
compatible with the _target_ schema **first**, then run `migrate down`.
Going down before the app is compatible can break live requests against
the older schema.

Prefer backward-compatible **expand/contract** migrations (add the new
column/table, deploy code that tolerates both shapes, only later drop the
old shape) so `down` stays a rare break-glass action rather than part of
the routine deploy.

## What never rolls back automatically

- Auto-migrate on boot (`CLOUDPDF_AUTO_MIGRATE`, default on for SQLite,
  off for Postgres) only ever applies **forward** migrations.
- `buildApp` validates for drift and can refuse to start
  (`CLOUDPDF_FAIL_ON_PENDING=1`) but never rolls anything back.
- There is no Helm pre-upgrade/rollback hook that runs `migrate down`.
  Down is exclusively the operator-run command above.

## Adding a migration

1. Add `NNN_name.sql` to **both** `src/db/migrations/sqlite/` and
   `src/db/migrations/postgres/`.
2. Add the matching `NNN_name.down.sql` to both dialects (reverse the up
   in child-before-parent FK order).
3. Register both in `sqlite/index.ts` and `postgres/index.ts`
   (`{ version, name, sql, down }`).
4. Run `pnpm --filter @cloudpdf/server test` — the round-trip test
   (`test/migrator-down.test.ts`) asserts `up → down --all → up` works on
   both dialects.

### SQLite `DROP COLUMN` caveat

SQLite refuses `ALTER TABLE ... DROP COLUMN` for a column referenced by a
`CHECK` constraint (or index/PK/FK/generated expression). When a down
needs to remove such a column, rebuild the table instead (see
`sqlite/007_document_security.down.sql`): mark the file
`-- pragma: no-transaction`, `PRAGMA foreign_keys=OFF`, create the
table's prior shape, copy, drop, rename, recreate indexes,
`PRAGMA foreign_keys=ON`. Postgres has no such limitation and drops the
columns directly.
