import type { DocumentPagesService } from './DocumentPagesService';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { Change, ChangeItem, ChangeOp, ChangeResult } from '../mutation/Change';
import type { WriteOptions } from '../mutation/WriteOptions';
import { AbortablePromise } from '../promise/AbortablePromise';

/** The verbs of `doc.pages` that change the page structure: each one op of a change. */
export type PageStructureVerb = 'reorder' | 'rotate' | 'delete' | 'insert' | 'insertBlank';

/** The ops the structure verbs make. */
type PageOpType = Extract<ChangeOp['type'], `pages.${string}`>;

/**
 * `doc.pages` on any engine: what `rest` holds (the reads, extract, flatten
 * and the page names), and each structure verb as a one-op change through
 * `apply`, so a verb has its op's checks, events and undo (its `opId` undoes
 * it) and answers as its single verb did.
 */
export function pageVerbs(
  rest: Omit<DocumentPagesService, PageStructureVerb>,
  apply: (change: Change, options?: WriteOptions) => AbortablePromise<ChangeResult>,
): DocumentPagesService {
  const one = <T extends PageOpType, Answer>(
    op: Extract<ChangeOp, { type: T }>,
    options: WriteOptions | undefined,
    answer: (item: Extract<ChangeItem, { type: T }>) => Answer,
  ): AbortablePromise<Answer> =>
    AbortablePromise.run(async (signal) => {
      const result = await apply(
        { ops: [op] },
        options?.opId === undefined ? {} : { opId: options.opId },
      ).abortWith(signal);
      const type = (op as ChangeOp).type;
      const item = result.items[0];
      // A fresh op is never skipped: only an undo leaves one alone.
      if (!item || item.type !== type) {
        throw new EngineError(EngineErrorCode.Unknown, `${type} wrote nothing`);
      }
      return answer(item as Extract<ChangeItem, { type: T }>);
    });

  return {
    list: () => rest.list(),
    setName: (input, options) => rest.setName(input, options),
    removeName: (input, options) => rest.removeName(input, options),
    flatten: (pages, options) => rest.flatten(pages, options),
    extract: (pages, options) => rest.extract(pages, options),
    reorder: (pages, position, options) =>
      one({ type: 'pages.reorder', pages, position }, options, (item) => ({
        pages: item.pages,
        layout: item.layout,
        meta: item.meta,
      })),
    rotate: (pages, rotation, options) =>
      one({ type: 'pages.rotate', pages, rotation }, options, (item) => ({
        layout: item.layout,
        meta: item.meta,
      })),
    delete: (pages, options) =>
      one({ type: 'pages.delete', pages }, options, (item) => ({
        layout: item.layout,
        meta: item.meta,
      })),
    insert: (bytes, position, options) =>
      one(
        {
          type: 'pages.insert',
          source: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
          ...(position === undefined ? {} : { position }),
        },
        options,
        (item) => ({ insertedPages: item.insertedPages, layout: item.layout, meta: item.meta }),
      ),
    insertBlank: (spec, position, options) =>
      one(
        {
          type: 'pages.insertBlank',
          spec,
          ...(position === undefined ? {} : { position }),
          ...(options?.objectNumbers === undefined ? {} : { objectNumbers: options.objectNumbers }),
        },
        options,
        (item) => ({ insertedPages: item.insertedPages, layout: item.layout, meta: item.meta }),
      ),
  };
}
