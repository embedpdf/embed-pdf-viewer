import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { FsObjectStore } from '../src/storage/adapters/FsObjectStore';
import { StorageKeys } from '../src/storage/keys';

/**
 * A prefix delete prunes empty ancestor directories, and a put elsewhere in
 * the same tenant can lose the directories it has just made. The mock makes
 * that happen at the worst moment: right after the put's mkdir.
 */
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, mkdir: vi.fn(actual.mkdir) };
});
const realFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

let root: string;
let store: FsObjectStore;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'embedpdf-fs-pruning-'));
  store = new FsObjectStore({ root });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test('a put survives its directory being pruned between mkdir and write', async () => {
  const key = StorageKeys.basePdf('tenant-pruned', 'doc-arriving');
  const tenantDir = join(root, 'tenant-pruned');
  for (const body of [new Uint8Array([1, 2]), Readable.from([Buffer.from([1, 2])])]) {
    vi.mocked(mkdir).mockImplementationOnce(async (path, options) => {
      const made = await realFs.mkdir(path, options);
      await realFs.rm(tenantDir, { recursive: true, force: true });
      return made;
    });
    await store.put(key, body, { contentLength: 2 });
    expect(await store.stat(key)).not.toBeNull();
    await store.delete(key);
  }
});
