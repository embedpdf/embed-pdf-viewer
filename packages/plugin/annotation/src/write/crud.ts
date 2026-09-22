import { PluginError, pageRefsEqual, toPluginError, type BatchResult } from '@embedpdf/core';
import {
  applyProps,
  linkChildrenOf,
  type Annot,
  type Geom,
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
import type { Announcer } from '../services/announce';
import { ORIGIN_API, ORIGIN_UNKNOWN } from '../services/events';

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
  announce: Announcer,
  text: Pick<TextEditing, 'commitText'>,
  links: Pick<LinkWrites, 'scheduleSync'>,
) {
  /** The one engine-update path, shared by `update` and `updateSelection`. A
   *  programmatic patch changes the appearance → render live (vector). */
  const updateRaw = async (ref: AnnotationRef, patch: AnnotationPatch): Promise<void> => {
    const doc = ctx.doc;
    if (!doc) throw new Error('[annotation] no document bound');
    const pon = records.pageOf(ref);
    if (pon == null) throw new Error('[annotation] cannot resolve page for ref');
    const res = await doc.page(toPageRef(pon)).annotations.update(ref, patch);
    records.sync(res.updated, 'vector', res.appearance?.changed);
    announce.updated(res.updated, ORIGIN_API);
  };

  const wireSubtypeOf = (a: Annot): AnnotationDTO['subtype'] =>
    a.data?.subtype ?? (a.subtype as AnnotationDTO['subtype']);

  // Page-space patches lower through the same projection the gestures use.
  const geomFromPatch = (geom: Geom, patch: AnnotationGeometryPatch): Geom => {
    const bad = (): never => {
      throw new PluginError(
        'invalid-input',
        'annotation',
        `a '${patch.kind}' geometry cannot replace a '${geom.t}' geometry`,
      );
    };
    switch (patch.kind) {
      case 'rect':
        return geom.t === 'rect'
          ? {
              ...geom,
              rect: patch.bounds,
              ...(patch.rotation !== undefined ? { rot: patch.rotation } : {}),
            }
          : bad();
      case 'line':
        return geom.t === 'line' ? { ...geom, a: patch.from, b: patch.to } : bad();
      case 'polygon':
      case 'polyline':
        return geom.t === 'poly'
          ? {
              ...geom,
              points: patch.vertices.map((v) => ({ ...v })),
              closed: patch.kind === 'polygon',
            }
          : bad();
      case 'ink':
        return geom.t === 'ink'
          ? { ...geom, strokes: patch.strokes.map((s) => s.map((v) => ({ ...v }))) }
          : bad();
      case 'markup':
        return geom.t === 'quads' ? { ...geom, quads: patch.quads.map((q) => ({ ...q })) } : bad();
      case 'text':
        return geom.t === 'text'
          ? {
              ...geom,
              rect: patch.bounds,
              ...(patch.rotation !== undefined ? { rot: patch.rotation } : {}),
              ...(patch.callout !== undefined ? { callout: patch.callout ?? undefined } : {}),
            }
          : bad();
    }
  };
  const withBounds = (geom: Geom, bounds: Rect): Geom => {
    if (geom.t === 'rect' || geom.t === 'text' || geom.t === 'caret')
      return { ...geom, rect: bounds };
    throw new PluginError(
      'invalid-input',
      'annotation',
      `'${geom.t}' geometry has no bounds to set; patch its geometry`,
    );
  };
  const withRotation = (geom: Geom, rot: number): Geom => {
    if (geom.t === 'quads' || geom.t === 'caret') {
      throw new PluginError('unsupported', 'annotation', `'${geom.t}' annotations do not rotate`);
    }
    return { ...geom, rot };
  };

  const update = async (ref: AnnotationRef, patch: AnnotationPagePatch): Promise<void> => {
    const a = annotations.loadedOrThrow(ref);
    const crop = geometry.cropOf(a.page.pageObjectNumber);
    if (!crop)
      throw new PluginError('not-found', 'annotation', 'the annotation page is not loaded');
    let modified: Annot = a;
    if (patch.bounds) modified = { ...modified, geom: withBounds(modified.geom, patch.bounds) };
    if (patch.geometry)
      modified = { ...modified, geom: geomFromPatch(modified.geom, patch.geometry) };
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
    if (modified !== a) engine = { ...engine, ...(toPatch(modified, crop) ?? {}) };
    if (patch.flags) engine = { ...engine, flags: { ...a.flags, ...patch.flags } };
    if (patch.contents !== undefined) engine = { ...engine, contents: patch.contents };
    if (Object.keys(engine).length) {
      await updateRaw(a.ref, { subtype: wireSubtypeOf(a), ...engine } as AnnotationPatch);
    }
    if (patch.richText) {
      store.commit({
        t: 'setRichText',
        id: a.id,
        doc: { paragraphs: patch.richText.paragraphs },
      });
      await text.commitText(a.ref);
    }
  };
  const setRotation = async (ref: AnnotationRef, degrees: number): Promise<void> => {
    const a = annotations.loadedOrThrow(ref);
    const crop = geometry.cropOf(a.page.pageObjectNumber);
    if (!crop)
      throw new PluginError('not-found', 'annotation', 'the annotation page is not loaded');
    const modified = { ...a, geom: withRotation(a.geom, degrees) };
    const patch = toScopedPatch(modified, { kind: 'geometry' }, crop);
    if (patch) await updateRaw(a.ref, patch);
  };
  const rotationOf = (a: Annot): number => ('rot' in a.geom ? (a.geom.rot ?? 0) : 0);

  const create = (input: CreateAnnotationInput): Promise<AnnotationRef> => {
    if (!authority.canCreate()) {
      return Promise.reject(
        new PluginError('permission-denied', 'annotation', 'create requires doc.annotate.create'),
      );
    }
    if (!ctx.document()?.pages.some((p) => pageRefsEqual(p.ref, input.page))) {
      return Promise.reject(
        new PluginError(
          'not-found',
          'annotation',
          `page ${input.page.pageObjectNumber} is not in this document`,
        ),
      );
    }
    let staged: { subtype: Subtype; geom: Geom };
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
      t: 'createAnnot',
      page: input.page,
      subtype: staged.subtype,
      geom: staged.geom,
      preset: tool?.preset ?? input.tool,
      props: input.props,
      flags: { ...tool?.flags, ...input.flags },
      select: input.select ?? false,
    });
    return writes.awaitCreate(writes.createEffectsOf(effects)[0]?.id);
  };

  const createRaw = async (page: PageRef, draft: AnnotationDraft): Promise<AnnotationRef> => {
    const doc = ctx.doc;
    if (!doc) throw new Error('[annotation] no document bound');
    // Default `/F` to `print` (Acrobat parity — without it the annotation
    // disappears when printed). An EXPLICIT `flags` is respected verbatim.
    const withFlags = (
      draft.flags ? draft : { ...draft, flags: { print: true } }
    ) as AnnotationDraft;
    const res = await doc.page(page).annotations.create(withFlags);
    // Stamps have no vector render — their engine-baked /AP is the visual.
    records.sync(res.created, res.created.subtype === 'stamp' ? 'baked' : 'vector');
    announce.created(res.created, ORIGIN_API);
    return res.created.ref;
  };

  const remove = async (ref: AnnotationRef): Promise<void> => {
    const doc = ctx.doc;
    if (!doc) throw new Error('[annotation] no document bound');
    const pon = records.pageOf(ref);
    if (pon == null) throw new Error('[annotation] cannot resolve page for ref');
    await doc.page(toPageRef(pon)).annotations.delete(ref);
    store.commit({ t: 'remove', ids: [annotationKey(ref)] });
    announce.deleted(ref, toPageRef(pon), ORIGIN_API);
  };

  // ── the effect runners: every gesture's optimistic change reaches the engine here ──

  store.onEffect('create', (fx, m) => {
    const doc = ctx.doc;
    if (!doc) return;
    const a = m.byId[fx.id];
    const crop = a && geometry.cropOf(a.page.pageObjectNumber);
    const draft = a && crop ? toCreateDraft(a, crop) : null;
    if (!a || !draft) return;
    doc
      .page(a.page)
      .annotations.create(draft)
      .then(
        (res) => {
          // Reconcile temp→durable id (keeps selection/order), then attach the
          // authoritative DTO so the committed annotation is fully data-backed.
          store.commit({
            t: 'created',
            tempId: fx.id,
            id: annotationKey(res.created.ref),
            ref: res.created.ref,
          });
          records.sync(res.created, 'vector');
          // Confirmed: the record is in the model, so the event fires now and
          // a programmatic create() resolves after it (rule 2 of the contract).
          announce.created(
            res.created,
            writes.isCreateAwaited(fx.id) ? ORIGIN_API : ORIGIN_UNKNOWN,
          );
          writes.confirmCreate(fx.id, res.created.ref);
        },
        (error: unknown) => {
          store.commit({ t: 'createFailed', tempId: fx.id });
          writes.failCreate(fx.id, error);
        },
      );
  });

  store.onEffect('createGroup', (fx, m) => {
    const doc = ctx.doc;
    if (!doc) return;
    const ids = [fx.primary, ...fx.members];
    const annots = ids.map((id) => m.byId[id]);
    const primary = annots[0];
    if (
      !primary ||
      annots.some((a) => !a || a.page.pageObjectNumber !== primary.page.pageObjectNumber)
    ) {
      store.commit({ t: 'remove', ids });
      return;
    }
    const crop = geometry.cropOf(primary.page.pageObjectNumber);
    const drafts = crop
      ? annots.map((a) => (a ? toCreateDraft(a, crop) : null))
      : annots.map(() => null);
    if (drafts.some((d) => !d)) {
      store.commit({ t: 'remove', ids });
      return;
    }

    void (async () => {
      const committed: Array<{ tempId: string; ref: AnnotationRef }> = [];
      try {
        const page = doc.page(primary.page);
        const primaryResult = await page.annotations.create(drafts[0]!);
        committed.push({ tempId: fx.primary, ref: primaryResult.created.ref });
        store.commit({
          t: 'created',
          tempId: fx.primary,
          id: annotationKey(primaryResult.created.ref),
          ref: primaryResult.created.ref,
        });
        records.sync(primaryResult.created, 'vector');

        for (let i = 0; i < fx.members.length; i++) {
          const tempId = fx.members[i]!;
          const draft = {
            ...drafts[i + 1]!,
            inReplyTo: primaryResult.created.ref,
            replyType: 'group' as const,
          } as AnnotationDraft;
          const result = await page.annotations.create(draft);
          committed.push({ tempId, ref: result.created.ref });
          store.commit({
            t: 'created',
            tempId,
            id: annotationKey(result.created.ref),
            ref: result.created.ref,
          });
          records.sync(result.created, 'vector');
        }
        writes.confirmCreate(fx.primary, primaryResult.created.ref);
      } catch (error) {
        // A PDF write cannot be transactional, so compensate in reverse: remove
        // every committed part. Keep any part whose rollback itself fails in the
        // model; the UI must reflect the authoritative PDF, never hide an orphan.
        const removeIds = ids.filter((id) => !committed.some((c) => c.tempId === id));
        for (const part of [...committed].reverse()) {
          try {
            await doc.page(primary.page).annotations.delete(part.ref);
            removeIds.push(annotationKey(part.ref));
          } catch {
            // `records.sync` already made this committed annotation visible.
          }
        }
        if (removeIds.length) store.commit({ t: 'remove', ids: removeIds });
        writes.failCreate(fx.primary, error);
        console.error('[annotation] grouped annotation creation failed:', error);
      }
    })();
  });

  store.onEffect('flags', (fx, m) => {
    const doc = ctx.doc;
    if (!doc) return;
    // A `/F`-only write: the model already holds the MERGED flags, so emit
    // the full set (create/update both land on exactly these bits). The
    // re-sync PRESERVES the render source — flags never change an
    // appearance, so a baked raster stays authoritative and nothing
    // re-fetches.
    const a = m.byId[fx.id];
    if (!a || !a.ref || !a.data) return;
    const write = doc.page(a.page).annotations.update(a.ref, {
      subtype: a.data.subtype,
      flags: a.flags,
    } as AnnotationPatch);
    writes.note(a.ref, write);
    write.then(
      (res) => {
        records.sync(res.updated, a.source);
        announce.updated(res.updated, ORIGIN_UNKNOWN);
      },
      (err) => console.error('[annotation] flags write failed:', err),
    );
  });

  store.onEffect('patch', (fx, m) => {
    const doc = ctx.doc;
    if (!doc) return;
    const a = m.byId[fx.id];
    const crop = a && geometry.cropOf(a.page.pageObjectNumber);
    const patch = a && a.ref && crop ? toScopedPatch(a, fx.scope, crop) : null;
    if (!a || !a.ref || !patch) return;
    const write = doc.page(a.page).annotations.update(a.ref, patch);
    writes.note(a.ref, write);
    // Re-sync from the authoritative DTO, PRESERVING the source the gesture
    // chose: a move kept it baked (raster rides along), a resize flipped it to
    // vector. So the round-trip can't silently re-bake an edited annotation.
    //
    // `apVersion` is driven by the ENGINE'S echo (`res.appearance.changed`),
    // not by guessing from the patch we sent: the engine value-diffs the
    // patch, verifies rigid translations, and reports whether the document's
    // appearance definition actually changed. Preserved moves (including
    // widget/stamp drags — their /AP survives now) cost zero re-fetches;
    // regenerated appearances re-fetch exactly once, when the engine is
    // done — never one-behind. The core's `fx.apChanged` prediction stays
    // advisory (a future pre-commit "this will replace an imported
    // appearance" affordance); the echo is the authority.
    write.then(
      (res) => {
        records.sync(res.updated, a.source, res.appearance.changed);
        announce.updated(res.updated, ORIGIN_UNKNOWN);
        // Attached link children follow their parent's COMMITTED geometry
        // — scheduled after the parent's own write resolves, from ONE
        // place, so no gesture ever has to know the children exist.
        if (linkChildrenOf(store.model(), fx.id).length) void links.scheduleSync(fx.id, 'keep');
      },
      // A refused write (a race, a stale /access) must not leave the
      // optimistic patch as a lie. The effect runs AFTER the reducer
      // applied it, so the pre-image is the annot's own canonical DTO —
      // the last COMMITTED truth — re-ingested with fresh authority.
      () => {
        if (a.data && crop)
          store.commit({ t: 'upsert', annots: [records.ingest(a.data, crop, a.source)] });
      },
    );
  });

  store.onEffect('delete', (fx) => {
    const doc = ctx.doc;
    if (!doc) return;
    const write = doc.page(fx.ref.page).annotations.delete(fx.ref);
    writes.note(fx.ref, write);
    write.then(
      () => announce.deleted(fx.ref, fx.ref.page, ORIGIN_UNKNOWN),
      () => {},
    );
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
