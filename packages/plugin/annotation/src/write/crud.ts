/**
 * Create, update, delete and move: the public verbs, in the engine's own
 * terms, and the transfers (export, import, a resource's bytes). Each change
 * states itself through `store.apply` (a move through the pending moves), so
 * it shows at once and is written, settled and refused exactly like a
 * gesture's, and each resolves with what the engine wrote for it: its own
 * write's answer, never another change still on its way.
 */
import {
  PluginError,
  toPluginError,
  toPluginErrorInfo,
  type OperationOptions,
} from '@embedpdf/core';
import { defaultsFor } from '@embedpdf/core-annotation';
import {
  ANNOTATION_FIELD_NAMES,
  anchorOf,
  annotationKey,
  type Annotation,
  type AnnotationBundle,
  type AnnotationDraft,
  type AnnotationImportOptions,
  type AnnotationPatch,
  type AnnotationPosition,
  type AnnotationRef,
  type AnnotationResourceRole,
  type AnnotationResources,
  type ListPosition,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import type { AnnotationExportSelection, AnnotationImportResult } from '../contract';
import { addReorder, dropReorder } from '../model';
import type { AnnotationReads } from '../read/annotations';
import type { AnnotationContext, AnnotationServices } from '../services';
import { recordOfRef } from '../services/store';
import { appliedAnnotationOf, appliedOrThrow } from './outcomes';

export function createCrud(
  ctx: Pick<AnnotationContext, 'doc' | 'state' | 'pageOf' | 'assertAllowed' | 'cancellable'>,
  {
    store,
    tools,
    records,
    events,
  }: Pick<AnnotationServices, 'store' | 'tools' | 'records' | 'events'>,
  annotations: Pick<AnnotationReads, 'get' | 'pageOf'>,
  /** Write what is held back (typed text) and wait for every write on its way. */
  settle: () => Promise<void>,
) {
  /** The annotation `ref` names, as the view holds it: for a change that wrote nothing. */
  const current = (ref: AnnotationRef): { annotation: Annotation } => {
    const annotation = annotations.get(ref);
    if (!annotation) {
      throw new PluginError('not-found', 'annotation', `no annotation ${annotationKey(ref)}`);
    }
    return { annotation };
  };

  /**
   * `draft` over a tool's defaults and flags: what it leaves out, the tool
   * fills in, and the engine's defaults the rest. The tool's text body is
   * left out: it formats text drawn with the tool, and a draft brings its own.
   */
  const withTool = (draft: AnnotationDraft, toolId: string): AnnotationDraft => {
    const tool = tools.get(toolId);
    if (!tool) throw new PluginError('not-found', 'annotation', `no tool '${toolId}'`);
    const declared = ANNOTATION_FIELD_NAMES[draft.subtype];
    const defaults = Object.entries(defaultsFor(store.model(), tool.preset)).filter(
      ([name]) => name !== 'richText' && declared.includes(name),
    );
    return { ...tool.flags, ...Object.fromEntries(defaults), ...draft } as AnnotationDraft;
  };

  const create = async (
    page: PageRef | number,
    fields: AnnotationDraft | Annotation,
    resources?: AnnotationResources,
    options: OperationOptions & { tool?: string; select?: boolean } = {},
  ): Promise<{ annotation: Annotation }> => {
    ctx.assertAllowed('annotations:create', 'annotation.create');
    const { ref } = ctx.pageOf(page);
    // A read is a create too (a copy): the engine writes only its own fields,
    // and refuses a value a write can't make. A kind it doesn't know has none.
    if (fields.subtype === 'unsupported') {
      throw new PluginError(
        'invalid-input',
        'annotation',
        "a kind the engine doesn't know can't be created",
      );
    }
    const draft = fields as AnnotationDraft;
    const stated = options.tool ? withTool(draft, options.tool) : draft;
    const applied = store.apply([
      { type: 'create', page: ref, draft: stated, ...(resources ? { resources } : {}) },
    ]);
    if (options.select) store.commit({ type: 'select', ids: [...applied.ids] });
    const annotation = await ctx.cancellable(options.signal, appliedAnnotationOf(applied));
    if (!annotation) {
      throw new PluginError(
        'operation-failed',
        'annotation',
        'the annotation could not be created',
      );
    }
    return { annotation };
  };

  const update = async (
    ref: AnnotationRef,
    patch: AnnotationPatch,
    resources?: AnnotationResources,
    options: OperationOptions = {},
  ): Promise<{ annotation: Annotation }> => {
    const annotation = await ctx.cancellable(
      options.signal,
      appliedAnnotationOf(
        store.apply([{ type: 'update', ref, patch, ...(resources ? { resources } : {}) }]),
      ),
    );
    return annotation ? { annotation } : current(ref);
  };

  const remove = async (ref: AnnotationRef, options: OperationOptions = {}): Promise<void> => {
    await ctx.cancellable(options.signal, appliedOrThrow(store.apply([{ type: 'delete', ref }])));
  };

  /** The last pending reorder's token: each reorder is removed by its own. */
  let reorderToken = 0;

  /**
   * Move annotations on one page to a new place in its drawing order, next to
   * a neighbour or to the bottom or top. The new order shows at once; once
   * the engine confirmed it, the confirmed records hold it and the pending
   * reorder goes. A refused reorder goes at once.
   */
  const reorder = async (
    refs: readonly AnnotationRef[],
    position: AnnotationPosition,
    options: OperationOptions = {},
  ): Promise<void> => {
    if (!refs.length) return;
    const model = store.model();
    const recordOf = (ref: AnnotationRef) => {
      const record = recordOfRef(model, ref);
      if (!record) {
        throw new PluginError('not-found', 'annotation', `no annotation ${annotationKey(ref)}`);
      }
      return record;
    };
    const moving = refs.map(recordOf);
    const anchor = anchorOf(position);
    const neighbour = anchor ? recordOf(anchor) : null;
    const page = moving[0]!.annotation.page;
    const onOtherPage = (record: { annotation: { page: PageRef } }) =>
      record.annotation.page.objectNumber !== page.objectNumber;
    if (moving.some(onOtherPage) || (neighbour && onOtherPage(neighbour))) {
      throw new PluginError(
        'invalid-input',
        'annotation',
        'a reorder stays on one page: the annotations and their neighbour',
      );
    }
    // The same position, by record for the view and by ref for the engine.
    const at = <T>(name: (record: (typeof moving)[number]) => T): ListPosition<T> => {
      if (!neighbour || typeof position !== 'object') return position as 'start' | 'end';
      return 'before' in position ? { before: name(neighbour) } : { after: name(neighbour) };
    };
    const token = ++reorderToken;
    ctx.state.update(addReorder, {
      token,
      page: page.objectNumber,
      ids: moving.map((record) => record.id),
      position: at((record) => record.id),
    });
    try {
      await ctx.cancellable(
        options.signal,
        ctx.doc.page(page).annotations.reorder(
          moving.map((record) => record.annotation.ref),
          at((record) => record.annotation.ref),
        ),
      );
      await records.settled();
    } catch (error) {
      const refused = toPluginError('annotation', error);
      if (refused.code !== 'operation-cancelled') {
        events.writeFailed.emit({
          refs: moving.map((record) => record.annotation.ref),
          error: toPluginErrorInfo(refused),
        });
      }
      throw refused;
    } finally {
      ctx.state.update(dropReorder, token);
    }
  };

  /** The pages a selection names, as refs: an index becomes its page's ref. */
  const pageRefsOf = (pages: readonly (PageRef | number)[] | undefined): PageRef[] | undefined =>
    pages?.map((page) => ctx.pageOf(page).ref);

  const exportBundle = async (
    selection: AnnotationExportSelection = {},
    options: OperationOptions = {},
  ): Promise<AnnotationBundle> => {
    ctx.assertAllowed('doc.download', 'annotation.export');
    const pages = pageRefsOf(selection.pages);
    // What the user sees is what the bundle carries: typed text and pending writes land first.
    await ctx.cancellable(options.signal, settle());
    return ctx.cancellable(
      options.signal,
      ctx.doc.annotations.export({
        ...(selection.refs ? { refs: selection.refs } : {}),
        ...(pages ? { pages } : {}),
      }),
    );
  };

  const importBundle = async (
    bundle: AnnotationBundle,
    options: AnnotationImportOptions & OperationOptions = {},
  ): Promise<AnnotationImportResult> => {
    ctx.assertAllowed('annotations:create', 'annotation.import');
    const { signal, ...importOptions } = options;
    const result = await ctx.cancellable(signal, ctx.doc.annotations.import(bundle, importOptions));
    // The engine published one `annotations.created` per annotation: once the
    // records hold them, `list()` shows them.
    await records.settled();
    return { annotations: result.annotations, refMap: result.refMap, dropped: result.dropped };
  };

  const downloadResource = async (
    ref: AnnotationRef,
    role: AnnotationResourceRole,
    options: OperationOptions = {},
  ): Promise<Uint8Array> => {
    ctx.assertAllowed('doc.download', 'annotation.downloadResource');
    current(ref);
    return ctx.cancellable(
      options.signal,
      ctx.doc.page(annotations.pageOf(ref)).annotations.downloadResource(ref, role),
    );
  };

  const api = {
    create,
    update,
    delete: remove,
    reorder,
    export: exportBundle,
    import: importBundle,
    downloadResource,
  };

  return { update, api };
}

export type Crud = ReturnType<typeof createCrud>;
