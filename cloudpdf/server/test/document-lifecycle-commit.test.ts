/**
 * Commit-time sha verification. The interesting property under test:
 * commit needs exactly ONE object-store read of the uploaded bytes.
 *
 * With a base-file cache wired, `fileCache.acquire` downloads the
 * object into the cache and verifies its hash on the way down; the
 * security probe then reuses that warm entry. The old shape hashed the
 * remote object (buffering it whole in RAM) and THEN materialised it a
 * second time for the probe — two full downloads per presigned upload.
 *
 * The cache is content-addressed across documents, so a hit that was
 * materialised from a DIFFERENT object's key proves nothing about OUR
 * key — commit must detect that via `handle.sourceKey` and fall back
 * to hashing the remote object directly.
 */
import { createHash } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';

import type { DocumentsRepo, DocumentRow } from '../src/db/repos/documents.repo';
import type { TenantsRepo } from '../src/db/repos/tenants.repo';
import { DocumentLifecycleService } from '../src/services/DocumentLifecycleService';
import type { LocalFileHandle } from '../src/storage/BaseFileCache';
import { ShaMismatchError, type ObjectStoreWithInfo } from '../src/storage/ObjectStore';

const CONTENT = Buffer.from('%PDF-1.7 fake body for commit sha tests');
const SHA = createHash('sha256').update(CONTENT).digest('hex');
const SIZE = CONTENT.byteLength;

function pendingDoc(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 'doc-1',
    tenantId: 'tnt-1',
    state: 'pending',
    baseSha: null,
    storageSizeBytes: null,
    expectedSha256: SHA,
    expectedSizeBytes: SIZE,
    uploadKind: 'presigned',
    uploadExpiresAt: null,
    security: {
      encryptionState: 'unknown',
      encryptionRequiresPassword: null,
      securityHandlerRevision: null,
      pdfPermissionsBits: null,
      pdfPermissionsAllAllowed: null,
      pdfOpenedAs: null,
      securityProbedAt: null,
    },
    docVersion: 1,
    metadata: null,
    idempotencyKey: null,
    failureReason: null,
    thumbnailState: 'pending',
    thumbnailKey: null,
    createdAt: 1,
    updatedAt: 1,
    createdBy: 'test',
    ...overrides,
  };
}

function fixture(
  opts: {
    doc?: DocumentRow;
    /** Omit the fileCache entirely (legacy admin-only deploys). */
    withCache?: boolean;
    /** Make acquire() reject with this error. */
    acquireError?: Error;
    /** Pretend the cache hit came from a different object's key. */
    hitFromKey?: string;
    /** What storage.getSha256 reports for the remote object. */
    remoteSha?: string | null;
  } = {},
) {
  const doc = opts.doc ?? pendingDoc();
  const markFailed = vi.fn(async () => undefined);
  const setThumbnail = vi.fn(async () => undefined);
  const commit = vi.fn(async (input: { baseSha: string }): Promise<DocumentRow> => {
    return { ...doc, state: 'ready', baseSha: input.baseSha };
  });
  const documents = {
    requireOwned: vi.fn(async () => doc),
    markFailed,
    setThumbnail,
    commit,
  } as unknown as DocumentsRepo;

  const getSha256 = vi.fn(async () => (opts.remoteSha === undefined ? SHA : opts.remoteSha));
  const del = vi.fn(async () => true);
  const storage = {
    info: { kind: 's3', location: 's3://b' },
    stat: vi.fn(async () => ({ size: SIZE, etag: 'e' })),
    getSha256,
    delete: del,
  } as unknown as ObjectStoreWithInfo;

  const release = vi.fn();
  const acquire = vi.fn(async (input: { sha: string; key: string }): Promise<LocalFileHandle> => {
    if (opts.acquireError) throw opts.acquireError;
    return {
      path: '/cache/base',
      size: SIZE,
      sha256: input.sha,
      sourceKey: opts.hitFromKey ?? input.key,
      release,
    };
  });

  const lifecycle = new DocumentLifecycleService({
    documents,
    tenants: {} as TenantsRepo,
    storage,
    ...(opts.withCache === false ? {} : { fileCache: { acquire } }),
  });
  return { lifecycle, doc, markFailed, commit, getSha256, del, acquire, release };
}

