/**
 * S3 import source: the shared conformance suite over an in-memory
 * GetObject fake, adapter specifics (revision pinning, error
 * taxonomy), and the createImportSource authorization gates —
 * credential class, tenant binding, scope resolution (including the
 * acme/acme-other prefix-collision case), and the self-storage
 * fingerprint matrix.
 */
import { Readable } from 'node:stream';
import { sdkStreamMixin } from '@smithy/util-stream';
import { beforeAll, describe, expect, test } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { S3ImportSource } from '../src/import/adapters/S3ImportSource';
import {
  ImportConnectionSchema,
  type ImportConnection,
  type S3ImportConnection,
} from '../src/import/config/ImportConnectionSchema';
import { ImportPolicySchema, type ImportPolicy } from '../src/import/config/ImportPolicySchema';
import {
  createImportSource,
  targetsDeploymentStorage,
  type ImportSourceDeps,
} from '../src/import/createImportSource';
import { ImportConnectionRegistry } from '../src/import/ImportConnectionRegistry';
import { ImportSourceError } from '../src/import/ImportSource';
import { UrlImportSource } from '../src/import/adapters/UrlImportSource';
import type { ObjectStoreInfo } from '../src/storage/ObjectStore';
import { runImportSourceConformance } from './_helpers/import-source-conformance';

const s3Mock = mockClient(S3Client);

interface FakeObject {
  bytes: Buffer;
  contentType?: string;
  versionId?: string;
}
const objects = new Map<string, FakeObject>();

function registerGetObject(): void {
  s3Mock.reset();
  s3Mock.on(GetObjectCommand).callsFake((input: { Key: string; VersionId?: string }) => {
    // Sentinel keys let error-taxonomy tests compose with the
    // persistent fake (callsFake + rejectsOnce do not stack).
    if (input.Key.startsWith('err/')) {
      const name = input.Key.slice(4);
      const status = name === 'InternalError' ? 500 : name === 'NoSuchKey' ? 404 : 403;
      throw s3Err(name, status);
    }
    const o = objects.get(input.Key);
    if (!o) throw s3Err('NoSuchKey', 404);
    if (input.VersionId && input.VersionId !== o.versionId) throw s3Err('NoSuchVersion', 404);
    return {
      Body: sdkStreamMixin(Readable.from([o.bytes])),
      ContentLength: o.bytes.byteLength,
      ...(o.contentType ? { ContentType: o.contentType } : {}),
      ...(o.versionId ? { VersionId: o.versionId } : {}),
    };
  });
}

function s3Err(name: string, status: number): Error {
  return Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } });
}

function conn(overrides: Record<string, unknown> = {}): S3ImportConnection {
  return ImportConnectionSchema.parse({
    kind: 's3',
    id: 'test-conn',
    bucket: 'src-bucket',
    region: 'us-east-1',
    ...overrides,
  }) as S3ImportConnection;
}

function policyFor(maxBytes?: number): ImportPolicy {
  return ImportPolicySchema.parse(maxBytes === undefined ? {} : { maxBytes });
}

function sourceFor(key: string, opts: { revision?: string; maxBytes?: number } = {}): S3ImportSource {
  return new S3ImportSource({
    connection: conn(),
    key,
    revision: opts.revision,
    policy: policyFor(opts.maxBytes),
  });
}

async function openErr(s: S3ImportSource, revisionKey?: string): Promise<ImportSourceError> {
  void revisionKey;
  const err = await s.open({ signal: new AbortController().signal }).then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ImportSourceError);
  return err as ImportSourceError;
}

runImportSourceConformance('s3', () => {
  objects.clear();
  registerGetObject();
  return {
    seed(name, bytes, opts) {
      objects.set(name, {
        bytes: Buffer.from(bytes),
        ...(opts?.contentType ? { contentType: opts.contentType } : {}),
      });
    },
    source(name, opts) {
      return sourceFor(name, { ...(opts?.maxBytes !== undefined ? { maxBytes: opts.maxBytes } : {}) });
    },
    missingName: () => 'definitely-missing',
  };
});

