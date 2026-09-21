import { PluginError, pageRefsEqual } from '@embedpdf/core';
import {
  geomVisualBounds,
  propsFor,
  readProp,
  type Annot,
  type AnnotationProps,
  type Geom,
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
  const projections = new WeakMap<Annot, Annotation>();

  const refOfId = (id: Id): AnnotationRef | null => store.model().byId[id]?.ref ?? null;

  const geometryOf = (g: Geom): AnnotationGeometry => {
    switch (g.t) {
      case 'rect':
        return { kind: 'rect', bounds: g.rect, rotation: g.rot ?? 0 };
      case 'line':
        return { kind: 'line', from: g.a, to: g.b };
      case 'poly':
        return { kind: g.closed ? 'polygon' : 'polyline', vertices: g.points };
      case 'ink':
        return { kind: 'ink', strokes: g.strokes };
      case 'quads':
        return { kind: 'markup', quads: g.quads };
      case 'caret':
        return { kind: 'caret', bounds: g.rect };
      case 'text':
        return { kind: 'text', bounds: g.rect, rotation: g.rot ?? 0, callout: g.callout ?? null };
    }
  };
  const propsOf = (a: Annot): Partial<AnnotationProps> => {
    const out: Partial<AnnotationProps> = {};
    for (const spec of propsFor(a.subtype)) {
      const value = readProp(a, spec.key);
      if (value !== undefined) (out as Record<string, unknown>)[spec.key] = value;
    }
    return out;
  };
  const projectAnnot = (a: Annot): Annotation | null => {
    if (!a.ref) return null;
    const hit = projections.get(a);
    if (hit) return hit;
    const d = a.data;
    const projected: Annotation = {
      ref: a.ref,
      page: a.page,
      subtype: a.subtype,
      bounds: geomVisualBounds(a.geom, a.style.strokeWidth, a.style.border),
      geometry: geometryOf(a.geom),
      props: propsOf(a),
      flags: a.flags,
      contents: d?.contents ?? '',
      author: d?.author ?? null,
      createdAt: d?.created ?? null,
      modifiedAt: d?.modified ?? null,
      group: a.group ? refOfId(a.group) : null,
      inReplyTo: d?.inReplyTo ?? null,
      authority: a.authority ?? { update: true, delete: true },
      raw: d ?? null,
    };
    projections.set(a, projected);
    return projected;
  };
  const projectRef = (ref: AnnotationRef): Annotation | null => {
    const a = store.model().byId[annotationKey(ref)];
    return a ? projectAnnot(a) : null;
  };

  const listAnnots = (filter?: AnnotationFilter): Annot[] => {
    const m = store.model();
    const group = filter?.group ? annotationKey(filter.group) : undefined;
    return m.order
      .map((id) => m.byId[id])
      .filter((a): a is Annot => a !== undefined)
      .filter(
        (a) =>
          (!filter?.page || pageRefsEqual(a.page, filter.page)) &&
          (!filter?.subtype || a.subtype === filter.subtype) &&
          (filter?.author === undefined || a.data?.author === filter.author) &&
          (!group || a.group === group || a.id === group),
      );
  };
  // Unfiltered and per-page lists are what layers subscribe to: memoized per model.
  let listMemo: { model: Model; v: readonly Annotation[] } | null = null;
  const pageListMemo = new Map<number, { model: Model; v: readonly Annotation[] }>();
  const projectList = (annots: readonly Annot[]): Annotation[] =>
    annots.map(projectAnnot).filter((a): a is Annotation => a !== null);
  const listAnnotations = (filter?: AnnotationFilter): readonly Annotation[] => {
    const m = store.model();
    if (!filter) {
      if (listMemo?.model !== m) listMemo = { model: m, v: projectList(listAnnots()) };
      return listMemo.v;
    }
    if (
      filter.page &&
      filter.subtype === undefined &&
      filter.author === undefined &&
      !filter.group
    ) {
      const pon = filter.page.pageObjectNumber;
      const hit = pageListMemo.get(pon);
      if (hit?.model === m) return hit.v;
      const v = projectList(listAnnots(filter));
      pageListMemo.set(pon, { model: m, v });
      return v;
    }
    return projectList(listAnnots(filter));
  };
  let selectedMemo: { model: Model; v: readonly Annotation[] } | null = null;
  const listSelected = (): readonly Annotation[] => {
    const m = store.model();
    if (selectedMemo?.model !== m) {
      selectedMemo = {
        model: m,
        v: projectList(m.selected.map((id) => m.byId[id]).filter((a): a is Annot => !!a)),
      };
    }
    return selectedMemo.v;
  };

  const loadedOrThrow = (ref: AnnotationRef): Annot & { ref: AnnotationRef } => {
    const a = store.model().byId[annotationKey(ref)];
    if (!a || !a.ref) {
      throw new PluginError('not-found', 'annotation', 'annotation is not loaded in this document');
    }
    return a as Annot & { ref: AnnotationRef };
  };
  /** Committed, data-backed annotations in the current selection. */
  const selectedCommitted = (): Annot[] => {
    const m = store.model();
    return m.selected.map((id) => m.byId[id]).filter((a): a is Annot => !!a && !!a.ref && !!a.data);
  };

  const api = {
    get: projectRef,
    list: listAnnotations,
    listRaw: (filter?: AnnotationFilter) =>
      listAnnots(filter)
        .map((a) => a.data)
        .filter((d): d is AnnotationDTO => d != null),
    getRaw: (ref: AnnotationRef): AnnotationDTO | null =>
      store.model().byId[annotationKey(ref)]?.data ?? null,
    listSelected,
    getSelection: (): AnnotationRef[] => {
      const m = store.model();
      return m.selected.map((id) => m.byId[id]?.ref).filter((r): r is AnnotationRef => r != null);
    },
  };

  return { projectRef, listAnnots, loadedOrThrow, selectedCommitted, api };
}

export type AnnotationReads = ReturnType<typeof createAnnotationReads>;
