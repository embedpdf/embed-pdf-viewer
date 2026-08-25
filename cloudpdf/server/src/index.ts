/**
 * @cloudpdf/server - self-hostable Engine v3 server.
 *
 * Programmatic API used by tests and integrators. The CLI entry point lives
 * at bin/cloudpdf-server.ts.
 */
export { buildApp } from './app/buildApp';
export type { BuildAppOptions, AppBundle } from './app/buildApp';

/**
 * @license FCL-1.0-ALv2
 *
 * WARNING: The exports below provide CloudPDF's required license runtime.
 * Removing or modifying them to disable or circumvent license enforcement,
 * enable protected functionality without a valid license key, or remove
 * protected functionality is a breach of FCL-1.0-ALv2 while this release is
 * governed by that license. See cloudpdf/server/LICENSE.
 */
export { createLicenseRuntime } from './licensing/public';
export type { CloudPdfLicenseRuntime } from './licensing/public';
export {
  createJwtVerifier,
  Hs256Verifier,
  AsymmetricVerifier,
  JwksVerifier,
  signDevToken,
  hasTenantScope,
  hasDocScope,
  isTenantClaims,
  isDocUserClaims,
} from './auth/JwtVerifier';
export type {
  BaseClaims,
  DocUserClaims,
  TenantClaims,
  JwtClaims,
  JwtVerifier,
  JwtVerifierConfig,
  JwtAudienceProfile,
  JwksCacheStore,
  RevocationCheck,
  SignDevTokenInput,
  TenantScope,
  DocScope,
} from './auth/JwtVerifier';
export { requireTenant, requireScope, requireDocAccess } from './app/jwt-plugin';
export type { DocAccessMode } from './app/jwt-plugin';
export { RevokedJtisGuard } from './auth/RevokedJtisGuard';
export type { RevokedJtisGuardOptions } from './auth/RevokedJtisGuard';
export { DbJwksCacheStore } from './auth/JwksCacheStore';
export { WorkerThreadPool } from './runtime/WorkerThreadPool';
export type {
  WorkerThreadPoolOptions,
  FallbackFontDescriptor,
  WorkerBootstrapData,
} from './runtime/WorkerThreadPool';
export { loadFallbackFontsFromEnv } from './runtime/loadFallbackFontsFromEnv';
export * from './security/index';

// Phase 1 cloud platform surfaces.
export { createSqliteDb } from './db/drivers/sqlite';
export type { CreateSqliteDbOptions } from './db/drivers/sqlite';
export { createPostgresDb } from './db/drivers/postgres';
export type { CreatePostgresDbOptions } from './db/drivers/postgres';
export { migrate, migrateDown, status, validate, validateOrThrow } from './db/migrator/runner';
export type {
  MigrationSource,
  MigrateInput,
  MigrateOptions,
  MigrateDownOptions,
  MigrationStatusEntry,
  DriftIssue,
  DriftKind,
} from './db/migrator/runner';
export { sqliteMigrations } from './db/migrations/sqlite/index';
export { postgresMigrations } from './db/migrations/postgres/index';
export type {
  Database as DbSchema,
  DocumentState,
  TenantsTable,
  DocumentsTable,
  DocumentPagesTable,
  LayersTable,
  LayerPagesTable,
  WeakAnnotationSessionsTable,
  WeakAnnotationSessionPagesTable,
  AuditLogTable,
} from './db/schema';
export { DocumentsRepo } from './db/repos/documents.repo';
export type { DocumentRow, CreatePendingInput, CommitInput } from './db/repos/documents.repo';
export { TenantsRepo } from './db/repos/tenants.repo';
export type { TenantRow } from './db/repos/tenants.repo';
export { DocumentPagesRepo, LayersRepo, LayerPagesRepo } from './db/repos/page_state.repo';
export type {
  DurablePageRow,
  UpsertDurablePageInput,
  LayerRow,
  CreateLayerInput,
} from './db/repos/page_state.repo';
export { WeakAnnotationSessionsRepo } from './db/repos/weak_annotation_sessions.repo';
export type {
  WeakAnnotationSessionRow,
  WeakAnnotationSessionScope,
} from './db/repos/weak_annotation_sessions.repo';
export { AuditLogRepo } from './db/repos/audit_log.repo';
export type {
  AppendAuditLogInput,
  AuditDocKey,
  AuditMutationKind,
} from './db/repos/audit_log.repo';
export { AuditExportsRepo } from './db/repos/audit_exports.repo';
export type {
  AuditExportClaimResult,
  AuditExportRow,
  AuditExportScope,
  AuditExportStatus,
} from './db/repos/audit_exports.repo';
export { StorageKeys } from './storage/keys';
export { FsObjectStore } from './storage/adapters/FsObjectStore';
export type { FsObjectStoreOptions } from './storage/adapters/FsObjectStore';
export { S3ObjectStore } from './storage/adapters/S3ObjectStore';
export type { S3ObjectStoreOptions } from './storage/adapters/S3ObjectStore';
export { GcsObjectStore } from './storage/adapters/GcsObjectStore';
export type { GcsObjectStoreOptions } from './storage/adapters/GcsObjectStore';
export { AzureBlobObjectStore } from './storage/adapters/AzureBlobObjectStore';
export type { AzureBlobObjectStoreOptions } from './storage/adapters/AzureBlobObjectStore';
export { createObjectStore, type CreateObjectStoreOptions } from './storage/createObjectStore';
export {
  ObjectStoreConfigSchema,
  type ObjectStoreConfig,
} from './storage/config/ObjectStoreConfigSchema';
export { loadObjectStoreConfigFromEnv } from './storage/config/loadObjectStoreConfigFromEnv';

