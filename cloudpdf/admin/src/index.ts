/**
 * @cloudpdf/admin - Node-only SDK for a customer's backend.
 *
 * Holds exactly one credential — the deployment's API token (root,
 * valid everywhere) or a delegated tenant JWT (valid under its own
 * tenant subtree) — and addresses tenant resources under
 * `/v1/tenants/{tenantId}/…` via `cloud.tenant(id)`.
 *
 * NEVER ship this SDK or its credentials to the browser. End users
 * receive doc-scoped tokens and call the engine via `@cloudpdf/engine`.
 */

export { createCloudAdmin, CloudAdmin, TenantClient } from './CloudAdmin';
export type { CloudAdminOptions } from './CloudAdmin';
export { Documents } from './documents/Documents';
export type {
  DocumentCreateInput,
  DocumentCreateResult,
  DocumentInitInput,
  DocumentCommitInput,
} from './documents/Documents';
export { Tenants } from './tenants/Tenants';
export type {
  TenantCreateInput,
  TenantCreateResult,
  TenantListOptions,
  TenantListPage,
} from './tenants/Tenants';
export { TenantTokens } from './tokens/TenantTokens';
export type {
  IssueDocTokenInput,
  IssueTenantTokenInput,
  IssuedToken,
  RevokeTokenOptions,
} from './tokens/TenantTokens';
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
