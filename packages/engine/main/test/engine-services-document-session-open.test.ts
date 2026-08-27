import { describe, expect, test } from 'vitest';
import { wirePack, type WorkerResponse } from '@embedpdf/engine-core/runtime';
import { ManifestPageSchema } from '@embedpdf/engine-core/wire';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';
import { BaseDocumentRegistry } from '../../services/src/document-session/lifecycle/BaseDocumentRegistry';
import { DocumentSession } from '../../services/src/document-session/DocumentSession';
import { openLayerDocument } from '../../services/src/document-session/lifecycle/PdfDocumentOpener';
import { WorkerHost } from '../../services/src/worker-host/WorkerHost';

const ptr = (value: number): Ptr => BigInt(value) as Ptr;

function createFakeRuntime(): PdfRuntimeModule & {
  readonly calls: {
    closeDocuments: Ptr[];
    loadMemDocuments: Array<{ ptr: Ptr; size: number; password: string }>;
    loadMemBases: Array<{ ptr: Ptr; size: number; password: string }>;
    nodeFilePaths: string[];
    releaseBases: Ptr[];
    fileAccessClosed: number;
    loadPages: Array<{ docPtr: Ptr; pageIndex: number }>;
    order: string[];
  };
} {
  let nextPtr = 1000;
  const memory = new Map<string, number | bigint>();
  const pagesByDoc = new Map<Ptr, number[]>();
  const ponByPagePtr = new Map<Ptr, number>();
  const calls = {
    closeDocuments: [] as Ptr[],
    loadMemDocuments: [] as Array<{ ptr: Ptr; size: number; password: string }>,
    loadMemBases: [] as Array<{ ptr: Ptr; size: number; password: string }>,
    nodeFilePaths: [] as string[],
    releaseBases: [] as Ptr[],
    fileAccessClosed: 0,
    loadPages: [] as Array<{ docPtr: Ptr; pageIndex: number }>,
    order: [] as string[],
  };

  const runtime = {
    kind: 'native',
    platform: 'test',
    calls,
    mem: {
      alloc: () => ptr(nextPtr++),
      free: () => undefined,
      readBytes: () => new Uint8Array(),
      writeBytes: () => undefined,
      readU8String: () => '',
      writeU8String: () => ptr(nextPtr++),
      readU16String: () => '',
      writeU16String: () => ptr(nextPtr++),
      peek: (address: Ptr, _kind: string, byteOffset = 0) =>
        memory.get(`${address}:${byteOffset}`) ?? 0,
      poke: (address: Ptr, _kind: string, value: number | bigint, byteOffset = 0) => {
        memory.set(`${address}:${byteOffset}`, value);
      },
    },
    cb: {
      register: () => ptr(nextPtr++),
      dispose: () => undefined,
    },
    fileAccess: {
      fromMemory: () => ({
        ptr: ptr(501),
        close: () => {
          calls.fileAccessClosed++;
          calls.order.push('file-access');
        },
      }),
      fromNodeFile: (path: string) => ({
        ptr: ptr(502),
        close: () => {
          calls.nodeFilePaths.push(path);
          calls.fileAccessClosed++;
          calls.order.push('file-access');
        },
      }),
    },
    fn: {
      FPDF_InitLibrary: () => undefined,
      FPDF_DestroyLibrary: () => undefined,
      EPDF_InitThread: () => undefined,
      EPDF_ShutdownThread: () => undefined,
      FPDF_LoadMemDocument64: (dataPtr: Ptr, size: number, password: string) => {
        calls.loadMemDocuments.push({ ptr: dataPtr, size, password });
        const docPtr = ptr(101);
        pagesByDoc.set(docPtr, [1101]);
        return docPtr;
      },
      FPDF_CloseDocument: (docPtr: Ptr) => {
        calls.closeDocuments.push(docPtr);
        calls.order.push('document');
      },
      FPDF_GetPageCount: (docPtr: Ptr) => pagesByDoc.get(docPtr)?.length ?? 0,
      EPDFDoc_GetPageObjectNumberByIndex: (docPtr: Ptr, pageIndex: number) =>
        pagesByDoc.get(docPtr)?.[pageIndex] ?? 0,
      FPDF_LoadPage: (docPtr: Ptr, pageIndex: number) => {
        calls.loadPages.push({ docPtr, pageIndex });
        const pon = pagesByDoc.get(docPtr)?.[pageIndex];
        if (!pon) return ptr(0);
        const pagePtr = ptr(Number(docPtr) * 100 + pageIndex);
        ponByPagePtr.set(pagePtr, pon);
        return pagePtr;
      },
      EPDFDoc_LoadPageByObjectNumber: (docPtr: Ptr, pageObjectNumber: number) => {
        if (!pagesByDoc.get(docPtr)?.includes(pageObjectNumber)) return ptr(0);
        const pagePtr = ptr(Number(docPtr) * 1000 + pageObjectNumber);
        ponByPagePtr.set(pagePtr, pageObjectNumber);
        return pagePtr;
      },
      FPDF_ClosePage: () => undefined,
      EPDFPage_GetObjectNumber: (pagePtr: Ptr) => ponByPagePtr.get(pagePtr) ?? 0,
      // Security probe run on every open. The harness opens unencrypted
      // fixtures: report success with kind=0 (none); the caller pre-zeroes
      // the out-params so the defaults (no perms, revision 0) flow through.
      EPDF_CheckPasswordPermissions: () => 1,
      // Geometry bindings used by PagesReader (pages.list). The harness
      // only asserts page identity (pageObjectNumber/order), so return the
      // "absent" sentinel for every box/size/unit/label and let the reader
      // apply its documented fallbacks (0x0 size, rotation 0, userUnit 1,
      // null label, zero-rect media).
      EPDF_GetPageBoxByIndex: () => 0,
      EPDF_GetPageSizeByIndexNormalized: () => 0,
      EPDF_GetPageRotationByIndex: () => 0,
      EPDF_GetPageUserUnitByIndex: () => 0,
      FPDF_GetPageLabel: () => 0,
      // No page-level actions in this ownership/routing fixture.
      EPDFDoc_GetPageActionModel: () => ptr(0),
      EPDF_LoadMemBaseDocument64: (dataPtr: Ptr, size: number, password: string) => {
        calls.loadMemBases.push({ ptr: dataPtr, size, password });
        return ptr(201);
      },
      EPDF_LoadBaseDocument: () => ptr(202),
      EPDF_ReleaseBaseDocument: (basePtr: Ptr) => {
        calls.releaseBases.push(basePtr);
        calls.order.push('base');
      },
      EPDFLayer_OpenLayer: (_basePtr: Ptr, _accessPtr: Ptr, _password: string, statusPtr: Ptr) => {
        runtime.mem.poke(statusPtr, 'i32', 0);
        const docPtr = ptr(301);
        pagesByDoc.set(docPtr, [3101, 3102]);
        return docPtr;
      },
      EPDFLayer_OpenLayerArtifact: (
        _basePtr: Ptr,
        _accessPtr: Ptr,
        _password: string,
        statusPtr: Ptr,
      ) => {
        runtime.mem.poke(statusPtr, 'i32', 0);
        const docPtr = ptr(302);
        pagesByDoc.set(docPtr, [3201, 3202]);
        return docPtr;
      },
    },
    async destroy() {
      return undefined;
    },
  } as unknown as PdfRuntimeModule & { calls: typeof calls };

  return runtime;
}

