/**
 * The page-edit controller. Stateless: it turns the engine handle's page
 * service into a ref-addressed edit capability. The relative→absolute rotation
 * and the placement→index resolution live here — once — instead of in every
 * framework adapter's click handler.
 */
import { PluginError, toPluginError } from '@embedpdf/core';
import type {
  PluginContext,
  DocCapability,
  PageInsertResult,
  PageRef,
  PageRotateResult,
  PageRotation,
  PdfSize,
} from '@embedpdf/core';

import type { PageEditCapability, PagePlacement } from './contract';

/** PDF permission bit 11 (assemble: insert, rotate and delete pages). The engine enforces it too. */
const ASSEMBLE_CAPABILITY: DocCapability = 'doc.pages.assemble';

/** The size of a blank page when the document has no page to match: Letter, in points. */
const LETTER_SIZE: PdfSize = { width: 612, height: 792 };

export function createPageEditController(ctx: PluginContext<void>) {
  /** Read-modify-write verbs run one at a time, in submission order. */
  const enqueue = ctx.serialQueue('mutations');

  /** Engine calls outside the guarded `ctx.doc` (another document, a scratch document) map their errors here. */
  const mapErrors = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      throw toPluginError('page-edit', error);
    }
  };
  const registry = () => ctx.document()?.pages ?? [];
  const requireEntry = (page: PageRef) => {
    const entry = ctx.getPage(page);
    if (!entry) {
      throw new PluginError('not-found', 'page-edit', `no page ${page.pageObjectNumber}`);
    }
    return entry;
  };

  /** A placement → the engine's index wire, from the registry at call time. */
  const resolvePlacement = (placement: PagePlacement | undefined) => {
    if (!placement || placement === 'end') return { toIndex: undefined, anchor: undefined };
    if ('index' in placement) return { toIndex: placement.index, anchor: undefined };
    const anchor = requireEntry('after' in placement ? placement.after : placement.before);
    return { toIndex: 'after' in placement ? anchor.index + 1 : anchor.index, anchor };
  };
  /** Default blank-page size: the insertion point's predecessor, else the last page, else Letter. */
  const neighbourSize = (toIndex: number | undefined): PdfSize => {
    const pages = registry();
    if (pages.length === 0) return LETTER_SIZE;
    if (toIndex === undefined) return pages[pages.length - 1].size;
    return pages[Math.max(0, Math.min(toIndex - 1, pages.length - 1))].size;
  };
  const insertAt = (
    bytes: Uint8Array | ArrayBuffer,
    placement: PagePlacement | undefined,
  ): Promise<PageInsertResult> => ctx.doc.pages.insert(bytes, resolvePlacement(placement).toIndex);

  const api: PageEditCapability = {
    // Wildcard-aware predicate (mirrors the engine's own enforcement), not an
    // `scope.includes(...)` enumeration, which would drop the `*` grant.
    canEdit: () => ctx.doc.security.allows(ASSEMBLE_CAPABILITY),

    rotateBy: (pages, delta) =>
      enqueue(async () => {
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
          result = await ctx.doc.pages.rotate(group, rotation);
        }
        if (!result) throw new PluginError('invalid-input', 'page-edit', 'no pages given');
        return result;
      }),
    setRotation: (pages, rotation) => enqueue(() => ctx.doc.pages.rotate([...pages], rotation)),
    move: (pages, placement) =>
      enqueue(() => {
        const { toIndex } = resolvePlacement(placement);
        return ctx.doc.pages.move([...pages], toIndex ?? registry().length);
      }),
    delete: (pages) => enqueue(() => ctx.doc.pages.delete([...pages])),
    insertBlank: (options = {}) =>
      enqueue(() => {
        const { toIndex, anchor } = resolvePlacement(options.placement);
        // A ref placement matches the anchor the user is looking at; everything
        // else matches the neighbour the new page will follow.
        const size = options.size ?? anchor?.size ?? neighbourSize(toIndex);
        return ctx.doc.pages.insertBlank({ size, count: options.count }, toIndex);
      }),
    insertFromBytes: (bytes, options = {}) =>
      enqueue(async () => {
        const { pageIndexes } = options;
        if (!pageIndexes) return insertAt(bytes, options.placement);
        // A subset: open the bytes beside the document, extract, insert.
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
          const layout = await mapErrors(() => source.pages.list());
          const refs = pageIndexes.map((index) => {
            const page = layout.pages[index];
            if (!page) {
              throw new PluginError('not-found', 'page-edit', `the PDF has no page ${index}`);
            }
            return page.ref;
          });
          const subset = await mapErrors(() => source.pages.extract(refs));
          return await insertAt(subset, options.placement);
        } finally {
          await source.close();
        }
      }),
    insertFromDocument: (documentId, pages, options = {}) =>
      enqueue(async () => {
        const other = ctx.documentHandle(documentId);
        if (!other) {
          throw new PluginError('not-found', 'page-edit', `document '${documentId}' is not open`);
        }
        const bytes = await mapErrors(() => other.pages.extract([...pages]));
        return insertAt(bytes, options.placement);
      }),
    duplicate: (pages, options = {}) =>
      enqueue(async () => {
        const last = pages[pages.length - 1];
        if (!last) throw new PluginError('invalid-input', 'page-edit', 'no pages given');
        const bytes = await ctx.doc.pages.extract([...pages]);
        return insertAt(bytes, options.placement ?? { after: last });
      }),
    extract: (pages) => ctx.doc.pages.extract([...pages]),
  };
  return { api };
}
