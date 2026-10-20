import type {
  Annotation,
  AnnotationFamily,
  AnnotationPatch,
  AnnotationRef,
  ChangeItemType,
  CustomMetadataPatch,
  FormFieldDTO,
  FormFieldPatch,
  FormFieldValue,
  MetadataPatch,
  OutlineItemPatch,
  OutlineItemRef,
  PageRef,
  PdfCoordinates,
  PdfDestination,
  PdfRotation,
  WidgetAnnotation,
} from '@embedpdf/engine-core/runtime';

/**
 * What the engine keeps of a change so it can undo it: who made it, and the
 * steps that reverse it, in the order they run (the reverses of its ops, in
 * reverse op order). Each step is guarded by what the change left: it applies
 * where the document still shows that, and is skipped, and reported, where it
 * doesn't. Running a step records the step that reverses it in turn, so the
 * undo of an undo is a redo.
 */
export interface ChangeRecord {
  /** Who made the change: only they may undo it. */
  readonly userId: string | null;
  readonly steps: readonly ReverseStep[];
}

export type ReverseStep =
  | ObjectsRevertStep
  | AnnotationRemoveStep
  | AnnotationRestoreStep
  | AnnotationReorderStep
  | FieldRemoveStep
  | FieldRestoreStep
  | WidgetRestoreStep
  | WidgetDeleteStep
  | CalculationOrderStep
  | MetadataRevertStep
  | OutlineRemoveStep
  | OutlineRestoreStep
  | OutlineMoveStep
  | OutlineReopenStep
  | PageRotateStep
  | PageReorderStep
  | PageRestoreStep
  | PageRemoveStep;

/**
 * One dictionary a change wrote, as it was before (the capture, with the
 * objects under `deep` the layer held) and as the change left it (a shallow
 * capture, the guard). `before` is null for a dictionary the change made.
 */
export interface CapturedObject {
  readonly objectNumber: number;
  readonly deep: readonly string[];
  readonly before: Uint8Array | null;
  readonly after: Uint8Array;
}

/**
 * Puts back the dictionaries an op wrote, exactly as they were, when each
 * still reads as the op left it. When one doesn't, someone changed it since:
 * an annotation update, a field update or a form value write puts back, by
 * value, only what still shows what the op set (`fallback`); any other op is
 * skipped.
 */
export interface ObjectsRevertStep {
  readonly kind: 'objects.revert';
  /** What its item reports doing: the op it puts back, or its opposite (a widget's add undoes its removal). */
  readonly reports: ChangeItemType;
  readonly objects: readonly CapturedObject[];
  /** What the item reads back: the annotation, the form fields, or the outline item. */
  readonly subject:
    | { readonly annotation: AnnotationRef }
    | { readonly fields: readonly number[] }
    | { readonly outlineItem: OutlineItemRef };
  /** Whether the op changed what the annotation shows (its update's `appearance.changed`). */
  readonly appearanceChanged?: boolean;
  readonly fallback?: RevertFallback;
  /** The rights it takes beside its op's: an import's (see {@link StepRights}). */
  readonly rights?: StepRights;
}

/** How a revert puts values back when the dictionaries it wrote changed since. */
export type RevertFallback =
  | {
      readonly kind: 'annotation';
      /** The old values of the fields the update changed. */
      readonly restore: AnnotationPatch<PdfCoordinates>;
      /** The values the update left in them: a field still holding its value is put back. */
      readonly left: AnnotationPatch<PdfCoordinates>;
    }
  | {
      readonly kind: 'properties';
      readonly objectNumber: number;
      /** The old values of the properties a field update changed, as a patch. */
      readonly restore: FormFieldPatch;
      /** The values it left in them: a property still holding its value is put back. */
      readonly left: FormFieldPatch;
    }
  | {
      readonly kind: 'outline';
      /** The old values of the fields an outline item update changed, as a patch. */
      readonly restore: OutlineItemPatch<PdfDestination>;
      /** The values it left in them: a field still holding its value is put back. */
      readonly left: OutlineItemPatch<PdfDestination>;
    }
  | {
      readonly kind: 'value';
      /** Each field the op wrote: its value before, and the value the op left. */
      readonly fields: readonly {
        readonly objectNumber: number;
        readonly before: FormFieldValue;
        readonly left: FormFieldValue;
      }[];
    };

/**
 * Deletes what a create, an import or a restore brought back, when nobody
 * changed it since and deleting it takes nothing else: undoing a create
 * never deletes someone else's reply.
 */
export interface AnnotationRemoveStep {
  readonly kind: 'annotation.remove';
  readonly ref: AnnotationRef;
  /** What the delete takes, as the change left it: the annotation first. */
  readonly left: readonly Annotation<PdfCoordinates>[];
  /** The rights it takes: an import's (see {@link StepRights}); a delete's when absent. */
  readonly rights?: StepRights;
}

