/**
 * A test harness for the annotation controller on the kernel's real test
 * context. Its fake engine behaves like the real ones: every write publishes
 * its confirmed event before the write's promise resolves, so the model
 * changes through the same event path as in production. Its annotations are
 * the file's values, as tests write them; it hands them out in page space,
 * as the engines do (`pageAnnotationOf`).
 */
import { createEventHook, type DocumentEvent } from '@embedpdf/core';
import { createTestContext } from '@embedpdf/core/testing';
import type {
  AnnotationDTO,
  AnnotationRef,
  PageRef,
  PdfCoordinates,
  PdfRect,
} from '@embedpdf/engine-core/runtime';
import { pageAnnotationOf, toPageRef } from '@embedpdf/engine-core/runtime';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { vi } from 'vitest';

import { createAnnotationController } from '../src/controller';
import { initialAnnotationState, type AnnotationState } from '../src/model';

export const PAGE = toPageRef(1);

/** A read's data by field name, for assertions that span kinds (`color` is a square's, not a widget's). */
export const dataOf = (annotation: AnnotationDTO | null | undefined): Record<string, unknown> =>
  (annotation ?? {}) as unknown as Record<string, unknown>;
export const PAGE2 = toPageRef(2);

const localOrigin = { kind: 'local', sessionId: 'me', sub: null, ts: 0, serverId: null };

/** The mutation meta a write's event carries; a weak (index-addressed) write invalidates positions. */
const metaOf = (weakRefsInvalidated = false) => ({
  affectedPages: [],
  cacheDelta: null,
  changed: [],
  weakRefsInvalidated,
  shouldRefetch: weakRefsInvalidated ? { reason: 'weakRefsInvalidated' } : null,
});

/** An annotation as the fake engine keeps it: the file's values. */
export type FileAnnotation = AnnotationDTO<PdfCoordinates>;

/** The whole-document list `listAll` resolves with: the records and their pages. */
export const snapshotOf = (records: readonly FileAnnotation[], auditHead?: number) => {
  const pages = new Map<number, PageRef>();
  for (const record of records) pages.set(record.page.pageObjectNumber, record.page);
  return {
    annotations: [...records],
    pages: [...pages.values()].map((page) => ({ page })),
    ...(auditHead !== undefined ? { auditHead } : {}),
  };
};

export interface AnnotationHarnessOptions {
  /** The first page's crop box in PDF points (default: a 600 × 800 page at the origin). */
  readonly crop?: { left: number; bottom: number; right: number; top: number };
}

const DEFAULT_CROP: PdfRect = { left: 0, bottom: 0, right: 600, top: 800 };

