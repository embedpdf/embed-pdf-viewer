import {
  memo,
  PluginError,
  toPluginError,
  type DocCapability,
  type OperationOptions,
  type PendingChange,
  type PluginContext,
} from '@embedpdf/core';
import type {
  Annotation,
  Attachment,
  AttachmentContent,
  AttachmentFileSource,
  ChangeItem,
  ChangeOp,
  ChangeResult,
  DocumentEvent,
} from '@embedpdf/engine-core/runtime';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';
import { StageToken } from '@embedpdf/plugin-stage/contract';

import type {
  AttachedFile,
  AttachmentCapability,
  AttachmentsChangedEvent,
  AttachmentsResyncedEvent,
} from './contract';
import { documentFileOf, freeName, pageFileOf, type DocumentFiles } from './model';
import { displayNameOf } from './names';
import { foldFiles, predictFiles, undoOf } from './sync/files';

const MODIFY: DocCapability = 'doc.attachments.modify';
const DOWNLOAD: DocCapability = 'doc.download';

const NO_FILES: readonly AttachedFile[] = Object.freeze([]);

/**
 * The attachments controller. The document's attachments are a mirror,
 * read when something asks for them (`ensureLoaded()`, what
 * `attachmentState` does), and every read shows its `view()`: the engine's
 * attachments with this session's pending adds and removes on top. A page's
 * file is a file attachment annotation, read from the annotation plugin, so
 * the list shows both homes with no read of its own. Each add or remove of
 * an attachment is one change on the document's queue: it shows at once, is
 * one step of the history, and undoing it shows the files as they were.
 */
