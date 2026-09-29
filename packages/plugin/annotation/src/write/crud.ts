/**
 * Create, update and delete: the public verbs, in the engine's own terms.
 * Each states its change through `store.apply`, so it shows at once and is
 * written, settled and refused exactly like a gesture's, and each resolves
 * with the engine's record once the engine answered.
 */
import { PluginError, pageRefsEqual, type OperationOptions } from '@embedpdf/core';
import { defaultsFor, fieldsOf, withFields } from '@embedpdf/core-annotation';
import {
  ANNOTATION_FIELD_NAMES,
  annotationKey,
  annotationPatchBetween,
  type AnnotationDraft,
  type AnnotationDTO,
  type AnnotationPatch,
  type AnnotationRef,
  type AnnotationResources,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import type { AnnotationReads } from '../read/annotations';
import type { AnnotationContext, AnnotationServices } from '../services';
import { appliedOrThrow, appliedRefOf } from './outcomes';
import { geometryWithRotation } from './page-patch';

export function createCrud(
  ctx: Pick<AnnotationContext, 'document'>,
  { store, authority, tools }: Pick<AnnotationServices, 'store' | 'authority' | 'tools'>,
  annotations: Pick<AnnotationReads, 'get' | 'loadedOrThrow'>,
) {
  /** The annotation `ref` names, as the view holds it once its writes settled. */
  const settled = (ref: AnnotationRef): { annotation: AnnotationDTO } => {
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
    if (!authority.canCreate()) {
      throw new PluginError(
        'permission-denied',
        'annotation',
        'create requires doc.annotate.create',
      );
    }
    if (!ctx.document()?.pages.some((pageInfo) => pageRefsEqual(pageInfo.ref, page))) {
      throw new PluginError(
        'not-found',
        'annotation',
        `page ${page.pageObjectNumber} is not in this document`,
      );
    }
    const stated = options.tool ? withTool(draft, options.tool) : draft;
    const applied = store.apply([
      { type: 'create', page, draft: stated, ...(resources ? { resources } : {}) },
    ]);
    if (options.select) store.commit({ type: 'select', ids: [...applied.ids] });
    return settled(await appliedRefOf(applied));
  };

  const update = async (
    ref: AnnotationRef,
    patch: AnnotationPatch,
    resources?: AnnotationResources,
  ): Promise<{ annotation: AnnotationDTO }> => {
    await appliedOrThrow(
      store.apply([{ type: 'update', ref, patch, ...(resources ? { resources } : {}) }]),
    );
    return settled(ref);
  };

  /** Turn one annotation to `degrees`: the patch the turn means. The selection's quarter turns use it. */
  const setRotation = async (ref: AnnotationRef, degrees: number): Promise<void> => {
    const annotation = annotations.loadedOrThrow(ref);
    const turned = withFields(annotation, {
      geometry: geometryWithRotation(fieldsOf(annotation).geometry, degrees),
    });
    const patch = annotationPatchBetween(annotation.annotation, turned.annotation);
    if (Object.keys(patch).length) {
      await update(ref, { ...patch, subtype: annotation.annotation.subtype } as AnnotationPatch);
    }
  };

  const remove = async (ref: AnnotationRef): Promise<void> => {
    await appliedOrThrow(store.apply([{ type: 'delete', ref }]));
  };

  const api = { create, update, delete: remove };

  return { update, setRotation, api };
}

export type Crud = ReturnType<typeof createCrud>;