export function annotationHarness(options: AnnotationHarnessOptions = {}) {
  const cropOf = (page: PageRef): PdfRect =>
    page.pageObjectNumber === PAGE.pageObjectNumber ? (options.crop ?? DEFAULT_CROP) : DEFAULT_CROP;
  /** A read as the engine hands it out. */
  const read = (annotation: FileAnnotation): AnnotationDTO =>
    pageAnnotationOf(annotation, cropOf(annotation.page), cropOf);
  const readAll = <List extends { annotations: FileAnnotation[] }>(list: List) =>
    list && { ...list, annotations: list.annotations.map(read) };
  const readResult = <Result extends { annotation?: FileAnnotation }>(result: Result) =>
    result?.annotation ? { ...result, annotation: read(result.annotation) } : result;
  const create = vi.fn();
  const update = vi.fn();
  const remove = vi.fn(async (_ref: AnnotationRef) => ({}));
  /** One page's list. */
  const list = vi.fn();
  /** The whole document's list. */
  const listAll = vi.fn();
  // Allow-all authority by default; permission tests narrow these mocks.
  const allows = vi.fn((_capability: string) => true);
  const allowsAnnotationCreate = vi.fn(() => true);
  const allowsAnnotationMutation = vi.fn(
    (_action: 'update' | 'delete', _target: { userId?: string; groupId?: string }) => true,
  );

  // A minimal interaction hub, enough for the plugin's `connect` wiring.
  const toolChanged = createEventHook<unknown>();
  const interaction = {
    registerTool: () => () => {},
    registerHandler: () => () => {},
    hasTool: () => false,
    getActiveTool: () => ({ id: 'pointer', cursor: 'default', enables: new Set<string>() }),
    getActiveToolId: () => 'pointer',
    onToolChanged: toolChanged.on,
  };

  const ctx = createTestContext<AnnotationState>({
    id: 'annotation',
    state: initialAnnotationState(),
    capabilities: [[InteractionToken, interaction]],
    pages: [
      options.crop
        ? { ref: PAGE, crop: options.crop }
        : { ref: PAGE, size: { width: 600, height: 800 } },
      { ref: PAGE2, size: { width: 600, height: 800 } },
    ],
    doc: {
      page: (page: PageRef) => ({
        annotations: {
          create: async (draft: unknown, resources?: unknown) => {
            // Every create this plugin sends to the viewed document carries an /NM.
            if (!(draft as { nm?: string }).nm) throw new Error('a create without an /NM');
            const result = readResult(await create(draft, ...(resources ? [resources] : [])));
            ctx.emitDocumentEvent({
              type: 'annotations.created',
              page: result.annotation.page ?? page,
              origin: localOrigin,
              meta: metaOf(),
              ...result,
            } as unknown as DocumentEvent);
            return result;
          },
          update: async (ref: AnnotationRef, patch: unknown, resources?: unknown) => {
            const result = readResult(await update(ref, patch, ...(resources ? [resources] : [])));
            if (result?.annotation) {
              ctx.emitDocumentEvent({
                type: 'annotations.updated',
                page: result.annotation.page,
                origin: localOrigin,
                appearance: { changed: false },
                meta: metaOf(),
                ...result,
              } as unknown as DocumentEvent);
            }
            return { appearance: { changed: false }, ...result };
          },
          delete: async (ref: AnnotationRef) => {
            const result = await remove(ref);
            // A weak delete reports no stable id and says the page's positions moved.
            const weak = ref.kind === 'index';
            ctx.emitDocumentEvent({
              type: 'annotations.deleted',
              page: ref.page,
              origin: localOrigin,
              deleted:
                ref.kind === 'objectNumber'
                  ? [{ kind: 'objectNumber', value: ref.annotObjectNumber }]
                  : ref.kind === 'nm'
                    ? [{ kind: 'nm', value: ref.nm }]
                    : [],
              meta: metaOf(weak),
            } as unknown as DocumentEvent);
            return result;
          },
          list: async () => readAll(await list()),
        },
      }),
      annotations: {
        // Some pages read through each page's list, so a test queues page reads once.
        list: async (options?: { pages?: readonly PageRef[] }) => {
          if (!options?.pages) return readAll(await listAll());
          const lists = await Promise.all(options.pages.map(async () => readAll(await list())));
          return {
            annotations: lists.flatMap((page) => page.annotations),
            pages: lists.flatMap((page) => page.pages ?? []),
          };
        },
      },
      security: {
        allows,
        identity: { userId: 'me' },
        // One mock per question `allowsAnnotation` answers.
        allowsAnnotation: (
          action: 'create' | 'update' | 'delete' | 'set-group',
          target?: { userId?: string | null; groupId?: string | null },
        ) =>
          action === 'create'
            ? allowsAnnotationCreate()
            : action === 'set-group'
              ? true
              : allowsAnnotationMutation(action, {
                  ...(target?.userId ? { userId: target.userId } : {}),
                  ...(target?.groupId ? { groupId: target.groupId } : {}),
                }),
      },
    } as never,
  });
  const instance = createAnnotationController(ctx);
  const { api } = instance;
  let started = false;

  /** Start the records mirror only (what the kernel does after `connect`). */
  const startSync = () => {
    if (started) return;
    started = true;
    ctx.connect({ api });
  };
  /** Run the plugin's full `connect` (hub wiring, reactions) and start the mirror. */
  const connectAll = () => {
    started = true;
    ctx.connect(instance);
  };

  return {
    ctx,
    capability: api,
    create,
    update,
    remove,
    list,
    listAll,
    allows,
    allowsAnnotationCreate,
    allowsAnnotationMutation,
    state: () => ctx.state.get(),
    /** The composed model: confirmed records, pending changes and the session. */
    model: () => instance.model(),
    /** Run a core message through the store's `commit` door, as a gesture does. */
    commit: instance.commit,
    /** State changes in code, through the store's `apply` door. */
    apply: instance.apply,
    startSync,
    connectAll,
    /** A fixture (the file's values) as the engine hands it out, in page space. */
    read,
    /** Deliver a document event (another session's change, a form write, …); its annotation is the file's values. */
    emit: (event: DocumentEvent) =>
      ctx.emitDocumentEvent(readResult(event as { annotation?: FileAnnotation }) as DocumentEvent),
    /** Load these confirmed records as the document's annotations. */
    load: async (records: readonly FileAnnotation[], auditHead?: number) => {
      listAll.mockResolvedValueOnce(snapshotOf(records, auditHead));
      if (started) await api.refresh();
      else startSync();
      await api.whenSynced();
    },
  };
}

export type AnnotationHarness = ReturnType<typeof annotationHarness>;
