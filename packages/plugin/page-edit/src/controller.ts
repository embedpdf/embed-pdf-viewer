/**
 * The page-edit controller: page edits that take refs or indexes, and the
 * page selection. Turning a page relative to its own rotation, and fixing a
 * position's page, live here once instead of in every app's click handler.
 *
 * A verb refuses before anything starts (permission, pages, position), then
 * stages its edit as one change on the document's queue (`ctx.changes`): one
 * step of the history, sent after everything staged before it. The page list
 * shows a rotate, a move, a delete, a blank insert or a duplicate at once (the
 * kernel's page view), with what undoing it shows, the page labels moving as
 * the engine moves them; an insert of another PDF's pages shows once the
 * engine answers.
 */
import {
  memo,
  PluginError,
  reorderBackOf,
  restoredPagesOf,
  rotateBackOf,
  toPageRef,
  toPluginError,
  DocumentsToken,
} from '@embedpdf/core';
import type {
  ChangeLabel,
  DocCapability,
  OperationOptions,
  PageLayout,
  PagePosition,
  PageRef,
  PdfRotation,
  PdfSize,
  PendingChange,
  PluginContext,
  PredictedOp,
} from '@embedpdf/core';

import type { PageEditCapability, PageEditInsertResult } from './contract';
import { selected, type PageEditModel } from './model';

/** Inserting, rotating and deleting pages (PDF permission bit 4 or 11). The engine enforces it too. */
const ASSEMBLE: DocCapability = 'doc.pages.assemble';
/** Copying pages out of a document is a partial download. The engine enforces it too. */
const DOWNLOAD: DocCapability = 'doc.download';

/** The size of a blank page when the document has no page to match: Letter, in points. */
const LETTER_SIZE: PdfSize = { width: 612, height: 792 };

const NO_PAGES: readonly PageRef[] = Object.freeze([]);
const NO_LAYOUTS: readonly PageLayout[] = Object.freeze([]);

/** What undoing a page op looks like: page ops, and the pages a delete took coming back. */
type PageUndo = Extract<PredictedOp, { type: `pages.${string}` }>;
/** A page op, as a verb stages it. */
type PageOp = Exclude<PageUndo, { type: 'pages.restore' | 'pages.relabel' }>;

/** What a change is called in history and refusals. */
type PageVerb = 'rotate' | 'reorder' | 'delete' | 'insertBlank' | 'insert' | 'duplicate';