describe('DocumentSession open ownership', () => {
  test('fat memory open preserves current FPDF_LoadMemDocument behavior', () => {
    const runtime = createFakeRuntime();
    const session = new DocumentSession(runtime);

    session.open(new Uint8Array([1, 2, 3]), 'pw');

    expect(session.kind).toBe('fat-memory');
    expect(runtime.calls.loadMemDocuments).toHaveLength(1);
    expect(runtime.calls.loadMemDocuments[0]).toMatchObject({ size: 3, password: 'pw' });

    session.close();

    expect(runtime.calls.closeDocuments).toEqual([ptr(101)]);
  });

  test('pageState keeps weak annotation knowledge explicit', () => {
    const runtime = createFakeRuntime();
    const session = new DocumentSession(runtime);

    session.open(new Uint8Array([1]), null);

    const initial = session.pageState(1101);
    expect(initial.weakAnnotationState).toEqual({ kind: 'unknown' });
    expect(
      ManifestPageSchema.safeParse({
        state: initial,
        cache: { contentVersion: 1, annotationVersion: 1 },
      }).success,
    ).toBe(false);

    session.recordWeakFlag(1101, false);
    const known = session.pageState(1101);
    expect(known.weakAnnotationState).toEqual({
      kind: 'known',
      hasAnyWeakAnnotations: false,
    });
    expect(
      ManifestPageSchema.safeParse({
        state: known,
        cache: { contentVersion: 1, annotationVersion: 1 },
      }).success,
    ).toBe(true);

    session.close();
  });

  test('base registry shares one loaded memory base until the last release', () => {
    const runtime = createFakeRuntime();
    const registry = new BaseDocumentRegistry(runtime);

    const first = registry.acquireMemoryBase({
      key: 'base-a',
      bytes: new Uint8Array([1, 2]),
      password: null,
    });
    const second = registry.acquireMemoryBase({
      key: 'base-a',
      bytes: new Uint8Array([9, 9]),
      password: null,
    });

    expect(first.basePtr).toBe(second.basePtr);
    expect(runtime.calls.loadMemBases).toHaveLength(1);
    expect(registry.getRefCountForTesting('base-a')).toBe(2);

    first.release();
    expect(registry.getRefCountForTesting('base-a')).toBe(1);
    expect(runtime.calls.releaseBases).toEqual([]);

    second.release();
    expect(registry.getRefCountForTesting('base-a')).toBe(0);
    expect(runtime.calls.releaseBases).toEqual([ptr(201)]);
  });

  test('layer session closes document before artifact access and shared base', () => {
    const runtime = createFakeRuntime();
    const base = {
      key: 'base-a',
      basePtr: ptr(201),
      release: () => {
        runtime.calls.order.push('base-handle');
      },
    };

    const session = new DocumentSession(runtime);
    session.openFromHandle(
      openLayerDocument(runtime, base, { kind: 'artifact', bytes: new Uint8Array([7]) }),
    );

    expect(session.kind).toBe('layer');
    session.close();

    expect(runtime.calls.closeDocuments).toEqual([ptr(302)]);
    expect(runtime.calls.fileAccessClosed).toBe(1);
    expect(runtime.calls.order).toEqual(['document', 'file-access', 'base-handle']);
  });

  test('renderEncoded kinds fail fast with NotImplemented on hosts without an injected encoder', () => {
    // The `*.renderEncoded` wire kinds are cloud-server surface: the server
    // worker injects a sharp-backed encoder; browser/local hosts (this
    // two-argument construction) must reject WITHOUT paying for a render.
    const runtime = createFakeRuntime();
    const responses: WorkerResponse[] = [];
    const host = new WorkerHost(runtime, (pack) => responses.push(pack.payload));

    host.receive({
      kind: 'pages.renderEncoded',
      jobId: 9,
      docId: 'doc-never-opened',
      pageObjectNumber: 1,
      encode: { format: 'webp' },
    });

    expect(responses).toHaveLength(1);
    const r = responses[0]!;
    expect(r.kind).toBe('reject');
    if (r.kind === 'reject') {
      expect(r.error.code).toBe('NotImplemented');
      // Fail-fast means no runtime work happened at all.
      expect(runtime.calls.closeDocuments).toEqual([]);
    }
  });

  test('worker routes base and layer sessions independently for one docId', () => {
    const runtime = createFakeRuntime();
    const responses: WorkerResponse[] = [];
    const host = new WorkerHost(runtime, (pack) => responses.push(pack.payload));

    host.receive({
      kind: 'open.fatMem',
      jobId: 1,
      docId: 'doc-a',
      bytes: new ArrayBuffer(1),
      password: null,
    });
    host.receive({
      kind: 'open.layerMemBase',
      jobId: 2,
      docId: 'doc-a',
      layerName: 'alice',
      baseKey: 'base-a',
      baseBytes: new ArrayBuffer(1),
      layer: { kind: 'fresh' },
      password: null,
    });
    host.receive({ kind: 'pages.list', jobId: 3, docId: 'doc-a' });
    host.receive({ kind: 'pages.list', jobId: 4, docId: 'doc-a', layerName: 'alice' });
    host.receive({ kind: 'close', jobId: 5, docId: 'doc-a' });
    host.receive({ kind: 'pages.list', jobId: 6, docId: 'doc-a', layerName: 'alice' });

    expect(responses.map((r) => r.kind)).toEqual([
      'resolve',
      'resolve',
      'resolve',
      'resolve',
      'resolve',
      'reject',
    ]);

    const baseList = responses[2];
    const layerList = responses[3];
    expect(baseList.kind).toBe('resolve');
    expect(layerList.kind).toBe('resolve');
    if (baseList.kind !== 'resolve' || layerList.kind !== 'resolve') return;
    expect(baseList.result).toMatchObject({
      tag: 'pages.list',
      snapshot: { pages: [{ pageObjectNumber: 1101 }] },
    });
    expect(layerList.result).toMatchObject({
      tag: 'pages.list',
      snapshot: { pages: [{ pageObjectNumber: 3101 }, { pageObjectNumber: 3102 }] },
    });
    expect(runtime.calls.loadPages).toEqual([]);
    expect(runtime.calls.closeDocuments).toEqual([ptr(101), ptr(301)]);
    expect(runtime.calls.releaseBases).toEqual([ptr(201)]);
  });

  test('worker can open the base-view session from a file-backed base', () => {
    const runtime = createFakeRuntime();
    const responses: WorkerResponse[] = [];
    const host = new WorkerHost(runtime, (pack) => responses.push(pack.payload));

    host.receive({
      kind: 'open.layerFileBase',
      jobId: 1,
      docId: 'doc-file',
      baseKey: 'base-file',
      basePath: '/tmp/base-file.pdf',
      layer: { kind: 'fresh' },
      password: null,
    });
    host.receive({ kind: 'pages.list', jobId: 2, docId: 'doc-file' });
    host.receive({ kind: 'close', jobId: 3, docId: 'doc-file' });

    expect(responses.map((r) => r.kind)).toEqual(['resolve', 'resolve', 'resolve']);
    const list = responses[1];
    expect(list.kind).toBe('resolve');
    if (list.kind !== 'resolve') return;
    expect(list.result).toMatchObject({
      tag: 'pages.list',
      snapshot: { pages: [{ pageObjectNumber: 3101 }, { pageObjectNumber: 3102 }] },
    });
    expect(runtime.calls.loadPages).toEqual([]);
    expect(runtime.calls.nodeFilePaths).toEqual(['/tmp/base-file.pdf']);
    expect(runtime.calls.closeDocuments).toEqual([ptr(301)]);
    expect(runtime.calls.releaseBases).toEqual([ptr(202)]);
  });

  test('worker shares one memory base across local layer docIds with the same baseKey', () => {
    const runtime = createFakeRuntime();
    const responses: WorkerResponse[] = [];
    const host = new WorkerHost(runtime, (pack) => responses.push(pack.payload));

    host.receive({
      kind: 'open.layerMemBase',
      jobId: 1,
      docId: 'layer-a',
      baseKey: 'shared-base',
      baseBytes: new ArrayBuffer(1),
      layer: { kind: 'fresh' },
      password: null,
    });
    host.receive({
      kind: 'open.layerMemBase',
      jobId: 2,
      docId: 'layer-b',
      baseKey: 'shared-base',
      baseBytes: new ArrayBuffer(1),
      layer: { kind: 'fresh' },
      password: null,
    });
    host.receive({ kind: 'close', jobId: 3, docId: 'layer-a' });
    host.receive({ kind: 'close', jobId: 4, docId: 'layer-b' });

    expect(responses.map((r) => r.kind)).toEqual(['resolve', 'resolve', 'resolve', 'resolve']);
    expect(runtime.calls.loadMemBases).toHaveLength(1);
    expect(runtime.calls.releaseBases).toEqual([ptr(201)]);
  });
});
