import type { DocumentOutlineService } from './DocumentOutlineService';
import type { DocumentOutline } from '../dto/DocumentOutline';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { Change, ChangeOp, ChangeResult } from '../mutation/Change';
import type {
  OutlineCreateResult,
  OutlineDeleteResult,
  OutlineMoveResult,
  OutlineUpdateResult,
} from '../mutation/OutlineMutationResults';
import type { WriteOptions } from '../mutation/WriteOptions';
import { AbortablePromise } from '../promise/AbortablePromise';

/** What each verb answers: its op's item without the item's own fields. */
interface Answers {
  'outline.create': OutlineCreateResult;
  'outline.update': OutlineUpdateResult;
  'outline.move': OutlineMoveResult;
  'outline.delete': OutlineDeleteResult;
}

/**
 * `doc.outline` on any engine: its read, and each verb as a one-op change
 * through `apply`, so a verb has its op's checks, events and undo (its
 * `opId` undoes it) and answers with the op's item.
 */
export function outlineVerbs(
  get: () => AbortablePromise<DocumentOutline>,
  apply: (change: Change, options?: WriteOptions) => AbortablePromise<ChangeResult>,
): DocumentOutlineService {
  const one = <T extends keyof Answers>(
    op: Extract<ChangeOp, { type: T }>,
    options: WriteOptions | undefined,
  ): AbortablePromise<Answers[T]> =>
    AbortablePromise.run(async (signal) => {
      const result = await apply(
        { ops: [op] },
        options?.opId === undefined ? {} : { opId: options.opId },
      ).abortWith(signal);
      const type = (op as ChangeOp).type;
      const item = result.items[0];
      if (!item || item.type !== type) {
        throw new EngineError(EngineErrorCode.Unknown, `${type} wrote nothing`);
      }
      // A fresh op is never skipped: `skipped` rides only an undo's item.
      const {
        type: _type,
        skipped: _skipped,
        ...answer
      } = item as unknown as {
        type: T;
        skipped?: unknown;
      };
      return answer as unknown as Answers[T];
    });
  return {
    get,
    create: (data, options) =>
      one(
        {
          type: 'outline.create',
          parent: options?.parent ?? null,
          data,
          ...(options?.position === undefined ? {} : { position: options.position }),
          ...(options?.objectNumber === undefined ? {} : { objectNumber: options.objectNumber }),
        },
        options,
      ),
    update: (ref, patch, options) => one({ type: 'outline.update', ref, patch }, options),
    move: (refs, parent, position, options) =>
      one({ type: 'outline.move', refs, parent, position }, options),
    delete: (ref, options) => one({ type: 'outline.delete', ref }, options),
  };
}
