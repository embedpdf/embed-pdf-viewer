/**
 * Azure Blob import source: shared conformance over in-memory SDK
 * fakes (keyless DefaultAzureCredential path), plus version-id
 * revision semantics and the archived-blob mapping.
 */
import { Readable } from 'node:stream';
import { describe, expect, test, vi } from 'vitest';

import {
  ImportConnectionSchema,
  type AzureBlobImportConnection,
} from '../src/import/config/ImportConnectionSchema';
import { ImportPolicySchema, type ImportPolicy } from '../src/import/config/ImportPolicySchema';
import { ImportSourceError } from '../src/import/ImportSource';
import { runImportSourceConformance } from './_helpers/import-source-conformance';

const az = vi.hoisted(() => {
  interface Obj {
    bytes: Buffer;
    contentType?: string;
    versionId?: string;
  }
  return { objects: new Map<string, Obj>(), credentials: 0 };
});

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: class {
    constructor() {
      az.credentials++;
    }
  },
}));

vi.mock('@azure/storage-blob', () => {
  const azErr = (message: string, statusCode: number, code?: string): Error =>
    Object.assign(new Error(message), { statusCode, ...(code ? { code } : {}) });
  class FakeBlobClient {
    constructor(
      readonly key: string,
      readonly versionId?: string,
    ) {}
    withVersion(v: string): FakeBlobClient {
      return new FakeBlobClient(this.key, v);
    }
    async download(
      _offset?: number,
      _count?: number,
      opts?: { abortSignal?: AbortSignal },
    ): Promise<Record<string, unknown>> {
      if (opts?.abortSignal?.aborted) throw azErr('aborted', 0, 'AbortError');
      if (this.key === 'err/denied') throw azErr('denied', 403);
      if (this.key === 'err/archived') throw azErr('archived', 409, 'BlobArchived');
      if (this.key === 'err/flaky') throw azErr('server error', 500);
      const o = az.objects.get(this.key);
      if (!o) throw azErr('BlobNotFound', 404, 'BlobNotFound');
      if (this.versionId !== undefined && this.versionId !== o.versionId) {
        throw azErr('BlobNotFound', 404, 'BlobNotFound');
      }
      return {
        contentLength: o.bytes.byteLength,
        readableStreamBody: Readable.from([o.bytes]),
        ...(o.contentType ? { contentType: o.contentType } : {}),
        ...(o.versionId ? { versionId: o.versionId } : {}),
      };
    }
  }
  class FakeContainerClient {
    getBlobClient(key: string): FakeBlobClient {
      return new FakeBlobClient(key);
    }
  }
  return {
    BlobServiceClient: class {
      constructor(
        readonly url: string,
        readonly credential: unknown,
      ) {}
      getContainerClient(): FakeContainerClient {
        return new FakeContainerClient();
      }
    },
  };
});

const { AzureBlobImportSource } = await import('../src/import/adapters/AzureBlobImportSource');

const CONN = ImportConnectionSchema.parse({
  kind: 'azure-blob',
  id: 'az-conn',
  container: 'docs',
  accountName: 'acct',
}) as AzureBlobImportConnection;

function policyFor(maxBytes?: number): ImportPolicy {
  return ImportPolicySchema.parse(maxBytes === undefined ? {} : { maxBytes });
}

function sourceFor(key: string, opts: { revision?: string; maxBytes?: number } = {}) {
  return new AzureBlobImportSource({
    connection: CONN,
    key,
    revision: opts.revision,
    policy: policyFor(opts.maxBytes),
  });
}

async function openErr(key: string, opts: { revision?: string } = {}): Promise<ImportSourceError> {
  const err = await sourceFor(key, opts)
    .open({ signal: new AbortController().signal })
    .then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(ImportSourceError);
  return err as ImportSourceError;
}

runImportSourceConformance('azure-blob', () => {
  az.objects.clear();
  return {
    seed(name, bytes, opts) {
      az.objects.set(name, {
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

describe('AzureBlobImportSource specifics', () => {
  test('revisions pin version ids and resolvedRevision reports what was served', async () => {
    az.objects.set('inv/a.pdf', { bytes: Buffer.from('%PDF azure'), versionId: '2026-08-19T00:00:00.000Z' });
    const opened = await sourceFor('inv/a.pdf', { revision: '2026-08-19T00:00:00.000Z' }).open({
      signal: new AbortController().signal,
    });
    expect(opened.resolvedRevision).toBe('2026-08-19T00:00:00.000Z');
    const wrong = await openErr('inv/a.pdf', { revision: '1999-01-01T00:00:00.000Z' });
    expect(wrong.code).toBe('not_found');
  });

  test('denied and archived blobs map to their terminal classes', async () => {
    expect((await openErr('err/denied')).code).toBe('denied');
    const archived = await openErr('err/archived');
    expect(archived.code).toBe('unsupported');
    expect(archived.message).toMatch(/archived/);
  });

  test('source 5xx maps to retryable upstream', async () => {
    const err = await openErr('err/flaky');
    expect(err.code).toBe('upstream');
    expect(err.retryable).toBe(true);
  });

  test('info uses the account endpoint and never credentials', () => {
    expect(sourceFor('inv/a.pdf').info).toMatchObject({
      kind: 'azure-blob',
      location: 'https://acct.blob.core.windows.net/docs/inv/a.pdf',
      connectionId: 'az-conn',
    });
  });
});
