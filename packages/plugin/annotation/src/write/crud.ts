import { PluginError, pageRefsEqual, toPluginError, type BatchResult } from '@embedpdf/core';
import {
  applyProps,
  capsFor,
  linkChildrenOf,
  type ModelAnnotation,
  type ContentGeometry,
  type Rect,
  type Subtype,
} from '@embedpdf/core-annotation';
import {
  annotationKey,
  toPageRef,
  type AnnotationDTO,
  type AnnotationDraft,
  type AnnotationPatch,
  type AnnotationRef,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import type { AnnotationGeometryPatch, AnnotationPatch as AnnotationPagePatch } from '../contract';
import { geometryFromInput, type CreateAnnotationInput } from '../create-input';
import type { AnnotationReads } from '../read/annotations';
import { toCreateDraft, toPatch, toScopedPatch } from '../repository';
import type { AnnotationContext, AnnotationServices } from '../services';
import type { LinkWrites } from './links';
import type { TextEditing } from './text-editing';

/**
 * Create, update and delete: the public page-space verbs, their raw
 * (PDF-space) twins, and the effect runners that commit every gesture's
 * optimistic change to the engine and re-sync from its confirmed record.
 */
export function createCrud(
  ctx: Pick<AnnotationContext, 'doc' | 'document'>,
  {
    store,
    geometry,
    records,
    authority,
    writes,
    tools,
  }: Pick<AnnotationServices, 'store' | 'geometry' | 'records' | 'authority' | 'writes' | 'tools'>,
  annotations: Pick<AnnotationReads, 'loadedOrThrow'>,
  text: Pick<TextEditing, 'commitText'>,
  links: Pick<LinkWrites, 'scheduleSync'>,
) {
  /**
   * The one engine-update path, shared by `update` and `updateSelection`. The
   * confirmed record reaches the model through the fold before this resolves.
   */
  const updateRaw = async (ref: AnnotationRef, patch: AnnotationPatch): Promise<void> => {
    const pageObjectNumber = records.pageOf(ref);
    if (pageObjectNumber == null) {
      throw new PluginError(
        'not-found',
        'annotation',
        'cannot resolve the page of this annotation',
      );
    }
    // A programmatic patch may change the appearance: render the record live
    // from its data rather than show a raster that is about to go stale.
    // Opaque kinds (stamps, icons) have no live rendering and keep their raster.
    const current = store.model().byId[annotationKey(ref)];
    if (current && current.source !== 'vector' && !capsFor(current.subtype).opaqueBody) {
      store.commit({ type: 'upsert', annots: [{ ...current, source: 'vector' }] });
    }
    await ctx.doc.page(toPageRef(pageObjectNumber)).annotations.update(ref, patch);
  };

  const wireSubtypeOf = (annotation: ModelAnnotation): AnnotationDTO['subtype'] =>
    annotation.data?.subtype ?? (annotation.subtype as AnnotationDTO['subtype']);

  // Page-space patches lower through the same projection the gestures use.
  const geomFromPatch = (
    geometry: ContentGeometry,
    patch: AnnotationGeometryPatch,
  ): ContentGeometry => {
    const bad = (): never => {
      throw new PluginError(
        'invalid-input',
        'annotation',
        `a '${patch.kind}' geometry cannot replace a '${geometry.kind}' geometry`,
      );
    };
    switch (patch.kind) {
      case 'rect':
        return geometry.kind === 'rect'
          ? {
              ...geometry,
              rect: patch.bounds,
              ...(patch.rotation !== undefined ? { rot: patch.rotation } : {}),
            }
          : bad();
      case 'line':
        return geometry.kind === 'line' ? { ...geometry, a: patch.from, b: patch.to } : bad();
      case 'polygon':
      case 'polyline':
        return geometry.kind === 'poly'
          ? {
              ...geometry,
              points: patch.vertices.map((point) => ({ ...point })),
              closed: patch.kind === 'polygon',
            }
          : bad();
      case 'ink':
        return geometry.kind === 'ink'
          ? {
              ...geometry,
              strokes: patch.strokes.map((stroke) => stroke.map((point) => ({ ...point }))),
            }
          : bad();
      case 'markup':
        return geometry.kind === 'quads'
          ? { ...geometry, quads: patch.quads.map((quad) => ({ ...quad })) }
          : bad();
      case 'text':
        return geometry.kind === 'text'
          ? {
              ...geometry,
              rect: patch.bounds,
              ...(patch.rotation !== undefined ? { rot: patch.rotation } : {}),
              ...(patch.callout !== undefined ? { callout: patch.callout ?? undefined } : {}),
            }
          : bad();
    }
  };
  const withBounds = (geometry: ContentGeometry, bounds: Rect): ContentGeometry => {
    if (geometry.kind === 'rect' || geometry.kind === 'text' || geometry.kind === 'caret')
      return { ...geometry, rect: bounds };
    throw new PluginError(
      'invalid-input',
      'annotation',
      `'${geometry.kind}' geometry has no bounds to set; patch its geometry`,
    );
  };
  const withRotation = (geometry: ContentGeometry, rot: number): ContentGeometry => {
    if (geometry.kind === 'quads' || geometry.kind === 'caret') {
      throw new PluginError(
        'unsupported',
        'annotation',
        `'${geometry.kind}' annotations do not rotate`,
      );
    }
    return { ...geometry, rot };
  };

  const update = async (ref: AnnotationRef, patch: AnnotationPagePatch): Promise<void> => {
    const annotation = annotations.loadedOrThrow(ref);
    const crop = geometry.cropOf(annotation.page.pageObjectNumber);
    if (!crop)
      throw new PluginError('not-found', 'annotation', 'the annotation page is not loaded');
    let modified: ModelAnnotation = annotation;
    if (patch.bounds)
      modified = { ...modified, geometry: withBounds(modified.geometry, patch.bounds) };
    if (patch.geometry)
      modified = { ...modified, geometry: geomFromPatch(modified.geometry, patch.geometry) };
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
      store.commit({
        type: 'setRichText',
        id: annotation.id,
        doc: { paragraphs: patch.richText.paragraphs },
      });
      await text.commitText(annotation.ref);
    }
  };
  const setRotation = async (ref: AnnotationRef, degrees: number): Promise<void> => {
    const annotation = annotations.loadedOrThrow(ref);
    const crop = geometry.cropOf(annotation.page.pageObjectNumber);
    if (!crop)
      throw new PluginError('not-found', 'annotation', 'the annotation page is not loaded');
    const modified = { ...annotation, geometry: withRotation(annotation.geometry, degrees) };
    const patch = toScopedPatch(modified, { kind: 'geometry' }, crop);
    if (patch) await updateRaw(annotation.ref, patch);
  };
  const rotationOf = (annotation: ModelAnnotation): number =>
    'rot' in annotation.geometry ? (annotation.geometry.rot ?? 0) : 0;

  const create = (input: CreateAnnotationInput): Promise<AnnotationRef> => {
    if (!authority.canCreate()) {
      return Promise.reject(
        new PluginError('permission-denied', 'annotation', 'create requires doc.annotate.create'),
      );
    }
    if (!ctx.document()?.pages.some((pageInfo) => pageRefsEqual(pageInfo.ref, input.page))) {
      return Promise.reject(
        new PluginError(
          'not-found',
          'annotation',
          `page ${input.page.pageObjectNumber} is not in this document`,
        ),
      );
    }
    let staged: { subtype: Subtype; geometry: ContentGeometry };
    try {
      staged = geometryFromInput(input);
    } catch (error) {
      return Promise.reject(error);
    }
    const tool = input.tool ? tools.get(input.tool) : undefined;
    if (input.tool && !tool) {
      return Promise.reject(
        new PluginError('not-found', 'annotation', `unknown tool '${input.tool}'`),
      );
    }
    // One commit path: the same `createAnnot` → `create` effect a draw tool
    // takes, so defaults, flags, optimistic staging, engine write and
    // reconciliation are identical for pointer and API.
    const effects = store.commit({
      type: 'createAnnot',
      page: input.page,
      subtype: staged.subtype,
      geometry: staged.geometry,
      preset: tool?.preset ?? input.tool,
      props: input.props,
      flags: { ...tool?.flags, ...input.flags },
      select: input.select ?? false,
    });
    return writes.awaitCreate(writes.createEffectsOf(effects)[0]?.id);
  };

  const createRaw = async (page: PageRef, draft: AnnotationDraft): Promise<AnnotationRef> => {
    // Default `/F` to `print`, as Acrobat does: without it the annotation
    // disappears when printed. An explicit `flags` is kept as given.
    const withFlags = (
      draft.flags ? draft : { ...draft, flags: { print: true } }
    ) as AnnotationDraft;
    const result = await ctx.doc.page(page).annotations.create(withFlags);
    return result.created.ref;
  };

  const remove = async (ref: AnnotationRef): Promise<void> => {
    const pageObjectNumber = records.pageOf(ref);
    if (pageObjectNumber == null) {
      throw new PluginError(
        'not-found',
        'annotation',
        'cannot resolve the page of this annotation',
      );
    }
    await ctx.doc.page(toPageRef(pageObjectNumber)).annotations.delete(ref);
  };

  /**
   * After an optimistic create's engine write resolves: the fold normally
   * matched the confirmed record to the temporary one by its /NM already.
   * If it could not (an engine that does not echo /NM), reconcile here.
   */
  const reconcileCreate = (tempId: string, ref: AnnotationRef, nm: string | undefined): void => {
    const unmatched = nm === undefined || writes.claimCreate(nm) !== undefined;
    const model = store.model();
    if (!unmatched || !model.byId[tempId]) return;
    const id = annotationKey(ref);
    if (model.byId[id]) {
      const wasSelected = model.selected.includes(tempId);
      store.commit({ type: 'remove', ids: [tempId] });
      if (wasSelected) store.commit({ type: 'select', ids: [id], add: true });
    } else {
      store.commit({ type: 'created', tempId, id, ref });
    }
  };

  // ── the effect runners: every gesture's optimistic change reaches the engine here ──

  store.onEffect('create', (effect, model) => {
    const staged = model.byId[effect.id];
    const crop = staged && geometry.cropOf(staged.page.pageObjectNumber);
    const draft = staged && crop ? toCreateDraft(staged, crop) : null;
    if (!staged || !draft) return;
    if (draft.nm) writes.expectCreate(draft.nm, effect.id);
    ctx.doc
      .page(staged.page)
      .annotations.create(draft)
      .then(
        (result) => {
          reconcileCreate(effect.id, result.created.ref, draft.nm);
          writes.confirmCreate(effect.id, result.created.ref);
        },
        (error: unknown) => {
          if (draft.nm) writes.claimCreate(draft.nm);
          store.commit({ type: 'createFailed', tempId: effect.id });
          writes.failCreate(effect.id, error);
        },
      );
  });

  store.onEffect('createGroup', (effect, model) => {
    const doc = ctx.doc;
    const ids = [effect.primary, ...effect.members];
    const staged = ids.map((id) => model.byId[id]);
    const primary = staged[0];
    if (
      !primary ||
      staged.some(
        (record) => !record || record.page.pageObjectNumber !== primary.page.pageObjectNumber,
      )
    ) {
      store.commit({ type: 'remove', ids });
      return;
    }
    const crop = geometry.cropOf(primary.page.pageObjectNumber);
    const drafts = crop
      ? staged.map((record) => (record ? toCreateDraft(record, crop) : null))
      : staged.map(() => null);
    if (drafts.some((draft) => !draft)) {
      store.commit({ type: 'remove', ids });
      return;
    }

    void (async () => {
      const committed: Array<{ tempId: string; ref: AnnotationRef }> = [];
      const page = doc.page(primary.page);
      const createPart = async (tempId: string, draft: AnnotationDraft) => {
        if (draft.nm) writes.expectCreate(draft.nm, tempId);
        const result = await page.annotations.create(draft);
        committed.push({ tempId, ref: result.created.ref });
        reconcileCreate(tempId, result.created.ref, draft.nm);
        return result.created.ref;
      };
      try {
        const primaryRef = await createPart(effect.primary, drafts[0]!);
        for (let index = 0; index < effect.members.length; index++) {
          await createPart(effect.members[index]!, {
            ...drafts[index + 1]!,
            inReplyTo: primaryRef,
            replyType: 'group',
          } as AnnotationDraft);
        }
        writes.confirmCreate(effect.primary, primaryRef);
      } catch (error) {
        // A PDF write cannot be transactional, so compensate in reverse:
        // delete every committed part (the fold removes each from the
        // model) and drop the parts that were never written. A part whose
        // deletion fails stays visible: the view must match the PDF.
        const unwritten = ids.filter((id) => !committed.some((part) => part.tempId === id));
        for (const part of [...committed].reverse()) {
          await page.annotations.delete(part.ref).catch(() => {});
        }
        if (unwritten.length) store.commit({ type: 'remove', ids: unwritten });
        writes.failCreate(effect.primary, error);
        console.error('[annotation] grouped annotation creation failed:', error);
      }
    })();
  });

  store.onEffect('flags', (effect, model) => {
    // A `/F`-only write: the model already holds the merged flags, so send
    // the full set. Flags never change an appearance, so nothing re-fetches.
    const record = model.byId[effect.id];
    if (!record || !record.ref || !record.data) return;
    const write = ctx.doc.page(record.page).annotations.update(record.ref, {
      subtype: record.data.subtype,
      flags: record.flags,
    } as AnnotationPatch);
    writes.note(record.ref, write);
    write.catch((error) => console.error('[annotation] flags write failed:', error));
  });

  store.onEffect('patch', (effect, model) => {
    const record = model.byId[effect.id];
    const crop = record && geometry.cropOf(record.page.pageObjectNumber);
    const patch = record && record.ref && crop ? toScopedPatch(record, effect.scope, crop) : null;
    if (!record || !record.ref || !patch) return;
    const write = ctx.doc.page(record.page).annotations.update(record.ref, patch);
    writes.note(record.ref, write);
    write.then(
      () => {
        // Attached link children follow their parent's committed geometry,
        // synced from this one place after the parent's write resolves.
        if (linkChildrenOf(store.model(), effect.id).length) {
          void links.scheduleSync(effect.id, 'keep');
        }
      },
      // A refused write (a race, a revoked grant) must not leave the
      // optimistic patch on screen: restore the record's last confirmed
      // state, re-ingested with fresh authority.
      () => {
        if (record.data && crop) {
          store.commit({
            type: 'upsert',
            annots: [records.ingest(record.data, crop, record.source)],
          });
        }
      },
    );
  });

  store.onEffect('delete', (effect) => {
    const write = ctx.doc.page(effect.ref.page).annotations.delete(effect.ref);
    writes.note(effect.ref, write);
    write.catch(() => {});
  });

  const api = {
    create,
    createMany: (inputs: readonly CreateAnnotationInput[]) =>
      writes.batchOver(
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
      writes.batchOver(
        refs,
        (ref) => update(ref, patch),
        (ref) => ref,
      ),
    updateRaw: (ref: AnnotationRef, patch: AnnotationPatch) => updateRaw(ref, patch),
    setRotation,
    rotateBy: (ref: AnnotationRef, delta: number) =>
      setRotation(ref, rotationOf(annotations.loadedOrThrow(ref)) + delta),
    delete: remove,
    deleteMany: (refs: readonly AnnotationRef[]) =>
      writes.batchOver(
        refs,
        (ref) => remove(ref),
        (ref) => ref,
      ),
  };

  return { updateRaw, setRotation, rotationOf, api };
}

export type Crud = ReturnType<typeof createCrud>;

/** Re-exported for the areas that lower errors the same way. */
export { toPluginError };
