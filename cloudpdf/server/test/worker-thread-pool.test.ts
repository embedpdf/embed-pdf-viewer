import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { wirePack, type WorkerJobId } from '@embedpdf/engine-core/runtime';
import { WorkerThreadPool } from '../src/runtime/WorkerThreadPool';

const STUB_ENTRY = new URL('./_helpers/stub-worker-entry.cjs', import.meta.url);

// Each test gets its own pool so eviction state doesn't leak.
let pool: WorkerThreadPool | null = null;
async function newPool(
  opts: {
    size?: number;
    maxDocsPerSlot?: number;
    onEvict?: (e: { docId: string; baseSha: string; slot: number }) => void;
  } = {},
): Promise<WorkerThreadPool> {
  pool = await WorkerThreadPool.create({
    workerEntry: STUB_ENTRY,
    size: opts.size ?? 2,
    maxDocsPerSlot: opts.maxDocsPerSlot,
    onEvict: opts.onEvict,
  });
  return pool;
}

afterEach(async () => {
  if (pool) {
    await pool.destroy();
    pool = null;
  }
});

const openBuild = (docId: string) => (jobId: WorkerJobId) => {
  // Stub workers don't read bytes; pass an empty payload + empty
  // transfer list so the test stays focused on the routing logic.
  const empty = new ArrayBuffer(0);
  return wirePack({ kind: 'open.fatMem' as const, jobId, docId, bytes: empty, password: null }, [
    empty,
  ]);
};

describe('WorkerThreadPool sticky-by-base_sha', () => {
  test('two docs with the same baseSha land on the same slot', async () => {
    const p = await newPool({ size: 3 });
    const baseSha = 'a'.repeat(64);
    await p.runOpen('doc-1', baseSha, openBuild('doc-1'));
    await p.runOpen('doc-2', baseSha, openBuild('doc-2'));

    const inspect = p.inspect();
    const slotsServingBase = inspect.filter((s) => s.baseShas.includes(baseSha));
    expect(slotsServingBase).toHaveLength(1);
    expect(slotsServingBase[0]!.docIds.sort()).toEqual(['doc-1', 'doc-2']);
  });

  test('different baseShas spread across slots (no co-location)', async () => {
    const p = await newPool({ size: 3 });
    await p.runOpen('doc-a', 'a'.repeat(64), openBuild('doc-a'));
    await p.runOpen('doc-b', 'b'.repeat(64), openBuild('doc-b'));
    await p.runOpen('doc-c', 'c'.repeat(64), openBuild('doc-c'));

    const inspect = p.inspect();
    const occupied = inspect.filter((s) => s.docIds.length > 0);
    expect(occupied).toHaveLength(3);
  });

  test('legacy 2-arg runOpen (no baseSha) still picks least-loaded', async () => {
    const p = await newPool({ size: 2 });
    // No baseSha — falls back to overall least-loaded round-robin.
    await p.runOpen('legacy-1', openBuild('legacy-1'));
    await p.runOpen('legacy-2', openBuild('legacy-2'));
    const counts = p.inspect().map((s) => s.docIds.length);
    expect(counts.sort()).toEqual([1, 1]);
  });

  test('close releases the baseSha refcount on the slot', async () => {
    const p = await newPool({ size: 2 });
    const baseSha = 'd'.repeat(64);
    await p.runOpen('doc-x', baseSha, openBuild('doc-x'));
    await p.runOpen('doc-y', baseSha, openBuild('doc-y'));

    // After closing both, no slot should still claim the baseSha.
    await p.close('doc-x');
    await p.close('doc-y');
    const inspect = p.inspect();
    for (const s of inspect) expect(s.baseShas).not.toContain(baseSha);
  });

  test('slot eviction drops the LRU doc when maxDocsPerSlot is exceeded', async () => {
    const evicted: Array<{ docId: string; baseSha: string }> = [];
    const p = await newPool({
      size: 1,
      maxDocsPerSlot: 2,
      onEvict: (e) => evicted.push({ docId: e.docId, baseSha: e.baseSha }),
    });
    const baseSha = 'e'.repeat(64);
    // Open order = LRU order (oldest first). d1 is oldest, becomes
    // the eviction target when capacity is exceeded by d3.
    await p.runOpen('d1', baseSha, openBuild('d1'));
    await p.runOpen('d2', baseSha, openBuild('d2'));
    await p.runOpen('d3', baseSha, openBuild('d3'));

    expect(evicted).toHaveLength(1);
    expect(evicted[0]).toMatchObject({ docId: 'd1', baseSha });

    const inspect = p.inspect();
    expect(inspect[0]!.docIds.sort()).toEqual(['d2', 'd3']);
  });

  test('rejects a duplicate docId without consuming a slot', async () => {
    const p = await newPool({ size: 2 });
    await p.runOpen('only-once', 'f'.repeat(64), openBuild('only-once'));
    await expect(p.runOpen('only-once', 'f'.repeat(64), openBuild('only-once'))).rejects.toThrow(
      /already open/,
    );
    const counts = p.inspect().map((s) => s.docIds.length);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
  });

  test('failed open does not bind the docId (rollback)', async () => {
    const p = await newPool({ size: 1 });
    // The stub worker rejects unknown kinds — abuse that to force a
    // rejection while still going through runOpen's binding path.
    await expect(
      p.runOpen('fails', 'f'.repeat(64), (jobId) =>
        wirePack({ kind: 'metadata.read', jobId, docId: 'fails' }),
      ),
    ).rejects.toThrow();
    expect(p.inspect()[0]!.docIds).toEqual([]);
    expect(p.inspect()[0]!.baseShas).toEqual([]);
  });
});
