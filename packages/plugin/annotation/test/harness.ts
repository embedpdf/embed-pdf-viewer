/**
 * A test harness for the annotation controller on the kernel's real test
 * context. Its fake engine behaves like the real ones: every write publishes
 * its confirmed event before the write's promise resolves, so the model
 * changes through the same event path as in production.
 */
import { createEventHook, type DocumentEvent } from '@embedpdf/core';
import { createTestContext } from '@embedpdf/core/testing';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import type { AnnotationDTO, AnnotationRef, PageRef } from '@embedpdf/engine-core/runtime';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { vi } from 'vitest';

import { createAnnotationController } from '../src/controller';
import { initialAnnotationState, type AnnotationState } from '../src/model';

export const PAGE = toPageRef(1);
export const PAGE2 = toPageRef(2);

const localOrigin = { kind: 'local', sessionId: 'me', sub: null, ts: 0, serverId: null };

/** The bulk snapshot `listRawAll` resolves with, grouped by page. */
export const snapshotOf = (records: readonly AnnotationDTO[], auditHead?: number) => {
  const pages = new Map<number, { page: PageRef; annotations: AnnotationDTO[] }>();
  for (const record of records) {
    const entry = pages.get(record.page.pageObjectNumber) ?? { page: record.page, annotations: [] };
    entry.annotations.push(record);
    pages.set(record.page.pageObjectNumber, entry);
  }
  return {
    pages: [...pages.values()].map(({ page, annotations }) => ({ pageState: { page }, annotations })),
    ...(auditHead !== undefined ? { auditHead } : {}),
  };
};

export interface AnnotationHarnessOptions {
  /** The first page's crop box in PDF points (default: a 600 × 800 page at the origin). */
  readonly crop?: { left: number; bottom: number; right: number; top: number };
}

export function annotationHarness(options: AnnotationHarnessOptions = {}) {
  const create = vi.fn();
  const update = vi.fn();
  const remove = vi.fn(async (_ref: AnnotationRef) => ({}));
  const list = vi.fn();
  const listRawAll = vi.fn();
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
      options.crop ? { ref: PAGE, crop: options.crop } : { ref: PAGE, size: { width: 600, height: 800 } },
      { ref: PAGE2, size: { width: 600, height: 800 } },
    ],
    doc: {
      page: (page: PageRef) => ({
        annotations: {
          create: async (draft: unknown) => {
            const result = await create(draft);
            ctx.emitDocumentEvent({
              type: 'annotation.created',
              page: result.created.page ?? page,
              origin: localOrigin,
              ...result,
            } as unknown as DocumentEvent);
            return result;
          },
          update: async (ref: AnnotationRef, patch: unknown) => {
            const result = await update(ref, patch);
            if (result?.updated) {
              ctx.emitDocumentEvent({
                type: 'annotation.updated',
                page: result.updated.page,
                origin: localOrigin,
                appearance: { changed: false },
                ...result,
              } as unknown as DocumentEvent);
            }
            return { appearance: { changed: false }, ...result };
          },
          delete: async (ref: AnnotationRef) => {
            const result = await remove(ref);
            if (ref.kind === 'objectNumber') {
              ctx.emitDocumentEvent({
                type: 'annotation.deleted',
                page: ref.page,
                origin: localOrigin,
                deleted: { kind: 'objectNumber', value: ref.annotObjectNumber },
              } as unknown as DocumentEvent);
            }
            return result;
          },
          list,
        },
      }),
      annotations: { listRawAll },
      security: {
        allows,
        identity: { user_id: 'me' },
        allowsAnnotationCreate,
        allowsAnnotationMutation,
        allowsAnnotationGroupAssignment: () => true,
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
    listRawAll,
    allows,
    allowsAnnotationCreate,
    allowsAnnotationMutation,
    state: () => ctx.state.get(),
    startSync,
    connectAll,
    /** Deliver a document event (another session's change, a form write, …). */
    emit: (event: DocumentEvent) => ctx.emitDocumentEvent(event),
    /** Load these confirmed records as the document's annotations. */
    load: async (records: readonly AnnotationDTO[], auditHead?: number) => {
      listRawAll.mockResolvedValueOnce(snapshotOf(records, auditHead));
      if (started) await api.refresh();
      else startSync();
      await api.whenSynced();
    },
  };
}

export type AnnotationHarness = ReturnType<typeof annotationHarness>;
