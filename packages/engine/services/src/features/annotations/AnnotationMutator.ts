import { isDimension } from '@embedpdf/engine-core/runtime';
import {
  annotationKey,
  annotationKeysOf,
  assertAnnotationResources,
  appearanceImpactOf,
  checkAnnotationPatch,
  deletedWith,
  EngineError,
  EngineErrorCode,
  type AnnotationActor,
  type AppearanceOutcome,
  type AnnotationCreateResult,
  type AnnotationDeleteResult,
  type AnnotationDTO,
  type AnnotationDraft,
  type AnnotationListMutationMeta,
  type AnnotationMoveResult,
  type AnnotationPatch,
  type WireAnnotationResources,
  type AnnotationRef,
  type AnnotationReplyType,
  type AnnotationStableId,
  type AnnotationUpdateResult,
  type PageObjectNumber,
  PdfAnnotationSubtypeCode,
  PermissionDenied,
  toPageRef,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { pdfPageCountOf } from './internal/write/stampDrawing';
import { AnnotationBatchApplier } from './AnnotationBatchApplier';
import { blendModeFromCode } from './internal/blendMode';
import { assertDeclaredFields } from './internal/mutations/prepareCreate';
import { prepareMeasurementPatch } from './internal/mutations/prepareMeasurementMutation';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import type { FontRegistrar } from '../fonts';
import { captureOrStampStableId } from './internal/identity/captureOrStampStableId';
import { resolveAnnotPtr } from './internal/identity/resolveAnnotationPointer';
import { computeMutationImpact } from './internal/mutations/computeMutationImpact';
import { readContextFor } from './internal/read/annotationReadContext';
import { readAnnotString } from './internal/read/annotationReadPrimitives';
import {
  joinWidgetFieldNumbers,
  resolveWidgetFieldObjectNumber,
} from './internal/read/joinWidgetField';
import { readAnnotationFromPtr } from './internal/read/readAnnotationFromPtr';
import { assertRichTextAgreement } from './internal/richTextWire';
import type { AnnotationWriteContext } from './internal/write/annotationWriteContext';
import { applyPatch, preflightPatch } from './internal/write/annotationWriterRegistry';
import { RawAnnotationReader } from './RawAnnotationReader';
import { prepareTextStatePatch } from './internal/write/writeTextAnnotation';
import { generateAppearance } from './internal/write/generateAppearance';
import { writeAnnotationModified } from './internal/write/writeAnnotationBase';
import {
  writeAnnotationRelationship,
  writePopupParent,
} from './internal/write/writeAnnotationRelationship';
import { applyEmbedMetadataOnUpdate } from './internal/write/writeEmbedMetadata';

/** `FPDF_ANNOT_APPEARANCEMODE_NORMAL` — the `/AP /N` stream. */
const APPEARANCE_MODE_NORMAL = 0;

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
 *   - `create` is a one-item change set on `AnnotationBatchApplier`, which
 *     makes the annotation with `EPDFPage_CreateAnnotRaw` (an indirect
 *     object, on a page that isn't loaded), so new annotations are born
 *     durable. If the fork helper ever returns a direct object, it throws —
 *     never silently producing a weak annotation.
 *   - `update` is non-structural. /NM is monotonic per annotation:
 *       * already durable (objectNumber > 0 or /NM present) -> never touched.
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
  private writeContext(pagePtr: Ptr, resources?: WireAnnotationResources): AnnotationWriteContext {
    const fonts = this.fonts;
    return {
      ...(fonts
        ? {
            resolveRegisteredFontId: (key: string) => fonts.idFor(key),
            describeRegisteredFont: (key: string) => fonts.describeOrUndefined(key),
          }
        : {}),
      docPtr: this.session.requireDocPtr(),
      pagePtr,
      drawings: this.session.drawingIndex(),
      pdfPageCount: (bytes) => pdfPageCountOf(this.runtime.fn, this.runtime.mem, bytes),
      ...(resources ? { resources } : {}),
    };
  }

  /**
   * A one-item change set on {@link AnnotationBatchApplier}: checked before
   * the first write, made without loading its page, all or nothing. A
   * `reply` or a popup's `parent` names an annotation the document has.
   */
  create(
    pageObjectNumber: PageObjectNumber,
    draft: AnnotationDraft,
    signal: AbortSignal,
    actor?: AnnotationActor,
    resources?: WireAnnotationResources,
  ): AnnotationCreateResult {
    const { reply, ...data } = draft as AnnotationDraft & { parent?: AnnotationRef | null };
    const parent = draft.subtype === 'popup' ? draft.parent : null;
    if (draft.subtype === 'popup') delete (data as { parent?: unknown }).parent;
    const { created, meta } = new AnnotationBatchApplier(
      this.runtime,
      this.session,
      this.fonts,
    ).create(
      [
        {
          page: toPageRef(pageObjectNumber),
          draft: data as AnnotationDraft,
          ...(reply
            ? { replyTo: { to: { existing: reply.to }, type: reply.type ?? 'reply' } }
            : {}),
          ...(parent ? { parent: { existing: parent } } : {}),
          ...(resources ? { resources } : {}),
          attribution: { kind: 'stamp', ...(actor ? { actor } : {}) },
        },
      ],
      signal,
    );
    return { annotation: created[0]!, meta };
  }

  update(
    ref: AnnotationRef,
    patch: AnnotationPatch,
    signal: AbortSignal,
    actor?: AnnotationActor,
    resources?: WireAnnotationResources,
  ): AnnotationUpdateResult {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const pool = this.session.pagePool();
    const pagePtr = pool.acquire(ref.page.pageObjectNumber);
    let annotPtr: Ptr | null = null;
    try {
      annotPtr = resolveAnnotPtr(this.runtime, this.session, pagePtr, ref);
      throwIfAborted(signal);

      const writeCtx = this.writeContext(pagePtr, resources);

      this.ensureKnownWeakStateFromPage(ref.page.pageObjectNumber, pagePtr);
      const pageStateBefore = this.session.pageState(ref.page.pageObjectNumber);

      // Blend mode lives inside the existing /AP graphics state rather than in
      // the annotation dictionary. Capture it before re-baking so an unrelated
      // patch (colour, geometry, contents...) cannot silently reset it.
      const previousBlendMode = blendModeFromCode(fn.EPDFAnnot_GetBlendMode(annotPtr));

      // Pre-patch DTO for the appearance classifier: it value-diffs the patch
      // against this, so no-op keys (full-projection clients) drop away and a
      // pure move is recognized no matter how verbose the patch is.
      const preIndex = fn.FPDFPage_GetAnnotIndex(pagePtr, annotPtr);
      if (preIndex < 0) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `FPDFPage_GetAnnotIndex returned ${preIndex} before update`,
        );
      }
      const currentDto = readAnnotationFromPtr(
        fn,
        mem,
        annotPtr,
        ref.page.pageObjectNumber,
        preIndex,
        pageStateBefore.revision,
        readContextFor(this.session, this.fonts),
      );

      patch = prepareTextStatePatch(currentDto, patchForTarget(currentDto, patch));
      assertAnnotationResources(currentDto.subtype, resources, 'update');
      preflightPatch(patch, writeCtx);
      assertRichTextAgreement(patch);
      patch = prepareMeasurementPatch(fn, annotPtr, currentDto, patch);

      // Apply boundary: validation and cancellation are complete before the
      // first possible document write (weak-id strengthening below).
      throwIfAborted(signal);

      // Opportunistic /NM stamp for weak annotations + capture the
      // resulting stable id for `meta.changed`. Same monotonic /NM
      // rule that `move()` uses; sharing the helper guarantees the
      // two paths cannot drift in their identity bookkeeping.
      const stableId = this.captureOrStampStableId(annotPtr);

      // Apply caller-supplied subtype-specific writes.
      applyPatch(fn, mem, annotPtr, patch, writeCtx);
      // A derived plain label supersedes imported rich contents; retaining stale /RC
      // would show a different value in consumers that prefer rich text.
      if (
        patch.contents !== undefined &&
        patch.contents !== currentDto.contents &&
        isDimension({ ...currentDto, ...patch })
      ) {
        fn.EPDFAnnot_RemoveKey(annotPtr, 'RC');
      }
      // Apply /IRT + /RT changes (set/relink/clear, or RT-only). Setting a
      // link may promote a weak parent to indirect (non-structural); the
      // strengthened parent id is folded into `meta.changed` below.
      let linkedParentId: AnnotationStableId | null = null;
      if (patch.reply !== undefined && !sameReply(patch.reply, currentDto.reply)) {
        linkedParentId = writeAnnotationRelationship(
          this.runtime,
          this.session,
          pagePtr,
          annotPtr,
          ref.page.pageObjectNumber,
          patch.reply === null
            ? { inReplyTo: null }
            : { inReplyTo: patch.reply.to, replyType: patch.reply.type ?? 'reply' },
        );
      }
      if (
        patch.subtype === 'popup' &&
        currentDto.subtype === 'popup' &&
        patch.parent !== undefined &&
        !sameRef(patch.parent, currentDto.parent)
      ) {
        linkedParentId = writePopupParent(
          this.runtime,
          this.session,
          pagePtr,
          annotPtr,
          ref.page.pageObjectNumber,
          patch.parent,
          currentDto.parent,
        );
      }
      // Refresh standard /M (modified date) on every update — independent
      // of whether the patch touched any subtype-specific field. Then
      // refresh /EMBD_Metadata/UpdatedBy if an actor was supplied;
      // UserID/GroupID/CreatedBy are preserved across updates.
      writeAnnotationModified(fn, mem, annotPtr);
      applyEmbedMetadataOnUpdate(fn, mem, annotPtr, actor);
      // The appearance decision (engine-core `appearanceImpactOf`): an /AP is
      // content, not cache — a foreign-authored stream (Acrobat's rich /AP, an
      // image stamp) is destroyed only as the explicit consequence of a
      // semantic edit, never as a side effect of writing back values nobody
      // changed. `inert` patches (metadata-only, or all values no-ops) never
      // touch /AP; a verified rigid translation preserves an existing /AP
      // byte-for-byte (ISO 32000: BBox→/Rect fitting translates the pixels);
      // everything else re-bakes. With no existing normal /AP there is
      // nothing to preserve, so any appearance-relevant write bakes one
      // (otherwise the annotation renders as nothing). The verdict is
      // echoed on the result: clients drive raster invalidation off
      // `appearance.changed` instead of guessing from the patch they sent.
      // New appearance bytes are a new drawing, whatever the patch says.
      const impact = resources?.appearance ? 'regenerate' : appearanceImpactOf(currentDto, patch);
      let appearance: AppearanceOutcome;
      if (
        impact === 'inert' ||
        (impact === 'translation' &&
          fn.EPDFAnnot_HasAppearanceStream(annotPtr, APPEARANCE_MODE_NORMAL))
      ) {
        appearance = { action: 'preserved', changed: false };
      } else {
        const ok = generateAppearance(
          this.runtime.fn,
          annotPtr,
          patch.blendMode ?? previousBlendMode,
        );
        appearance = ok
          ? { action: 'regenerated', changed: true }
          : // No generic generator for this subtype (e.g. widgets). The
            // dictionary still changed when the patch was appearance-relevant,
            // so `changed` stays true in that case — form-layer renderers may
            // paint differently even though no /AP was written.
            { action: 'generation-unavailable', changed: impact === 'regenerate' };
      }

      // PDFium caches the parsed appearance form on an annotation context. A
      // regenerated /AP is persisted immediately, but reading blend mode through
      // the same handle can still observe that old form. Reopen the non-structural
      // target before read-back so the returned DTO reflects the new stream.
      fn.FPDFPage_CloseAnnot(annotPtr);
      annotPtr = null;
      annotPtr = resolveAnnotPtr(this.runtime, this.session, pagePtr, ref);

      // Read back. Update is non-structural, so the index does not move
      // and the revision does not bump.
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
        ref.page.pageObjectNumber,
        newIndex,
        pageStateBefore.revision,
        readContextFor(this.session, this.fonts),
      );
      joinWidgetFieldNumbers(this.runtime, this.session, [dto]);

      this.recordWeakStateFromPage(ref.page.pageObjectNumber, pagePtr);
      const pageStateAfter = this.session.pageState(ref.page.pageObjectNumber);
      const meta = computeMutationImpact({
        mutation: 'update',
        pageStateBefore,
        pageStateAfter,
        changed: linkedParentId ? [stableId, linkedParentId] : [stableId],
      });
      return { annotation: dto, appearance, meta };
    } finally {
      if (annotPtr !== null) fn.FPDFPage_CloseAnnot(annotPtr);
      pool.release(ref.page.pageObjectNumber);
    }
  }

  /**
   * Attached widgets are views of a form field: deleting one here would
   * orphan the field's /Kids (the corruption class doc.forms.repair
   * exists to fix). Remove it from its field first, or delete the field. A
   * merged field/widget is the field's own dictionary and has nothing to be
   * removed from, so only the field's delete removes it; that cascade passes
   * the field it has unlinked as `releasedFieldObjectNumber`.
   */
  private assertNotAttachedWidget(annotPtr: Ptr, releasedFieldObjectNumber: number): void {
    const { fn } = this.runtime;
    if (fn.FPDFAnnot_GetSubtype(annotPtr) !== PdfAnnotationSubtypeCode.WIDGET) return;
    const annotObjectNumber = fn.EPDFAnnot_GetObjectNumber(annotPtr);
    if (releasedFieldObjectNumber > 0 && annotObjectNumber === releasedFieldObjectNumber) {
      return; // the unlinked field's own dictionary, leaving its page
    }
    const fieldObjectNumber = resolveWidgetFieldObjectNumber(
      this.runtime,
      this.session,
      annotObjectNumber,
    );
    if (fieldObjectNumber === 0) {
      return; // inert widget: an ordinary annotation, ordinary delete
    }
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      fieldObjectNumber === annotObjectNumber
        ? "widget is its form field's own dictionary (a merged field/widget) - delete the field with doc.forms.delete"
        : 'widget is attached to a form field - use doc.forms.removeWidget or doc.forms.delete',
    );
  }

  /**
   * Delete an annotation with everything that goes with it
   * ({@link deletedWith}): its replies and theirs, grouped parts, review
   * states and every popup, in one change. `checked` names what the caller's
   * permission check covered; a member it doesn't name (one added since) is
   * refused, so nothing is deleted unchecked. Every check runs before the
   * first write: a deleted object can't be rolled back.
   */
  delete(
    ref: AnnotationRef,
    checked: readonly AnnotationRef[],
    signal: AbortSignal,
  ): AnnotationDeleteResult {
    throwIfAborted(signal);
    const { fn } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const pageObjectNumber = ref.page.pageObjectNumber;
    const { pageIndex } = this.session.resolvePageRef(ref.page);
    if (ref.kind === 'index') this.session.validateRevision(ref.revision);
    // Raw handles off the document, never a loaded page: a page loaded
    // before this change's writes (a layer's copy-on-write) could miss them.
    const { annotations } = new RawAnnotationReader(this.runtime, this.session, this.fonts).listOne(
      pageObjectNumber,
      signal,
    );
    const hasWeak = (list: readonly AnnotationDTO[]) =>
      list.some((annotation) => annotation.ref.kind === 'index');
    if (this.session.weakAnnotationState(pageObjectNumber).kind !== 'known') {
      this.session.recordWeakFlag(pageObjectNumber, hasWeak(annotations));
    }
    const pageStateBefore = this.session.pageState(pageObjectNumber);

    const members = deletedWith(annotations, ref);
    if (members.length === 0) throw missingAnnotation(ref);
    const checkedKeys = new Set(checked.map(annotationKey));
    const unchecked = members.filter(
      (member) => !annotationKeysOf(member).some((key) => checkedKeys.has(key)),
    );
    if (unchecked.length > 0) {
      throw new PermissionDenied(
        'annotations:delete',
        'the thread changed while it was checked',
        undefined,
        unchecked.map((member) => member.ref),
      );
    }
    const withRaw = <T>(index: number, body: (annotPtr: Ptr) => T): T => {
      const annotPtr = fn.EPDFPage_GetAnnotRaw(docPtr, pageIndex, index);
      if (!annotPtr) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `annotation ${index} on page ${pageObjectNumber} could not be opened`,
        );
      }
      try {
        return body(annotPtr);
      } finally {
        fn.FPDFPage_CloseAnnot(annotPtr);
      }
    };
    for (const member of members) {
      withRaw(member.index, (annotPtr) => this.assertNotAttachedWidget(annotPtr, 0));
    }
    // A popup deleted without the annotation it shows leaves that
    // annotation, which stops naming it.
    const going = new Set(members.flatMap(annotationKeysOf));
    const keptParents = members.flatMap((member) => {
      if (member.subtype !== 'popup' || !member.parent) return [];
      const parent = annotations.find((annotation) =>
        annotationKeysOf(annotation).includes(annotationKey(member.parent!)),
      );
      return parent && !going.has(annotationKey(parent.ref)) ? [parent] : [];
    });

    // Apply boundary. The highest position first, so the positions still to
    // go hold; the raw remove also deletes the indirect object.
    throwIfAborted(signal);
    let bumpRequested = true;
    try {
      for (const member of [...members].sort((a, b) => b.index - a.index)) {
        if (!fn.EPDFPage_RemoveAnnotRaw(docPtr, pageIndex, member.index)) {
          throw new EngineError(
            EngineErrorCode.Unknown,
            `failed to remove annotation ${member.index} on page ${pageObjectNumber}`,
          );
        }
      }
      // After the removals, at the position each kept parent now has.
      for (const parent of keptParents) {
        const before = members.filter((member) => member.index < parent.index).length;
        withRaw(parent.index - before, (annotPtr) => fn.EPDFAnnot_RemoveKey(annotPtr, 'Popup'));
      }
      // Structural change; bump the local index-space epoch now and stop
      // the finally-bump (see move()).
      this.session.bumpRevision(pageObjectNumber);
      bumpRequested = false;
      this.session.recordWeakFlag(
        pageObjectNumber,
        hasWeak(annotations.filter((annotation) => !members.includes(annotation))),
      );
      const meta = computeMutationImpact({
        mutation: 'delete',
        pageStateBefore,
        pageStateAfter: this.session.pageState(pageObjectNumber),
        // The annotation first, then what went with it.
        changed: [...members].reverse().flatMap((member) => stableIdOf(member.ref)),
      });
      return { meta };
    } finally {
      if (bumpRequested) this.session.bumpRevision(pageObjectNumber);
    }
  }

  /**
   * Remove a widget of the field `doc.forms.delete` has just unlinked from
   * the field tree, including the field's own dictionary when it is a
   * merged field/widget. The cascade runs past that mutation's apply
   * boundary, so it takes no abort signal.
   */
  deleteReleasedWidget(
    ref: AnnotationRef,
    releasedFieldObjectNumber: number,
  ): AnnotationDeleteResult {
    const { fn, mem } = this.runtime;
    const pool = this.session.pagePool();
    const pagePtr = pool.acquire(ref.page.pageObjectNumber);
    let bumpRequested = false;
    try {
      this.ensureKnownWeakStateFromPage(ref.page.pageObjectNumber, pagePtr);
      const pageStateBefore = this.session.pageState(ref.page.pageObjectNumber);

      let deleted: AnnotationStableId | null;
      let ok = false;
      switch (ref.kind) {
        case 'objectNumber': {
          // Probe so we 404 honestly before mutating. The fork helper
          // does its own existence check too, but we want a clean
          // NotFound up front rather than a "false" return code we'd have
          // to translate.
          const probe = fn.EPDFPage_GetAnnotByObjectNumber(pagePtr, ref.annotObjectNumber);
          if (!probe) {
            throw new EngineError(
              EngineErrorCode.NotFound,
              `no annotation with object number ${ref.annotObjectNumber} on page ${ref.page.pageObjectNumber}`,
            );
          }
          try {
            this.assertNotAttachedWidget(probe, releasedFieldObjectNumber);
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
                EngineErrorCode.NotFound,
                `no annotation with /NM '${ref.nm}' on page ${ref.page.pageObjectNumber}`,
              );
            }
            try {
              this.assertNotAttachedWidget(probe, releasedFieldObjectNumber);
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
              `index ${ref.index} out of range on page ${ref.page.pageObjectNumber}`,
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
          // EPDFPage_RemoveAnnot is the fork helper that also cleans up
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
      this.session.bumpRevision(ref.page.pageObjectNumber);
      bumpRequested = false;
      this.recordWeakStateFromPage(ref.page.pageObjectNumber, pagePtr);
      const pageStateAfter = this.session.pageState(ref.page.pageObjectNumber);

      const meta = computeMutationImpact({
        mutation: 'delete',
        pageStateBefore,
        pageStateAfter,
        changed: deleted ? [deleted] : [],
      });
      return { meta };
    } finally {
      if (bumpRequested) this.session.bumpRevision(ref.page.pageObjectNumber);
      pool.release(ref.page.pageObjectNumber);
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
   *     fresh engine-generated UUID v4 before the move. So
   *     `meta.changed` always lists durable stable ids, and the moved
   *     DTOs come out durable. Same monotonic `/NM` rule as `update()`.
   *
   * Validation rules applied here before calling the helper, so callers
   * get clean errors instead of an opaque `false` return code:
   *   - `refs.length >= 1`.
   *   - All refs target the page identified by `pageObjectNumber`.
   *   - `toIndex >= 0` and `toIndex <= count - refs.length` (count is
   *     captured after ref resolution, so the helper sees the same view).
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
      if (r.page.pageObjectNumber !== pageObjectNumber) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `move refs must all target page ${pageObjectNumber}; got ref on page ${r.page.pageObjectNumber}`,
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
          moved[i] = readAnnotationFromPtr(
            fn,
            mem,
            annotPtr,
            pageObjectNumber,
            newIdx,
            bumpedRev,
            readContextFor(this.session, this.fonts),
          );
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
      return { annotations: moved, meta };
    } finally {
      if (bumpRequested) this.session.bumpRevision(pageObjectNumber);
      pool.release(pageObjectNumber);
    }
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

/**
 * The patch as the target's kind: its subtype filled in from the target, which
 * a caller may leave out. A different subtype, a changed name, or any change to
 * an annotation of a type the engine doesn't model is refused.
 */
function patchForTarget(current: AnnotationDTO, patch: AnnotationPatch): AnnotationPatch {
  if (patch.subtype !== undefined && patch.subtype !== current.subtype) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'Annotation subtype cannot change');
  }
  if (current.subtype === 'unsupported') {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      "an annotation of a type the engine doesn't model can't be updated",
    );
  }
  if (patch.nm !== undefined && patch.nm !== current.nm) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      "an annotation's nm can't change after create",
    );
  }
  assertDeclaredFields(current.subtype, patch);
  return checkAnnotationPatch(current, { ...patch, subtype: current.subtype } as AnnotationPatch);
}

