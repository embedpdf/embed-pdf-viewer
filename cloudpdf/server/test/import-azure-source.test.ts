/**
 * Azure Blob import source: shared conformance over the in-memory SDK
 * fakes (`__mocks__/@azure/`, keyless DefaultAzureCredential path), plus
 * version-id revision semantics and the archived-blob mapping.
 */
import { describe, expect, test, vi } from 'vitest';

import { identity } from '../__mocks__/@azure/identity';
import { FakeBlobClient, blobError, blobs } from '../__mocks__/@azure/storage-blob';

import {
  ImportConnectionSchema,
  type AzureBlobImportConnection,
} from '../src/import/config/ImportConnectionSchema';
import { ImportPolicySchema, type ImportPolicy } from '../src/import/config/ImportPolicySchema';
import { ImportSourceError } from '../src/import/ImportSource';
import { runImportSourceConformance } from './_helpers/import-source-conformance';

// No factories: vitest serves __mocks__/@azure/identity.ts and
// __mocks__/@azure/storage-blob.ts.
vi.mock('@azure/identity');
vi.mock('@azure/storage-blob');

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

/** The source's SDK blob client, made without calling it: a real one would call Azure. */
function blobOf(source: ReturnType<typeof sourceFor>): Promise<unknown> {
  return (source as unknown as { blob(): Promise<unknown> }).blob();
}

async function openErr(key: string, opts: { revision?: string } = {}): Promise<ImportSourceError> {
  const err = await sourceFor(key, opts)
    .open({ signal: new AbortController().signal })
    .then(
      () => null,
      (e: unknown) => e,
    );
  expect(err).toBeInstanceOf(ImportSourceError);
  return err as ImportSourceError;
}

runImportSourceConformance('azure-blob', () => {
  blobs.objects.clear();
  blobs.failures.clear();
  return {
    seed(name, bytes, opts) {
      blobs.objects.set(name, {
        bytes: Buffer.from(bytes),
        ...(opts?.contentType ? { contentType: opts.contentType } : {}),
        metadata: {},
      });
    },
    source(name, opts) {
      return sourceFor(name, {
        ...(opts?.maxBytes !== undefined ? { maxBytes: opts.maxBytes } : {}),
      });
    },
    missingName: () => 'definitely-missing',
  };
});

describe('AzureBlobImportSource specifics', () => {
  test('revisions pin version ids and resolvedRevision reports what was served', async () => {
    blobs.objects.set('inv/a.pdf', {
      bytes: Buffer.from('%PDF azure'),
      metadata: {},
      versionId: '2026-08-19T00:00:00.000Z',
    });
    const opened = await sourceFor('inv/a.pdf', { revision: '2026-08-19T00:00:00.000Z' }).open({
      signal: new AbortController().signal,
    });
    expect(opened.resolvedRevision).toBe('2026-08-19T00:00:00.000Z');
    const wrong = await openErr('inv/a.pdf', { revision: '1999-01-01T00:00:00.000Z' });
    expect(wrong.code).toBe('not_found');
  });

  test('denied and archived blobs map to their terminal classes', async () => {
    blobs.failures.set('inv/denied.pdf', blobError('denied', 403));
    blobs.failures.set('inv/archived.pdf', blobError('archived', 409, 'BlobArchived'));
    expect((await openErr('inv/denied.pdf')).code).toBe('denied');
    const archived = await openErr('inv/archived.pdf');
    expect(archived.code).toBe('unsupported');
    expect(archived.message).toMatch(/archived/);
  });

  test('source 5xx maps to retryable upstream', async () => {
    blobs.failures.set('inv/flaky.pdf', blobError('server error', 500));
    const err = await openErr('inv/flaky.pdf');
    expect(err.code).toBe('upstream');
    expect(err.retryable).toBe(true);
  });

  test('sources opened back to back all get the fake SDKs', async () => {
    // Each source starts its own imports of both SDKs on first use, so
    // these imports overlap. A vi.mock factory hands some of them the
    // real clients.
    identity.credentials = 0;
    const clients = await Promise.all(
      Array.from({ length: 8 }, () => blobOf(sourceFor('inv/a.pdf'))),
    );
    expect(clients.every((c) => c instanceof FakeBlobClient)).toBe(true);
    expect(identity.credentials).toBe(8);
  });

  test('info uses the account endpoint and never credentials', () => {
    expect(sourceFor('inv/a.pdf').info).toMatchObject({
      kind: 'azure-blob',
      location: 'https://acct.blob.core.windows.net/docs/inv/a.pdf',
      connectionId: 'az-conn',
    });
  });
});
