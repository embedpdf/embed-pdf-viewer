import { isDimension, type PdfCoordinates } from '@embedpdf/engine-core/runtime';
import {
  annotationKey,
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
  type AnnotationDraft,
  type AnnotationPatch,
  type WireAnnotationResources,
  type AnnotationRef,
  type AnnotationReplyType,
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
import { throwIfAborted } from '../../shared/abort';
import type { FontRegistrar } from '../fonts';
import { annotationRefOf } from './internal/identity/annotationName';
import { openAnnotAtRaw, resolveAnnotIndexRaw } from './internal/identity/resolveAnnotIndexRaw';
import { annotationMutationMeta } from './internal/mutations/annotationMutationMeta';
import { readContextFor } from './internal/read/annotationReadContext';
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
 * mutations. Owns the dance between PDFium calls, identity bookkeeping, and
 * the `AnnotationListMutationMeta` envelope every result type carries.
 *
 * Lives in `engine-services` (not the worker hosts) so the local Web
 * Worker, the Node `worker_thread` server, and any future direct-thread
 * embedding share the exact same code path. The only difference between
 * them is the underlying `PdfRuntimeModule` (WASM vs native).
 *
 * Identity rules enforced here, locked with the user:
 *   - `create` is a one-item change set on `AnnotationBatchApplier`, which
 *     makes the annotation with `EPDFPage_CreateAnnotRaw` (an indirect
 *     object, on a page that isn't loaded), so a new annotation is named by
 *     its object number. If the fork helper ever returns a direct object, it
 *     throws.
 *   - Every annotation keeps its name through every write (see
 *     `annotationRefOf`). No write stamps an /NM to name one, and the patch
 *     type has no `nm` field, so callers cannot rename one either.
 *   - `delete` is subtype-agnostic and names everything it removed.
 *
 * Every write finds its annotations from the page's dictionaries (raw
 * handles), so none parses the page's content. Each runs inside its job's
 * layer transaction: a failure after the first write aborts all of it.
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
      runtime: this.runtime,
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
    options: {
      /** Who creates it: stamped as its author. */
      readonly actor?: AnnotationActor;
      /** The bytes beside the draft, by role. */
      readonly resources?: WireAnnotationResources;
      /** The object number it gets; the next free one when absent. */
      readonly objectNumber?: number;
    } = {},
  ): AnnotationCreateResult<PdfCoordinates> {
    const { actor, resources, objectNumber } = options;
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
          ...(objectNumber !== undefined ? { objectNumber } : {}),
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
      // first document write.
      throwIfAborted(signal);

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
      // Apply /IRT + /RT changes (set/relink/clear, or RT-only). Only this
      // annotation is written; a popup relink and a shared `/Open` also write
      // the other annotation, which `meta.changed` names after this one.
      let linkedParent: AnnotationRef | null = null;
      if (patch.reply !== undefined && !sameReply(patch.reply, currentDto.reply)) {
        writeAnnotationRelationship(
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
        linkedParent = writePopupParent(
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
      let linkedOpen: AnnotationRef | null = null;
      const open = (patch as { open?: boolean }).open;
      if (open !== undefined && !relinked) {
        const other =
          currentDto.subtype === 'text'
            ? currentDto.popup
            : currentDto.subtype === 'popup'
              ? currentDto.parent
              : null;
        if (other) {
          linkedOpen = writeLinkedOpen(
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
        const ok =
          currentDto.subtype === 'widget'
            ? // Drawn as its field's family draws it; a widget in no field has none.
              fn.EPDFAnnot_GenerateFormFieldAP(annotPtr)
            : generateAppearance(fn, annotPtr, patch.blendMode ?? previousBlendMode);
        appearance = ok
          ? { action: 'regenerated', changed: true }
          : // No generator for this annotation (a widget in no field). The
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

      // Read back. Update is non-structural, so the index does not move.
      const dto = readAnnotationFromPtr(
        fn,
        mem,
        annotPtr,
        ref.page.objectNumber,
        index,
        readContextFor(this.session, this.fonts),
      );
      joinWidgetFieldNumbers(this.runtime, this.session, [dto]);

      const meta = annotationMutationMeta(
        this.session.writeStamp(),
        ref.page.objectNumber,
        uniqueRefs([dto.ref, linkedParent, linkedOpen]),
      );
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
    // Raw handles off the document, never a loaded page: a page loaded
    // before this change's writes (a layer's copy-on-write) could miss them.
    const { annotations } = new RawAnnotationReader(this.runtime, this.session, this.fonts).listOne(
      pageObjectNumber,
      signal,
    );

    const members = deletedWith(annotations, ref);
    if (members.length === 0) throw missingAnnotation(ref);
    authorizeAnnotationDelete(authority, members);
    const indexOf = (member: AnnotationRef) =>
      resolveAnnotIndexRaw(this.runtime, this.session, member).index;
    const positions = members.map((member) => indexOf(member.ref));
    for (const index of positions) {
      this.withAnnotAt(pageIndex, index, (annotPtr) => this.assertNotAttachedWidget(annotPtr, 0));
    }
    // A popup deleted without the annotation it shows leaves that
    // annotation, which stops naming it.
    const going = new Set(members.map((member) => annotationKey(member.ref)));
    const keptParents = members.flatMap((member) => {
      if (member.subtype !== 'popup' || !member.parent) return [];
      const key = annotationKey(member.parent);
      const parent = annotations.find((annotation) => annotationKey(annotation.ref) === key);
      return parent && !going.has(key) ? [indexOf(parent.ref)] : [];
    });

    // Apply boundary. Promotion keeps every position; then the highest
    // position first, so the positions still to go hold. The raw remove also
    // deletes the indirect object.
    throwIfAborted(signal);
    promoteInlineAnnotations(this.runtime, this.session, pageObjectNumber);
    for (const index of [...positions].sort((a, b) => b - a)) {
      if (!fn.EPDFPage_RemoveAnnotRaw(docPtr, pageIndex, index)) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `failed to remove annotation ${index} on page ${pageObjectNumber}`,
        );
      }
    }
    // After the removals, at the position each kept parent now has.
    for (const parent of keptParents) {
      const before = positions.filter((index) => index < parent).length;
      this.withAnnotAt(pageIndex, parent - before, (annotPtr) =>
        fn.EPDFAnnot_RemoveKey(annotPtr, 'Popup'),
      );
    }
    // The annotation first, then what went with it.
    const changed = [...members].reverse().map((member) => member.ref);
    return { meta: annotationMutationMeta(this.session.writeStamp(), pageObjectNumber, changed) };
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
    const docPtr = this.session.requireDocPtr();
    const pageObjectNumber = ref.page.objectNumber;
    const { pageIndex, index } = resolveAnnotIndexRaw(this.runtime, this.session, ref);

    const deleted = this.withAnnotAt(pageIndex, index, (annotPtr) => {
      this.assertNotAttachedWidget(annotPtr, releasedFieldObjectNumber);
      return annotationRefOf(fn, mem, docPtr, ref.page, annotPtr, index);
    });

    // Promotion keeps every position; the raw remove also deletes the
    // indirect object.
    promoteInlineAnnotations(this.runtime, this.session, pageObjectNumber);
    if (!fn.EPDFPage_RemoveAnnotRaw(docPtr, pageIndex, index)) {
      throw new EngineError(EngineErrorCode.Unknown, `failed to remove annotation: ${ref.kind}`);
    }
    return { meta: annotationMutationMeta(this.session.writeStamp(), pageObjectNumber, [deleted]) };
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
}

/** `NotFound` for a ref that names no annotation on its page. */
function missingAnnotation(ref: AnnotationRef): EngineError {
  return new EngineError(
    EngineErrorCode.NotFound,
    `no annotation ${annotationKey(ref)} on page ${ref.page.objectNumber}`,
  );
}

/** What a write reports touching, once each, in order. */
function uniqueRefs(refs: ReadonlyArray<AnnotationRef | null>): AnnotationRef[] {
  const seen = new Set<string>();
  return refs.filter((ref): ref is AnnotationRef => {
    if (ref === null || seen.has(annotationKey(ref))) return false;
    seen.add(annotationKey(ref));
    return true;
  });
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
