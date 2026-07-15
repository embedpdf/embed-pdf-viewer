import {
  EngineError,
  EngineErrorCode,
  PDF_SUBTYPE_TO_CODE,
  type AnnotationActor,
  type BlendMode,
  type AnnotationCreateResult,
  type AnnotationDeleteResult,
  type AnnotationDTO,
  type WireAnnotationDraft,
  type AnnotationListMutationMeta,
  type AnnotationMoveResult,
  type WireAnnotationPatch,
  type WireResourceMap,
  type AnnotationRef,
  type AnnotationStableId,
  type AnnotationUpdateResult,
  type PageObjectNumber,
  PdfAnnotationSubtypeCode,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/pdf-runtime';

import { blendModeFromCode, blendModeToCode } from './internal/blendMode';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import type { FontRegistrar } from '../fonts';
import { captureOrStampStableId } from './internal/identity/captureOrStampStableId';
import { resolveAnnotPtr } from './internal/identity/resolveAnnotationPointer';
import { computeMutationImpact } from './internal/mutations/computeMutationImpact';
import { readAnnotString } from './internal/read/annotationReadPrimitives';
import {
  joinWidgetFieldNumbers,
  resolveWidgetFieldObjectNumber,
} from './internal/read/joinWidgetField';
import { readAnnotationFromPtr } from './internal/read/readAnnotationFromPtr';
import type { AnnotationWriteContext } from './internal/write/annotationWriteContext';
import {
  applyDraft,
  applyPatch,
  preflightDraft,
  preflightPatch,
} from './internal/write/annotationWriterRegistry';
import {
  writeAnnotationAuthor,
  writeAnnotationModified,
} from './internal/write/writeAnnotationBase';
import { writeAnnotationRelationship } from './internal/write/writeAnnotationRelationship';
import {
  applyEmbedMetadataOnCreate,
  applyEmbedMetadataOnUpdate,
} from './internal/write/writeEmbedMetadata';

/**
 * Synchronous orchestrator for `create` / `update` / `delete` annotation
 * mutations. Owns the dance between PDFium calls, identity bookkeeping,
 * revision bumping (only for structural ops), and the
 * `AnnotationListMutationMeta` envelope every result type carries.
 *
 * Lives in `engine-services` (not the worker hosts) so the local Web
 * Worker, the Node `worker_thread` server, and any future direct-thread
 * embedding share the exact same code path. The only difference between
 * them is the underlying `PdfRuntimeModule` (WASM vs native).
 *
 * Identity rules enforced here, locked with the user:
 *   - `create` always uses `EPDFPage_CreateAnnot` (the fork helper that
 *     creates an INDIRECT object) so new annotations are born durable.
 *     If the fork helper ever returns a direct object, we throw — never
 *     silently produce a weak annotation.
 *   - `update` is non-structural. /NM is monotonic per annotation:
 *       * already durable (objectNumber > 0 OR /NM present) -> NEVER touched.
 *       * weak (no objectNumber, no /NM) -> stamp engine-generated UUID v4.
 *     The patch type has no `nm` field, so the writer surface enforces
 *     "callers cannot rename a stable id" at the type level. Updates do
 *     not bump the revision.
 *   - `delete` is subtype-agnostic. Three native fork helpers handle the
 *     three ref kinds without round-tripping through index. For weak
 *     deletes (`AnnotationStableId | null`-shaped result), we set
 *     `deleted: null` so callers can detect that no durable id was
 *     reportable.
 */
export class AnnotationMutator {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
    /**
     * Registered-font registry for this thread. Optional: when absent, the
     * registered-font authoring path is unavailable and a draft/patch carrying
     * a `registeredFontKey` fails loud (rather than silently using a standard
     * font). Standard-font FreeText and all other subtypes are unaffected.
     */
    private readonly fonts?: FontRegistrar,
  ) {}

  /** Build the per-write context handed to subtype writers: font resolver
   *  (FreeText `/DA`), doc/page pointers and binary resources (stamp). */
  private writeContext(pagePtr: Ptr, resources?: WireResourceMap): AnnotationWriteContext {
    const fonts = this.fonts;
    return {
      ...(fonts ? { resolveRegisteredFontId: (key: string) => fonts.idFor(key) } : {}),
      docPtr: this.session.requireDocPtr(),
      pagePtr,
      ...(resources ? { resources } : {}),
    };
  }

  create(
    pageObjectNumber: PageObjectNumber,
    draft: WireAnnotationDraft,
    signal: AbortSignal,
    actor?: AnnotationActor,
    resources?: WireResourceMap,
  ): AnnotationCreateResult {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const subtypeCode = PDF_SUBTYPE_TO_CODE[draft.subtype];

    const pool = this.session.pagePool();
    const pagePtr = pool.acquire(pageObjectNumber);
    try {
      this.ensureKnownWeakStateFromPage(pageObjectNumber, pagePtr);
      const writeCtx = this.writeContext(pagePtr, resources);
      preflightDraft(draft, writeCtx);
      // `create` is append-only: PDFium drops the new annotation at
      // `index = previousCount`, so no existing index ever shifts. Per
      // the locked rule in `computeMutationImpact`, that means create is
      // non-invalidating — no per-page revision bump, no weak-ref
      // staleness signal. The DTO is read against the page's current
      // revision (which both pre-existing and freshly-created
      // annotations share, since nothing bumped it).
      const pageStateBefore = this.session.pageState(pageObjectNumber);
      throwIfAborted(signal);

      const annotPtr = fn.EPDFPage_CreateAnnot(pagePtr, subtypeCode);
      if (!annotPtr) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `EPDFPage_CreateAnnot returned NULL for subtype '${draft.subtype}'`,
        );
      }

      let dto;
      let newObjNum: number;
      let newIndex: number;
      let linkedParentId: AnnotationStableId | null = null;
      try {
        applyDraft(fn, mem, annotPtr, draft, writeCtx);
        // Link to an /IRT parent when the draft asks for one. This may
        // promote a weak/direct parent to an indirect object (non-structural,
        // no index shift); the strengthened parent id is folded into
        // `meta.changed` below so the client can reconcile its cached ref.
        if (draft.inReplyTo !== undefined || draft.replyType !== undefined) {
          linkedParentId = writeAnnotationRelationship(
            this.runtime,
            this.session,
            pagePtr,
            annotPtr,
            pageObjectNumber,
            { inReplyTo: draft.inReplyTo, replyType: draft.replyType },
          );
        }
        // Stamp identity + modification metadata AFTER the per-subtype
        // writer so a buggy subtype writer can't clobber them:
        //   /T             ← actor.displayName  (when present)
        //   /M             ← now                 (always)
        //   /EMBD_Metadata ← actor.userId/groupId (when present)
        if (actor?.displayName) {
          writeAnnotationAuthor(fn, mem, annotPtr, actor.displayName);
        }
        writeAnnotationModified(fn, mem, annotPtr);
        applyEmbedMetadataOnCreate(fn, mem, annotPtr, actor);
        // Bake the /AP appearance stream now that every visual field is
        // written, so the new annotation ships with a standard-compliant
        // appearance (matches the v2 engine).
        this.regenerateAppearance(annotPtr, pagePtr, draft.blendMode);

        newObjNum = fn.EPDFAnnot_GetObjectNumber(annotPtr);
        if (newObjNum <= 0) {
          // Defensive: the fork helper guarantees an indirect object.
          throw new EngineError(
            EngineErrorCode.Unknown,
            `EPDFPage_CreateAnnot produced a direct object (no objectNumber); fork helper invariant broken`,
          );
        }
        newIndex = fn.FPDFPage_GetAnnotIndex(pagePtr, annotPtr);
        if (newIndex < 0) {
          throw new EngineError(
            EngineErrorCode.Unknown,
            `FPDFPage_GetAnnotIndex returned ${newIndex} for freshly created annotation`,
          );
        }

        dto = readAnnotationFromPtr(
          fn,
          mem,
          annotPtr,
          pageObjectNumber,
          newIndex,
          pageStateBefore.revision,
        );
        joinWidgetFieldNumbers(this.runtime, this.session, [dto]);
      } finally {
        fn.FPDFPage_CloseAnnot(annotPtr);
      }

      const createdId: AnnotationStableId = { kind: 'objectNumber', value: newObjNum };
      // Linking promoted the parent in place, so the page may now have one
      // fewer weak annotation — refresh the flag that future delete/move
      // refetch decisions read. (A plain create touches no existing annot.)
      if (linkedParentId) this.recordWeakStateFromPage(pageObjectNumber, pagePtr);
      const pageStateAfter = this.session.pageState(pageObjectNumber);
      const meta: AnnotationListMutationMeta = computeMutationImpact({
        mutation: 'create',
        pageStateBefore,
        pageStateAfter,
        changed: linkedParentId ? [createdId, linkedParentId] : [createdId],
      });

      return { created: dto, meta };
    } finally {
      pool.release(pageObjectNumber);
    }
  }

  update(
    ref: AnnotationRef,
    patch: WireAnnotationPatch,
    signal: AbortSignal,
    actor?: AnnotationActor,
    resources?: WireResourceMap,
  ): AnnotationUpdateResult {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const pool = this.session.pagePool();
    const pagePtr = pool.acquire(ref.pageObjectNumber);
    let annotPtr: Ptr | null = null;
    try {
      annotPtr = resolveAnnotPtr(this.runtime, this.session, pagePtr, ref);
      throwIfAborted(signal);

      const writeCtx = this.writeContext(pagePtr, resources);
      preflightPatch(patch, writeCtx);

      this.ensureKnownWeakStateFromPage(ref.pageObjectNumber, pagePtr);
      const pageStateBefore = this.session.pageState(ref.pageObjectNumber);

      // Apply boundary: validation and cancellation are complete before the
      // first possible document write (weak-id strengthening below).
      throwIfAborted(signal);

      // Opportunistic /NM stamp for weak annotations + capture the
      // resulting stable id for `meta.changed`. Same monotonic /NM
      // rule that `move()` uses; sharing the helper guarantees the
      // two paths cannot drift in their identity bookkeeping.
      const stableId = this.captureOrStampStableId(annotPtr);

      // Blend mode lives inside the existing /AP graphics state rather than in
      // the annotation dictionary. Capture it before re-baking so an unrelated
      // patch (colour, geometry, contents...) cannot silently reset it.
      const previousBlendMode = blendModeFromCode(fn.EPDFAnnot_GetBlendMode(annotPtr));

      // Apply caller-supplied subtype-specific writes.
      applyPatch(fn, mem, annotPtr, patch, writeCtx);
      // Apply /IRT + /RT changes (set/relink/clear, or RT-only). Setting a
      // link may promote a weak parent to indirect (non-structural); the
      // strengthened parent id is folded into `meta.changed` below.
      let linkedParentId: AnnotationStableId | null = null;
      if (patch.inReplyTo !== undefined || patch.replyType !== undefined) {
        linkedParentId = writeAnnotationRelationship(
          this.runtime,
          this.session,
          pagePtr,
          annotPtr,
          ref.pageObjectNumber,
          { inReplyTo: patch.inReplyTo, replyType: patch.replyType },
        );
      }
      // Refresh standard /M (modified date) on every update — independent
      // of whether the patch touched any subtype-specific field. Then
      // refresh /EMBD_Metadata/UpdatedBy if an actor was supplied;
      // UserID/GroupID/CreatedBy are preserved across updates.
      writeAnnotationModified(fn, mem, annotPtr);
      applyEmbedMetadataOnUpdate(fn, mem, annotPtr, actor);
      // Re-bake the /AP appearance stream from the patched properties so
      // the rendered appearance stays in sync with the dictionary.
      this.regenerateAppearance(annotPtr, pagePtr, patch.blendMode ?? previousBlendMode);

      // PDFium caches the parsed appearance form on an annotation context. A
      // regenerated /AP is persisted immediately, but reading blend mode through
      // the same handle can still observe that old form. Reopen the non-structural
      // target before read-back so the returned DTO reflects the new stream.
      fn.FPDFPage_CloseAnnot(annotPtr);
      annotPtr = null;
      annotPtr = resolveAnnotPtr(this.runtime, this.session, pagePtr, ref);

      // Read back. Update is non-structural, so the index does NOT move
      // and the revision does NOT bump.
      const newIndex = fn.FPDFPage_GetAnnotIndex(pagePtr, annotPtr);
      if (newIndex < 0) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `FPDFPage_GetAnnotIndex returned ${newIndex} after update`,
        );
      }
      const dto = readAnnotationFromPtr(
        fn,
        mem,
        annotPtr,
        ref.pageObjectNumber,
        newIndex,
        pageStateBefore.revision,
      );
      joinWidgetFieldNumbers(this.runtime, this.session, [dto]);

      this.recordWeakStateFromPage(ref.pageObjectNumber, pagePtr);
      const pageStateAfter = this.session.pageState(ref.pageObjectNumber);
      const meta = computeMutationImpact({
        mutation: 'update',
        pageStateBefore,
        pageStateAfter,
        changed: linkedParentId ? [stableId, linkedParentId] : [stableId],
      });
      return { updated: dto, meta };
    } finally {
      if (annotPtr !== null) fn.FPDFPage_CloseAnnot(annotPtr);
      pool.release(ref.pageObjectNumber);
    }
  }

  /**
   * Attached widgets are views of a form field: deleting one here would
   * orphan the field's /Kids (the corruption class doc.forms.repair
   * exists to fix). Detach first, or use the forms-plane cascade.
   */
  private assertNotAttachedWidget(annotPtr: Ptr): void {
    const { fn } = this.runtime;
    if (fn.FPDFAnnot_GetSubtype(annotPtr) !== PdfAnnotationSubtypeCode.WIDGET) return;
    const annotObjectNumber = fn.EPDFAnnot_GetObjectNumber(annotPtr);
    if (resolveWidgetFieldObjectNumber(this.runtime, this.session, annotObjectNumber) === 0) {
      return; // inert widget: an ordinary annotation, ordinary delete
    }
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'widget is attached to a form field - use doc.forms.detachWidget or doc.forms.deleteField',
    );
  }

  delete(ref: AnnotationRef, signal: AbortSignal): AnnotationDeleteResult {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const pool = this.session.pagePool();
    const pagePtr = pool.acquire(ref.pageObjectNumber);
    let bumpRequested = false;
    try {
      this.ensureKnownWeakStateFromPage(ref.pageObjectNumber, pagePtr);
      const pageStateBefore = this.session.pageState(ref.pageObjectNumber);
      throwIfAborted(signal);

      let deleted: AnnotationStableId | null;
      let ok = false;
      switch (ref.kind) {
        case 'objectNumber': {
          // Probe so we 404 honestly before mutating. The fork helper
          // does its own existence check too, but we want a clean
          // InvalidReference up front rather than a "false" return code
          // we'd have to translate.
          const probe = fn.EPDFPage_GetAnnotByObjectNumber(pagePtr, ref.annotObjectNumber);
          if (!probe) {
            throw new EngineError(
              EngineErrorCode.InvalidReference,
              `no annotation with object number ${ref.annotObjectNumber} on page ${ref.pageObjectNumber}`,
            );
          }
          try {
            this.assertNotAttachedWidget(probe);
          } finally {
            fn.FPDFPage_CloseAnnot(probe);
          }
          bumpRequested = true;
          ok = fn.EPDFPage_RemoveAnnotByObjectNumber(pagePtr, ref.annotObjectNumber);
          deleted = { kind: 'objectNumber', value: ref.annotObjectNumber };
          break;
        }
        case 'nm': {
          const namePtr = mem.writeU16String(ref.nm);
          try {
            const probe = fn.EPDFPage_GetAnnotByName(pagePtr, namePtr);
            if (!probe) {
              throw new EngineError(
                EngineErrorCode.InvalidReference,
                `no annotation with /NM '${ref.nm}' on page ${ref.pageObjectNumber}`,
              );
            }
            try {
              this.assertNotAttachedWidget(probe);
            } finally {
              fn.FPDFPage_CloseAnnot(probe);
            }
            bumpRequested = true;
            ok = fn.EPDFPage_RemoveAnnotByName(pagePtr, namePtr);
          } finally {
            mem.free(namePtr);
          }
          deleted = { kind: 'nm', value: ref.nm };
          break;
        }
        case 'index': {
          this.session.validateRevision(ref.revision);
          const annotPtr = fn.FPDFPage_GetAnnot(pagePtr, ref.index);
          if (!annotPtr) {
            throw new EngineError(
              EngineErrorCode.InvalidReference,
              `index ${ref.index} out of range on page ${ref.pageObjectNumber}`,
            );
          }
          let probedObjNum: number;
          let probedNm: string | null;
          try {
            probedObjNum = fn.EPDFAnnot_GetObjectNumber(annotPtr);
            probedNm = readAnnotString(fn, mem, annotPtr, 'NM');
          } finally {
            fn.FPDFPage_CloseAnnot(annotPtr);
          }
          deleted =
            probedObjNum > 0
              ? { kind: 'objectNumber', value: probedObjNum }
              : probedNm !== null && probedNm.length > 0
                ? { kind: 'nm', value: probedNm }
                : null;
          bumpRequested = true;
          // EPDFPage_RemoveAnnot is the fork helper that ALSO cleans up
          // the indirect object if the annotation has one. The vanilla
          // FPDFPage_RemoveAnnot would leak the indirect object.
          ok = fn.EPDFPage_RemoveAnnot(pagePtr, ref.index);
          break;
        }
      }
      if (!ok) {
        throw new EngineError(EngineErrorCode.Unknown, `failed to remove annotation: ${ref.kind}`);
      }

      // Structural change; bump the local index-space epoch now and stop
      // the finally-bump. Do not gate this on the page's current weak state:
      // old snapshots can still hold index refs from before annotations were
      // strengthened, and delete/move can make those refs point elsewhere.
      this.session.bumpRevision(ref.pageObjectNumber);
      bumpRequested = false;
      this.recordWeakStateFromPage(ref.pageObjectNumber, pagePtr);
      const pageStateAfter = this.session.pageState(ref.pageObjectNumber);

      const meta = computeMutationImpact({
        mutation: 'delete',
        pageStateBefore,
        pageStateAfter,
        changed: deleted ? [deleted] : [],
      });
      return { deleted, meta };
    } finally {
      if (bumpRequested) this.session.bumpRevision(ref.pageObjectNumber);
      pool.release(ref.pageObjectNumber);
    }
  }

  /**
   * Batch reorder of a contiguous block of annotations within a single
   * page's /Annots array. Symmetric with `pages.move()` for pages.
   *
   * Semantics (locked with the user, mirrors `EPDFPage_MoveAnnots`):
   *   - Each ref in `refs` is resolved to its current /Annots index.
   *     The block is detached, then re-inserted at `toIndex` in the
   *     post-removal index space, preserving caller-supplied order.
   *   - Single-annotation case is `move([ref], toIndex)`. There is no
   *     separate single-move path; one batch primitive serves both.
   *   - Atomic from the caller's perspective:
   *       * one revision bump per batch, regardless of `refs.length`.
   *       * one `AnnotationListMutationMeta` envelope.
   *       * if `EPDFPage_MoveAnnots` rejects (returns false) the page is
   *         untouched and we throw `InvalidArg` without bumping.
   *   - Identity strengthening: each weak ref in the batch (no
   *     `objectNumber`, no `/NM`) is opportunistically stamped with a
   *     fresh engine-generated UUID v4 BEFORE the move. So
   *     `meta.changed` always lists durable stable ids, and the moved
   *     DTOs come out durable. Same monotonic `/NM` rule as `update()`.
   *
   * Validation rules applied here BEFORE calling the helper, so callers
   * get clean errors instead of an opaque `false` return code:
   *   - `refs.length >= 1`.
   *   - All refs target the page identified by `pageObjectNumber`.
   *   - `toIndex >= 0` and `toIndex <= count - refs.length` (count is
   *     captured AFTER ref resolution, so the helper sees the same view).
   *   - Resolved indices have no duplicates.
   *
   * The `EPDFPage_MoveAnnots` helper itself enforces the same rules; the
   * up-front validation is purely for a usable error surface.
   */
  move(
    pageObjectNumber: PageObjectNumber,
    refs: AnnotationRef[],
    toIndex: number,
    signal: AbortSignal,
  ): AnnotationMoveResult {
    throwIfAborted(signal);
    if (refs.length === 0) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'move requires at least one ref');
    }
    if (toIndex < 0 || !Number.isInteger(toIndex)) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `move toIndex must be a non-negative integer (got ${toIndex})`,
      );
    }
    for (const r of refs) {
      if (r.pageObjectNumber !== pageObjectNumber) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `move refs must all target page ${pageObjectNumber}; got ref on page ${r.pageObjectNumber}`,
        );
      }
    }

    const { fn, mem } = this.runtime;
    const pool = this.session.pagePool();
    const pagePtr = pool.acquire(pageObjectNumber);
    let bumpRequested = false;

    try {
      this.ensureKnownWeakStateFromPage(pageObjectNumber, pagePtr);
      const pageStateBefore = this.session.pageState(pageObjectNumber);
      throwIfAborted(signal);

      // 1. Resolve every ref in caller order. For each: capture its
      //    current /Annots index and its (possibly newly-stamped)
      //    stable id. We close each annotPtr right after probing — the
      //    move helper takes the page-level pointer, and we'll re-open
      //    annotPtrs later by *new* index for the readback.
      const fromIndices: number[] = new Array(refs.length);
      const stableIds: AnnotationStableId[] = new Array(refs.length);
      for (let i = 0; i < refs.length; i++) {
        throwIfAborted(signal);
        const annotPtr = resolveAnnotPtr(this.runtime, this.session, pagePtr, refs[i]);
        try {
          const idx = fn.FPDFPage_GetAnnotIndex(pagePtr, annotPtr);
          if (idx < 0) {
            throw new EngineError(
              EngineErrorCode.Unknown,
              `FPDFPage_GetAnnotIndex returned ${idx} during move resolution`,
            );
          }
          fromIndices[i] = idx;
          stableIds[i] = this.captureOrStampStableId(annotPtr);
        } finally {
          fn.FPDFPage_CloseAnnot(annotPtr);
        }
      }

      // 2. Reject duplicate source indices up front. Two refs that
      //    resolve to the same index would violate the helper's
      //    invariant (and would also be a confused caller).
      const seen = new Set<number>();
      for (const idx of fromIndices) {
        if (seen.has(idx)) {
          throw new EngineError(
            EngineErrorCode.InvalidArg,
            `move refs resolve to duplicate /Annots index ${idx}`,
          );
        }
        seen.add(idx);
      }

      // 3. Range-check toIndex against the post-removal count, matching
      //    the helper's contract.
      const count = fn.FPDFPage_GetAnnotCount(pagePtr);
      const postRemovalCount = count - fromIndices.length;
      if (toIndex > postRemovalCount) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `move toIndex ${toIndex} out of range; post-removal count is ${postRemovalCount}`,
        );
      }

      // 4. Marshal fromIndices into an i32 array in runtime memory and
      //    invoke the helper. From this call onward a structural change
      //    may have happened; finally-bump on any failure.
      const arrBytes = 4 * fromIndices.length;
      const arrPtr = mem.alloc(arrBytes);
      let ok: boolean;
      try {
        for (let i = 0; i < fromIndices.length; i++) {
          mem.poke(arrPtr, 'i32', fromIndices[i], 4 * i);
        }
        bumpRequested = true;
        ok = fn.EPDFPage_MoveAnnots(pagePtr, arrPtr, fromIndices.length, toIndex);
      } finally {
        mem.free(arrPtr);
      }

      if (!ok) {
        // The helper validates atomically: a `false` return means it
        // rejected the request and made no changes. Cancel the pending
        // bump and surface a clean error.
        bumpRequested = false;
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `EPDFPage_MoveAnnots rejected the request (toIndex=${toIndex}, fromIndices=[${fromIndices.join(
            ',',
          )}])`,
        );
      }

      // 5. Single revision bump for the whole batch. This is the local
      //    index-space epoch, so it advances for every successful move even
      //    if the page is currently strong. Read back DTOs against the
      //    bumped revision so they are internally consistent.
      const bumpedRev = this.session.bumpRevision(pageObjectNumber);
      bumpRequested = false;

      const moved: AnnotationDTO[] = new Array(fromIndices.length);
      for (let i = 0; i < fromIndices.length; i++) {
        throwIfAborted(signal);
        const newIdx = toIndex + i;
        const annotPtr = fn.FPDFPage_GetAnnot(pagePtr, newIdx);
        if (!annotPtr) {
          throw new EngineError(
            EngineErrorCode.Unknown,
            `failed to re-read moved annotation at index ${newIdx}`,
          );
        }
        try {
          moved[i] = readAnnotationFromPtr(fn, mem, annotPtr, pageObjectNumber, newIdx, bumpedRev);
        } finally {
          fn.FPDFPage_CloseAnnot(annotPtr);
        }
      }

      this.recordWeakStateFromPage(pageObjectNumber, pagePtr);
      const pageStateAfter = this.session.pageState(pageObjectNumber);
      const meta: AnnotationListMutationMeta = computeMutationImpact({
        mutation: 'move',
        pageStateBefore,
        pageStateAfter,
        changed: stableIds,
      });
      return { moved, meta };
    } finally {
      if (bumpRequested) this.session.bumpRevision(pageObjectNumber);
      pool.release(pageObjectNumber);
    }
  }

  /**
   * Bake (or re-bake) an annotation's `/AP` normal appearance stream from
   * its current dictionary properties using PDFium's native AP generator,
   * then flush the page content so the result is persisted into the
   * page/object tree. Same path the v2 engine used after every
   * create/update; runs for every writable subtype (shapes + text-markup).
   *
   * Best-effort: `EPDFAnnot_GenerateAppearance` returns false for subtypes
   * PDFium has no generator for (e.g. widgets), in which case the
   * annotation simply ships without a baked `/AP` and viewers synthesize
   * one — so a false return is not a hard error. This step is
   * non-structural: it never shifts annotation indices or bumps revisions.
   */
  private regenerateAppearance(annotPtr: Ptr, pagePtr: Ptr, blendMode?: BlendMode): void {
    const { fn } = this.runtime;
    if (blendMode === undefined) fn.EPDFAnnot_GenerateAppearance(annotPtr);
    else fn.EPDFAnnot_GenerateAppearanceWithBlend(annotPtr, blendModeToCode(blendMode));
    fn.FPDFPage_GenerateContent(pagePtr);
  }

  private captureOrStampStableId(annotPtr: Ptr): AnnotationStableId {
    return captureOrStampStableId(this.runtime, annotPtr);
  }

  private ensureKnownWeakStateFromPage(pageObjectNumber: PageObjectNumber, pagePtr: Ptr): void {
    if (this.session.weakAnnotationState(pageObjectNumber).kind === 'known') {
      return;
    }
    this.recordWeakStateFromPage(pageObjectNumber, pagePtr);
  }

  private recordWeakStateFromPage(pageObjectNumber: PageObjectNumber, pagePtr: Ptr): void {
    this.session.recordWeakFlag(pageObjectNumber, this.computeHasWeakAnnotations(pagePtr));
  }

  private computeHasWeakAnnotations(pagePtr: Ptr): boolean {
    const { fn, mem } = this.runtime;
    const count = fn.FPDFPage_GetAnnotCount(pagePtr);
    if (count < 0) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        `FPDFPage_GetAnnotCount returned ${count} while computing weak annotations`,
      );
    }
    for (let i = 0; i < count; i++) {
      const annotPtr = fn.FPDFPage_GetAnnot(pagePtr, i);
      if (!annotPtr) {
        continue;
      }
      try {
        const objNum = fn.EPDFAnnot_GetObjectNumber(annotPtr);
        if (objNum > 0) {
          continue;
        }
        const nm = readAnnotString(fn, mem, annotPtr, 'NM');
        if (nm === null || nm.length === 0) {
          return true;
        }
      } finally {
        fn.FPDFPage_CloseAnnot(annotPtr);
      }
    }
    return false;
  }
}
