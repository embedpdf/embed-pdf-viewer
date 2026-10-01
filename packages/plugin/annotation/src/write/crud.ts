/**
 * Create, update and delete: the public verbs, in the engine's own terms.
 * Each states its change through `store.apply`, so it shows at once and is
 * written, settled and refused exactly like a gesture's, and each resolves
 * with what the engine wrote for it: its own write's answer, never another
 * change still on its way.
 */
import { PluginError, pageRefsEqual, type OperationOptions } from '@embedpdf/core';
import { defaultsFor } from '@embedpdf/core-annotation';
import {
  ANNOTATION_FIELD_NAMES,
  annotationKey,
  type AnnotationDraft,
  type AnnotationDTO,
  type AnnotationPatch,
  type AnnotationRef,
  type AnnotationResources,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import type { AnnotationReads } from '../read/annotations';
import type { AnnotationContext, AnnotationServices } from '../services';
import { appliedAnnotationOf, appliedOrThrow } from './outcomes';

export function createCrud(
  ctx: Pick<AnnotationContext, 'document' | 'assertAllowed'>,
  { store, tools }: Pick<AnnotationServices, 'store' | 'tools'>,
  annotations: Pick<AnnotationReads, 'get'>,
) {
  /** The annotation `ref` names, as the view holds it: for a change that wrote nothing. */
  const current = (ref: AnnotationRef): { annotation: AnnotationDTO } => {
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
    page: PageRef,
    draft: AnnotationDraft,
    resources?: AnnotationResources,
    options: OperationOptions & { tool?: string; select?: boolean } = {},
  ): Promise<{ annotation: AnnotationDTO }> => {
    ctx.assertAllowed('annotations:create', 'annotation.create');
    if (!ctx.document()?.pages.some((pageInfo) => pageRefsEqual(pageInfo.ref, page))) {
      throw new PluginError(
        'not-found',
        'annotation',
        `page ${page.objectNumber} is not in this document`,
      );
    }
    const stated = options.tool ? withTool(draft, options.tool) : draft;
    const applied = store.apply([
      { type: 'create', page, draft: stated, ...(resources ? { resources } : {}) },
    ]);
    if (options.select) store.commit({ type: 'select', ids: [...applied.ids] });
    const annotation = await appliedAnnotationOf(applied);
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
  ): Promise<{ annotation: AnnotationDTO }> => {
    const annotation = await appliedAnnotationOf(
      store.apply([{ type: 'update', ref, patch, ...(resources ? { resources } : {}) }]),
    );
    return annotation ? { annotation } : current(ref);
  };

  const remove = async (ref: AnnotationRef): Promise<void> => {
    await appliedOrThrow(store.apply([{ type: 'delete', ref }]));
  };

  const api = { create, update, delete: remove };

  return { update, api };
}

export type Crud = ReturnType<typeof createCrud>;
