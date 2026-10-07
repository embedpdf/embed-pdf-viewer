import type {
  Annotation,
  AnnotationPatch,
  AnnotationRef,
  ChangeItemType,
  CustomMetadataPatch,
  FormFieldDTO,
  FormFieldPatch,
  FormFieldValue,
  MetadataPatch,
  PageRef,
  PdfCoordinates,
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
  | MetadataRevertStep;

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
  /** What the item reads back: the annotation, or the form fields. */
  readonly subject: { readonly annotation: AnnotationRef } | { readonly fields: readonly number[] };
  /** Whether the op changed what the annotation shows (its update's `appearance.changed`). */
  readonly appearanceChanged?: boolean;
  readonly fallback?: RevertFallback;
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
      readonly kind: 'value';
      /** Each field the op wrote: its value before, and the value the op left. */
      readonly fields: readonly {
        readonly objectNumber: number;
        readonly before: FormFieldValue;
        readonly left: FormFieldValue;
      }[];
    };

/**
 * Deletes what a create or a restore brought back, when nobody changed it
 * since and deleting it takes nothing else: undoing a create never deletes
 * someone else's reply.
 */
export interface AnnotationRemoveStep {
  readonly kind: 'annotation.remove';
  readonly ref: AnnotationRef;
  /** What the delete takes, as the change left it: the annotation first. */
  readonly left: readonly Annotation<PdfCoordinates>[];
}

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
}

/**
 * Moves annotations to `targets`, when they are still `at`: back where a move
 * took them from, or, for a redo, where it put them.
 */
export interface AnnotationReorderStep {
  readonly kind: 'annotation.reorder';
  readonly page: PageRef;
  readonly refs: readonly AnnotationRef[];
  /** Where each of `refs` is when the step may run. */
  readonly at: readonly number[];
  /** Where each of `refs` goes. */
  readonly targets: readonly number[];
}

/** Deletes a field a create made, when nobody changed it since. */
export interface FieldRemoveStep {
  readonly kind: 'field.remove';
  readonly objectNumber: number;
  /** The field as the change left it. */
  readonly left: FormFieldDTO<PdfCoordinates>;
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
}

/** Puts metadata back, entry by entry, where an entry still holds what the change set. */
export interface MetadataRevertStep {
  readonly kind: 'metadata.revert';
  readonly op: 'metadata.update' | 'metadata.updateCustom';
  readonly restore: MetadataPatch | CustomMetadataPatch;
  readonly left: MetadataPatch | CustomMetadataPatch;
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
        bytes += step.capture.byteLength;
        break;
      default:
        break;
    }
  }
  return bytes;
}
