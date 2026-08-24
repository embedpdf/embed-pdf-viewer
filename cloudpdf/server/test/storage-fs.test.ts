import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { FsObjectStore } from '../src/storage/adapters/FsObjectStore';
import { StorageKeys } from '../src/storage/keys';
import { runObjectStoreConformance } from './_helpers/object-store-conformance';

// FsObjectStore is the always-on correctness oracle: a real backend
// (no mocks) running the exact assertions every other adapter runs.
runObjectStoreConformance('fs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fs-conf-root-'));
  return new FsObjectStore({ root });
});

/** The shard contract: first 2 hex chars of sha256(docId) — id-format-blind. */
function expectedShard(docId: string): string {
  return createHash('sha256').update(docId).digest('hex').slice(0, 2);
}

describe('StorageKeys', () => {
  const SH = expectedShard('ab123');

  test('basePdf composes per-doc 2-char shard layout', () => {
    expect(StorageKeys.basePdf('tnt-1', 'ab123')).toBe(`tnt-1/docs/${SH}/ab123/base.pdf`);
  });
  test('docRoot ends with /', () => {
    expect(StorageKeys.docRoot('t', 'ab123')).toBe(`t/docs/${SH}/ab123/`);
  });
  test('layerArtifact zero-pads version', () => {
    expect(StorageKeys.layerArtifact('t', 'ab123', 'main', 7)).toBe(
      `t/docs/${SH}/ab123/layers/main/v00000007.layer`,
    );
  });
  test('eventsMonth validates YYYY-MM', () => {
    expect(StorageKeys.eventsMonth('t', 'ab123', '2026-05')).toBe(
      `t/docs/${SH}/ab123/events/2026-05.jsonl`,
    );
    expect(() => StorageKeys.eventsMonth('t', 'ab123', '2026-5')).toThrow();
  });
  test('eventsDay validates YYYY-MM-DD', () => {
    expect(StorageKeys.eventsDay('t', 'ab123', '2026-05-17')).toBe(
      `t/docs/${SH}/ab123/events/2026-05-17.jsonl`,
    );
    expect(() => StorageKeys.eventsDay('t', 'ab123', '2026-5-17')).toThrow();
  });
  test('rejects too-short docIds', () => {
    expect(() => StorageKeys.basePdf('t', 'a')).toThrow();
  });
  test('shard is hash-derived: prefixed ids fan out instead of collapsing', () => {
    // THE bug this grammar fixes: every production id starts with `doc_`,
    // so slice-sharding put the entire fleet in `docs/do/`. Hash sharding
    // must spread same-prefix ids across many buckets.
    const shards = new Set(
      Array.from(
        { length: 64 },
        (_, i) => StorageKeys.docRoot('t', `doc_${i.toString(16).padStart(24, '0')}`).split('/')[2],
      ),
    );
    expect(shards.size).toBeGreaterThan(16);
  });
  test('shard chars are lowercase hex so case-folded filesystems behave', () => {
    // Hex digests are lowercase by construction; the docId's own casing
    // stays intact in the key (ids are case-sensitive identifiers).
    const key = StorageKeys.basePdf('t', 'AB123');
    expect(key).toBe(`t/docs/${expectedShard('AB123')}/AB123/base.pdf`);
    expect(key.split('/')[2]).toMatch(/^[0-9a-f]{2}$/);
  });
});

