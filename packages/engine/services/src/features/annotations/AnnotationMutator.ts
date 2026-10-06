import { isDimension, type PdfCoordinates } from '@embedpdf/engine-core/runtime';
import {
  annotationKey,
  annotationKeysOf,
  assertAnnotationResources,
  appearanceImpactOf,
  authorizeAnnotationDelete,
  authorizeAnnotationUpdate,
  pdfResolveAnnotationPatch,
  deletedWith,
  EngineError,
  EngineErrorCode,
  type AnnotationActor,
  type AnnotationAuthority,
  type AppearanceOutcome,
  type AnnotationCreateResult,
  type AnnotationDeleteResult,
  type Annotation,
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
  toPageRef,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { pdfPageCountOf } from './internal/write/stampDrawing';
import { AnnotationBatchApplier } from './AnnotationBatchApplier';
import { blendModeFromCode } from './internal/blendMode';
import { assertCaptionMetadataWritable } from './internal/mutations/captionMetadata';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { withScratch } from '../../runtime/memory/scratch';
import { throwIfAborted } from '../../shared/abort';
import type { FontRegistrar } from '../fonts';
import { captureOrStampStableId } from './internal/identity/captureOrStampStableId';
import { openAnnotAtRaw, resolveAnnotIndexRaw } from './internal/identity/resolveAnnotIndexRaw';
import { computeMutationImpact } from './internal/mutations/computeMutationImpact';
import { readContextFor } from './internal/read/annotationReadContext';
import { readAnnotString } from './internal/read/annotationReadPrimitives';
import { pageHasWeakAnnotations } from './internal/read/pageHasWeakAnnotations';
import {
  joinWidgetFieldNumbers,
  resolveWidgetFieldObjectNumber,
} from './internal/read/joinWidgetField';
import { readAnnotationFromPtr } from './internal/read/readAnnotationFromPtr';
import type { AnnotationWriteContext } from './internal/write/annotationWriteContext';
import { applyPatch, preflightPatch } from './internal/write/annotationWriterRegistry';
import { settleAnnotationTurn } from './internal/write/writeAnnotationTransformMetadata';
import { RawAnnotationReader } from './RawAnnotationReader';
import { generateAppearance } from './internal/write/generateAppearance';
import { writeAnnotationModified } from './internal/write/writeAnnotationBase';
import { promoteInlineAnnotations } from './internal/write/promoteInlineAnnotations';
import {
  writeAnnotationRelationship,
  writeLinkedOpen,
  writePopupParent,
} from './internal/write/writeAnnotationRelationship';
import { applyEmbedMetadataOnUpdate } from './internal/write/writeEmbedMetadata';

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
 *   - `delete` is subtype-agnostic. A weak annotation has no durable id
 *     to report, so its delete names nothing in `meta.changed`.
 *
 * Every write finds its annotations from the page's dictionaries (raw
 * handles), so none parses the page's content. Each runs inside its job's
 * layer transaction: a failure after the first write aborts all of it,
 * revisions included.
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
   *  (FreeText `/DA`), the document pointer and binary resources (stamp). */
  private writeContext(resources?: WireAnnotationResources): AnnotationWriteContext {
    const fonts = this.fonts;
    return {
      ...(fonts
        ? {
            resolveRegisteredFontId: (key: string) => fonts.idFor(key),
            describeRegisteredFont: (key: string) => fonts.describeOrUndefined(key),
          }
        : {}),
      docPtr: this.session.requireDocPtr(),
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
    draft: AnnotationDraft<PdfCoordinates>,
    signal: AbortSignal,
    actor?: AnnotationActor,
    resources?: WireAnnotationResources,
  ): AnnotationCreateResult<PdfCoordinates> {
    const { reply, ...data } = draft as AnnotationDraft<PdfCoordinates> & {
      parent?: AnnotationRef | null;
    };
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
          draft: data as AnnotationDraft<PdfCoordinates>,
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

  /**
   * Edit an annotation in place. `authority` is checked against the
   * annotation as it reads before the first write, and gives the actor the
   * write stamps.
   */
  update(
    ref: AnnotationRef,
    patch: AnnotationPatch<PdfCoordinates>,
    authority: AnnotationAuthority,
    signal: AbortSignal,
    resources?: WireAnnotationResources,
  ): AnnotationUpdateResult<PdfCoordinates> {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    // An update edits in place, so the annotation keeps its position
    // throughout: opened again there after its appearance is baked.
    const { pageIndex, index } = resolveAnnotIndexRaw(this.runtime, this.session, ref);
    let annotPtr: Ptr | null = openAnnotAtRaw(this.runtime, this.session, pageIndex, index);
    try {
      throwIfAborted(signal);

      const writeCtx = this.writeContext(resources);

      this.knowWeakAnnotations(ref.page.objectNumber, pageIndex);
      const pageStateBefore = this.session.pageState(ref.page.objectNumber);

      // Blend mode lives inside the existing /AP graphics state rather than in
      // the annotation dictionary. Capture it before re-baking so an unrelated
      // patch (colour, geometry, contents...) cannot silently reset it.
      const previousBlendMode = blendModeFromCode(fn.EPDFAnnot_GetBlendMode(annotPtr));

      // Pre-patch DTO for the appearance classifier: it value-diffs the patch
      // against this, so no-op keys (full-projection clients) drop away and a
      // pure move is recognized no matter how verbose the patch is.
      const currentDto = readAnnotationFromPtr(
        fn,
        mem,
        annotPtr,
        ref.page.objectNumber,
        index,
        pageStateBefore.revision,
        readContextFor(this.session, this.fonts),
      );
      const actor = authorizeAnnotationUpdate(
        authority,
        currentDto,
        (patch as { groupId?: string | null }).groupId,
      );

      // What the patch means, stated whole: the one resolution a viewer's
      // pending view shares (`applyAnnotationPatch`). The writers below write
      // exactly this.
      assertCaptionMetadataWritable(fn, annotPtr, currentDto, patch);
      patch = pdfResolveAnnotationPatch(currentDto, patch, {
        describeFont: writeCtx.describeRegisteredFont,
      });
      assertAnnotationResources(currentDto.subtype, resources, 'update');
      preflightPatch(patch, writeCtx);

      // Apply boundary: validation and cancellation are complete before the
      // first possible document write (weak-id strengthening below).
      throwIfAborted(signal);

      // Opportunistic /NM stamp for weak annotations + capture the
      // resulting stable id for `meta.changed`. Same monotonic /NM
      // rule that `move()` uses; sharing the helper guarantees the
      // two paths cannot drift in their identity bookkeeping.
      const stableId = this.captureOrStampStableId(annotPtr);

      // The appearance decision (see below) depends only on the read and the
      // patch. A write that redraws or re-places the drawing starts from the
      // turn the annotation reads: our keys record it first.
      const impact = resources?.appearance ? 'regenerate' : appearanceImpactOf(currentDto, patch);
      if (impact !== 'inert') settleAnnotationTurn(fn, mem, annotPtr);

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
          annotPtr,
          ref.page.objectNumber,
          patch.reply === null
            ? { inReplyTo: null }
            : { inReplyTo: patch.reply.to, replyType: patch.reply.type ?? 'reply' },
        );
      }
      let relinked = false;
      if (
        patch.subtype === 'popup' &&
        currentDto.subtype === 'popup' &&
        patch.parent !== undefined &&
        !sameRef(patch.parent, currentDto.parent)
      ) {
        relinked = true;
        linkedParentId = writePopupParent(
          this.runtime,
          this.session,
          annotPtr,
          ref.page.objectNumber,
          patch.parent,
          currentDto.parent,
        );
      }
      // A note and its popup hold one `/Open`: writing it on one writes the
      // other (a relink has made them equal already).
      let linkedOpenId: AnnotationStableId | null = null;
      const open = (patch as { open?: boolean }).open;
      if (open !== undefined && !relinked) {
        const other =
          currentDto.subtype === 'text'
            ? currentDto.popup
            : currentDto.subtype === 'popup'
              ? currentDto.parent
              : null;
        if (other) {
          linkedOpenId = writeLinkedOpen(
            this.runtime,
            this.session,
            other,
            open,
            currentDto.subtype === 'popup',
          );
        }
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
      // touch /AP. A verified rigid translation keeps the appearance as it is:
      // an existing /AP byte-for-byte (ISO 32000: BBox→/Rect fitting
      // translates the pixels), and a missing one stays missing (the renderer
      // draws it in memory where the annotation now is; a move gives the file
      // no drawing of ours). Everything else bakes one. The verdict is echoed
      // on the result: clients drive raster invalidation off
      // `appearance.changed` instead of guessing from the patch they sent.
      // New appearance bytes are a new drawing, whatever the patch says.
      let appearance: AppearanceOutcome;
      if (impact === 'inert' || impact === 'translation') {
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
      annotPtr = openAnnotAtRaw(this.runtime, this.session, pageIndex, index);

      // Read back. Update is non-structural, so the index does not move
      // and the revision does not bump.
      const dto = readAnnotationFromPtr(
        fn,
        mem,
        annotPtr,
        ref.page.objectNumber,
        index,
        pageStateBefore.revision,
        readContextFor(this.session, this.fonts),
      );
      joinWidgetFieldNumbers(this.runtime, this.session, [dto]);

      this.recordWeakAnnotations(ref.page.objectNumber, pageIndex);
      const pageStateAfter = this.session.pageState(ref.page.objectNumber);
      const meta = computeMutationImpact({
        mutation: 'update',
        pageStateBefore,
        pageStateAfter,
        changed: [
          ...new Set(
            [stableId, linkedParentId, linkedOpenId].filter(
              (id): id is AnnotationStableId => id !== null,
            ),
          ),
        ],
      });
      return { annotation: dto, appearance, meta };
    } finally {
      if (annotPtr !== null) fn.FPDFPage_CloseAnnot(annotPtr);
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
   * states and every popup, in one change. `authority` is checked against
   * each of them, and every check runs before the first write.
   */
  delete(
    ref: AnnotationRef,
    authority: AnnotationAuthority,
    signal: AbortSignal,
  ): AnnotationDeleteResult {
    throwIfAborted(signal);
    const { fn } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const pageObjectNumber = ref.page.objectNumber;
    const { pageIndex } = this.session.resolvePageRef(ref.page);
    if (ref.kind === 'index') this.session.validateRevision(ref.revision);
    // Raw handles off the document, never a loaded page: a page loaded
    // before this change's writes (a layer's copy-on-write) could miss them.
    const { annotations } = new RawAnnotationReader(this.runtime, this.session, this.fonts).listOne(
      pageObjectNumber,
      signal,
    );
    const hasWeak = (list: readonly Annotation<PdfCoordinates>[]) =>
      list.some((annotation) => annotation.ref.kind === 'index');
    if (this.session.weakAnnotationState(pageObjectNumber).kind !== 'known') {
      this.session.recordWeakFlag(pageObjectNumber, hasWeak(annotations));
    }
    const pageStateBefore = this.session.pageState(pageObjectNumber);

    const members = deletedWith(annotations, ref);
    if (members.length === 0) throw missingAnnotation(ref);
    authorizeAnnotationDelete(authority, members);
    for (const member of members) {
      this.withAnnotAt(pageIndex, member.index, (annotPtr) =>
        this.assertNotAttachedWidget(annotPtr, 0),
      );
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

    // Apply boundary. Promotion keeps every position; then the highest
    // position first, so the positions still to go hold. The raw remove also
    // deletes the indirect object.
    throwIfAborted(signal);
    promoteInlineAnnotations(this.runtime, this.session, pageObjectNumber);
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
      this.withAnnotAt(pageIndex, parent.index - before, (annotPtr) =>
        fn.EPDFAnnot_RemoveKey(annotPtr, 'Popup'),
      );
    }
    this.session.bumpRevision(pageObjectNumber);
    this.recordWeakAnnotations(pageObjectNumber, pageIndex);
    const meta = computeMutationImpact({
      mutation: 'delete',
      pageStateBefore,
      pageStateAfter: this.session.pageState(pageObjectNumber),
      // The annotation first, then what went with it.
      changed: [...members].reverse().flatMap((member) => stableIdOf(member.ref)),
    });
    return { meta };
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
    const pageObjectNumber = ref.page.objectNumber;
    const { pageIndex, index } = resolveAnnotIndexRaw(this.runtime, this.session, ref);
    this.knowWeakAnnotations(pageObjectNumber, pageIndex);
    const pageStateBefore = this.session.pageState(pageObjectNumber);

    // What the ref names it by; a weak widget has no durable id to report.
    const deleted = this.withAnnotAt(pageIndex, index, (annotPtr) => {
      this.assertNotAttachedWidget(annotPtr, releasedFieldObjectNumber);
      if (ref.kind !== 'index') return stableIdOf(ref)[0]!;
      const objectNumber = fn.EPDFAnnot_GetObjectNumber(annotPtr);
      if (objectNumber > 0) return { kind: 'objectNumber', objectNumber } as const;
      const nm = readAnnotString(fn, mem, annotPtr, 'NM');
      return nm ? ({ kind: 'nm', nm } as const) : null;
    });

    // Promotion keeps every position; the raw remove also deletes the
    // indirect object.
    promoteInlineAnnotations(this.runtime, this.session, pageObjectNumber);
    if (!fn.EPDFPage_RemoveAnnotRaw(this.session.requireDocPtr(), pageIndex, index)) {
      throw new EngineError(EngineErrorCode.Unknown, `failed to remove annotation: ${ref.kind}`);
    }

    // A structural change advances the local index-space epoch whatever the
    // page's weak state: old snapshots can still hold index refs from before
    // annotations were strengthened, and a delete makes those point elsewhere.
    this.session.bumpRevision(pageObjectNumber);
    this.recordWeakAnnotations(pageObjectNumber, pageIndex);
    const meta = computeMutationImpact({
      mutation: 'delete',
      pageStateBefore,
      pageStateAfter: this.session.pageState(pageObjectNumber),
      changed: deleted ? [deleted] : [],
    });
    return { meta };
  }

  /**
   * Batch reorder of a contiguous block of annotations within a single
   * page's /Annots array. Symmetric with `pages.move()` for pages.
   *
   * Semantics (mirrors `EPDFPage_MoveAnnotsRaw`):
   *   - Each ref in `refs` is resolved to its current /Annots index.
   *     The block is detached, then re-inserted at `toIndex` in the
   *     post-removal index space, preserving caller-supplied order.
   *   - Single-annotation case is `move([ref], toIndex)`. There is no
   *     separate single-move path; one batch primitive serves both.
   *   - One revision bump and one `AnnotationListMutationMeta` envelope
   *     per batch, regardless of `refs.length`.
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
   * `EPDFPage_MoveAnnotsRaw` itself enforces the same rules; the up-front
   * validation is purely for a usable error surface.
   */
  move(
    pageObjectNumber: PageObjectNumber,
    refs: AnnotationRef[],
    toIndex: number,
    signal: AbortSignal,
  ): AnnotationMoveResult<PdfCoordinates> {
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
      if (r.page.objectNumber !== pageObjectNumber) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `move refs must all target page ${pageObjectNumber}; got ref on page ${r.page.objectNumber}`,
        );
      }
    }

    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const { pageIndex } = this.session.resolvePageRef(toPageRef(pageObjectNumber));
    this.knowWeakAnnotations(pageObjectNumber, pageIndex);
    const pageStateBefore = this.session.pageState(pageObjectNumber);

    // 1. Resolve every ref, in caller order, to its current /Annots index.
    const fromIndices = refs.map((ref) => {
      throwIfAborted(signal);
      return resolveAnnotIndexRaw(this.runtime, this.session, ref).index;
    });

    // 2. Two refs that resolve to one index would break the helper's
    //    invariant (and are a confused caller).
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

    // 3. Range-check toIndex against the post-removal count, matching the
    //    helper's contract.
    const postRemovalCount = fn.EPDFPage_GetAnnotCountRaw(docPtr, pageIndex) - fromIndices.length;
    if (toIndex > postRemovalCount) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `move toIndex ${toIndex} out of range; post-removal count is ${postRemovalCount}`,
      );
    }

    // Apply boundary. Each annotation's stable id, stamped on a weak one
    // before promotion gives it an object number.
    throwIfAborted(signal);
    const stableIds = fromIndices.map((index) =>
      this.withAnnotAt(pageIndex, index, (annotPtr) => this.captureOrStampStableId(annotPtr)),
    );

    // 4. Promotion keeps every position; then the block moves.
    promoteInlineAnnotations(this.runtime, this.session, pageObjectNumber);
    const moved = withScratch(mem, 4 * fromIndices.length, (arrPtr) => {
      fromIndices.forEach((index, i) => mem.poke(arrPtr, 'i32', index, 4 * i));
      return fn.EPDFPage_MoveAnnotsRaw(docPtr, pageIndex, arrPtr, fromIndices.length, toIndex);
    });
    if (!moved) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `EPDFPage_MoveAnnotsRaw rejected the request (toIndex=${toIndex}, fromIndices=[${fromIndices.join(
          ',',
        )}])`,
      );
    }

    // 5. One revision bump for the whole batch. This is the local
    //    index-space epoch, so it advances for every move even if the page
    //    is strong. The moved DTOs read against the bumped revision.
    const bumpedRev = this.session.bumpRevision(pageObjectNumber);
    const annotations = fromIndices.map((_, i) => {
      throwIfAborted(signal);
      return this.withAnnotAt(pageIndex, toIndex + i, (annotPtr) =>
        readAnnotationFromPtr(
          fn,
          mem,
          annotPtr,
          pageObjectNumber,
          toIndex + i,
          bumpedRev,
          readContextFor(this.session, this.fonts),
        ),
      );
    });

    this.recordWeakAnnotations(pageObjectNumber, pageIndex);
    const meta: AnnotationListMutationMeta = computeMutationImpact({
      mutation: 'move',
      pageStateBefore,
      pageStateAfter: this.session.pageState(pageObjectNumber),
      changed: stableIds,
    });
    return { annotations, meta };
  }

  private captureOrStampStableId(annotPtr: Ptr): AnnotationStableId {
    return captureOrStampStableId(this.runtime, annotPtr);
  }

  /** An annotation of the page opened raw at `index`, closed after `body`. */
  private withAnnotAt<T>(pageIndex: number, index: number, body: (annotPtr: Ptr) => T): T {
    const annotPtr = openAnnotAtRaw(this.runtime, this.session, pageIndex, index);
    try {
      return body(annotPtr);
    } finally {
      this.runtime.fn.FPDFPage_CloseAnnot(annotPtr);
    }
  }

  private knowWeakAnnotations(pageObjectNumber: PageObjectNumber, pageIndex: number): void {
    if (this.session.weakAnnotationState(pageObjectNumber).kind === 'known') return;
    this.recordWeakAnnotations(pageObjectNumber, pageIndex);
  }

  private recordWeakAnnotations(pageObjectNumber: PageObjectNumber, pageIndex: number): void {
    this.session.recordWeakFlag(
      pageObjectNumber,
      pageHasWeakAnnotations(this.runtime, this.session.requireDocPtr(), pageIndex),
    );
  }
}

/** `NotFound` for a ref by number or name, `InvalidReference` for a position out of range. */
function missingAnnotation(ref: AnnotationRef): EngineError {
  const page = ref.page.objectNumber;
  switch (ref.kind) {
    case 'objectNumber':
      return new EngineError(
        EngineErrorCode.NotFound,
        `no annotation with object number ${ref.objectNumber} on page ${page}`,
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
  if (ref.kind === 'objectNumber')
    return [{ kind: 'objectNumber', objectNumber: ref.objectNumber }];
  if (ref.kind === 'nm') return [{ kind: 'nm', nm: ref.nm }];
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
