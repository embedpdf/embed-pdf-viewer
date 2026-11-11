/**
 * Create, update, delete, reorder and duplicate: the public verbs, in the
 * engine's own terms, and the transfers (export, import, a resource's
 * bytes). Each change states itself through `store.apply`, so it shows at
 * once and is sent, answered and refused exactly like a gesture's, and each
 * resolves with what the engine wrote for it: its own change's answer, never
 * another change still on its way. An import is a change too: the engine's
 * own verb makes it, so it is staged on the document's queue as that verb's
 * call.
 */
import { PluginError, type HistoryOptions, type OperationOptions } from '@embedpdf/core';
import { defaultsFor, linkChildrenOf } from '@embedpdf/core-annotation';
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
  type ChangeItem,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import type {
  AnnotationDuplicateOptions,
  AnnotationDuplicateResult,
  AnnotationExportSelection,
  AnnotationImportResult,
} from '../contract';
import type { AnnotationReads } from '../read/annotations';
import type { AnnotationContext, AnnotationServices } from '../services';
import { appliedAnnotationOf, appliedOrThrow } from './outcomes';

export function createCrud(
  ctx: Pick<AnnotationContext, 'doc' | 'pageOf' | 'assertAllowed' | 'cancellable' | 'changes'>,
  {
    store,
    tools,
    records,
    lending,
  }: Pick<AnnotationServices, 'store' | 'tools' | 'records' | 'lending'>,
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
    const applied = await store.applyWhenNumbered(
      [{ type: 'create', page: ref, draft: stated, ...(resources ? { resources } : {}) }],
      { select: options.select },
    );
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

  /**
   * Move annotations on one page to a new place in its drawing order, next to
   * a neighbour or to the bottom or top. The new order shows at once, and goes
   * away if the engine refuses it.
   */
  const reorder = async (
    refs: readonly AnnotationRef[],
    position: AnnotationPosition,
    options: OperationOptions = {},
  ): Promise<void> => {
    if (!refs.length) return;
    const model = store.model();
    const recordOf = (ref: AnnotationRef) => {
      const record = model.byId[annotationKey(ref)];
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
    await ctx.cancellable(
      options.signal,
      appliedOrThrow(
        store.apply([
          {
            type: 'reorder',
            page,
            refs: moving.map((record) => record.annotation.ref),
            position,
          },
        ]),
      ),
    );
  };

  /**
   * Copies of annotations in this document, which the engine makes in one
   * op: they show at once, and it is one step to undo. An annotation's
   * attached link is a child of it, so it is copied along. A link `refs`
   * names itself is copied once, as one of the copies named.
   *
   * `lent` are the selection's lent records (a form's widgets, in design
   * mode), which only the selection's own duplicate passes: their lender
   * says which ops copy them, and those join the same change, so a
   * selection of both kinds is one step. Their copies are among the
   * annotations it resolves; what their lender left out is its own to tell.
   */
  const duplicate = async (
    refs: readonly AnnotationRef[],
    options: AnnotationDuplicateOptions & OperationOptions = {},
    lent: readonly AnnotationRef[] = [],
  ): Promise<AnnotationDuplicateResult> => {
    if (refs.length || !lent.length) {
      ctx.assertAllowed('annotations:create', 'annotation.duplicate');
    }
    if (!refs.length && !lent.length) return { annotations: [], dropped: [] };
    const page = options.page === undefined ? undefined : ctx.pageOf(options.page).ref;
    const placement = {
      ...(page ? { page } : {}),
      ...(options.offset ? { offset: options.offset } : {}),
    };
    const lender = lent.length ? lending.lender() : null;
    const lentCopy = lender ? await lender.copyOps(lent, placement) : null;
    const model = store.model();
    const stated = new Set(refs.map(annotationKey));
    const along = refs.flatMap((ref) =>
      linkChildrenOf(model, annotationKey(ref))
        .map((child) => child.annotation.ref)
        .filter((child) => !stated.has(annotationKey(child))),
    );
    const lentIds = lentCopy?.copies.map(annotationKey) ?? [];
    const applied = await store.applyWhenNumbered(
      refs.length ? [{ type: 'copy', refs, ...(along.length ? { along } : {}), ...placement }] : [],
      {
        select: options.select,
        ...(lentCopy
          ? {
              lent: { ops: lentCopy.ops, ids: lentIds },
              label: {
                key: refs.length ? 'annotation.duplicate' : `${lender!.owner}.duplicate`,
                count: refs.length + lentIds.length,
              },
            }
          : {}),
      },
    );
    const outcome = await ctx.cancellable(options.signal, appliedOrThrow(applied));
    const items = outcome.result?.items ?? [];
    const copied = items.find((item) => item.type === 'annotations.copy');
    if (refs.length && copied?.type !== 'annotations.copy') {
      throw new PluginError(
        'operation-failed',
        'annotation',
        'the annotations could not be copied',
      );
    }
    // The copies of the annotations named: a link that came along isn't one.
    const named = new Set(applied.ids);
    const own =
      copied?.type === 'annotations.copy'
        ? copied.annotations.filter((copy) => named.has(annotationKey(copy.ref)))
        : [];
    // A lent record's copy, as the last op that names it left it.
    const rows = new Map<string, Annotation>();
    for (const item of items) {
      const made =
        item.type === 'forms.copy' || item.type === 'forms.addWidget'
          ? item.widgets
          : item.type === 'forms.updateWidget'
            ? [item.widget]
            : [];
      for (const row of made) rows.set(annotationKey(row.ref), row);
    }
    return {
      annotations: [...own, ...lentIds.flatMap((id) => rows.get(id) ?? [])],
      dropped: copied?.type === 'annotations.copy' ? copied.dropped : [],
    };
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
    options: AnnotationImportOptions & OperationOptions & HistoryOptions = {},
  ): Promise<AnnotationImportResult> => {
    ctx.assertAllowed('annotations:create', 'annotation.import');
    const { signal, history, ...importOptions } = options;
    // One change on the queue: what was typed is sent first, and the history
    // keeps it as one step unless the caller says it isn't one.
    const change = ctx.changes.stage({
      label: { key: 'annotation.import' },
      opId: importOptions.opId,
      history,
      send: (doc, { opId }) =>
        ctx
          .cancellable(signal, doc.annotations.import(bundle, { ...importOptions, opId }))
          .then((result) => ({
            items: [{ type: 'annotations.import' as const, ...result }],
            meta: result.meta,
          })),
    });
    const { items } = await change.result;
    const imported = items[0] as Extract<ChangeItem, { type: 'annotations.import' }>;
    // The engine published one `annotations.created` per annotation: once the
    // records hold them, `list()` shows them.
    await records.settled();
    return {
      annotations: imported.annotations,
      refMap: imported.refMap,
      dropped: imported.dropped,
    };
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
    duplicate,
    export: exportBundle,
    import: importBundle,
    downloadResource,
  };

  return { update, duplicate, api };
}

export type Crud = ReturnType<typeof createCrud>;
