/**
 * The page-edit controller. Stateless: it turns the engine handle's page
 * service into a ref-addressed edit capability. The relative→absolute rotation
 * and the placement→index resolution live here — once — instead of in every
 * framework adapter's click handler.
 */
import { createSerialQueue, PluginError, toPluginError } from '@embedpdf/core';
import type {
  DocCapability,
  DocumentHandle,
  PageInsertResult,
  PageRef,
  PageRotateResult,
  PageRotation,
  PdfSize,
  PluginContext,
} from '@embedpdf/core';

import type { PageEditCapability, PagePlacement } from './contract';

/** PDF bit 11 (ASSEMBLE = insert/rotate/delete pages). The engine enforces it too. */
const ASSEMBLE_CAPABILITY: DocCapability = 'doc.pages.assemble';

export function createPageEditController(ctx: PluginContext<unknown>): PageEditCapability {
  /** Read-modify-write verbs serialize per document. */
  const enqueue = createSerialQueue();

  const requireDoc = (): DocumentHandle => {
    const doc = ctx.doc;
    if (!doc) throw new PluginError('not-ready', 'page-edit', 'no document bound');
    return doc;
  };
  const engine = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      throw toPluginError('page-edit', error);
    }
  };
  const registry = () => ctx.document()?.pages ?? [];
  const entryOf = (page: PageRef) =>
    registry().find((p) => p.ref.pageObjectNumber === page.pageObjectNumber);
  const requireEntry = (page: PageRef) => {
    const entry = entryOf(page);
    if (!entry) {
      throw new PluginError('not-found', 'page-edit', `no page ${page.pageObjectNumber}`);
    }
    return entry;
  };

  /** A placement → the engine's index wire, from the registry at call time. */
  const resolvePlacement = (placement: PagePlacement | undefined) => {
    if (!placement || placement === 'end') return { destIndex: undefined, anchor: undefined };
    if ('index' in placement) return { destIndex: placement.index, anchor: undefined };
    const anchor = requireEntry('after' in placement ? placement.after : placement.before);
    return { destIndex: 'after' in placement ? anchor.index + 1 : anchor.index, anchor };
  };
  /** Default blank-page size: the insertion point's predecessor, else the last page, else US Letter. */
  const neighbourSize = (destIndex: number | undefined): PdfSize => {
    const pages = registry();
    if (pages.length === 0) return { width: 612, height: 792 };
    if (destIndex === undefined) return pages[pages.length - 1].size;
    return pages[Math.max(0, Math.min(destIndex - 1, pages.length - 1))].size;
  };
  const insertAt = (
    doc: DocumentHandle,
    bytes: Uint8Array | ArrayBuffer,
    placement: PagePlacement | undefined,
  ): Promise<PageInsertResult> =>
    engine(() => doc.pages.insert(bytes, resolvePlacement(placement).destIndex));

  const api: PageEditCapability = {
    // Wildcard-aware predicate (mirrors the engine's own enforcement) — NOT an
    // `effectiveScope.includes(...)` enumeration, which would drop the `*` grant.
    canEdit: () => ctx.doc?.security.allows(ASSEMBLE_CAPABILITY) ?? false,

    rotateBy: (pages, delta) =>
      enqueue(async () => {
        const doc = requireDoc();
        // Group by the resulting absolute rotation: the engine wire is one
        // value per call. Wrap to [0, 360) — the double-mod keeps -90 from 0 at 270.
        const groups = new Map<PageRotation, PageRef[]>();
        for (const page of pages) {
          const next = ((((requireEntry(page).rotation + delta) % 360) + 360) %
            360) as PageRotation;
          groups.set(next, [...(groups.get(next) ?? []), page]);
        }
        let result: PageRotateResult | null = null;
        for (const [rotation, group] of groups) {
          result = await engine(() => doc.pages.rotate(group, rotation));
        }
        if (!result) throw new PluginError('invalid-input', 'page-edit', 'no pages given');
        return result;
      }),
    setRotation: (pages, rotation) =>
      enqueue(() => engine(() => requireDoc().pages.rotate([...pages], rotation))),
    move: (pages, placement) =>
      enqueue(() => {
        const doc = requireDoc();
        const { destIndex } = resolvePlacement(placement);
        return engine(() => doc.pages.move([...pages], destIndex ?? registry().length));
      }),
    delete: (pages) => enqueue(() => engine(() => requireDoc().pages.delete([...pages]))),
    insertBlank: (options = {}) =>
      enqueue(() => {
        const doc = requireDoc();
        const { destIndex, anchor } = resolvePlacement(options.placement);
        // A ref placement matches the anchor the user is looking at; everything
        // else matches the neighbour the new page will follow.
        const size = options.size ?? anchor?.size ?? neighbourSize(destIndex);
        return engine(() => doc.pages.insertBlank({ size, count: options.count }, destIndex));
      }),
    insertFromBytes: (bytes, options = {}) =>
      enqueue(async () => {
        const doc = requireDoc();
        if (!options.pageIndexes) return insertAt(doc, bytes, options.placement);
        // A subset: open the bytes beside the document, extract, insert.
        const source = await engine(() =>
          ctx.engine.open(
            {
              kind: 'bytes',
              id: `page-edit-source-${Date.now().toString(36)}`,
              bytes: new Uint8Array(bytes),
            },
            { scope: ['*'] },
          ),
        );
        try {
          const layout = await engine(() => source.pages.list());
          const refs = options.pageIndexes!.map((index) => {
            const page = layout.pages[index];
            if (!page)
              throw new PluginError('not-found', 'page-edit', `the PDF has no page ${index}`);
            return page.ref;
          });
          const subset = await engine(() => source.pages.extract(refs));
          return await insertAt(doc, subset, options.placement);
        } finally {
          await source.close();
        }
      }),
    insertFromDocument: (documentId, pages, options = {}) =>
      enqueue(async () => {
        const doc = requireDoc();
        const other = ctx.documentHandle(documentId);
        if (!other)
          throw new PluginError('not-found', 'page-edit', `document '${documentId}' is not open`);
        const bytes = await engine(() => other.pages.extract([...pages]));
        return insertAt(doc, bytes, options.placement);
      }),
    duplicate: (pages, options = {}) =>
      enqueue(async () => {
        const doc = requireDoc();
        const last = pages[pages.length - 1];
        if (!last) throw new PluginError('invalid-input', 'page-edit', 'no pages given');
        const bytes = await engine(() => doc.pages.extract([...pages]));
        return insertAt(doc, bytes, options.placement ?? { after: last });
      }),
    extract: (pages) => engine(() => requireDoc().pages.extract([...pages])),
  };
  return api;
}