export function createPageEditController(ctx: PluginContext<PageEditModel>) {
  /** Engine calls outside the guarded `ctx.doc` (another document, a scratch document) map their errors here. */
  const mapErrors = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      throw toPluginError('page-edit', error);
    }
  };
  const registry = (): readonly PageLayout[] => ctx.document()?.pages ?? NO_LAYOUTS;
  const noPages = () => new PluginError('invalid-input', 'page-edit', 'no pages given');

  /**
   * A verb's pages as refs, checked when it is called: an index names the
   * page at that position now, which is the page the user clicked.
   */
  const refsOf = (pages: readonly (PageRef | number)[]): PageRef[] => {
    if (pages.length === 0) throw noPages();
    return pages.map((page) => ctx.pageOf(page).ref);
  };

  /** A position, its page checked when the verb is called, like the verb's own pages. Default `'end'`. */
  const positionOf = (position: PagePosition | undefined): PagePosition => {
    if (!position || position === 'start' || position === 'end') return position ?? 'end';
    if ('after' in position) return { after: ctx.pageOf(position.after).ref };
    return { before: ctx.pageOf(position.before).ref };
  };
  /**
   * Default blank-page size: the page the position names, else the page the
   * new ones go next to (the first or the last), else Letter.
   */
  const sizeAt = (position: PagePosition): PdfSize => {
    if (typeof position === 'object') {
      return ctx.pageOf('after' in position ? position.after : position.before).size;
    }
    const pages = registry();
    if (pages.length === 0) return LETTER_SIZE;
    return (position === 'start' ? pages[0] : pages[pages.length - 1]).size;
  };

  /* ── the selection ─────────────────────────────────────────────────────── */

  const getSelected = memo(
    () => [registry(), ctx.state.get().selected] as const,
    (pages, refs) => {
      if (refs.length === 0) return NO_PAGES;
      const present = new Set(pages.map((page) => page.ref.objectNumber));
      return refs.filter((ref) => present.has(ref.objectNumber));
    },
  );
  const select = (pages: readonly (PageRef | number)[]): void => {
    const refs = pages.flatMap((page) => {
      const found = ctx.getPage(page);
      return found ? [found.ref] : [];
    });
    ctx.state.update(selected, refs);
  };

  /* ── writes ────────────────────────────────────────────────────────────── */

  /** Refuse before anything starts: without the right, or once the caller cancelled. */
  const refuse = (
    permission: DocCapability,
    operation: string,
    options: OperationOptions | undefined,
  ): void => {
    ctx.assertAllowed(permission, operation);
    if (options?.signal?.aborted) {
      throw new PluginError('operation-cancelled', 'page-edit', `${operation} was cancelled`);
    }
  };

  /**
   * Stage one user action: one change, one step of the history. Its label
   * counts the pages it acts on, when the verb knows how many.
   */
  const stageChange = (
    verb: PageVerb,
    count: number | null,
    ops: readonly PageOp[],
    undo?: readonly PageUndo[],
  ): PendingChange => {
    const label: ChangeLabel =
      count === null ? { key: `pages.${verb}` } : { key: `pages.${verb}`, count };
    return ctx.changes.stage({ label, ops, ...(undo ? { undo } : {}) });
  };

  /** The engine's answer to a staged change: its first item. */
  const answer = async (change: PendingChange, options: OperationOptions | undefined) => {
    try {
      const result = await ctx.cancellable(options?.signal, change.result);
      return result.items[0]!;
    } catch (error) {
      throw toPluginError('page-edit', error);
    }
  };

  /** What an insert's answer names: the new pages. */
  const inserted = async (
    change: PendingChange,
    options: OperationOptions | undefined,
  ): Promise<PageEditInsertResult> => {
    const item = await answer(change, options);
    return { pages: 'insertedPages' in item ? item.insertedPages : NO_PAGES };
  };

  /**
   * Rotate pages as one change: one op per rotation they end up with. A turn
   * starts from the rotation the page shows, so two quick quarter turns are a
   * half turn; undoing it turns each page back.
   */
  const rotate = (refs: readonly PageRef[], rotationAfter: (ref: PageRef) => PdfRotation) => {
    const after = new Map<PdfRotation, PageRef[]>();
    for (const ref of refs) {
      const rotation = rotationAfter(ref);
      after.set(rotation, [...(after.get(rotation) ?? []), ref]);
    }
    const ops: PageOp[] = [...after].map(([rotation, pages]) => ({
      type: 'pages.rotate',
      pages,
      rotation,
    }));
    return stageChange('rotate', refs.length, ops, rotateBackOf(registry(), refs));
  };

  /**
   * What an undo of a page edit ends with: the label sections the pages show
   * now, which the edit is about to move. None when the document has none.
   */
  const labelsBack = (): PageUndo[] => {
    const labels = ctx.document()?.pageLabels ?? [];
    return labels.length > 0 ? [{ type: 'pages.relabel', labels }] : [];
  };

  /**
   * Names for new pages from the session's pool, as many as it holds up to
   * `count`: final at birth, so the pages show before the engine answers and
   * later edits can name them.
   */
  const takeNumbers = (count: number): number[] => {
    const numbers: number[] = [];
    while (numbers.length < count) {
      const number = ctx.changes.takeObjectNumber();
      if (number === null) break;
      numbers.push(number);
    }
    return numbers;
  };

  /**
   * `count` names for new pages, then `stage` with them: at once when the
   * pool holds them, so verbs stage in the order they're called, else once it
   * reserved more.
   */
  const withNumbers = <T>(
    count: number,
    options: OperationOptions | undefined,
    stage: (numbers: number[]) => T,
  ): T | Promise<T> => {
    const held = takeNumbers(count);
    if (held.length === count) return stage(held);
    return (async () => {
      const numbers = [...held];
      while (numbers.length < count) {
        await ctx.cancellable(
          options?.signal,
          ctx.changes.reserveObjectNumbers(count - numbers.length),
        );
        numbers.push(...takeNumbers(count - numbers.length));
      }
      return stage(numbers);
    })();
  };

  /**
   * The pages as they show: every change on its way sent and answered first,
   * so a copy holds the edits made before it.
   */
  const settled = async (options: OperationOptions | undefined): Promise<void> => {
    ctx.changes.sendHolds();
    await ctx.cancellable(options?.signal, ctx.changes.whenSettled());
  };

  /** Copy pages of this document out, as they show. */
  const extractShown = async (
    refs: readonly PageRef[],
    options: OperationOptions | undefined,
  ): Promise<Uint8Array> => {
    await settled(options);
    return ctx.cancellable(options?.signal, ctx.doc.pages.extract([...refs]));
  };

  /**
   * Stage the insert of a PDF's pages; resolves the new pages. When it knows
   * how many pages the PDF has (`count`), they are named first, so its undo
   * shows at once; the pages themselves show when the engine answers.
   */
  const insertBytes = async (
    count: number | null,
    bytes: Uint8Array | ArrayBuffer,
    position: PagePosition,
    options: OperationOptions | undefined,
  ): Promise<PageEditInsertResult> => {
    const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (count === null) {
      return inserted(
        stageChange('insert', null, [{ type: 'pages.insert', source, position }]),
        options,
      );
    }
    return withNumbers(count, options, (objectNumbers) => {
      const change = stageChange(
        'insert',
        count,
        [{ type: 'pages.insert', source, position, objectNumbers }],
        [{ type: 'pages.delete', pages: objectNumbers.map(toPageRef) }, ...labelsBack()],
      );
      return inserted(change, options);
    });
  };

  /** Some pages of a PDF: open the bytes beside the document and extract them. */
  const pagesOfBytes = async (
    bytes: Uint8Array | ArrayBuffer,
    pageIndexes: readonly number[],
    signal: AbortSignal | undefined,
  ): Promise<Uint8Array> => {
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
      return await mapErrors(() => ctx.cancellable(signal, source.pages.extract(refs)));
    } finally {
      await source.close();
    }
  };

  const api: PageEditCapability = {
    canEdit: () => ctx.allows(ASSEMBLE),
    canExtract: () => ctx.allows(DOWNLOAD),

    getSelected,
    select,

    rotateBy: async (pages, delta, options) => {
      refuse(ASSEMBLE, 'pageEdit.rotateBy', options);
      const refs = refsOf(pages);
      // The double modulo keeps -90 from 0 at 270.
      const change = rotate(
        refs,
        (ref) => ((((ctx.pageOf(ref).rotation + delta) % 360) + 360) % 360) as PdfRotation,
      );
      await answer(change, options);
    },

    setRotation: async (pages, rotation, options) => {
      refuse(ASSEMBLE, 'pageEdit.setRotation', options);
      const change = rotate(refsOf(pages), () => rotation);
      await answer(change, options);
    },

    reorder: async (pages, position, options) => {
      refuse(ASSEMBLE, 'pageEdit.reorder', options);
      const refs = refsOf(pages);
      const change = stageChange(
        'reorder',
        refs.length,
        [{ type: 'pages.reorder', pages: refs, position: positionOf(position) }],
        [...reorderBackOf(registry(), refs), ...labelsBack()],
      );
      await answer(change, options);
    },

    delete: async (pages, options) => {
      refuse(ASSEMBLE, 'pageEdit.delete', options);
      const refs = refsOf(pages);
      const deleting = new Set(refs.map((ref) => ref.objectNumber));
      if (registry().every((page) => deleting.has(page.ref.objectNumber))) {
        throw new PluginError('invalid-input', 'page-edit', 'a document keeps at least one page');
      }
      const change = stageChange(
        'delete',
        refs.length,
        [{ type: 'pages.delete', pages: refs }],
        [{ type: 'pages.restore', pages: restoredPagesOf(registry(), refs) }, ...labelsBack()],
      );
      await answer(change, options);
    },

    insertBlank: async (options = {}) => {
      refuse(ASSEMBLE, 'pageEdit.insertBlank', options);
      const position = positionOf(options.position);
      const count = options.count ?? 1;
      const size = options.size ?? sizeAt(position);
      return withNumbers(count, options, (objectNumbers) => {
        const change = stageChange(
          'insertBlank',
          count,
          [{ type: 'pages.insertBlank', spec: { size, count }, position, objectNumbers }],
          [{ type: 'pages.delete', pages: objectNumbers.map(toPageRef) }, ...labelsBack()],
        );
        return inserted(change, options);
      });
    },

    insertFromBytes: async (bytes, options = {}) => {
      refuse(ASSEMBLE, 'pageEdit.insertFromBytes', options);
      const position = positionOf(options.position);
      const { pageIndexes, signal } = options;
      if (pageIndexes?.length === 0) throw noPages();
      const source = pageIndexes ? await pagesOfBytes(bytes, pageIndexes, signal) : bytes;
      return insertBytes(pageIndexes?.length ?? null, source, position, options);
    },

    insertFromDocument: async (documentId, pages, options = {}) => {
      refuse(ASSEMBLE, 'pageEdit.insertFromDocument', options);
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
      const position = positionOf(options.position);
      // The other document's session decides whether its pages may be copied
      // out: the engine refuses `doc.download` there with the permission named.
      const bytes = await mapErrors(() =>
        ctx.cancellable(options.signal, other.pages.extract(refs)),
      );
      return insertBytes(refs.length, bytes, position, options);
    },

    duplicate: async (pages, options = {}) => {
      refuse(ASSEMBLE, 'pageEdit.duplicate', options);
      const refs = refsOf(pages);
      const position = options.position
        ? positionOf(options.position)
        : { after: refs[refs.length - 1]! };
      return withNumbers(refs.length, options, (objectNumbers) => {
        const change = stageChange(
          'duplicate',
          refs.length,
          [{ type: 'pages.copy', pages: refs, position, objectNumbers }],
          [{ type: 'pages.delete', pages: objectNumbers.map(toPageRef) }, ...labelsBack()],
        );
        return inserted(change, options);
      });
    },

    extract: async (pages, options) => {
      refuse(DOWNLOAD, 'pageEdit.extract', options);
      return extractShown(refsOf(pages), options);
    },
  };
  return { api };
}