/**
 * The rights a step takes as a restoring import's undo or redo: what the
 * import took. For annotations, `doc.annotate.modify` and
 * `doc.annotate.import` instead of the per-annotation rules: a restoring
 * import gives annotations other people's `userId`, which a delete's rules
 * (`annotations:delete:self`) would never let the importer remove. For
 * forms, `doc.forms.import` beside `doc.forms.modify` or `doc.forms.fill`:
 * putting back who made or filled a field is restoring attribution too.
 */
export type StepRights = 'import';

/**
 * Brings back what a delete removed: the same objects, at the same numbers and
 * positions, from the capture taken in the delete's transaction.
 */
export interface AnnotationRestoreStep {
  readonly kind: 'annotation.restore';
  readonly page: PageRef;
  /** What came back: the annotation first, then what went with it. */
  readonly members: readonly AnnotationRef[];
  readonly capture: Uint8Array;
  /** Annotations the delete unlinked a popup from, put back as they were. */
  readonly unlinked: readonly CapturedObject[];
  /** The rights it takes: those of the remove it reverses (see {@link StepRights}). */
  readonly rights?: StepRights;
}

/**
 * Puts rows of one family on a page back beside the neighbours they had
 * before a reorder: its reverse, and, the other way round, its redo. A row
 * runs only when it is still where the reorder left it.
 */
export interface AnnotationReorderStep {
  readonly kind: 'annotation.reorder';
  readonly page: PageRef;
  readonly family: AnnotationFamily;
  /** The rows the reorder moved, in the order it was given them. */
  readonly refs: readonly AnnotationRef[];
  /** The family's order before the reorder, bottom to top: where the rows go back to. */
  readonly before: readonly AnnotationRef[];
  /** The family's order it left. */
  readonly after: readonly AnnotationRef[];
}

/**
 * Takes back what a change did to the form's calculation order, by field
 * object number, where nobody changed it since (see `orderBack`): a field it
 * added leaves, one it took out comes back, one it moved goes back beside
 * its old neighbour.
 */
export interface CalculationOrderStep {
  readonly kind: 'calculations.restore';
  /** The order before the change. */
  readonly before: readonly number[];
  /** The order the change left. */
  readonly after: readonly number[];
}

/**
 * Brings back a widget a delete removed: onto its page at its place, and into
 * its field again when it had one. Left alone when the page is gone, the
 * widget is back already, or its field changed since.
 */
export interface WidgetRestoreStep {
  readonly kind: 'widget.restore';
  readonly page: PageRef;
  readonly widget: AnnotationRef;
  /** The widget as it was on its page, out of its field. */
  readonly capture: Uint8Array;
  /** The field it was in; `null` for a widget in no field. */
  readonly fieldObjectNumber: number | null;
  /** The field's dictionary and the widget's, before and after it left the field. */
  readonly detached: readonly CapturedObject[];
}

/** Deletes a widget a restore brought back, when nobody changed it since: the redo of a delete. */
export interface WidgetDeleteStep {
  readonly kind: 'widget.delete';
  readonly widget: AnnotationRef;
  readonly left: WidgetAnnotation<PdfCoordinates>;
}

/** Deletes a field a create or an import made, when nobody changed it since. */
export interface FieldRemoveStep {
  readonly kind: 'field.remove';
  readonly objectNumber: number;
  /** The field as the change left it. */
  readonly left: FormFieldDTO<PdfCoordinates>;
  /** The rights it takes beside `doc.forms.modify`: an import's (see {@link StepRights}). */
  readonly rights?: StepRights;
}

/** Brings back a field a delete removed, its widgets and the parents it pruned. */
export interface FieldRestoreStep {
  readonly kind: 'field.restore';
  readonly objectNumber: number;
  /** Its fully qualified name: the restore is skipped when another field took it. */
  readonly name: string;
  /** The pages its widgets were on: the restore is skipped when one is gone. */
  readonly pages: readonly PageRef[];
  readonly capture: Uint8Array;
  /** The rights it takes: those of the remove it reverses (see {@link StepRights}). */
  readonly rights?: StepRights;
}

/** Puts metadata back, entry by entry, where an entry still holds what the change set. */
export interface MetadataRevertStep {
  readonly kind: 'metadata.revert';
  readonly op: 'metadata.update' | 'metadata.updateCustom';
  readonly restore: MetadataPatch | CustomMetadataPatch;
  readonly left: MetadataPatch | CustomMetadataPatch;
}

/**
 * Deletes outline items a create or a restore brought back, when nobody
 * changed them since: the item and the items under it are the same ones, and
 * their dictionaries read exactly as the change left them. Undoing a create
 * never deletes an item someone gave a child, or renamed, since; a page its
 * target goes to going away changes nothing of it.
 */
