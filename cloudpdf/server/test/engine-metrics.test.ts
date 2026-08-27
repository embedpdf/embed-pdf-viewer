import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { readCgroupMemory } from '../src/runtime/cgroup-memory';
import {
  buildHostFixture,
  listAnnotations,
  seedDocument,
  tearDownHostFixture,
} from './_helpers/host-app-fixture';

/** Cgroup working-set reader and engine operational metrics. */

describe('readCgroupMemory', () => {
  const dirs: string[] = [];
  afterAll(async () => {
    for (const d of dirs) await rm(d, { recursive: true, force: true });
  });

  async function root(): Promise<string> {
    const d = await mkdtemp(join(tmpdir(), 'cg-'));
    dirs.push(d);
    return d;
  }

  test('v2: working set = current − inactive_file; "max" limit → null', async () => {
    const r = await root();
    await writeFile(join(r, 'memory.current'), '1000000\n');
    await writeFile(join(r, 'memory.stat'), 'anon 1\ninactive_file 300000\nactive_file 5\n');
    await writeFile(join(r, 'memory.max'), 'max\n');
    expect(readCgroupMemory(r)).toEqual({ workingSetBytes: 700000, limitBytes: null });
  });

  test('v2 with a numeric limit', async () => {
    const r = await root();
    await writeFile(join(r, 'memory.current'), '500\n');
    await writeFile(join(r, 'memory.stat'), 'inactive_file 100\n');
    await writeFile(join(r, 'memory.max'), '4096\n');
    expect(readCgroupMemory(r)).toEqual({ workingSetBytes: 400, limitBytes: 4096 });
  });

  test('v1 fallback: usage/stat/limit under memory/; sentinel limit → null', async () => {
    const r = await root();
    await mkdir(join(r, 'memory'));
    await writeFile(join(r, 'memory', 'memory.usage_in_bytes'), '800\n');
    await writeFile(join(r, 'memory', 'memory.stat'), 'total_inactive_file 200\n');
    await writeFile(join(r, 'memory', 'memory.limit_in_bytes'), '9223372036854771712\n');
    expect(readCgroupMemory(r)).toEqual({ workingSetBytes: 600, limitBytes: null });
  });

  test('no cgroup filesystem → null (dev machines)', async () => {
    expect(readCgroupMemory(await root())).toBeNull();
  });
});

describe('engine operational counters over /metrics', () => {
  test('doc opens count and surface as monotonic totals; conflicts gauge present', async () => {
    const fx = await buildHostFixture({ metrics: true });
    try {
      await seedDocument(fx, 'tenant-m', 'docmet001');
      const first = await listAnnotations(fx, 'tenant-m', 'docmet001', 'alice');
      expect(first.status).toBe(200);
      expect(fx.bundle.engineCounters!.docOpens).toBeGreaterThanOrEqual(1);

      const res = await fetch(`${fx.baseUrl}/metrics`);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toMatch(/cloudpdf_engine_doc_opens_total [1-9]/);
      expect(body).toContain('cloudpdf_layer_write_conflicts_total 0');
      // The Prometheus TYPE contract: monotonic totals are counters, the
      // queue wait is a real seconds histogram (percentile-capable).
      expect(body).toContain('# TYPE cloudpdf_engine_doc_opens_total counter');
      expect(body).toContain('# TYPE cloudpdf_layer_write_conflicts_total counter');
      expect(body).toContain('# TYPE cloudpdf_engine_sheds_total counter');
      expect(body).toContain('# TYPE cloudpdf_engine_queue_wait_seconds histogram');
      expect(body).toMatch(/cloudpdf_engine_queue_depth\{lane="interactive"\} \d/);
      // Host mode: the memory-heartbeat gauges are registered, with an
      // age gauge so "no reading" is distinguishable from zero RSS.
      expect(body).toContain('cloudpdf_engine_host_rss_bytes');
      expect(body).toContain('cloudpdf_engine_host_memory_age_seconds');
    } finally {
      await tearDownHostFixture(fx);
    }
  }, 60_000);
});
