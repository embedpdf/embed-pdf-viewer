import {
  opIdOf,
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type DocumentPagesService,
  type PageFlattenResult,
  type PageDeleteResult,
  type PageInsertBlankSpec,
  type PageInsertResult,
  type PageLayout,
  type PageListSnapshot,
  type PagePosition,
  type PageReorderResult,
  type PageNameInput,
  type PageNameResult,
  type PageRef,
  type PageRemoveNameInput,
  type PageRotateResult,
  type PdfRotation,
  pageRefsEqual,
  type WriteOptions,
  type FlattenWriteOptions,
  type PageInsertBlankOptions,
} from '@embedpdf/engine-core/runtime';
import {
  PageDeleteResultSchema,
  PageFlattenResultSchema,
  PageInsertResultSchema,
  PageListSnapshotSchema,
  PageReorderResultSchema,
  PageNameResultSchema,
  PageRotateResultSchema,
  wirePaths,
} from '@embedpdf/engine-core/wire';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import { buildRoleMutationForm } from './buildMutationForm';
import type { ManifestAccessor } from './CloudDocumentHandle';
import type { CloudWrites } from './CloudWrites';
import { planesInherited } from './planes';
import { awaitSignal } from '../shared/awaitSignal';
import { withObjectNumbers } from '../shared/withObjectNumbers';
import type { HttpClient } from '../transport/HttpClient';

/** Detach a Uint8Array view into a standalone ArrayBuffer (the resource-map
 *  shape) without disturbing a larger buffer the caller still owns. */
function copyToExactBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(view.byteLength);
  new Uint8Array(copy).set(view);
  return copy;
}

/**
 * Cloud-side document pages service. Mirrors `LocalDocumentPagesService`
 * over HTTP: GET /pages for `list`, POST /pages/reorder for the reorder.
 *
 * Page identity rule (locked with the user, do not change):
 *   - Pages are addressed exclusively by `PageRef` (their indirect
 *     `pageObjectNumber`); mutation bodies ship `{ pages: PageRef[] }`.
 *     The wire never sends a page index for a mutation. This keeps
 *     multi-call client logic from having to account for index drift
 *     between requests.
 *   - Successful `reorder()` returns the new `layout` (order + geometry) plus
 *     cloud coherence pins. A page reorder bumps only `docVersion` +
 *     `layoutVersion`; every per-page pin stays warm.
 */