// Import (server-side pull) family for documents.importFrom.
export type { ImportSource, ImportSourceInfo, ImportSourceOpen } from './import/ImportSource';
export { ImportSourceError } from './import/ImportSource';
export { createImportSource } from './import/createImportSource';
export { UrlImportSource, isPubliclyRoutableAddress } from './import/adapters/UrlImportSource';
export {
  ImportPolicySchema,
  defaultImportPolicy,
  type ImportPolicy,
} from './import/config/ImportPolicySchema';
export { loadImportPolicyFromEnv } from './import/config/loadImportPolicyFromEnv';
export {
  ImportConnectionSchema,
  ImportConnectionScopeSchema,
  type AzureBlobImportConnection,
  type FsImportConnection,
  type GcsImportConnection,
  type ImportConnection,
  type ImportConnectionScope,
  type S3ImportConnection,
} from './import/config/ImportConnectionSchema';
export { loadImportConnectionsFromEnv } from './import/config/loadImportConnectionsFromEnv';
export { ImportConnectionRegistry } from './import/ImportConnectionRegistry';
export { ImportWorker, type ImportWorkerOptions } from './import/ImportWorker';
export { S3ImportSource } from './import/adapters/S3ImportSource';
export { GcsImportSource } from './import/adapters/GcsImportSource';
export { AzureBlobImportSource } from './import/adapters/AzureBlobImportSource';
export { FsImportSource } from './import/adapters/FsImportSource';
export {
  resolveScopePrefixes,
  targetsDeploymentStorage,
  type ImportCallerContext,
  type ImportSourceDeps,
} from './import/createImportSource';
export { DocumentImportsRepo, type DocumentImportRow } from './db/repos/document_imports.repo';

