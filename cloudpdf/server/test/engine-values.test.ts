import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { CACHED_READ_KINDS } from '@embedpdf/engine-core/wire';
import { engineValuesFor } from '../src/services/EngineValues';
import {
  createAnnotation,
  docToken,
  makeReplicaCluster,
  type Replica,
  type ReplicaCluster,
} from './_helpers/two-replica-harness';
import { ENGINE } from './_helpers/pins';

const TENANT = 'tenant-engine';
const DOC = 'docengine001';
const LAYER = 'alice';

describe('engine values', () => {
  test('every kind has one, and only the kinds the fonts draw with move with them', () => {
    const before = engineValuesFor('a1b2c3');
    const after = engineValuesFor('d4e5f6');
    expect(Object.keys(before).sort()).toEqual([...CACHED_READ_KINDS].sort());
    expect(new Set(Object.values(before)).size).toBe(CACHED_READ_KINDS.length);
    const moved = CACHED_READ_KINDS.filter((kind) => before[kind] !== after[kind]).sort();
    expect(moved).toEqual(['annotationAppearances', 'fonts', 'render', 'widgetAppearances']);
    expect(engineValuesFor('a1b2c3')).toEqual(before);
  });
});

/**
 * A cached read's URL names its kind's engine value (from `/head`) and the
 * shape the client reads. A URL that names another engine value is answered
 * with this server's own answer, uncached, so nothing is cached under a value
 * that doesn't describe it; a shape newer than this server's is refused.
 */
describe('cached reads name their engine value and shape', () => {
  let cluster: ReplicaCluster;
  let replica: Replica;

  beforeEach(async () => {
    cluster = await makeReplicaCluster(1);
    await cluster.seedDocument(TENANT, DOC, { pageCount: 1 });
    replica = cluster.replicas[0]!;
    const base = await createAnnotation(replica, {
      tenantId: TENANT,
      docId: DOC,
      layerName: LAYER,
      contents: 'BASE',
    });
    expect(base.status).toBe(200);
  });

  afterEach(async () => {
    await cluster.teardown();
  });

  const get = (path: string) =>
    fetch(`${replica.baseUrl}/v1/docs/${DOC}/layers/${LAYER}/${path}`, {
      headers: { Authorization: `Bearer ${docToken(TENANT, DOC, LAYER)}` },
    });

  test("/head carries this server's engine value for every kind", async () => {
    const res = await get('head');
    expect(res.status).toBe(200);
    const head = (await res.json()) as { engine: Record<string, string> };
    expect(head.engine).toEqual(ENGINE);
  });

  test("a URL with this server's engine value is cached", async () => {
    const res = await get(`text/pages/obj:1/data@contentVersion=1,engine=${ENGINE.text},shape=1`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(res.headers.get('embedpdf-engine')).toBeNull();
  });

  test('a URL with another engine value is answered uncached, naming this server’s', async () => {
    const res = await get('text/pages/obj:1/data@contentVersion=1,engine=0ther,shape=1');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).not.toContain('immutable');
    expect(res.headers.get('embedpdf-engine')).toBe(ENGINE.text);
  });

  test('a picture with another engine value is drawn but never stored or cached', async () => {
    const token = (engine: string) =>
      `contentVersion=1,engine=${engine},format=webp,shape=1,viewport.kind=width,viewport.width=320`;
    const other = await get(`render/pages/obj:1/data@${token('0ther')}`);
    expect(other.status).toBe(200);
    expect(other.headers.get('cache-control')).not.toContain('immutable');
    expect(other.headers.get('embedpdf-engine')).toBe(ENGINE.render);
    const own = await get(`render/pages/obj:1/data@${token(ENGINE.render)}`);
    expect(own.status).toBe(200);
    expect(own.headers.get('cache-control')).toContain('immutable');
  });

  test('a shape newer than this server answers is refused', async () => {
    const res = await get(`text/pages/obj:1/data@contentVersion=1,engine=${ENGINE.text},shape=2`);
    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control') ?? '').not.toContain('immutable');
  });

  test('a token without an engine value or a shape is refused', async () => {
    expect((await get('text/pages/obj:1/data@contentVersion=1')).status).toBe(400);
    expect((await get(`text/pages/obj:1/data@contentVersion=1,engine=${ENGINE.text}`)).status).toBe(
      400,
    );
  });
});
