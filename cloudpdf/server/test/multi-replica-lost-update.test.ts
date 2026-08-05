import { runMultiReplicaSuite } from './_helpers/multi-replica-suite';
import { sqliteReplicaFactory } from './_helpers/two-replica-harness';

/**
 * The multi-replica correctness suite on SQLite: N buildApp bundles over
 * one shared database file + one FsObjectStore. SQLite cannot represent
 * overlapping commit transactions (single writer), so the overlap test is
 * skipped here — `multi-replica-postgres.test.ts` runs the full suite on
 * the engine production multi-replica actually mandates.
 */
runMultiReplicaSuite(sqliteReplicaFactory());
