/**
 * @cloudpdf/admin - Node-only SDK for a customer's backend.
 *
 * Carries a tenant-scoped admin credential to mint user-scoped doc
 * JWTs, upload PDFs, and manage the document lifecycle against an
 * `@cloudpdf/server` deployment.
 *
 * NEVER ship this SDK or its credentials to the browser. End users
 * receive doc-scoped tokens (minted via `tokens.mintDocScoped`,
 * landing in Phase 2) and call the engine via `@cloudpdf/engine`.
 */

export { createCloudAdmin, CloudAdmin } from './CloudAdmin';
export type { CloudAdminOptions } from './CloudAdmin';
export { Documents } from './documents/Documents';
export type {
  DocumentCreateInput,
  DocumentCreateResult,
  DocumentInitInput,
  DocumentCommitInput,
} from './documents/Documents';
export { HttpClient } from './transport/HttpClient';
export type { HttpClientOptions, RequestOptions } from './transport/HttpClient';
export { AdminError } from './transport/AdminError';
export type {
  DocumentRecord,
  DocumentState,
  DedupMode,
  InitResponse,
  InitResponseUpload,
  InitResponseCreatedOrResumed,
  InitResponseDeduped,
  CommitResponse,
  ListResponse,
  DocumentResponse,
  AdminErrorPayload,
} from './documents/types';
