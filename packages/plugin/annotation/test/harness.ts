/**
 * A test harness for the annotation controller on the kernel's real test
 * context. Its fake engine behaves like the real ones: a change
 * (`doc.apply`) runs its ops in order, all or nothing, and publishes their
 * events as one burst before its promise resolves, so the model changes
 * through the same event path as in production. A create that names an
 * object number gets that ref. The engine's answer to each op comes from the
 * per-verb mocks (`create`, `update`, `remove`, `reorder`), which tests hold
 * or refuse. Its annotations are the file's values, as tests write them; it
 * hands them out in page space, as the engines do (`pageAnnotationOf`).
 */
import { createEventHook, type DocumentEvent } from '@embedpdf/core';
import { createTestContext } from '@embedpdf/core/testing';
import type {
  Annotation,
  AnnotationRef,
  Change,
  ChangeItem,
  PageRef,
  PdfCoordinates,
  PdfRect,
} from '@embedpdf/engine-core/runtime';
import { pageAnnotationOf, toPageRef } from '@embedpdf/engine-core/runtime';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { SelectionToken } from '@embedpdf/plugin-selection/contract';
import { vi } from 'vitest';

import {
  ANNOTATION_DEFAULTS,
  type AnnotationConfig,
  type AnnotationSettings,
} from '../src/contract';
import { createAnnotationController } from '../src/controller';
import { initialAnnotationState, type AnnotationState } from '../src/model';

export const PAGE = toPageRef(1);

/** A read's data by field name, for assertions that span kinds (`color` is a square's, not a widget's). */
export const dataOf = (annotation: Annotation | null | undefined): Record<string, unknown> =>
  (annotation ?? {}) as unknown as Record<string, unknown>;
export const PAGE2 = toPageRef(2);

const localOrigin = { kind: 'local', sessionId: 'me', sub: null, ts: 0, serverId: null };

/** The mutation meta a write's event carries. */
const metaOf = () => ({ affectedPages: [], cacheDelta: null, changed: [] });

/** An annotation as the fake engine keeps it: the file's values. */
export type FileAnnotation = Annotation<PdfCoordinates>;

/** The whole-document list `listAll` resolves with: the records and their pages. */
export const snapshotOf = (records: readonly FileAnnotation[], auditHead?: number) => {
  const pages = new Map<number, PageRef>();
  for (const record of records) pages.set(record.page.objectNumber, record.page);
  return {
    annotations: [...records],
    pages: [...pages.values()].map((page) => ({ page })),
    ...(auditHead !== undefined ? { auditHead } : {}),
  };
};

export interface AnnotationHarnessOptions {
  /** The first page's crop box in PDF points (default: a 600 × 800 page at the origin). */
  readonly crop?: { left: number; bottom: number; right: number; top: number };
  /** A text selection plugin to read and clear (`applyToolToSelection`, `createFromSelection`). */
  readonly selection?: object;
  /** The settings the app registers (`annotationPlugin(config)`). */
  readonly config?: AnnotationConfig;
}

const DEFAULT_CROP: PdfRect = { left: 0, bottom: 0, right: 600, top: 800 };