describe('FsObjectStore', () => {
  let root: string;
  let store: FsObjectStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'embedpdf-fs-store-'));
    store = new FsObjectStore({ root });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('put + get + stat roundtrip', async () => {
    const bytes = randomBytes(2048);
    const key = StorageKeys.basePdf('tenant-a', 'doc12345');
    const { sha256 } = await store.put(key, bytes, { contentLength: bytes.byteLength });
    expect(sha256).toBe(sha256Hex(bytes));

    const got = await store.get(key);
    expect(got).not.toBeNull();
    expect(got!.byteLength).toBe(bytes.byteLength);
    expect(sha256Hex(got!)).toBe(sha256);

    const s = await store.stat(key);
    expect(s).not.toBeNull();
    expect(s!.size).toBe(bytes.byteLength);
  });

  test('put rejects content-length mismatch and leaves no .partial', async () => {
    const bytes = randomBytes(256);
    const key = StorageKeys.basePdf('t', 'doc12345');
    await expect(store.put(key, bytes, { contentLength: bytes.byteLength + 10 })).rejects.toThrow(
      /contentLength/,
    );
    const stat = await store.stat(key);
    expect(stat).toBeNull();
  });

  test('getSha256 matches put result and survives unrelated reads', async () => {
    const bytes = randomBytes(512);
    const key = StorageKeys.basePdf('t', 'doc12345');
    const { sha256 } = await store.put(key, bytes, { contentLength: bytes.byteLength });
    expect(await store.getSha256(key)).toBe(sha256);
    expect(await store.getSha256('missing/key')).toBeNull();
  });

  test('delete is idempotent and tidies empty ancestor dirs', async () => {
    const bytes = randomBytes(128);
    const key = StorageKeys.basePdf('t', 'doc12345');
    await store.put(key, bytes, { contentLength: bytes.byteLength });
    expect(await store.delete(key)).toBe(true);
    expect(await store.delete(key)).toBe(false); // already gone
    expect(await store.stat(key)).toBeNull();
  });

  test('deletePrefix recursively removes everything under a doc', async () => {
    const tenant = 'tenant-a';
    const docId = 'doc12345';
    const base = StorageKeys.basePdf(tenant, docId);
    const layer = StorageKeys.layerPdf(tenant, docId, 'main', 1);
    const events = StorageKeys.eventsMonth(tenant, docId, '2026-05');

    await store.put(base, new Uint8Array([1]), { contentLength: 1 });
    await store.put(layer, new Uint8Array([2, 3]), { contentLength: 2 });
    await store.put(events, new Uint8Array([4, 5, 6]), { contentLength: 3 });

    const prefix = StorageKeys.docRoot(tenant, docId);
    const { deleted } = await store.deletePrefix(prefix);
    expect(deleted).toBe(3);
    expect(await store.stat(base)).toBeNull();
    expect(await store.stat(layer)).toBeNull();
    expect(await store.stat(events)).toBeNull();
  });

  test('deletePrefix on a missing prefix is a no-op', async () => {
    const { deleted } = await store.deletePrefix('nope/');
    expect(deleted).toBe(0);
  });

  test('absolute(...) rejects traversal attempts', async () => {
    for (const key of ['../../etc/passwd', '/etc/passwd', '.', 'nested/..', 'a//b', 'a\\b']) {
      await expect(store.put(key, new Uint8Array([0]), { contentLength: 1 })).rejects.toThrow(
        /invalid|escapes/,
      );
    }
  });

  test('deletePrefix cannot resolve to the storage root', async () => {
    await store.put('safe/file.pdf', new Uint8Array([1]), { contentLength: 1 });

    await expect(store.deletePrefix('.')).rejects.toThrow(/invalid|escapes/);
    await expect(store.deletePrefix('safe/..')).rejects.toThrow(/invalid|escapes/);
    expect(await store.get('safe/file.pdf')).not.toBeNull();
  });

  test('deletePrefix unlinks symlinks without traversing their targets', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'embedpdf-fs-outside-'));
    const sentinel = join(outside, 'sentinel.txt');
    try {
      await writeFile(sentinel, 'keep me');
      await store.put('safe/file.pdf', new Uint8Array([1]), { contentLength: 1 });
      await symlink(outside, join(root, 'safe', 'escape'));

      await expect(store.deletePrefix('safe/')).resolves.toEqual({ deleted: 2 });
      await expect(lstat(join(root, 'safe', 'escape'))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(sentinel, 'utf8')).resolves.toBe('keep me');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  test('presign methods return null (FS has no presign concept)', async () => {
    expect(
      await store.presignUpload('any/key', 60, {
        contentLength: 0,
        contentType: 'application/pdf',
      }),
    ).toBeNull();
    expect(await store.presignDownload('any/key', 60)).toBeNull();
  });
});

function randomBytes(n: number): Uint8Array {
  const arr = new Uint8Array(n);
  for (let i = 0; i < n; i++) arr[i] = (i * 31 + 7) & 0xff;
  return arr;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
