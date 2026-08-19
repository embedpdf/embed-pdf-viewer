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
import down010 from './010_layer_layout_version.down.sql';
import sql010 from './010_layer_layout_version.sql';
import down011 from './011_drop_page_index.down.sql';
import sql011 from './011_drop_page_index.sql';
import down012 from './012_layer_metadata_version.down.sql';
import sql012 from './012_layer_metadata_version.sql';
import down013 from './013_realtime_events.down.sql';
import sql013 from './013_realtime_events.sql';
import down014 from './014_layer_attachments_version.down.sql';
import sql014 from './014_layer_attachments_version.sql';
import down015 from './015_document_thumbnail.down.sql';
import sql015 from './015_document_thumbnail.sql';
import down016 from './016_license_runtime.down.sql';
import sql016 from './016_license_runtime.sql';
import down017 from './017_license_usage.down.sql';
import sql017 from './017_license_usage.sql';
import down018 from './018_documents_list_order.down.sql';
import sql018 from './018_documents_list_order.sql';
import down019 from './019_tenant_provenance.down.sql';
import sql019 from './019_tenant_provenance.sql';
import down020 from './020_security_events.down.sql';
import sql020 from './020_security_events.sql';
import down021 from './021_share_grants.down.sql';
import sql021 from './021_share_grants.sql';
import down022 from './022_tenant_usage.down.sql';
import sql022 from './022_tenant_usage.sql';
import down023 from './023_tenant_status.down.sql';
import sql023 from './023_tenant_status.sql';
import down024 from './024_upload_intent.down.sql';
import sql024 from './024_upload_intent.sql';
import down025 from './025_upload_kind_pull.down.sql';
import sql025 from './025_upload_kind_pull.sql';
import down026 from './026_document_imports.down.sql';
import sql026 from './026_document_imports.sql';
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
  { version: '015', name: '015_document_thumbnail.sql', sql: sql015, down: down015 },
  { version: '016', name: '016_license_runtime.sql', sql: sql016, down: down016 },
  { version: '017', name: '017_license_usage.sql', sql: sql017, down: down017 },
  { version: '018', name: '018_documents_list_order.sql', sql: sql018, down: down018 },
  { version: '019', name: '019_tenant_provenance.sql', sql: sql019, down: down019 },
  { version: '020', name: '020_security_events.sql', sql: sql020, down: down020 },
  { version: '021', name: '021_share_grants.sql', sql: sql021, down: down021 },
  { version: '022', name: '022_tenant_usage.sql', sql: sql022, down: down022 },
  { version: '023', name: '023_tenant_status.sql', sql: sql023, down: down023 },
  { version: '024', name: '024_upload_intent.sql', sql: sql024, down: down024 },
  { version: '025', name: '025_upload_kind_pull.sql', sql: sql025, down: down025 },
  { version: '026', name: '026_document_imports.sql', sql: sql026, down: down026 },
];
