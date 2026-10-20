import type { DocumentAttachmentsService } from './DocumentAttachmentsService';
import { normalizeAttachmentFileSource } from '../dto/normalizeAttachmentFileSource';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { Change, ChangeItem, ChangeOp, ChangeResult } from '../mutation/Change';
import type { WriteOptions } from '../mutation/WriteOptions';
import { AbortablePromise } from '../promise/AbortablePromise';

/** The verbs of `doc.attachments` that change the document: each one op of a change. */
export type AttachmentWriteVerb = 'create' | 'delete';

/** The ops the write verbs make. */
type AttachmentOpType = Extract<ChangeOp['type'], `attachments.${string}`>;

/**
 * `doc.attachments` on any engine: the reads `rest` holds (`list`,
 * `download`), and each write as a one-op change through `apply`, so a verb
 * has its op's checks, events and undo (its `opId` undoes it) and answers as
 * its single verb did.
 */
export function attachmentVerbs(
  rest: Omit<DocumentAttachmentsService, AttachmentWriteVerb>,
  apply: (change: Change, options?: WriteOptions) => AbortablePromise<ChangeResult>,
): DocumentAttachmentsService {
  const one = <T extends AttachmentOpType, Answer>(
    op: () => Promise<Extract<ChangeOp, { type: T }>>,
    type: T,
    options: WriteOptions | undefined,
    answer: (item: Extract<ChangeItem, { type: T }>) => Answer,
  ): AbortablePromise<Answer> =>
    AbortablePromise.run(async (signal) => {
      const result = await apply(
        { ops: [await op()] },
        options?.opId === undefined ? {} : { opId: options.opId },
      ).abortWith(signal);
      const item = result.items[0];
      // A fresh op is never skipped: only an undo leaves one alone.
      if (!item || item.type !== type) {
        throw new EngineError(EngineErrorCode.Unknown, `${type} wrote nothing`);
      }
      return answer(item as Extract<ChangeItem, { type: T }>);
    });

  return {
    list: () => rest.list(),
    download: (ref) => rest.download(ref),
    create: (file, options) =>
      one(
        async () => {
          // A `File` brings its own name and type; a file needs a name.
          const { wireFile, resource } = await normalizeAttachmentFileSource(file, 'file');
          const { resources: _resources, ...metadata } = wireFile;
          return {
            type: 'attachments.create',
            file: metadata,
            resources: { file: new Uint8Array(resource.bytes) },
          };
        },
        'attachments.create',
        options,
        (item) => ({ attachment: item.attachment, meta: item.meta }),
      ),
    delete: (ref, options) =>
      one(
        async () => ({ type: 'attachments.delete', ref }),
        'attachments.delete',
        options,
        (item) => ({ meta: item.meta }),
      ),
  };
}