export interface OutlineRemoveStep {
  readonly kind: 'outline.remove';
  readonly ref: OutlineItemRef;
  /** The item and the items under it, depth first, each as the change left it (the guard). */
  readonly left: readonly CapturedObject[];
}

/**
 * Opens again a parent that the op this step follows emptied, as it was open
 * before: a parent without children has no open state, so it comes back
 * closed with its first child. Only while its children are just the ones the
 * undo put back: a parent someone filled since keeps what they left.
 */
export interface OutlineReopenStep {
  readonly kind: 'outline.reopen';
  readonly ref: OutlineItemRef;
  /** The children it has once the undo put them back. */
  readonly children: readonly number[];
}

/**
 * Brings back what an outline delete removed: the same items, at the same
 * numbers, at the place the item had (`EPDFOutline_ImportItemRaw`). Left
 * alone when its parent is gone or it is back already.
 */
export interface OutlineRestoreStep {
  readonly kind: 'outline.restore';
  readonly ref: OutlineItemRef;
  /** Its parent when it went; `null` for the top level. */
  readonly parent: OutlineItemRef | null;
  readonly capture: Uint8Array;
}

/**
 * Puts outline items back where they were before a move: its reverse, and,
 * the other way round, its redo. Each item goes only while it is still under
 * the parent the move left it under, and its parent is still there.
 */
export interface OutlineMoveStep {
  readonly kind: 'outline.move';
  /**
   * Where each goes back to, by object number (parent 0: the top level;
   * after 0: first), in document order, so an anchor is placed before what
   * follows it.
   */
  readonly placements: readonly {
    readonly item: number;
    readonly parent: number;
    readonly after: number;
  }[];
  /** The parent each was left under (0: the top level). */
  readonly left: readonly { readonly item: number; readonly parent: number }[];
}

/**
 * Turns pages to `rotation`: its reverse, and, the other way round, its redo.
 * Each page turns only while it still has the rotation the change left it
 * with (`left`). A change that turned pages from several rotations has one
 * step for each.
 */
export interface PageRotateStep {
  readonly kind: 'pages.rotate';
  /** The pages, by object number. */
  readonly pages: readonly number[];
  readonly rotation: PdfRotation;
  readonly left: PdfRotation;
}

/**
 * Puts pages back where they were before a move: its reverse, and, the other
 * way round, its redo. Each page goes only while it still follows the page the
 * move left it after, and the page it goes after is still there.
 */
export interface PageReorderStep {
  readonly kind: 'pages.reorder';
  /**
   * Where each goes back to, by object number (after 0: first), in display
   * order, so an anchor is placed before what follows it.
   */
  readonly placements: readonly { readonly page: number; readonly after: number }[];
  /** The page each was left after (0: first). */
  readonly left: readonly { readonly page: number; readonly after: number }[];
}

/**
 * Brings back what a page delete removed: the same pages, at the same
 * numbers, each after the page it followed while that is still there, else
 * first (`EPDFPage_ImportRaw`), with their annotations and names. A page that
 * is back already is left alone.
 */
export interface PageRestoreStep {
  readonly kind: 'pages.restore';
  /** Each page and its capture, in the display order they had. */
  readonly pages: readonly { readonly page: number; readonly capture: Uint8Array }[];
}

/**
 * Deletes pages an insert or a restore brought, each while it reads as the
 * change left it: the page and what the layer holds of its annotations,
 * contents and resources. Undoing an insert never deletes a page someone
 * annotated, or turned, since. A step that would delete every page is left
 * alone: a document keeps one.
 */
export interface PageRemoveStep {
  readonly kind: 'pages.remove';
  /** Each page, and the digest of how the change left it. */
  readonly pages: readonly { readonly page: number; readonly left: string }[];
}

/** The bytes a record's captures hold. */
export function recordBytes(record: ChangeRecord): number {
  let bytes = 0;
  const objects = (list: readonly CapturedObject[]) => {
    for (const object of list) bytes += (object.before?.byteLength ?? 0) + object.after.byteLength;
  };
  for (const step of record.steps) {
    switch (step.kind) {
      case 'objects.revert':
        objects(step.objects);
        break;
      case 'annotation.restore':
        bytes += step.capture.byteLength;
        objects(step.unlinked);
        break;
      case 'field.restore':
      case 'outline.restore':
        bytes += step.capture.byteLength;
        break;
      case 'outline.remove':
        objects(step.left);
        break;
      case 'pages.restore':
        for (const { capture } of step.pages) bytes += capture.byteLength;
        break;
      default:
        break;
    }
  }
  return bytes;
}
