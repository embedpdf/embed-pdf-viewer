import { PluginError, pageRefsEqual } from '@embedpdf/core';
import {
  geomVisualBounds,
  propsFor,
  readProp,
  type ModelAnnotation,
  type AnnotationProps,
  type ContentGeometry,
  type Id,
  type Model,
} from '@embedpdf/core-annotation';
import {
  annotationKey,
  type AnnotationDTO,
  type AnnotationRef,
} from '@embedpdf/engine-core/runtime';

import type { Annotation, AnnotationFilter, AnnotationGeometry } from '../contract';
import type { AnnotationServices } from '../services';

/**
 * The page-space read model: every annotation projected once per model
 * entry (the model already lives in page space), so reads are
 * reference-stable until the entry changes.
 */
export function createAnnotationReads({ store }: Pick<AnnotationServices, 'store'>) {
  const projections = new WeakMap<ModelAnnotation, Annotation>();

  const refOfId = (id: Id): AnnotationRef | null => store.model().byId[id]?.ref ?? null;

  const geometryOf = (geometry: ContentGeometry): AnnotationGeometry => {
    switch (geometry.kind) {
      case 'rect':
        return { kind: 'rect', bounds: geometry.rect, rotation: geometry.rot ?? 0 };
      case 'line':
        return { kind: 'line', from: geometry.a, to: geometry.b };
      case 'poly':
        return { kind: geometry.closed ? 'polygon' : 'polyline', vertices: geometry.points };
      case 'ink':
        return { kind: 'ink', strokes: geometry.strokes };
      case 'quads':
        return { kind: 'markup', quads: geometry.quads };
      case 'caret':
        return { kind: 'caret', bounds: geometry.rect };
      case 'text':
        return {
          kind: 'text',
          bounds: geometry.rect,
          rotation: geometry.rot ?? 0,
          callout: geometry.callout ?? null,
        };
    }
  };
  const propsOf = (annotation: ModelAnnotation): Partial<AnnotationProps> => {
    const out: Partial<AnnotationProps> = {};
    for (const spec of propsFor(annotation.subtype)) {
      const value = readProp(annotation, spec.key);
      if (value !== undefined) (out as Record<string, unknown>)[spec.key] = value;
    }
    return out;
  };
  const projectAnnot = (annotation: ModelAnnotation): Annotation | null => {
    if (!annotation.ref) return null;
    const hit = projections.get(annotation);
    if (hit) return hit;
    const dto = annotation.data;
    const projected: Annotation = {
      ref: annotation.ref,
      page: annotation.page,
      subtype: annotation.subtype,
      bounds: geomVisualBounds(
        annotation.geometry,
        annotation.style.strokeWidth,
        annotation.style.border,
      ),
      geometry: geometryOf(annotation.geometry),
      props: propsOf(annotation),
      flags: annotation.flags,
      contents: dto?.contents ?? '',
      author: dto?.author ?? null,
      createdAt: dto?.created ?? null,
      modifiedAt: dto?.modified ?? null,
      group: annotation.group ? refOfId(annotation.group) : null,
      inReplyTo: dto?.inReplyTo ?? null,
      authority: annotation.authority ?? { update: true, delete: true },
      raw: dto ?? null,
    };
    projections.set(annotation, projected);
    return projected;
  };
  const projectRef = (ref: AnnotationRef): Annotation | null => {
    const annotation = store.model().byId[annotationKey(ref)];
    return annotation ? projectAnnot(annotation) : null;
  };

  const listAnnots = (filter?: AnnotationFilter): ModelAnnotation[] => {
    const model = store.model();
    const group = filter?.group ? annotationKey(filter.group) : undefined;
    return model.order
      .map((id) => model.byId[id])
      .filter((annotation): annotation is ModelAnnotation => annotation !== undefined)
      .filter(
        (annotation) =>
          (!filter?.page || pageRefsEqual(annotation.page, filter.page)) &&
          (!filter?.subtype || annotation.subtype === filter.subtype) &&
          (filter?.author === undefined || annotation.data?.author === filter.author) &&
          (!group || annotation.group === group || annotation.id === group),
      );
  };
  // Unfiltered and per-page lists are what layers subscribe to: memoized per model.
  let listMemo: { model: Model; v: readonly Annotation[] } | null = null;
  const pageListMemo = new Map<number, { model: Model; v: readonly Annotation[] }>();
  const projectList = (annots: readonly ModelAnnotation[]): Annotation[] =>
    annots.map(projectAnnot).filter((annotation): annotation is Annotation => annotation !== null);
  const listAnnotations = (filter?: AnnotationFilter): readonly Annotation[] => {
    const model = store.model();
    if (!filter) {
      if (listMemo?.model !== model) listMemo = { model: model, v: projectList(listAnnots()) };
      return listMemo.v;
    }
    if (
      filter.page &&
      filter.subtype === undefined &&
      filter.author === undefined &&
      !filter.group
    ) {
      const pageObjectNumber = filter.page.pageObjectNumber;
      const hit = pageListMemo.get(pageObjectNumber);
      if (hit?.model === model) return hit.v;
      const pageList = projectList(listAnnots(filter));
      pageListMemo.set(pageObjectNumber, { model: model, v: pageList });
      return pageList;
    }
    return projectList(listAnnots(filter));
  };
  let selectedMemo: { model: Model; v: readonly Annotation[] } | null = null;
  const listSelected = (): readonly Annotation[] => {
    const model = store.model();
    if (selectedMemo?.model !== model) {
      selectedMemo = {
        model: model,
        v: projectList(
          model.selected
            .map((id) => model.byId[id])
            .filter((annotation): annotation is ModelAnnotation => !!annotation),
        ),
      };
    }
    return selectedMemo.v;
  };

  const loadedOrThrow = (ref: AnnotationRef): ModelAnnotation & { ref: AnnotationRef } => {
    const annotation = store.model().byId[annotationKey(ref)];
    if (!annotation || !annotation.ref) {
      throw new PluginError('not-found', 'annotation', 'annotation is not loaded in this document');
    }
    return annotation as ModelAnnotation & { ref: AnnotationRef };
  };
  /** Committed, data-backed annotations in the current selection. */
  const selectedCommitted = (): ModelAnnotation[] => {
    const model = store.model();
    return model.selected
      .map((id) => model.byId[id])
      .filter(
        (annotation): annotation is ModelAnnotation =>
          !!annotation && !!annotation.ref && !!annotation.data,
      );
  };

  const api = {
    get: projectRef,
    list: listAnnotations,
    listRaw: (filter?: AnnotationFilter) =>
      listAnnots(filter)
        .map((annotation) => annotation.data)
        .filter((dto): dto is AnnotationDTO => dto != null),
    getRaw: (ref: AnnotationRef): AnnotationDTO | null =>
      store.model().byId[annotationKey(ref)]?.data ?? null,
    listSelected,
    getSelection: (): AnnotationRef[] => {
      const model = store.model();
      return model.selected
        .map((id) => model.byId[id]?.ref)
        .filter((ref): ref is AnnotationRef => ref != null);
    },
  };

  return { projectRef, listAnnots, loadedOrThrow, selectedCommitted, api };
}

export type AnnotationReads = ReturnType<typeof createAnnotationReads>;