// CDN adapter family (signers + factory + config + None adapter).
// HMAC/CloudFront adapters ship in commit G; purge wiring in commit H.
export type {
  CdnSigner,
  CdnSignerInfo,
  SignInput,
  PurgeInput,
  PurgeReceipt,
} from './cdn/CdnSigner';
export { createCdnSigner, type CreateCdnSignerOptions } from './cdn/createCdnSigner';
export { CdnConfigSchema, type CdnConfig } from './cdn/config/CdnConfigSchema';
export { loadCdnConfigFromEnv } from './cdn/config/loadCdnConfigFromEnv';
export { NoneCdnSigner } from './cdn/adapters/NoneCdnSigner';
export { BunnyCdnSigner, signBunnyToken } from './cdn/adapters/BunnyCdnSigner';
export { CloudCdnSigner, signCloudCdnPrefix } from './cdn/adapters/CloudCdnSigner';
export {
  CloudFrontCdnSigner,
  signCloudFrontPolicy,
  signCloudFrontPolicyForResources,
} from './cdn/adapters/CloudFrontCdnSigner';
export { AzureFrontDoorCdnSigner, signAzureFdToken } from './cdn/adapters/AzureFrontDoorCdnSigner';
export { CustomHmacCdnSigner, signCustomHmacToken } from './cdn/adapters/CustomHmacCdnSigner';
export type {
  ObjectStore,
  ObjectStoreInfo,
  ObjectStoreKind,
  ObjectStoreWithInfo, // deprecated alias for back-compat
  ObjectBody,
  ObjectStat,
  PresignedUpload,
  PresignedDownload,
  PresignUploadOpts,
} from './storage/ObjectStore';
export { DocumentLifecycleService } from './services/DocumentLifecycleService';
export type {
  DocumentLifecycleOptions,
  DedupMode,
  InitInput,
  InitResult,
  InitUpload,
  CommitResult,
  UploadProxyInput,
  UploadPreference,
  UploadProxyPolicy,
} from './services/DocumentLifecycleService';

// Phase 3 — document open + worker integration.
export { BaseFileCache, fileSha256 } from './storage/BaseFileCache';
export type {
  BaseFileCacheOptions,
  BaseFileCacheEvent,
  LocalFileHandle,
} from './storage/BaseFileCache';
export { ShaMismatchError } from './storage/ObjectStore';
export type { MaterializeOpts, MaterializeResult } from './storage/ObjectStore';
export { DocumentService } from './services/DocumentService';
export type {
  DocumentServiceOptions,
  DocumentHead,
  DocumentManifest,
  OpenContext,
} from './services/DocumentService';
export { CloudRevisionBridge } from './services/CloudRevisionBridge';
export type { AnnotationMutationResult } from './services/CloudRevisionBridge';
export { EventLogService } from './services/EventLogService';
export type {
  AuditEvent,
  EventLogServiceOptions,
  ExportDayInput,
  ExportDayResult,
  ExportDocDayInput,
  ExportDocDayResult,
} from './services/EventLogService';
export { LayerStateService } from './services/LayerStateService';
export type { LayerStateServiceOptions, MutationImpactKind } from './services/LayerStateService';
export { LayerService } from './services/LayerService';
export type {
  LayerServiceOptions,
  LayerWriteContext,
  MaterializedLayer,
} from './services/LayerService';
export { WeakAnnotationSessionService } from './services/WeakAnnotationSessionService';
export type {
  WeakAnnotationSessionServiceOptions,
  WeakAnnotationSessionContext,
  WeakAnnotationSessionResult,
} from './services/WeakAnnotationSessionService';

/**
 * Stable URL of the bundled worker_thread entry. Resolves to:
 *   - `src/runtime/worker-entry.ts` during dev (tsx)
 *   - `dist/runtime/worker-entry.js` after the Vite build
 *
 * Anchored on `import.meta.url` of this file so it survives Vite's
 * library-mode chunk splitting (the entry of the package always lives at
 * the dist root, regardless of how shared code is factored out).
 */
export const defaultWorkerEntryUrl: URL = new URL('./runtime/worker-entry.js', import.meta.url);

/** Engine-host child entry (engineIsolation: 'host'); dist sibling of the worker entry. */
export const defaultEngineHostEntryUrl: URL = new URL(
  './runtime/engine-host-entry.js',
  import.meta.url,
);

export type { BuildPack, EnginePool } from './runtime/EnginePool';
export { EngineHostClient } from './runtime/EngineHostClient';
export {
  EngineRecycler,
  resolveRecycleConfig,
  type EngineRecyclePolicy,
} from './runtime/EngineRecycler';
export {
  EngineBusyError,
  SchedulingEnginePool,
  type EngineSchedulingConfig,
  type LaneStats,
  type SchedulingLane,
} from './runtime/SchedulingEnginePool';
export type {
  EngineHostClientOptions,
  HostCrashEvent,
  HostCrashSuspect,
} from './runtime/EngineHostClient';
export type { HostBootConfig } from './runtime/host-protocol';