export function annotationHarness(options: AnnotationHarnessOptions = {}) {
  const cropOf = (page: PageRef): PdfRect =>
    page.objectNumber === PAGE.objectNumber ? (options.crop ?? DEFAULT_CROP) : DEFAULT_CROP;
  /** A read as the engine hands it out. */
  const read = (annotation: FileAnnotation): Annotation =>
    pageAnnotationOf(annotation, cropOf(annotation.page), cropOf);
  const readAll = <List extends { annotations: FileAnnotation[] }>(list: List) =>
    list && { ...list, annotations: list.annotations.map(read) };
  const readResult = <Result extends { annotation?: FileAnnotation }>(result: Result) =>
    result?.annotation ? { ...result, annotation: read(result.annotation) } : result;
  const create = vi.fn();
  const update = vi.fn();
  const remove = vi.fn(async (_ref: AnnotationRef) => ({}));
  /** A page's drawing-order change: resolves with the page's new order. */
  const reorder = vi.fn(async (_refs: AnnotationRef[], _position: unknown) => ({
    order: [] as AnnotationRef[],
  }));
  const downloadResource = vi.fn(async (_ref: AnnotationRef, _role: string) => new Uint8Array([1]));
  /** A page's appearance pictures: none, unless a test gives some. */
  const renderAppearances = vi.fn(async (_options: unknown) => ({
    appearances: [] as unknown[],
  }));
  const exportBundle = vi.fn(async (_selection?: unknown) => ({ version: 1 }) as unknown);
  const importBundle = vi.fn(async (_bundle: unknown, _options?: unknown) => ({
    annotations: [] as Annotation[],
    refMap: [] as { from: AnnotationRef; to: AnnotationRef }[],
    dropped: [] as unknown[],
    meta: metaOf(),
  }));
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
  /** Every change the plugin sent, with its `opId`. */
  const applied: { change: Change; opId: string }[] = [];
  /** The object numbers the fake engine hands this session: never the same twice. */
  let nextNumber = 900;
  const lostListeners = new Set<(lost: { numbers: number[]; reason: 'reclaimed' }) => void>();

  // A minimal interaction hub, enough for the plugin's `connect` wiring.
  const toolChanged = createEventHook<unknown>();
  const interaction = {
    activateDefaultTool: vi.fn(),
    activateTool: vi.fn(),
    registerTool: () => () => {},
    registerHandler: () => () => {},
    hasTool: () => false,
    getActiveTool: () => ({ id: 'pointer', cursor: 'default', enables: new Set<string>() }),
    getActiveToolId: () => 'pointer',
    onToolChanged: toolChanged.on,
  };

  /** The changes before the one being sent, and how many there are: each waits for them. */
  let line: Promise<unknown> = Promise.resolve();
  let waiting = 0;
  /** One change, as the engine applies it: its ops in order, all or nothing, then its events. */
  const runChange = async (change: Change, opId: string) => {
    if (!('ops' in change)) throw new Error('the fake engine does not undo');
    // Each op answered by its verb's mock, in order; the first refusal refuses all.
    const items: ChangeItem[] = [];
    const events: Record<string, unknown>[] = [];
    for (const op of change.ops) {
      switch (op.type) {
        case 'annotations.create': {
          const result = readResult(
            await create(op.data, ...(op.resources ? [{ resources: op.resources }] : [])),
          );
          const annotation =
            op.objectNumber === undefined
              ? result.annotation
              : {
                  ...result.annotation,
                  ref: { kind: 'objectNumber', page: op.page, objectNumber: op.objectNumber },
                };
          items.push({ type: op.type, page: op.page, annotation, meta: metaOf() } as never);
          events.push({
            type: 'annotations.created',
            page: annotation.page ?? op.page,
            annotation,
            meta: metaOf(),
          });
          break;
        }
        case 'annotations.update': {
          const answer = readResult(
            await update(op.ref, op.patch, ...(op.resources ? [{ resources: op.resources }] : [])),
          );
          // The engine reads the annotation back under the ref it was asked about.
          const result = answer?.annotation
            ? { ...answer, annotation: { ...answer.annotation, ref: op.ref } }
            : answer;
          items.push({
            type: op.type,
            page: op.ref.page,
            appearance: { changed: false },
            meta: metaOf(),
            ...result,
          } as never);
          if (result?.annotation) {
            events.push({
              type: 'annotations.updated',
              page: result.annotation.page,
              appearance: { changed: false },
              meta: metaOf(),
              ...result,
            });
          }
          break;
        }
        case 'annotations.delete': {
          const { ref } = op;
          await remove(ref);
          items.push({ type: op.type, page: ref.page, meta: metaOf() } as never);
          events.push({
            type: 'annotations.deleted',
            page: ref.page,
            deleted: [ref],
            meta: metaOf(),
          });
          break;
        }
        case 'annotations.reorder': {
          const { order } = await reorder([...op.refs], op.position);
          items.push({ type: op.type, page: op.page, order, meta: metaOf() } as never);
          events.push({ type: 'annotations.reordered', page: op.page, order, meta: metaOf() });
          break;
        }
        default:
          throw new Error(`the fake engine does not apply ${op.type}`);
      }
    }
    // Published before the answer, as one burst: every event names the change.
    events.forEach((event, index) =>
      ctx.emitDocumentEvent({
        ...event,
        origin: { ...localOrigin, tx: { id: opId, index, count: events.length } },
      } as unknown as DocumentEvent),
    );
    return { items, meta: { ...metaOf(), opId, undoable: true } };
  };

  const ctx = createTestContext<AnnotationState, AnnotationSettings>({
    id: 'annotation',
    state: initialAnnotationState(),
    settings: { defaults: ANNOTATION_DEFAULTS, registered: options.config },
    capabilities: [
      [InteractionToken, interaction],
      ...(options.selection ? [[SelectionToken, options.selection] as const] : []),
    ],
    pages: [
      options.crop
        ? { ref: PAGE, crop: options.crop }
        : { ref: PAGE, size: { width: 600, height: 800 } },
      { ref: PAGE2, size: { width: 600, height: 800 } },
    ],
    doc: {
      objectNumbers: {
        take: () => nextNumber++,
        held: Infinity,
        reserve: async () => {},
        onLost: (listener: (lost: { numbers: number[]; reason: 'reclaimed' }) => void) => {
          lostListeners.add(listener);
          return () => lostListeners.delete(listener);
        },
      },
      // One change at a time, in the order they came: as both engines answer.
      apply: (change: Change, options?: { opId?: string }) => {
        const opId = options?.opId ?? 'no-op-id';
        applied.push({ change, opId });
        let aborted = false;
        const start = () => {
          if (aborted) throw new Error('aborted');
          return runChange(change, opId);
        };
        // Nothing ahead of it: it starts at once.
        const run = waiting === 0 ? start() : line.then(start);
        waiting += 1;
        const done = () => {
          waiting -= 1;
        };
        void run.then(done, done);
        line = run.catch(() => {});
        return Object.assign(run, {
          abort: () => {
            aborted = true;
          },
        });
      },
      page: (page: PageRef) => ({
        annotations: {
          renderAppearances: (options: unknown) =>
            Object.assign(
              renderAppearances(options).then((result) => ({ page, ...result })),
              { abort: () => {} },
            ),
          list: async () => readAll(await list()),
          downloadResource: (ref: AnnotationRef, role: string) => downloadResource(ref, role),
        },
      }),
      annotations: {
        export: (selection?: unknown) => exportBundle(selection),
        import: (bundle: unknown, options?: unknown) => importBundle(bundle, options),
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
  /** Seed each tool's defaults into the session again (the registry seeds them when it's built). */
  const seedToolDefaults = () => {
    for (const tool of api.listResolvedTools())
      if (tool.defaults) api.tools.updateDefaults(tool.id, tool.defaults);
  };

  return {
    ctx,
    capability: api,
    create,
    update,
    remove,
    reorder,
    downloadResource,
    renderAppearances,
    exportBundle,
    importBundle,
    interaction,
    list,
    listAll,
    allows,
    allowsAnnotationCreate,
    allowsAnnotationMutation,
    /** Every change the plugin sent, in order, with its `opId`. */
    applied,
    /** The engine reclaims these object numbers (another session took them over). */
    loseNumbers: (numbers: number[]) => {
      for (const listener of lostListeners) listener({ numbers, reason: 'reclaimed' });
    },
    state: () => ctx.state.get(),
    /** This session's changes the engine hasn't answered, in staging order. */
    pending: () => ctx.changes.pending(),
    /** The composed model: confirmed records, pending changes and the session. */
    model: () => instance.model(),
    /** Run a core message through the store's `commit` door, as a gesture does. */
    commit: instance.commit,
    /** State changes in code, through the store's `apply` door. */
    apply: instance.apply,
    startSync,
    connectAll,
    seedToolDefaults,
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
