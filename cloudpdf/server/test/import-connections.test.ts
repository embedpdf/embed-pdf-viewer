/**
 * Import-connection configuration: env loader conventions, boot-time
 * fail-closed validation (scope union invariants, template rules,
 * env-name collisions), and registry construction.
 */
import { describe, expect, test } from 'vitest';

import { ImportConnectionSchema } from '../src/import/config/ImportConnectionSchema';
import { loadImportConnectionsFromEnv } from '../src/import/config/loadImportConnectionsFromEnv';
import { ImportConnectionRegistry } from '../src/import/ImportConnectionRegistry';

function envFor(name: string, vars: Record<string, string>): NodeJS.ProcessEnv {
  const norm = name.toUpperCase().replace(/-/g, '_');
  const env: NodeJS.ProcessEnv = { CLOUDPDF_IMPORT_CONNECTIONS: name };
  for (const [k, v] of Object.entries(vars)) {
    env[`CLOUDPDF_IMPORT_CONNECTION_${norm}_${k}`] = v;
  }
  return env;
}

const S3_MINIMUM = { KIND: 's3', S3_BUCKET: 'customer-documents', S3_REGION: 'eu-west-1' };

describe('loadImportConnectionsFromEnv', () => {
  test('no declared connections yields an empty list', () => {
    expect(loadImportConnectionsFromEnv({})).toEqual([]);
    expect(loadImportConnectionsFromEnv({ CLOUDPDF_IMPORT_CONNECTIONS: '' })).toEqual([]);
  });

  test("the client's six-line setup: whole bucket, api-token only, all tenants", () => {
    const [conn] = loadImportConnectionsFromEnv(envFor('customer-archive', S3_MINIMUM));
    expect(conn).toMatchObject({
      kind: 's3',
      id: 'customer-archive',
      bucket: 'customer-documents',
      region: 'eu-west-1',
      credentials: ['api-token'],
      tenants: '*',
      scope: { kind: 'whole-bucket' },
    });
  });

  test('endpoint, credentials, tenants, and shared-prefix scope parse', () => {
    const [conn] = loadImportConnectionsFromEnv(
      envFor('minio-docs', {
        ...S3_MINIMUM,
        S3_ENDPOINT: 'https://minio.internal:9000',
        CREDENTIALS: 'api-token,tenant-jwt',
        TENANTS: 'acme,globex',
        SCOPE: 'shared-prefixes',
        SCOPE_PREFIXES: 'shared/,brochures/',
      }),
    );
    expect(conn).toMatchObject({
      endpoint: 'https://minio.internal:9000',
      credentials: ['api-token', 'tenant-jwt'],
      tenants: ['acme', 'globex'],
      scope: { kind: 'shared-prefixes', prefixes: ['shared/', 'brochures/'] },
    });
  });

  test('tenant-template scope parses', () => {
    const [conn] = loadImportConnectionsFromEnv(
      envFor('acme-docs', {
        ...S3_MINIMUM,
        CREDENTIALS: 'api-token,tenant-jwt',
        SCOPE: 'tenant-template',
        SCOPE_TEMPLATE: 'tenants/{tenantId}/',
      }),
    );
    expect(conn?.scope).toEqual({ kind: 'tenant-template', template: 'tenants/{tenantId}/' });
  });

  test('unsupported kinds and missing required vars refuse to boot', () => {
    expect(() =>
      loadImportConnectionsFromEnv(envFor('x', { ...S3_MINIMUM, KIND: 'gcs' })),
    ).toThrowError(/KIND must be 's3'/);
    expect(() =>
      loadImportConnectionsFromEnv(envFor('x', { KIND: 's3', S3_REGION: 'eu-west-1' })),
    ).toThrowError(/S3_BUCKET is required/);
  });

  test('normalized env-name collisions refuse to boot', () => {
    const env: NodeJS.ProcessEnv = {
      CLOUDPDF_IMPORT_CONNECTIONS: 'customer-archive,customer_archive',
      CLOUDPDF_IMPORT_CONNECTION_CUSTOMER_ARCHIVE_KIND: 's3',
      CLOUDPDF_IMPORT_CONNECTION_CUSTOMER_ARCHIVE_S3_BUCKET: 'b',
      CLOUDPDF_IMPORT_CONNECTION_CUSTOMER_ARCHIVE_S3_REGION: 'r',
    };
    expect(() => loadImportConnectionsFromEnv(env)).toThrowError(/collide as CUSTOMER_ARCHIVE/);
  });

  test('connection names outside [A-Za-z0-9_-] refuse to boot', () => {
    expect(() =>
      loadImportConnectionsFromEnv({ CLOUDPDF_IMPORT_CONNECTIONS: 'bad name' }),
    ).toThrowError(/must use \[A-Za-z0-9_-\]/);
  });

  test('mismatched scope variables refuse to boot', () => {
    expect(() =>
      loadImportConnectionsFromEnv(
        envFor('x', { ...S3_MINIMUM, SCOPE_TEMPLATE: 'tenants/{tenantId}/' }),
      ),
    ).toThrowError(/whole-bucket must not set/);
    expect(() =>
      loadImportConnectionsFromEnv(
        envFor('x', { ...S3_MINIMUM, SCOPE: 'shared-prefixes', SCOPE_PREFIXES: 'a/', SCOPE_TEMPLATE: 't/{tenantId}/' }),
      ),
    ).toThrowError(/must not set SCOPE_TEMPLATE/);
  });
});

describe('ImportConnectionSchema invariants', () => {
  const base = { kind: 's3', id: 'c', bucket: 'b', region: 'r' };

  test('tenant-jwt on a whole-bucket scope refuses to boot', () => {
    const res = ImportConnectionSchema.safeParse({
      ...base,
      credentials: ['api-token', 'tenant-jwt'],
    });
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.success ? [] : res.error.issues)).toContain(
      'whole-bucket access is api-token only',
    );
  });

  test('tenant-jwt with a template scope is legal', () => {
    const res = ImportConnectionSchema.safeParse({
      ...base,
      credentials: ['api-token', 'tenant-jwt'],
      scope: { kind: 'tenant-template', template: 'tenants/{tenantId}/' },
    });
    expect(res.success).toBe(true);
  });

  test.each([
    ['shared/', 'exactly one'],
    ['t/{tenantId}/x/{tenantId}/', 'exactly one'],
    ['tenants/{tenantId}', "end with '/'"],
    ['t/{tenantId}/{foo}/', 'unknown placeholder'],
    ['t/{foo}/{tenantId}/', 'unknown placeholder'],
  ])('template %s is refused (%s)', (template, needle) => {
    const res = ImportConnectionSchema.safeParse({
      ...base,
      scope: { kind: 'tenant-template', template },
    });
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.success ? [] : res.error.issues)).toContain(needle);
  });
});

describe('ImportConnectionRegistry', () => {
  test('duplicate ids refuse to construct; lookups resolve', () => {
    const conn = ImportConnectionSchema.parse({ kind: 's3', id: 'a', bucket: 'b', region: 'r' });
    expect(() => new ImportConnectionRegistry([conn, conn])).toThrowError(/duplicate/);
    const reg = new ImportConnectionRegistry([conn]);
    expect(reg.get('a')?.bucket).toBe('b');
    expect(reg.get('nope')).toBeUndefined();
    expect(reg.size).toBe(1);
  });
});
