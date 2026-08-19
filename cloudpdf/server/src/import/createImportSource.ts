/**
 * Factory + AUTHORIZATION LAYER for the import-source family.
 *
 * The wire descriptor discriminates authorization models, not storage
 * vendors: `url` carries its own authority (the caller minted it);
 * `connection` names operator pre-registered authority. Every gate
 * for connection sources fires HERE, before any provider adapter is
 * constructed and before any network activity:
 *
 *   1. the connection must exist;
 *   2. the caller's credential class must be allowed by it
 *      (default: api-token only);
 *   3. the AUTHENTICATED tenant must be allowed by it;
 *   4. the key must fall inside the resolved scope — for
 *      tenant-template scopes, `{tenantId}` is substituted with the
 *      authenticated tenant (validated against the contract's
 *      tenantIdPattern, never request-supplied text);
 *   5. the connection must not point at the deployment's own storage
 *      (fingerprint below — cross-tenant exfiltration primitive).
 *
 * Provider adapters stay pure byte-readers.
 */
import { tenantIdPattern, type AdminImportSource } from '@cloudpdf/contract';

import { S3ImportSource } from './adapters/S3ImportSource';
import { UrlImportSource } from './adapters/UrlImportSource';
import type { ImportConnectionScope, S3ImportConnection } from './config/ImportConnectionSchema';
import { TENANT_PLACEHOLDER } from './config/ImportConnectionSchema';
import type { ImportPolicy } from './config/ImportPolicySchema';
import type { ImportConnectionRegistry } from './ImportConnectionRegistry';
import { ImportSourceError, type ImportSource } from './ImportSource';
import type { ObjectStoreInfo } from '../storage/ObjectStore';

export interface ImportCallerContext {
  /** Which credential class authenticated the request. */
  via: 'api-token' | 'tenant-jwt';
  /** The AUTHENTICATED tenant (path tenant, verified by the route). */
  tenantId: string;
}

export interface ImportSourceDeps {
  policy: ImportPolicy;
  caller: ImportCallerContext;
  connections: ImportConnectionRegistry;
  /** Deployment ObjectStore identity — always refused as a source. */
  deploymentStorage: ObjectStoreInfo;
}

export function createImportSource(
  config: AdminImportSource,
  deps: ImportSourceDeps,
): ImportSource {
  switch (config.kind) {
    case 'url':
      return new UrlImportSource({ url: config.url, policy: deps.policy });
    case 'connection':
      return resolveConnectionSource(config, deps);
  }
}

function resolveConnectionSource(
  config: Extract<AdminImportSource, { kind: 'connection' }>,
  deps: ImportSourceDeps,
): ImportSource {
  const conn = deps.connections.get(config.connectionId);
  if (!conn) {
    throw new ImportSourceError(
      'policy',
      `unknown import connection ${config.connectionId}`,
      false,
    );
  }
  if (!conn.credentials.includes(deps.caller.via)) {
    throw new ImportSourceError(
      'policy',
      `connection ${conn.id} is not usable with ${deps.caller.via} credentials`,
      false,
    );
  }
  if (conn.tenants !== '*' && !conn.tenants.includes(deps.caller.tenantId)) {
    throw new ImportSourceError(
      'policy',
      `connection ${conn.id} is not enabled for this tenant`,
      false,
    );
  }
  const prefixes = resolveScopePrefixes(conn.scope, deps.caller.tenantId);
  if (prefixes !== null && !prefixes.some((p) => config.key.startsWith(p))) {
    throw new ImportSourceError(
      'policy',
      `key is outside the prefixes granted to connection ${conn.id}`,
      false,
    );
  }
  switch (conn.kind) {
    case 's3': {
      if (targetsDeploymentStorage(conn, deps.deploymentStorage)) {
        throw new ImportSourceError(
          'policy',
          'import connections must not point at the deployment storage bucket',
          false,
        );
      }
      return new S3ImportSource({
        connection: conn,
        key: config.key,
        revision: config.revision,
        policy: deps.policy,
      });
    }
  }
}

/**
 * Scope → concrete allowed prefixes for THIS caller. `null` = whole
 * bucket (already boot-gated to api-token-only connections).
 */
export function resolveScopePrefixes(
  scope: ImportConnectionScope,
  tenantId: string,
): string[] | null {
  switch (scope.kind) {
    case 'whole-bucket':
      return null;
    case 'shared-prefixes':
      return scope.prefixes;
    case 'tenant-template': {
      // The id is authenticated, but defend anyway: an id outside the
      // contract's tenant charset must never widen a prefix.
      if (!tenantIdPattern.test(tenantId)) {
        throw new ImportSourceError(
          'policy',
          'tenant id is not usable with a templated connection',
          false,
        );
      }
      return [scope.template.replace(TENANT_PLACEHOLDER, tenantId)];
    }
  }
}

type S3EndpointClass = { class: 'aws' } | { class: 'custom'; host: string } | { class: 'unknown' };

function classifyS3Endpoint(endpoint: string | undefined): S3EndpointClass {
  if (!endpoint) return { class: 'aws' }; // implicit AWS resolution
  try {
    const host = new URL(endpoint).host.toLowerCase();
    if (host === 'amazonaws.com' || host.endsWith('.amazonaws.com')) return { class: 'aws' };
    return { class: 'custom', host };
  } catch {
    return { class: 'unknown' };
  }
}

/**
 * Canonical backend fingerprint for the self-import refusal. Bucket
 * names are only meaningful per provider: on AWS they are
 * partition-global (implicit resolution and explicit *.amazonaws.com
 * endpoints are the SAME namespace); on custom endpoints (R2/MinIO)
 * identity is (host, bucket). Doubt resolves toward blocking —
 * over-blocking costs a rename, under-blocking is the vulnerability.
 */
export function targetsDeploymentStorage(
  conn: S3ImportConnection,
  storage: ObjectStoreInfo,
): boolean {
  if (storage.kind !== 's3') return false;
  if (storage['bucket'] !== conn.bucket) return false;
  const a = classifyS3Endpoint(conn.endpoint);
  const b = classifyS3Endpoint(
    typeof storage['endpoint'] === 'string' ? storage['endpoint'] : undefined,
  );
  if (a.class === 'unknown' || b.class === 'unknown') return true; // conservative
  if (a.class === 'aws' && b.class === 'aws') return true;
  if (a.class === 'custom' && b.class === 'custom') return a.host === b.host;
  return false; // classified as different providers
}
