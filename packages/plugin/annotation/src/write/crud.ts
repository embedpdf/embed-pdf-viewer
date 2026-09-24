/**
 * Create, update and delete: the public page-space verbs and their raw
 * (PDF-space) twins. `create` takes the same path a draw tool does (the core's
 * `createAnnot`, so defaults, flags and the new record's pending entry are
 * identical); the update and delete verbs write straight to the engine, and
 * the records mirror shows their result before they resolve.
 */
import { PluginError, pageRefsEqual, type BatchResult } from '@embedpdf/core';
import {
  FLAG_KEYS,
  applyProps,
  type ContentGeometry,
  type ModelAnnotation,
  type Subtype,
} from '@embedpdf/core-annotation';
import {
  type AnnotationDTO,
  type AnnotationDraft,
  type AnnotationPatch,
  type AnnotationRef,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import type { AnnotationPatch as AnnotationPagePatch } from '../contract';
import { geometryFromInput, type CreateAnnotationInput } from '../create-input';
import type { AnnotationReads } from '../read/annotations';
import { toPatch, toScopedPatch } from '../repository';
import type { AnnotationContext, AnnotationServices } from '../services';
import { named } from './named';
import { batchOver, createdRefOf, throwIfFailed } from './outcomes';
import {
  geometryWithBounds,
  geometryWithPatch,
  geometryWithRotation,
  rotationOf,
} from './page-patch';
import type { TextEditing } from './text-editing';

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
  /** The one engine-update path of the programmatic verbs. */
  const updateRaw = async (ref: AnnotationRef, patch: AnnotationPatch): Promise<void> => {
    await ctx.doc.page(annotations.pageOf(ref)).annotations.update(ref, patch);
  };

  const wireSubtypeOf = (annotation: ModelAnnotation): AnnotationDTO['subtype'] =>
    annotation.data?.subtype ?? (annotation.subtype as AnnotationDTO['subtype']);

  const cropOrThrow = (annotation: ModelAnnotation) => {
    const crop = geometry.cropOf(annotation.page.pageObjectNumber);
    if (!crop)
      throw new PluginError('not-found', 'annotation', 'the annotation page is not loaded');
    return crop;
  };

  const update = async (ref: AnnotationRef, patch: AnnotationPagePatch): Promise<void> => {
    const annotation = annotations.loadedOrThrow(ref);
    const crop = cropOrThrow(annotation);
    let modified: ModelAnnotation = annotation;
    if (patch.bounds) {
      modified = { ...modified, geometry: geometryWithBounds(modified.geometry, patch.bounds) };
    }
    if (patch.geometry) {
      modified = { ...modified, geometry: geometryWithPatch(modified.geometry, patch.geometry) };
    }
    if (patch.props) {
      const applied = applyProps(modified, patch.props);
      if (!applied) {
        throw new PluginError(
          'invalid-input',
          'annotation',
          'the props patch does not apply to this annotation',
        );
      }
      modified = applied;
    }
    let engine: Record<string, unknown> = {};
    if (modified !== annotation) engine = { ...engine, ...(toPatch(modified, crop) ?? {}) };
    if (patch.flags) engine = { ...engine, flags: { ...annotation.flags, ...patch.flags } };
    if (patch.contents !== undefined) engine = { ...engine, contents: patch.contents };
    if (Object.keys(engine).length) {
      await updateRaw(annotation.ref, {
        subtype: wireSubtypeOf(annotation),
        ...engine,
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
    const crop = cropOrThrow(annotation);
    const modified = {
      ...annotation,
      geometry: geometryWithRotation(annotation.geometry, degrees),
    };
    const patch = toScopedPatch(modified, { kind: 'geometry' }, crop);
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
    const staged: { subtype: Subtype; geometry: ContentGeometry } = geometryFromInput(input);
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
    const result = await ctx.doc.page(page).annotations.create(named(withFlags));
    return result.created.ref;
  };

  const remove = async (ref: AnnotationRef): Promise<void> => {
    await ctx.doc.page(annotations.pageOf(ref)).annotations.delete(ref);
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
