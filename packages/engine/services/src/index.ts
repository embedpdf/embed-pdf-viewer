/**
 * @embedpdf/engine-services - synchronous, runtime-agnostic PDF runtime service
 * implementations shared by every Engine v3 host (browser worker, server
 * worker_thread, future direct-thread embedding).
 *
 * Layout (strict downward dependency):
 *   runtime/           — low-level @embedpdf/engine-runtime helpers
 *   shared/            — generic runtime-agnostic helpers
 *   document-session/  — lifecycle and identity state of one open document
 *   features/          — domain capabilities (metadata, annotations, pages, ...)
 *   worker-host/       — worker wire dispatch (WorkerHost)
 */

// Tier 1: runtime / shared
export { ensureInitialized, destroyLibrary } from './runtime/lifecycle/bootstrap';
export { throwIfAborted } from './shared/abort';
export { generateUuid } from './shared/uuid';
export { formatPdfDate, pdfDateToIso } from './shared/pdf-date';
export {
  ALL_STANDARD_SECURITY_PERMISSIONS,
  hasAllStandardSecurityPermissions,
  normalizeU32,
} from './shared/securityPermissions';

// Engine-shell shared: the in-process DocumentEventStream implementation.
// Lives on the MAIN thread next to the DocumentHandle (not in the worker
// tiers): the engine that performs a mutation publishes at confirmation time.
export { EventHub, SessionEventPublisher } from './events/EventHub';

// Tier 2: document session
export { DocumentSession } from './document-session/DocumentSession';
export { BaseDocumentRegistry } from './document-session/lifecycle/BaseDocumentRegistry';
export {
  CloseStack,
  openFatMemoryDocument,
  openLayerDocument,
  type AcquiredBaseDocument,
  type LayerSource,
  type OpenedPdfDocument,
  type OpenedPdfDocumentKind,
} from './document-session/lifecycle/PdfDocumentOpener';
export {
  LocalRevisionAuthority,
  type RevisionAuthority,
} from './document-session/revisions/RevisionAuthority';
export { PagePtrPool } from './document-session/pages/PagePtrPool';
export type { PageRecord } from './document-session/pages/PageRecord';

// Tier 3: features
export * from './features/metadata';
export * from './features/pages';
export * from './features/redaction';
export * from './features/text';
export * from './features/geometry';
export { EPDF_CHAR_GEOMETRY_LAYOUT } from './runtime/memory/structs';
export * from './features/render';
export * from './features/annotations';
export * from './features/attachments';
export * from './features/security';
export * from './features/save';
export * from './features/fonts';
export * from './features/forms';
export * from './features/search';
export * from './features/actions';

// Tier 4: worker host
export { WorkerHost } from './worker-host/WorkerHost';
