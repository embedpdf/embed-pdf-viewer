/**
 * Create, update and delete: the public verbs, in the engine's own terms.
 * Each states its change through `store.apply`, so it shows at once and is
 * written, settled and refused exactly like a gesture's, and each resolves
 * with the engine's record once the engine answered.
 */
import { PluginError, pageRefsEqual, type OperationOptions } from '@embedpdf/core';
import { patchBetween } from '@embedpdf/core-annotation';
import {
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
import { appliedOrThrow, appliedRefOf } from './outcomes';
import { geometryWithRotation } from './page-patch';

export function createCrud(
  ctx: Pick<AnnotationContext, 'document'>,
  { store, authority }: Pick<AnnotationServices, 'store' | 'authority'>,
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

  const create = async (
    page: PageRef,
    draft: AnnotationDraft,
    resources?: AnnotationResources,
    options: OperationOptions & { select?: boolean } = {},
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
    const applied = store.apply([
      { type: 'create', page, draft, ...(resources ? { resources } : {}) },
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
    const turned = { ...annotation, geometry: geometryWithRotation(annotation.geometry, degrees) };
    const patch = patchBetween(annotation, turned);
    if (patch) await update(ref, patch);
  };

  const remove = async (ref: AnnotationRef): Promise<void> => {
    await appliedOrThrow(store.apply([{ type: 'delete', ref }]));
  };

  const api = { create, update, delete: remove };

  return { update, setRotation, api };
}

export type Crud = ReturnType<typeof createCrud>;
