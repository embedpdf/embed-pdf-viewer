import down001 from './001_initial.down.sql';
import sql001 from './001_initial.sql';
import down002 from './002_auth.down.sql';
import sql002 from './002_auth.sql';
import down003 from './003_layer_state.down.sql';
import sql003 from './003_layer_state.sql';
import down004 from './004_weak_annotation_sessions.down.sql';
import sql004 from './004_weak_annotation_sessions.sql';
import down005 from './005_audit_log.down.sql';
import sql005 from './005_audit_log.sql';
import down006 from './006_audit_exports.down.sql';
import sql006 from './006_audit_exports.sql';
import down007 from './007_document_security.down.sql';
import sql007 from './007_document_security.sql';
import down008 from './008_pdf_password_verifications.down.sql';
import sql008 from './008_pdf_password_verifications.sql';
import down009 from './009_pdf_password_sessions.down.sql';
import sql009 from './009_pdf_password_sessions.sql';
import sql010 from './010_layer_layout_version.sql';
import sql011 from './011_drop_page_index.sql';
import sql012 from './012_layer_metadata_version.sql';
import sql013 from './013_realtime_events.sql';
import sql014 from './014_layer_attachments_version.sql';
import down010 from './010_layer_layout_version.down.sql';
import down011 from './011_drop_page_index.down.sql';
import down012 from './012_layer_metadata_version.down.sql';
import down013 from './013_realtime_events.down.sql';
import down014 from './014_layer_attachments_version.down.sql';
import type { MigrationSource } from '../../migrator/runner';

/**
 * Postgres migration set, dialect-parallel to `./sqlite`. The `.sql`
 * files in this directory are the canonical, syntax-highlighted source;
 * tsup's text loader inlines them at bundle time (see the SQLite
 * index for the same pattern + sql.d.ts shim).
 *
 * The repo conformance test (`test/_helpers/db-conformance.ts`)
 * asserts that both this set and the SQLite set produce repos that
 * pass the exact same behavioural suite — proving the abstraction is
 * real.
 */
export const postgresMigrations: ReadonlyArray<MigrationSource> = [
  { version: '001', name: '001_initial.sql', sql: sql001, down: down001 },
  { version: '002', name: '002_auth.sql', sql: sql002, down: down002 },
  { version: '003', name: '003_layer_state.sql', sql: sql003, down: down003 },
  { version: '004', name: '004_weak_annotation_sessions.sql', sql: sql004, down: down004 },
  { version: '005', name: '005_audit_log.sql', sql: sql005, down: down005 },
  { version: '006', name: '006_audit_exports.sql', sql: sql006, down: down006 },
  { version: '007', name: '007_document_security.sql', sql: sql007, down: down007 },
  { version: '008', name: '008_pdf_password_verifications.sql', sql: sql008, down: down008 },
  { version: '009', name: '009_pdf_password_sessions.sql', sql: sql009, down: down009 },
  { version: '010', name: '010_layer_layout_version.sql', sql: sql010, down: down010 },
  { version: '011', name: '011_drop_page_index.sql', sql: sql011, down: down011 },
  { version: '012', name: '012_layer_metadata_version.sql', sql: sql012, down: down012 },
  { version: '013', name: '013_realtime_events.sql', sql: sql013, down: down013 },
  { version: '014', name: '014_layer_attachments_version.sql', sql: sql014, down: down014 },
];