/** `NotFound` for a ref by number or name, `InvalidReference` for a position out of range. */
function missingAnnotation(ref: AnnotationRef): EngineError {
  const page = ref.page.pageObjectNumber;
  switch (ref.kind) {
    case 'objectNumber':
      return new EngineError(
        EngineErrorCode.NotFound,
        `no annotation with object number ${ref.annotObjectNumber} on page ${page}`,
      );
    case 'nm':
      return new EngineError(
        EngineErrorCode.NotFound,
        `no annotation with /NM '${ref.nm}' on page ${page}`,
      );
    case 'index':
      return new EngineError(
        EngineErrorCode.InvalidReference,
        `index ${ref.index} out of range on page ${page}`,
      );
  }
}

/** What `meta.changed` names an annotation by; a weak one has no stable id. */
function stableIdOf(ref: AnnotationRef): AnnotationStableId[] {
  if (ref.kind === 'objectNumber') return [{ kind: 'objectNumber', value: ref.annotObjectNumber }];
  if (ref.kind === 'nm') return [{ kind: 'nm', value: ref.nm }];
  return [];
}

const sameRef = (left: AnnotationRef | null, right: AnnotationRef | null): boolean =>
  left === null || right === null ? left === right : annotationKey(left) === annotationKey(right);

/** Whether a patch's `reply` names the link the annotation already has. */
function sameReply(
  next: { to: AnnotationRef; type?: AnnotationReplyType } | null,
  current: { to: AnnotationRef; type: AnnotationReplyType } | null,
): boolean {
  if (next === null || current === null) return next === current;
  return sameRef(next.to, current.to) && (next.type ?? 'reply') === current.type;
}