export class CloudDocumentPagesService implements DocumentPagesService {
  /** The last layout leaf read by {@link pageLayout}, keyed by its URL path. */
  private layoutMemo: { path: string; snapshot: Promise<PageListSnapshot> } | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
    private readonly publisher: SessionEventPublisher,
    private readonly writes: CloudWrites,
  ) {}

  /**
   * Page-geometry list. The geometry bytes live at the content-addressed
   * `/layout@layoutVersion=N` leaf (not in the manifest); the manifest only
   * publishes the `layoutVersion` pointer. So `list()` reads `layoutVersion`
   * from the cached manifest, fetches the layout leaf, and on a 404 (stale
   * pointer) transparently refreshes the manifest and retries once — the
   * same ladder the per-page text/geometry reads use. `layoutVersion` bumps
   * only on structural page ops, so this leaf stays cached across content
   * and annotation edits.
   */
  list(): AbortablePromise<PageListSnapshot> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<PageListSnapshot>((signal) => this.fetchLayout(signal));
  }

  /**
   * One page's layout, for renders to size their image without a round
   * trip per tile. The layout leaf never changes at a given URL, so the
   * last one read is kept and shared until the manifest points elsewhere.
   */
  async pageLayout(ref: PageRef, signal: AbortSignal): Promise<PageLayout> {
    const path = await this.layoutPath(signal);
    let memo = this.layoutMemo;
    if (memo?.path !== path) {
      // Not tied to this caller's signal: one caller's cancel must not
      // fail the others waiting on the same read.
      const snapshot = this.fetchLayout(new AbortController().signal);
      const next = { path, snapshot };
      snapshot.catch(() => {
        if (this.layoutMemo === next) this.layoutMemo = null;
      });
      this.layoutMemo = memo = next;
    }
    const snapshot = await awaitSignal(memo.snapshot, signal);
    const page = snapshot.pages.find((p) => pageRefsEqual(p.ref, ref));
    if (!page) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `no page with object number ${ref.objectNumber} in document ${this.docId}`,
      );
    }
    return page;
  }

  /**
   * Plane-scope rule: the layout leaf depends on the `layout` plane —
   * while inherited (no reorder/rotate/insert/delete ever ran), every
   * visitor's page list is one doc-level URL served from the base
   * session; the SDK open sequence creates no layer session.
   */
  private async layoutPath(signal: AbortSignal): Promise<string> {
    const manifest = await this.manifest.get(signal);
    return planesInherited(manifest, ['layout'])
      ? wirePaths.docLayout(this.docId, manifest.layoutVersion)
      : wirePaths.layerLayout(this.docId, this.layerName, manifest.layoutVersion);
  }

  private fetchLayout(signal: AbortSignal): Promise<PageListSnapshot> {
    return this.http.getJsonWithRefresh(
      (s) => this.layoutPath(s),
      (raw) => PageListSnapshotSchema.parse(raw),
      async (s) => {
        await this.manifest.refresh(s);
      },
      signal,
    );
  }

  reorder(
    pages: PageRef[],
    position: PagePosition,
    options?: WriteOptions,
  ): AbortablePromise<PageReorderResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<PageReorderResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.postJson(
            wirePaths.layerPagesReorder(this.docId, this.layerName),
            { pages, position },
            (raw) => PageReorderResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        // A reorder only advances docVersion + layoutVersion (no per-page pin
        // changes), so the cached manifest can be patched in place — no refetch.
        this.manifest.apply(result.meta, ['layout']);
        // Publish after absorb: listeners reading the manifest in their
        // callback must see post-mutation state.
        this.publisher.publishWrite(opId, { type: 'pages.reordered', ...result });
        return result;
      });
    });
  }

  setName(input: PageNameInput, options?: WriteOptions): AbortablePromise<PageNameResult> {
    return this.runNameMutation(
      wirePaths.layerPagesNames(this.docId, this.layerName),
      input,
      input.name,
      input.page,
      options,
    );
  }

  removeName(input: PageRemoveNameInput, options?: WriteOptions): AbortablePromise<PageNameResult> {
    return this.runNameMutation(
      wirePaths.layerPagesNamesDelete(this.docId, this.layerName),
      input,
      input.name,
      null,
      options,
    );
  }

  /**
   * Named pages are layout: both verbs share the page-reorder patch exactly —
   * docVersion + layoutVersion advance, no per-page pin changes, so the
   * cached manifest is patched in place and the fresh layout is published.
   */
  private runNameMutation(
    path: string,
    body: PageNameInput | PageRemoveNameInput,
    name: string,
    page: PageRef | null,
    options: WriteOptions | undefined,
  ): AbortablePromise<PageNameResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<PageNameResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.postJson(path, body, (raw) => PageNameResultSchema.parse(raw), signal, sent),
        );
        this.manifest.apply(result.meta, ['layout']);
        this.publisher.publishWrite(opId, { type: 'pages.named', name, page, ...result });
        return result;
      });
    });
  }

  rotate(
    pages: PageRef[],
    rotation: PdfRotation,
    options?: WriteOptions,
  ): AbortablePromise<PageRotateResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<PageRotateResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.postJson(
            wirePaths.layerPagesRotate(this.docId, this.layerName),
            { pages, rotation },
            (raw) => PageRotateResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        // Rotation shares the reorder patch exactly: docVersion + layoutVersion
        // advance, every per-page pin (and its cached render) stays warm.
        this.manifest.apply(result.meta, ['layout']);
        this.publisher.publishWrite(opId, { type: 'pages.rotated', pages, rotation, ...result });
        return result;
      });
    });
  }

  delete(pages: PageRef[], options?: WriteOptions): AbortablePromise<PageDeleteResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<PageDeleteResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.postJson(
            wirePaths.layerPagesDelete(this.docId, this.layerName),
            { pages },
            (raw) => PageDeleteResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        // The structural advance plus dropping the deleted pages' manifest
        // rows — a retired page object number must not be buildable from the local cache.
        this.manifest.applyPageDelete(result.meta, pages);
        this.publisher.publishWrite(opId, { type: 'pages.deleted', pages, ...result });
        return result;
      });
    });
  }

  insert(
    bytes: Uint8Array | ArrayBuffer,
    position: PagePosition = 'end',
    options?: WriteOptions,
  ): AbortablePromise<PageInsertResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<PageInsertResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        // The body names the source PDF by its role, `resources: { source }`.
        const buffer = bytes instanceof ArrayBuffer ? bytes : copyToExactBuffer(bytes);
        const form = buildRoleMutationForm(
          { position },
          {
            source: { bytes: buffer, mimeType: 'application/pdf', name: 'source.pdf' },
          },
        );
        const result = await write.send((sent) =>
          this.http.postMultipartJson(
            wirePaths.layerPagesInsert(this.docId, this.layerName),
            form,
            (raw) => PageInsertResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        // Insert changes the page set: the cached manifest has no rows for
        // the fresh page object numbers, so the absorb drops it for a lazy refetch (the
        // result already carries the full new layout — nothing waits).
        this.manifest.applyPageInsert(result.meta);
        this.publisher.publishWrite(opId, { type: 'pages.inserted', ...result });
        return result;
      });
    });
  }

  insertBlank(
    spec: PageInsertBlankSpec,
    position: PagePosition = 'end',
    options: PageInsertBlankOptions = {},
  ): AbortablePromise<PageInsertResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<PageInsertResult>(async (signal) => {
      const opId = opIdOf(options);
      const { objectNumbers } = options;
      return this.writes.run(
        opId,
        signal,
        async (write) => {
          const result = await write.send((sent) =>
            this.http.postJson(
              withObjectNumbers(wirePaths.layerPagesInsertBlank(this.docId, this.layerName), {
                objectNumbers,
              }),
              {
                size: spec.size,
                ...(spec.count !== undefined ? { count: spec.count } : {}),
                position,
              },
              (raw) => PageInsertResultSchema.parse(raw),
              signal,
              sent,
            ),
          );
          this.manifest.applyPageInsert(result.meta);
          this.publisher.publishWrite(opId, { type: 'pages.inserted', ...result });
          return result;
        },
        objectNumbers ?? [],
      );
    });
  }

  extract(pages: PageRef[]): AbortablePromise<Uint8Array> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    // A read (gated by doc.download server-side): no absorb, no event —
    // nothing about the document changed.
    return AbortablePromise.run<Uint8Array>(async (signal) =>
      this.http.postJsonBytes(
        wirePaths.layerPagesExtract(this.docId, this.layerName),
        { pages },
        signal,
      ),
    );
  }

  flatten(pages: PageRef[], options?: FlattenWriteOptions): AbortablePromise<PageFlattenResult> {
    const usage = options?.usage ?? 'display';
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<PageFlattenResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.postJson(
            wirePaths.layerPagesFlatten(this.docId, this.layerName),
            { pages, usage },
            (raw) => PageFlattenResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        // Nothing flattened comes back without a cache delta: no artifact, no
        // coherence bump, no event.
        if (result.meta.cacheDelta === null) return result;
        // Flatten bakes annotations and form fields into page content.
        this.manifest.apply(result.meta, ['content', 'annotations', 'forms']);
        this.publisher.publishWrite(opId, {
          type: 'pages.flattened',
          ...result,
        });
        return result;
      });
    });
  }
}