export function createAttachmentController(ctx: PluginContext<void>) {
  const changed = ctx.events.source<AttachmentsChangedEvent>();
  const resynced = ctx.events.source<AttachmentsResyncedEvent>();

  // One `AttachedFile` per record, so a list row keeps its object while its file is unchanged.
  const documentFiles = new WeakMap<Attachment, AttachedFile>();
  const fileOfAttachment = (attachment: Attachment): AttachedFile => {
    let file = documentFiles.get(attachment);
    if (!file) documentFiles.set(attachment, (file = documentFileOf(attachment)));
    return file;
  };
  const pageFiles = new WeakMap<Annotation, AttachedFile | null>();
  const fileOfAnnotation = (annotation: Annotation): AttachedFile | null => {
    let file = pageFiles.get(annotation);
    if (file === undefined) pageFiles.set(annotation, (file = pageFileOf(annotation)));
    return file;
  };

  /** The fact a confirmed attachment event reports, or `null` for any other event. */
  const factOf = (
    event: DocumentEvent,
    previous: DocumentFiles,
  ): Omit<AttachmentsChangedEvent, 'origin'> | null => {
    switch (event.type) {
      case 'attachments.created':
        return { type: 'added', files: [fileOfAttachment(event.attachment)] };
      case 'attachments.restored':
        return { type: 'restored', files: [fileOfAttachment(event.attachment)] };
      case 'attachments.deleted': {
        const gone = previous?.find((file) => file.ref.key === event.deleted?.key);
        return { type: 'removed', files: gone ? [fileOfAttachment(gone)] : [] };
      }
      default:
        return null;
    }
  };

  const files = ctx.mirror<DocumentFiles>({
    name: 'attachments',
    onDemand: true,
    initial: () => null,
    load: async (doc) => ({ value: (await doc.attachments.list()).attachments }),
    fold: foldFiles,
    predict: predictFiles,
    changed: ({ cause, event, previous, next }) => {
      if (!next) return;
      if (cause === 'load') {
        resynced.emit({ files: next.map(fileOfAttachment) });
        return;
      }
      const fact = event && 'origin' in event ? factOf(event, previous) : null;
      if (fact && event && 'origin' in event) changed.emit({ ...fact, origin: event.origin });
    },
  });

  const annotations = () => ctx.tryGet(AnnotationToken);

  /* ── reads ─────────────────────────────────────────────────────────────── */

  const list = memo(
    () => [files.view(), annotations()?.list() ?? null] as const,
    (attachments, annots) => {
      const all = [
        ...(attachments ?? []).map(fileOfAttachment),
        ...(annots ?? []).flatMap((annotation) => {
          const file = fileOfAnnotation(annotation);
          return file ? [file] : [];
        }),
      ];
      return all.length > 0 ? all : NO_FILES;
    },
  );
  const get = (id: string): AttachedFile | null => list().find((file) => file.id === id) ?? null;

  const isPending = (file: AttachedFile): boolean => {
    if (file.home.kind === 'page') return annotations()?.isPending(file.home.ref) ?? false;
    const key = file.home.ref.key;
    return !(files.get() ?? []).some((confirmed) => confirmed.ref.key === key);
  };

  /* ── writes ────────────────────────────────────────────────────────────── */

  /** Refuse before anything starts: without the permission, or once the caller cancelled. */
  const refuse = (permission: DocCapability, operation: string, options?: OperationOptions) => {
    ctx.assertAllowed(permission, operation);
    if (options?.signal?.aborted) {
      throw new PluginError('operation-cancelled', 'attachment', `${operation} was cancelled`);
    }
  };

  /** The engine's answer to a staged change. */
  const answer = async (
    change: PendingChange,
    options?: OperationOptions,
  ): Promise<ChangeResult> => {
    try {
      return await ctx.cancellable(options?.signal, change.result);
    } catch (error) {
      throw toPluginError('attachment', error);
    }
  };

  /** The annotation plugin, for a page's file: the list shows none without it. */
  const annotationsFor = (operation: string) => {
    const annotation = annotations();
    if (!annotation) {
      throw new PluginError('not-found', 'attachment', `${operation}: no annotation plugin`);
    }
    return annotation;
  };

  /** The op that attaches `source` under a name no file has (`taken`, which it joins). */
  const createOp = (source: AttachmentFileSource, taken: Set<string>): ChangeOp => {
    const { data, description } = source;
    const blob = typeof Blob !== 'undefined' && data instanceof Blob ? data : null;
    const given = source.name ?? (blob && 'name' in blob ? String(blob.name) : '');
    if (!given) {
      throw new PluginError(
        'invalid-input',
        'attachment',
        'attachment.add: a file needs a name: pass { data, name } or a File',
      );
    }
    const name = freeName(given, taken);
    taken.add(name);
    const mimeType = source.mimeType ?? (blob?.type || undefined);
    return {
      type: 'attachments.create',
      file: {
        name,
        ...(mimeType !== undefined ? { mimeType } : {}),
        ...(description !== undefined ? { description } : {}),
      },
      resources: { file: data instanceof ArrayBuffer ? new Uint8Array(data) : data },
    };
  };

  const add: AttachmentCapability['add'] = async (sources, options) => {
    refuse(MODIFY, 'attachment.add', options);
    if (sources.length === 0) return NO_FILES;
    // The names in the document decide the free ones, so they are read first.
    await ctx.cancellable(options?.signal, files.ensureLoaded());
    const taken = new Set((files.view() ?? []).map((file) => file.ref.key));
    const ops = sources.map((source) => createOp(source, taken));
    const change = ctx.changes.stage({
      label: { key: 'attachment.add', count: ops.length },
      ops,
      undo: undoOf(files.view(), ops),
    });
    const result = await answer(change, options);
    return result.items.flatMap((item: ChangeItem) =>
      item.type === 'attachments.create' ? [fileOfAttachment(item.attachment)] : [],
    );
  };

  const remove: AttachmentCapability['remove'] = async (file, options) => {
    if (file.home.kind === 'page') {
      return annotationsFor('attachment.remove').delete(file.home.ref, options);
    }
    refuse(MODIFY, 'attachment.remove', options);
    const { ref } = file.home;
    const view = files.view();
    if (view && !view.some((attachment) => attachment.ref.key === ref.key)) {
      throw new PluginError(
        'not-found',
        'attachment',
        `attachment.remove: the document has no attachment '${ref.key}'`,
      );
    }
    const ops: ChangeOp[] = [{ type: 'attachments.delete', ref }];
    const change = ctx.changes.stage({
      label: { key: 'attachment.remove' },
      ops,
      undo: undoOf(view, ops),
    });
    await answer(change, options);
  };

  const download: AttachmentCapability['download'] = async (file, options) => {
    const content = (bytes: Uint8Array): AttachmentContent => ({
      bytes,
      name: displayNameOf(file),
      mimeType: file.mimeType,
    });
    if (file.home.kind === 'page') {
      const annotation = annotationsFor('attachment.download');
      return content(await annotation.downloadResource(file.home.ref, 'file', options));
    }
    refuse(DOWNLOAD, 'attachment.download', options);
    // A file this session is still adding is read once the engine has it.
    if (isPending(file)) await ctx.cancellable(options?.signal, ctx.changes.whenSettled());
    try {
      return content(
        await ctx.cancellable(options?.signal, ctx.doc.attachments.download(file.home.ref)),
      );
    } catch (error) {
      throw toPluginError('attachment', error);
    }
  };

  const reveal = (file: AttachedFile): void => {
    if (file.home.kind !== 'page') return;
    const annotation = annotations();
    const record = annotation?.get(file.home.ref);
    if (!annotation || !record) return;
    annotation.selection.set([record.ref]);
    // The file lands a third down the view, as a comment's annotation does.
    ctx.tryGet(StageToken)?.reveal(record.ref.page, {
      rect: record.rect,
      anchor: { x: 'center', y: 0.35 },
      behavior: 'smooth',
    });
  };

  const api: AttachmentCapability = {
    list,
    get,
    isPending,
    getStatus: files.getStatus,
    ensureLoaded: (options) => ctx.cancellable(options?.signal, files.ensureLoaded()),
    refresh: (options) => ctx.cancellable(options?.signal, files.refresh()),

    canDownload: () => ctx.allows(DOWNLOAD),
    canAdd: () => ctx.allows(MODIFY),
    canRemove: (file) =>
      file.home.kind === 'page'
        ? (annotations()?.canDelete(file.home.ref) ?? false)
        : ctx.allows(MODIFY),

    add,
    remove,
    download,
    reveal,

    onChanged: changed.on,
    onResynced: resynced.on,
  };

  return { api };
}
