/**
 * The page-edit controller. Stateless: it turns the engine handle's page
 * service into page edits that take refs or indexes. Turning a page relative
 * to its own rotation, and resolving a placement to a position, live here
 * once instead of in every app's click handler.
 *
 * A verb refuses before anything starts (permission, pages, placement), then
 * queues its edit: edits run one at a time, in the order they were called.
 */
import { DocumentsToken, PluginError, toPluginError } from '@embedpdf/core';
import type {
  DocCapability,
  PageInfo,
  PageRef,
  PdfRotation,
  PdfSize,
  PluginContext,
} from '@embedpdf/core';

import type { PageEditCapability, PageEditInsertResult, PagePlacement } from './contract';

/** PDF permission bit 11 (assemble: insert, rotate and delete pages). The engine enforces it too. */
const ASSEMBLE: DocCapability = 'doc.pages.assemble';
/** Copying pages out of a document is a partial download. The engine enforces it too. */
const DOWNLOAD: DocCapability = 'doc.download';

/** The size of a blank page when the document has no page to match: Letter, in points. */
const LETTER_SIZE: PdfSize = { width: 612, height: 792 };

export function createPageEditController(ctx: PluginContext<void>) {
  const enqueue = ctx.serialQueue('edits');
  // A download waits for the page edits on their way.
  ctx.onSettle(() => enqueue.idle());

  /** Engine calls outside the guarded `ctx.doc` (another document, a scratch document) map their errors here. */
  const mapErrors = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      throw toPluginError('page-edit', error);
    }
  };
  const registry = (): readonly PageInfo[] => ctx.document()?.pages ?? [];
  const noPages = () => new PluginError('invalid-input', 'page-edit', 'no pages given');

  /**
   * A verb's pages as refs, checked when it is called: an index names the
   * page at that position now, which is the page the user clicked.
   */
  const refsOf = (pages: readonly (PageRef | number)[]): PageRef[] => {
    if (pages.length === 0) throw noPages();
    return pages.map((page) => ctx.pageOf(page).ref);
  };

  /** A placement whose page is fixed when the verb is called, like the verb's own pages. */
  const fixPlacement = (placement: PagePlacement | undefined): PagePlacement | undefined => {
    if (!placement || placement === 'end' || 'index' in placement) return placement;
    if ('after' in placement) return { after: ctx.pageOf(placement.after).ref };
    return { before: ctx.pageOf(placement.before).ref };
  };

  /** A placement → the engine's position, from the page list when the edit runs. */
  const positionOf = (placement: PagePlacement | undefined) => {
    if (!placement || placement === 'end') return { toIndex: undefined, anchor: undefined };
    if ('index' in placement) return { toIndex: placement.index, anchor: undefined };
    const anchor = ctx.pageOf('after' in placement ? placement.after : placement.before);
    return { toIndex: 'after' in placement ? anchor.index + 1 : anchor.index, anchor };
  };
  /** Default blank-page size: the page the new ones follow, else the last page, else Letter. */
  const neighbourSize = (toIndex: number | undefined): PdfSize => {
    const pages = registry();
    if (pages.length === 0) return LETTER_SIZE;
    if (toIndex === undefined) return pages[pages.length - 1].size;
    return pages[Math.max(0, Math.min(toIndex - 1, pages.length - 1))].size;
  };

  /** Insert a PDF's pages; resolves the new pages. */
  const insertBytes = async (
    bytes: Uint8Array | ArrayBuffer,
    placement: PagePlacement | undefined,
    signal: AbortSignal | undefined,
  ): Promise<PageEditInsertResult> => {
    const { toIndex } = positionOf(placement);
    const result = await ctx.cancellable(signal, ctx.doc.pages.insert(bytes, toIndex));
    return { pages: result.insertedPages };
  };

  const api: PageEditCapability = {
    canEdit: () => ctx.allows(ASSEMBLE),
    canExtract: () => ctx.allows(DOWNLOAD),

    rotateBy: async (pages, delta, options) => {
      ctx.assertAllowed(ASSEMBLE, 'pageEdit.rotateBy');
      const refs = refsOf(pages);
      const signal = options?.signal;
      await enqueue(async () => {
        // The engine sets one rotation per call, so pages are grouped by where
        // they end up. Each page's rotation is read when the edit runs, after
        // the edits queued before it; the double modulo keeps -90 from 0 at 270.
        const groups = new Map<PdfRotation, PageRef[]>();
        for (const ref of refs) {
          const turned = (ctx.pageOf(ref).rotation + delta) % 360;
          const rotation = ((turned + 360) % 360) as PdfRotation;
          groups.set(rotation, [...(groups.get(rotation) ?? []), ref]);
        }
        for (const [rotation, group] of groups) {
          await ctx.cancellable(signal, ctx.doc.pages.rotate(group, rotation));
        }
      }, options);
    },

    setRotation: async (pages, rotation, options) => {
      ctx.assertAllowed(ASSEMBLE, 'pageEdit.setRotation');
      const refs = refsOf(pages);
      await enqueue(
        () => ctx.cancellable(options?.signal, ctx.doc.pages.rotate(refs, rotation)),
        options,
      );
    },

    move: async (pages, placement, options) => {
      ctx.assertAllowed(ASSEMBLE, 'pageEdit.move');
      const refs = refsOf(pages);
      const fixed = fixPlacement(placement);
      await enqueue(() => {
        const { toIndex } = positionOf(fixed);
        return ctx.cancellable(
          options?.signal,
          ctx.doc.pages.move(refs, toIndex ?? registry().length),
        );
      }, options);
    },

    delete: async (pages, options) => {
      ctx.assertAllowed(ASSEMBLE, 'pageEdit.delete');
      const refs = refsOf(pages);
      const deleting = new Set(refs.map((ref) => ref.objectNumber));
      if (registry().every((page) => deleting.has(page.ref.objectNumber))) {
        throw new PluginError('invalid-input', 'page-edit', 'a document keeps at least one page');
      }
      await enqueue(() => ctx.cancellable(options?.signal, ctx.doc.pages.delete(refs)), options);
    },

    insertBlank: async (options = {}) => {
      ctx.assertAllowed(ASSEMBLE, 'pageEdit.insertBlank');
      const placement = fixPlacement(options.placement);
      return enqueue(async () => {
        const { toIndex, anchor } = positionOf(placement);
        // A page placement matches the page the user is looking at; anything
        // else matches the page the new ones follow.
        const size = options.size ?? anchor?.size ?? neighbourSize(toIndex);
        const result = await ctx.cancellable(
          options.signal,
          ctx.doc.pages.insertBlank({ size, count: options.count }, toIndex),
        );
        return { pages: result.insertedPages };
      }, options);
    },

    insertFromBytes: async (bytes, options = {}) => {
      ctx.assertAllowed(ASSEMBLE, 'pageEdit.insertFromBytes');
      const placement = fixPlacement(options.placement);
      const { pageIndexes, signal } = options;
      if (pageIndexes?.length === 0) throw noPages();
      return enqueue(async () => {
        if (!pageIndexes) return insertBytes(bytes, placement, signal);
        // Some of the pages: open the bytes beside the document, extract them, insert those.
        const source = await mapErrors(() =>
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
          const layout = await mapErrors(() => ctx.cancellable(signal, source.pages.list()));
          const refs = pageIndexes.map((index) => {
            const page = layout.pages[index];
            if (!page) {
              throw new PluginError('not-found', 'page-edit', `the PDF has no page ${index}`);
            }
            return page.ref;
          });
          const subset = await mapErrors(() => ctx.cancellable(signal, source.pages.extract(refs)));
          return await insertBytes(subset, placement, signal);
        } finally {
          await source.close();
        }
      }, options);
    },

    insertFromDocument: async (documentId, pages, options = {}) => {
      ctx.assertAllowed(ASSEMBLE, 'pageEdit.insertFromDocument');
      if (pages.length === 0) throw noPages();
      const other = ctx.documentHandle(documentId);
      if (!other) {
        throw new PluginError('not-found', 'page-edit', `document '${documentId}' is not open`);
      }
      // The pages are the other document's, so its page list resolves them.
      const otherPages = ctx.get(DocumentsToken).listPages(documentId);
      const refs = pages.map((page) => {
        const found =
          typeof page === 'number'
            ? otherPages[page]
            : otherPages.find((candidate) => candidate.ref.objectNumber === page.objectNumber);
        if (!found) {
          throw new PluginError(
            'not-found',
            'page-edit',
            `document '${documentId}' has no such page`,
          );
        }
        return found.ref;
      });
      const placement = fixPlacement(options.placement);
      return enqueue(async () => {
        // The other document's session decides whether its pages may be copied
        // out: the engine refuses `doc.download` there with the permission named.
        const bytes = await mapErrors(() =>
          ctx.cancellable(options.signal, other.pages.extract(refs)),
        );
        return insertBytes(bytes, placement, options.signal);
      }, options);
    },

    duplicate: async (pages, options = {}) => {
      ctx.assertAllowed(ASSEMBLE, 'pageEdit.duplicate');
      ctx.assertAllowed(DOWNLOAD, 'pageEdit.duplicate');
      const refs = refsOf(pages);
      const placement = fixPlacement(options.placement) ?? { after: refs[refs.length - 1] };
      return enqueue(async () => {
        const bytes = await ctx.cancellable(options.signal, ctx.doc.pages.extract(refs));
        return insertBytes(bytes, placement, options.signal);
      }, options);
    },

    extract: async (pages, options) => {
      ctx.assertAllowed(DOWNLOAD, 'pageEdit.extract');
      const refs = refsOf(pages);
      return enqueue(() => ctx.cancellable(options?.signal, ctx.doc.pages.extract(refs)), options);
    },
  };
  return { api };
}