const INPUT = { docId: 'doc-1', tenantId: 'tnt-1', sha256: SHA };

describe('DocumentLifecycleService commit sha verification', () => {
  test('verifies via one cache materialisation; never re-reads the remote object', async () => {
    const fx = fixture();
    const r = await fx.lifecycle.commit(INPUT);
    expect(r.doc.state).toBe('ready');
    expect(r.doc.baseSha).toBe(SHA);
    expect(fx.acquire).toHaveBeenCalledTimes(1);
    expect(fx.acquire).toHaveBeenCalledWith(expect.objectContaining({ sha: SHA }));
    expect(fx.getSha256).not.toHaveBeenCalled();
    expect(fx.release).toHaveBeenCalledTimes(1);
  });

  test('ShaMismatchError from the cache marks the doc failed and deletes the bytes', async () => {
    const observed = 'b'.repeat(64);
    const fx = fixture({ acquireError: new ShaMismatchError('test', SHA, observed) });
    await expect(fx.lifecycle.commit(INPUT)).rejects.toMatchObject({ status: 400 });
    expect(fx.markFailed).toHaveBeenCalledWith('doc-1', 'tnt-1', 'sha_mismatch');
    expect(fx.del).toHaveBeenCalledTimes(1);
    expect(fx.commit).not.toHaveBeenCalled();
  });

  test('a transient materialise failure propagates without failing the doc (retryable)', async () => {
    const fx = fixture({ acquireError: new Error('socket hang up') });
    await expect(fx.lifecycle.commit(INPUT)).rejects.toThrow(/socket hang up/);
    expect(fx.markFailed).not.toHaveBeenCalled();
    expect(fx.del).not.toHaveBeenCalled();
  });

  test('a cache hit materialised from a DIFFERENT key still verifies our object', async () => {
    const fx = fixture({ hitFromKey: 'other-tenant/docs/zz/zzz/base.pdf' });
    const r = await fx.lifecycle.commit(INPUT);
    expect(r.doc.state).toBe('ready');
    // Content came from someone else's materialisation — our key's
    // bytes were never read, so commit must hash them directly.
    expect(fx.getSha256).toHaveBeenCalledTimes(1);
    expect(fx.release).toHaveBeenCalledTimes(1);
  });

  test('cross-key hit whose remote bytes do not match fails the commit', async () => {
    const fx = fixture({ hitFromKey: 'other/key.pdf', remoteSha: 'c'.repeat(64) });
    await expect(fx.lifecycle.commit(INPUT)).rejects.toMatchObject({ status: 400 });
    expect(fx.markFailed).toHaveBeenCalledWith('doc-1', 'tnt-1', 'sha_mismatch');
    expect(fx.del).toHaveBeenCalledTimes(1);
    expect(fx.release).toHaveBeenCalledTimes(1);
  });

  test('without a cache, falls back to the streaming remote hash', async () => {
    const fx = fixture({ withCache: false });
    const r = await fx.lifecycle.commit(INPUT);
    expect(r.doc.state).toBe('ready');
    expect(fx.getSha256).toHaveBeenCalledTimes(1);
  });

  test('rejects a malformed declared sha before touching storage bytes', async () => {
    const fx = fixture({ doc: pendingDoc({ expectedSha256: null }) });
    await expect(
      fx.lifecycle.commit({ ...INPUT, sha256: 'NOT-A-SHA' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fx.markFailed).toHaveBeenCalledWith('doc-1', 'tnt-1', 'sha_mismatch');
    expect(fx.acquire).not.toHaveBeenCalled();
    expect(fx.getSha256).not.toHaveBeenCalled();
  });
});