describe('S3ImportSource specifics', () => {
  beforeAll(() => {
    objects.clear();
    registerGetObject();
    objects.set('inv/a.pdf', {
      bytes: Buffer.from('%PDF-1.7 s3 source bytes'),
      contentType: 'application/pdf',
      versionId: 'v7',
    });
    objects.set('inv/empty.pdf', { bytes: Buffer.alloc(0) });
  });

  test('revision pins VersionId and resolvedRevision reports what was served', async () => {
    const opened = await sourceFor('inv/a.pdf', { revision: 'v7' }).open({
      signal: new AbortController().signal,
    });
    expect(opened.resolvedRevision).toBe('v7');
    const call = s3Mock.commandCalls(GetObjectCommand).at(-1)!.args[0].input;
    expect(call.VersionId).toBe('v7');
    expect(call.Bucket).toBe('src-bucket');
  });

  test('an unpinned read still reports the served revision', async () => {
    const opened = await sourceFor('inv/a.pdf').open({ signal: new AbortController().signal });
    expect(opened.resolvedRevision).toBe('v7');
  });

  test('a wrong revision maps to terminal not_found', async () => {
    const err = await openErr(sourceFor('inv/a.pdf', { revision: 'v8' }));
    expect(err.code).toBe('not_found');
  });

  test('AccessDenied maps to terminal denied', async () => {
    const err = await openErr(sourceFor('err/AccessDenied'));
    expect(err.code).toBe('denied');
    expect(err.retryable).toBe(false);
  });

  test('Glacier objects map to unsupported', async () => {
    const err = await openErr(sourceFor('err/InvalidObjectState'));
    expect(err.code).toBe('unsupported');
    expect(err.message).toMatch(/Glacier/);
  });

  test('source 5xx maps to retryable upstream', async () => {
    const err = await openErr(sourceFor('err/InternalError'));
    expect(err.code).toBe('upstream');
    expect(err.retryable).toBe(true);
  });

  test('empty objects are refused', async () => {
    const err = await openErr(sourceFor('inv/empty.pdf'));
    expect(err.code).toBe('unsupported');
    expect(err.message).toMatch(/at least one byte/);
  });

  test('info identifies the connection and the object without secrets', () => {
    const s = sourceFor('inv/a.pdf');
    expect(s.info).toMatchObject({
      kind: 's3',
      location: 's3://src-bucket/inv/a.pdf',
      connectionId: 'test-conn',
    });
  });
});

