import type { DocumentAnnotationsService } from './DocumentAnnotationsService';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { Change, ChangeResult } from '../mutation/Change';
import type { WriteOptions } from '../mutation/WriteOptions';
import { AbortablePromise } from '../promise/AbortablePromise';

/** The verbs of `doc.annotations` that are each one op of a change. */
export type AnnotationChangeVerb = 'copy';

/**
 * `doc.annotations` on any engine: what `rest` holds (the list, export and
 * import), and `copy` as a one-op change through `apply`, so it has its op's
 * checks, events and undo (its `opId` undoes it).
 */
export function annotationVerbs(
  rest: Omit<DocumentAnnotationsService, AnnotationChangeVerb>,
  apply: (change: Change, options?: WriteOptions) => AbortablePromise<ChangeResult>,
): DocumentAnnotationsService {
  return {
    list: (options) => rest.list(options),
    export: (selection) => rest.export(selection),
    import: (bundle, options) => rest.import(bundle, options),
    copy: (refs, options = {}) =>
      AbortablePromise.run(async (signal) => {
        const { opId, page, offset, objectNumbers } = options;
        const result = await apply(
          {
            ops: [
              {
                type: 'annotations.copy',
                refs,
                ...(page === undefined ? {} : { page }),
                ...(offset === undefined ? {} : { offset }),
                ...(objectNumbers === undefined ? {} : { objectNumbers }),
              },
            ],
          },
          opId === undefined ? {} : { opId },
        ).abortWith(signal);
        const item = result.items[0];
        // A fresh op is never skipped: only an undo leaves one alone.
        if (!item || item.type !== 'annotations.copy') {
          throw new EngineError(EngineErrorCode.Unknown, 'annotations.copy wrote nothing');
        }
        const { type: _type, ...copied } = item;
        return copied;
      }),
  };
}
