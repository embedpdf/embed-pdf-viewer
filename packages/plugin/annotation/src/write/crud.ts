/**
 * Create, update and delete: the public verbs and their raw twins. `create`
 * takes the same path a draw tool does (the core's `createAnnot`, so defaults,
 * flags and the new record's pending entry are identical); every other verb
 * states its change through `store.apply`, so it shows at once and is written,
 * settled and refused exactly like a gesture's.
 */
import { PluginError, pageRefsEqual, type BatchResult } from '@embedpdf/core';
import {
  FLAG_KEYS,
  annotTransformable,
  applyProps,
  propsFor,
  type AnnotationPropsPatch,
  type ModelGeometry,
  type ModelAnnotation,
  type Subtype,
} from '@embedpdf/core-annotation';
import {
  type AnnotationDraft,
  type AnnotationPatch,
  type AnnotationRef,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import type { AnnotationPatch as AnnotationPagePatch } from '../contract';
import { geometryFromInput, type CreateAnnotationInput } from '../create-input';
import type { AnnotationReads } from '../read/annotations';
import { patchBetween } from '@embedpdf/core-annotation';
import type { AnnotationContext, AnnotationServices } from '../services';
import { appliedOrThrow, appliedRefOf, batchOver, createdRefOf, throwIfFailed } from './outcomes';
import {
  geometryWithBounds,
  geometryWithPatch,
  geometryWithRotation,
  rotationOf,
} from './page-patch';
import type { TextEditing } from './text-editing';

/** Whether a props patch speaks to this annotation: it may change, and its kind takes a key. */
const propsApply = (annotation: ModelAnnotation, props: AnnotationPropsPatch): boolean => {
  const takes = new Set(propsFor(annotation.subtype).map((spec) => spec.key));
  return (
    annotTransformable(annotation) &&
    Object.keys(props).some((key) => takes.has(key as keyof AnnotationPropsPatch))
  );
};

export function createCrud(
  ctx: Pick<AnnotationContext, 'doc' | 'document'>,
  {
    store,
    geometry,
    authority,
    tools,
  }: Pick<AnnotationServices, 'store' | 'geometry' | 'authority' | 'tools'>,
  annotations: Pick<AnnotationReads, 'loadedOrThrow' | 'pageOf'>,
  text: Pick<TextEditing, 'flushText'>,
) {
  /** The one engine-update path of the programmatic verbs: the patch as given. */
  const updateRaw = async (ref: AnnotationRef, patch: AnnotationPatch): Promise<void> => {
    await appliedOrThrow(store.apply([{ type: 'update', ref, patch }]));
  };

  const update = async (ref: AnnotationRef, patch: AnnotationPagePatch): Promise<void> => {
    const annotation = annotations.loadedOrThrow(ref);
    let modified: ModelAnnotation = annotation;
    if (patch.bounds) {
      modified = { ...modified, geometry: geometryWithBounds(modified.geometry, patch.bounds) };
    }
    if (patch.geometry) {
      modified = { ...modified, geometry: geometryWithPatch(modified.geometry, patch.geometry) };
    }
    if (patch.props) {
      const applied = applyProps(modified, patch.props);
      // Nothing applied: a value it already has, or a patch it doesn't take.
      if (applied) modified = applied;
      else if (!propsApply(modified, patch.props)) {
        throw new PluginError(
          'invalid-input',
          'annotation',
          'the props patch does not apply to this annotation',
        );
      }
    }
    // What changed, as the engine takes it; each flag is its own field, so
    // only the ones the patch names are written.
    const engine: Record<string, unknown> = {
      ...patchBetween(annotation, modified),
      ...patch.flags,
      ...(patch.contents !== undefined ? { contents: patch.contents } : {}),
    };
    if (Object.keys(engine).some((name) => name !== 'subtype')) {
      await updateRaw(annotation.ref, {
        ...engine,
        subtype: annotation.annotation.subtype,
      } as AnnotationPatch);
    }
    if (patch.richText) {
      const commit = store.commit({
        type: 'setRichText',
        id: annotation.id,
        doc: { paragraphs: patch.richText.paragraphs },
      });
      void text.flushText(annotation.id);
      throwIfFailed(await commit.written);
    }
  };

  const setRotation = async (ref: AnnotationRef, degrees: number): Promise<void> => {
    const annotation = annotations.loadedOrThrow(ref);
    const modified = {
      ...annotation,
      geometry: geometryWithRotation(annotation.geometry, degrees),
    };
    const patch = patchBetween(annotation, modified);
    if (patch) await updateRaw(annotation.ref, patch);
  };

  const create = async (input: CreateAnnotationInput): Promise<AnnotationRef> => {
    if (!authority.canCreate()) {
      throw new PluginError(
        'permission-denied',
        'annotation',
        'create requires doc.annotate.create',
      );
    }
    if (!ctx.document()?.pages.some((pageInfo) => pageRefsEqual(pageInfo.ref, input.page))) {
      throw new PluginError(
        'not-found',
        'annotation',
        `page ${input.page.pageObjectNumber} is not in this document`,
      );
    }
    const staged: { subtype: Subtype; geometry: ModelGeometry } = geometryFromInput(input);
    const tool = input.tool ? tools.get(input.tool) : undefined;
    if (input.tool && !tool) {
      throw new PluginError('not-found', 'annotation', `unknown tool '${input.tool}'`);
    }
    return createdRefOf(
      store.commit({
        type: 'createAnnot',
        page: input.page,
        subtype: staged.subtype,
        geometry: staged.geometry,
        preset: tool?.preset ?? input.tool,
        props: input.props,
        flags: { ...tool?.flags, ...input.flags },
        select: input.select ?? false,
      }),
    );
  };

  const createRaw = async (page: PageRef, draft: AnnotationDraft): Promise<AnnotationRef> => {
    // Default `/F` to `print`, as Acrobat does: without it the annotation
    // disappears when printed. A draft that sets any flag is kept as given.
    const setsFlags = FLAG_KEYS.some(
      (key) => (draft as Partial<Record<string, unknown>>)[key] !== undefined,
    );
    const withFlags = (setsFlags ? draft : { ...draft, print: true }) as AnnotationDraft;
    return appliedRefOf(store.apply([{ type: 'create', page, draft: withFlags }]));
  };

  const remove = async (ref: AnnotationRef): Promise<void> => {
    await appliedOrThrow(store.apply([{ type: 'delete', ref }]));
  };

  const api = {
    create,
    createMany: (inputs: readonly CreateAnnotationInput[]) =>
      batchOver(
        inputs,
        (input) => create(input),
        (_input, out) => out ?? null,
      ),
    createRaw,
    update,
    updateMany: (
      refs: readonly AnnotationRef[],
      patch: AnnotationPagePatch,
    ): Promise<BatchResult<AnnotationRef, AnnotationRef>> =>
      batchOver(
        refs,
        (ref) => update(ref, patch),
        (ref) => ref,
      ),
    updateRaw,
    setRotation,
    rotateBy: (ref: AnnotationRef, delta: number) =>
      setRotation(ref, rotationOf(annotations.loadedOrThrow(ref).geometry) + delta),
    delete: remove,
    deleteMany: (refs: readonly AnnotationRef[]) =>
      batchOver(
        refs,
        (ref) => remove(ref),
        (ref) => ref,
      ),
  };

  return { updateRaw, setRotation, api };
}

export type Crud = ReturnType<typeof createCrud>;
