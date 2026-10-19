import {
  opIdOf,
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type DocumentPagesService,
  type PageStructureVerb,
  type PageFlattenResult,
  type PageLayout,
  type PageListSnapshot,
  type PageNameInput,
  type PageNameResult,
  type PageRef,
  type PageRemoveNameInput,
  pageRefsEqual,
  type SessionEventPublisher,
  type WriteOptions,
  type FlattenWriteOptions,
  type PageExtractInput,
  type PageExtractOptions,
} from '@embedpdf/engine-core/runtime';
import {
  PageFlattenResultSchema,
  PageListSnapshotSchema,
  PageNameResultSchema,
  wirePaths,
} from '@embedpdf/engine-core/wire';

import type { ManifestAccessor } from './CloudDocumentHandle';
import type { CloudWrites } from './CloudWrites';
import { planesInherited } from './planes';
import { awaitSignal } from '../shared/awaitSignal';
import type { HttpClient } from '../transport/HttpClient';

/**
 * Cloud-side document pages service: the reads, extract, flatten and the page
 * names, over HTTP, as `LocalDocumentPagesService` has them. The structure
 * verbs are changes (`pageVerbs`), so they can be undone.
 *
 * Page identity rule (locked with the user, do not change):
 *   - Pages are addressed exclusively by `PageRef` (their indirect
 *     `pageObjectNumber`); mutation bodies ship `{ pages: PageRef[] }`.
 *     The wire never sends a page index for a mutation. This keeps
 *     multi-call client logic from having to account for index drift
 *     between requests.
 *   - A page reorder (a change) returns the new `layout` (order + geometry)
 *     plus cloud coherence pins. It bumps only `docVersion` +
 *     `layoutVersion`; every per-page pin stays warm.
 */
export class CloudDocumentPagesService implements Omit<DocumentPagesService, PageStructureVerb> {
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

  extract(pages: PageRef[], options?: PageExtractOptions): AbortablePromise<Uint8Array> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    // A read (gated by doc.download server-side, or doc.download.flattened
    // for a flattened copy): no absorb, no event — nothing about the
    // document changed.
    const body: PageExtractInput = { pages, ...options };
    return AbortablePromise.run<Uint8Array>(async (signal) =>
      this.http.postJsonBytes(
        wirePaths.layerPagesExtract(this.docId, this.layerName),
        body,
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
