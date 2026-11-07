import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  createAnnotation,
  docToken,
  holdNextRead,
  holdNextUpload,
  listAnnotations,
  makeReplicaCluster,
  type AnnotationListBody,
  type Replica,
  type ReplicaCluster,
} from './_helpers/two-replica-harness';
import { ENGINE } from './_helpers/pins';

const TENANT = 'tenant-pinned';
const DOC = 'docpinned001';
const LAYER = 'alice';
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface LayerPins {
  annotationsVersion: number;
  page: { contentVersion: number; annotationVersion: number };
}

/**
 * The reads an annotation write changes, each at the pins it is cached
 * under, with the worker jobs that serve it.
 */
const ANNOTATION_PINNED_READS: ReadonlyArray<{
  name: string;
  path: (pins: LayerPins) => string;
  jobs: readonly string[];
}> = [
  {
    name: 'the page drawn with its annotations',
    path: (pins) =>
      `render/annotations/pages/obj:1/data@annotationVersion=${pins.page.annotationVersion},` +
      `contentVersion=${pins.page.contentVersion},engine=${ENGINE.render},format=webp,shape=1,` +
      'viewport.kind=width,viewport.width=320',
    jobs: ['pages.render', 'pages.renderEncoded'],
  },
  {
    name: "the page's annotation appearances",
    path: (pins) =>
      `annotations/pages/obj:1/appearances@annotationVersion=${pins.page.annotationVersion},` +
      `engine=${ENGINE.annotationAppearances},format=webp,shape=1,viewport.kind=scale,viewport.scale=1`,
    jobs: ['annotations.renderAppearances', 'annotations.renderAppearancesEncoded'],
  },
  {
    name: "the page's annotations",
    path: (pins) =>
      `annotations/pages/obj:1/items@annotationVersion=${pins.page.annotationVersion},` +
      `engine=${ENGINE.annotations},shape=1`,
    jobs: ['annotations.list'],
  },
  {
    name: "the document's annotations",
    path: (pins) =>
      `annotations/items@annotationsVersion=${pins.annotationsVersion},` +
      `engine=${ENGINE.annotationsAll},shape=1`,
    jobs: ['annotations.list'],
  },
];

/**
 * A pinned read (`…@token`) goes out `immutable`: every CDN that holds it
 * serves it for a year. Its body must be exactly the state its pins name,
 * whatever write runs on the layer while it reads. Each read below is
 * answered from that state, or refused as no longer current.
 */
describe('pinned reads under concurrent layer writes', () => {
  let cluster: ReplicaCluster;
  let replica: Replica;

  beforeEach(async () => {
    cluster = await makeReplicaCluster(1);
    await cluster.seedDocument(TENANT, DOC, { pageCount: 2 });
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

  const layerPins = async (): Promise<LayerPins> => {
    const res = await fetch(`${replica.baseUrl}/v1/docs/${DOC}/layers/${LAYER}/manifest`, {
      headers: { Authorization: `Bearer ${docToken(TENANT, DOC, LAYER)}` },
    });
    expect(res.status).toBe(200);
    const manifest = (await res.json()) as {
      annotationsVersion: number;
      pages: Array<{
        page: { objectNumber: number };
        cache: { contentVersion: number; annotationVersion: number };
      }>;
    };
    const page = manifest.pages.find((p) => p.page.objectNumber === 1)!;
    return { annotationsVersion: manifest.annotationsVersion, page: page.cache };
  };

  const pinnedGet = (path: string) =>
    fetch(`${replica.baseUrl}/v1/docs/${DOC}/layers/${LAYER}/${path}`, {
      headers: { Authorization: `Bearer ${docToken(TENANT, DOC, LAYER)}` },
    });

  const startWrite = () =>
    createAnnotation(replica, {
      tenantId: TENANT,
      docId: DOC,
      layerName: LAYER,
      contents: 'DIRTY',
    });

  for (const read of ANNOTATION_PINNED_READS) {
    test(`${read.name}: a write that commits while the read waits refuses the old pins`, async () => {
      const pins = await layerPins();

      // The write is applied in the worker and held before its commit.
      const upload = holdNextUpload(replica);
      const write = startWrite();
      await upload.held;

      // The read passes its pins (still current) and waits for the write.
      const response = pinnedGet(read.path(pins));
      await sleep(100);
      upload.release();

      const res = await response;
      expect((await write).status).toBe(200);
      expect(res.status).toBe(404);
      expect(res.headers.get('cache-control')).not.toContain('immutable');
    });

    test(`${read.name}: a write applied before the read runs refuses it, committed or not`, async () => {
      const pins = await layerPins();

      // The read passes its pins and the wait for writes, then stops before
      // its job reaches the worker.
      const reading = holdNextRead(replica, read.jobs);
      const response = pinnedGet(read.path(pins));
      await reading.held;

      // A write starts, is applied in the worker and is held before its
      // commit: the read's job runs on uncommitted state.
      const upload = holdNextUpload(replica);
      const write = startWrite();
      await upload.held;
      reading.release();

      const res = await response;
      upload.release();
      expect((await write).status).toBe(200);
      expect(res.status).toBe(404);
      expect(res.headers.get('cache-control')).not.toContain('immutable');
    });
  }

  test('a read whose pins a write leaves alone is answered once the write settles', async () => {
    const pins = await layerPins();
    const upload = holdNextUpload(replica);
    const write = startWrite();
    await upload.held;

    // Page text is pinned to the page's content, which an annotation write
    // leaves alone: the read waits for the write and is answered.
    const response = pinnedGet(
      `text/pages/obj:1/data@contentVersion=${pins.page.contentVersion},` +
        `engine=${ENGINE.text},shape=1`,
    );
    await sleep(100);
    upload.release();

    const res = await response;
    expect((await write).status).toBe(200);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  test('an annotation list read on uncommitted state never goes out under the old pin', async () => {
    const pins = await layerPins();
    const reading = holdNextRead(replica, ['annotations.list']);
    const response = pinnedGet(
      `annotations/pages/obj:1/items@annotationVersion=${pins.page.annotationVersion},` +
        `engine=${ENGINE.annotations},shape=1`,
    );
    await reading.held;

    const upload = holdNextUpload(replica);
    const write = startWrite();
    await upload.held;
    reading.release();

    const res = await response;
    if (res.status === 200) {
      const body = (await res.json()) as AnnotationListBody;
      expect(body.annotations.map((an) => an.contents)).toEqual(['BASE']);
    } else {
      expect(res.status).toBe(404);
    }
    upload.release();
    expect((await write).status).toBe(200);
    const after = await listAnnotations(replica, {
      tenantId: TENANT,
      docId: DOC,
      layerName: LAYER,
    });
    expect(after.annotations.map((an) => an.contents).sort()).toEqual(['BASE', 'DIRTY']);
  });
});