describe('createImportSource authorization gates', () => {
  const FS_STORAGE: ObjectStoreInfo = { kind: 'fs', location: '/data/objects' };

  function deps(
    connections: ImportConnection[],
    caller: { via: 'api-token' | 'tenant-jwt'; tenantId: string },
    storage: ObjectStoreInfo = FS_STORAGE,
  ): ImportSourceDeps {
    return {
      policy: policyFor(),
      caller,
      connections: new ImportConnectionRegistry(connections),
      deploymentStorage: storage,
    };
  }

  function resolveErr(
    source: Parameters<typeof createImportSource>[0],
    d: ImportSourceDeps,
  ): ImportSourceError {
    try {
      createImportSource(source, d);
    } catch (err) {
      expect(err).toBeInstanceOf(ImportSourceError);
      return err as ImportSourceError;
    }
    throw new Error('expected createImportSource to throw');
  }

  const wire = (connectionId: string, key: string) =>
    ({ kind: 'connection', connectionId, key }) as const;

  test('url sources bypass the connection gates entirely', () => {
    const s = createImportSource(
      { kind: 'url', url: 'https://bucket.s3.amazonaws.com/a.pdf?X-Amz-Signature=x' },
      deps([], { via: 'tenant-jwt', tenantId: 'acme' }),
    );
    expect(s).toBeInstanceOf(UrlImportSource);
  });

  test('unknown connections are refused', () => {
    const err = resolveErr(wire('nope', 'a.pdf'), deps([conn()], { via: 'api-token', tenantId: 't' }));
    expect(err.message).toMatch(/unknown import connection/);
  });

  test('tenant-jwt is refused on a default (api-token only) connection', () => {
    const err = resolveErr(wire('test-conn', 'a.pdf'), deps([conn()], { via: 'tenant-jwt', tenantId: 't' }));
    expect(err.message).toMatch(/not usable with tenant-jwt/);
    const ok = createImportSource(
      wire('test-conn', 'a.pdf'),
      deps([conn()], { via: 'api-token', tenantId: 't' }),
    );
    expect(ok).toBeInstanceOf(S3ImportSource);
  });

  test('the tenant allowlist is enforced', () => {
    const c = conn({ tenants: ['acme'] });
    const err = resolveErr(wire('test-conn', 'a.pdf'), deps([c], { via: 'api-token', tenantId: 'globex' }));
    expect(err.message).toMatch(/not enabled for this tenant/);
  });

  test('shared prefixes bound the key', () => {
    const c = conn({ scope: { kind: 'shared-prefixes', prefixes: ['shared/'] } });
    expect(
      createImportSource(wire('test-conn', 'shared/a.pdf'), deps([c], { via: 'api-token', tenantId: 't' })),
    ).toBeInstanceOf(S3ImportSource);
    const err = resolveErr(wire('test-conn', 'private/a.pdf'), deps([c], { via: 'api-token', tenantId: 't' }));
    expect(err.message).toMatch(/outside the prefixes/);
  });

  test('tenant templates isolate slices — acme cannot reach acme-other', () => {
    const c = conn({
      credentials: ['api-token', 'tenant-jwt'],
      scope: { kind: 'tenant-template', template: 'tenants/{tenantId}/' },
    });
    const acme = { via: 'tenant-jwt', tenantId: 'acme' } as const;
    expect(
      createImportSource(wire('test-conn', 'tenants/acme/inv.pdf'), deps([c], acme)),
    ).toBeInstanceOf(S3ImportSource);
    const cross = resolveErr(wire('test-conn', 'tenants/acme-other/inv.pdf'), deps([c], acme));
    expect(cross.message).toMatch(/outside the prefixes/);
    const weird = resolveErr(
      wire('test-conn', 'tenants/we/ird/inv.pdf'),
      deps([c], { via: 'api-token', tenantId: 'we/ird' }),
    );
    expect(weird.message).toMatch(/not usable with a templated connection/);
  });

  test('self-storage fingerprint: AWS namespace is global, custom endpoints differ by host', () => {
    const s3Storage = (bucket: string, endpoint?: string): ObjectStoreInfo => ({
      kind: 's3',
      location: 's3',
      bucket,
      ...(endpoint ? { endpoint } : {}),
    });
    // implicit AWS on both sides, same bucket → blocked
    expect(targetsDeploymentStorage(conn({ bucket: 'dep' }), s3Storage('dep'))).toBe(true);
    // explicit standard AWS endpoint vs implicit → same namespace → blocked
    expect(
      targetsDeploymentStorage(conn({ bucket: 'dep' }), s3Storage('dep', 'https://s3.us-east-1.amazonaws.com')),
    ).toBe(true);
    // same name on a MinIO endpoint vs AWS deployment → different backend → allowed
    expect(
      targetsDeploymentStorage(conn({ bucket: 'dep', endpoint: 'https://minio.local:9000' }), s3Storage('dep')),
    ).toBe(false);
    // both custom: same host blocked, different host allowed
    expect(
      targetsDeploymentStorage(
        conn({ bucket: 'dep', endpoint: 'https://minio.local:9000' }),
        s3Storage('dep', 'https://minio.local:9000'),
      ),
    ).toBe(true);
    expect(
      targetsDeploymentStorage(
        conn({ bucket: 'dep', endpoint: 'https://minio-a.local' }),
        s3Storage('dep', 'https://minio-b.local'),
      ),
    ).toBe(false);
    // unclassifiable endpoint → conservative block
    expect(targetsDeploymentStorage(conn({ bucket: 'dep' }), s3Storage('dep', 'not a url'))).toBe(true);
    // different bucket or non-s3 deployment storage → never blocked
    expect(targetsDeploymentStorage(conn({ bucket: 'other' }), s3Storage('dep'))).toBe(false);
    expect(targetsDeploymentStorage(conn({ bucket: 'dep' }), FS_STORAGE)).toBe(false);

    // gcs: bucket names are globally unique
    const gcsConn = ImportConnectionSchema.parse({ kind: 'gcs', id: 'g', bucket: 'dep' });
    expect(targetsDeploymentStorage(gcsConn, { kind: 'gcs', location: 'gs', bucket: 'dep' })).toBe(true);
    expect(targetsDeploymentStorage(gcsConn, { kind: 'gcs', location: 'gs', bucket: 'other' })).toBe(false);
    expect(targetsDeploymentStorage(gcsConn, s3Storage('dep'))).toBe(false);

    // azure: identity is (account, container), account case-insensitive
    const azConn = ImportConnectionSchema.parse({
      kind: 'azure-blob',
      id: 'a',
      container: 'docs',
      accountName: 'Acct',
    });
    expect(
      targetsDeploymentStorage(azConn, {
        kind: 'azure-blob',
        location: 'az',
        accountName: 'acct',
        container: 'docs',
      }),
    ).toBe(true);
    expect(
      targetsDeploymentStorage(azConn, {
        kind: 'azure-blob',
        location: 'az',
        accountName: 'acct',
        container: 'other',
      }),
    ).toBe(false);

    // fs: containment in either direction
    const fsConn = ImportConnectionSchema.parse({ kind: 'fs', id: 'f', root: '/data/objects/sub' });
    expect(
      targetsDeploymentStorage(fsConn, { kind: 'fs', location: '/data/objects', root: '/data/objects' }),
    ).toBe(true);
    expect(
      targetsDeploymentStorage(
        ImportConnectionSchema.parse({ kind: 'fs', id: 'f2', root: '/data' }),
        { kind: 'fs', location: '/data/objects', root: '/data/objects' },
      ),
    ).toBe(true);
    expect(
      targetsDeploymentStorage(
        ImportConnectionSchema.parse({ kind: 'fs', id: 'f3', root: '/srv/inbox' }),
        { kind: 'fs', location: '/data/objects', root: '/data/objects' },
      ),
    ).toBe(false);

    const err = resolveErr(
      wire('test-conn', 'a.pdf'),
      deps([conn({ bucket: 'dep' })], { via: 'api-token', tenantId: 't' }, s3Storage('dep')),
    );
    expect(err.message).toMatch(/deployment storage backend/);
  });
});
