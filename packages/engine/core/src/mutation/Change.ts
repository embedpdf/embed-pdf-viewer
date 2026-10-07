import type { AnnotationListMutationMeta } from './AnnotationListMutationMeta';
import type {
  AnnotationCreateResult,
  AnnotationDeleteResult,
  AnnotationMoveResult,
  AnnotationUpdateResult,
} from './AnnotationMutationResults';
import type { CustomMetadataUpdateResult } from './CustomMetadataUpdateResult';
import type {
  FormFieldCreateResult,
  FormFieldDeleteResult,
  FormFieldUpdateResult,
  FormMutationMeta,
  FormResetResult,
  FormSetValueResult,
  FormWidgetLinkResult,
} from './FormMutationResults';
import type { MetadataUpdateResult } from './MetadataUpdateResult';
import type { MutationMeta } from './MutationMeta';
import type { Annotation, AnnotationDraft, AnnotationPatch } from '../annotation/kinds';
import {
  annotationResourceBuffers,
  hasAnnotationResources,
  resolveAnnotationResources,
  withFileFromResource,
  type AnnotationResources,
  type WireAnnotationResources,
} from '../annotation/resources';
import type { CustomMetadataPatch } from '../dto/CustomMetadataPatch';
import type { MetadataPatch } from '../dto/MetadataPatch';
import type { SerializedEngineError } from '../errors/EngineError';
import type { FormFieldDraft, WidgetPlacement } from '../forms/draft';
import type { FormFieldDisplay } from '../forms/effects';
import type { FormFieldDTO } from '../forms/field';
import type { FormFieldPatch } from '../forms/patch';
import type { FormFieldValue } from '../forms/value';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { FormFieldRef } from '../identity/FormFieldRef';
import type { PageRef } from '../identity/PageRef';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';
import type { SignatureAppearanceInput } from '../signature/types';

/**
 * One user action, applied as one transaction (`doc.apply`): its ops in
 * order, all of them or none; or the reverse of an earlier change.
 *
 * A change is one entry everywhere: one audit row, one burst of events that
 * share `origin.tx`, and one undo step. `R` is how resources travel: what a
 * caller passes (`AnnotationResources`), or bytes on the wire.
 */
export type Change<C extends Coordinates = PageCoordinates, R = AnnotationResources> =
  | { readonly ops: readonly ChangeOp<C, R>[] }
  /**
   * The reverse of the change this names (its `opId`), as the engine
   * recorded it when that change ran. It applies where the document still
   * shows what that change set, and lists what it left alone (`skipped`).
   */
  | { readonly undoOf: string };

/**
 * One op of a change: exactly the parameters of its single verb. A create
 * that names its object number (from `doc.objectNumbers`) can be referred to
 * by later ops of the same change, by its final ref.
 *
 * `expect` says what the op assumes the document holds now, in the shape of
 * what it writes: an update's `expect` is a patch of the values the fields
 * must have. When the document doesn't match, the whole change is refused
 * with `ChangeConflict`. Without it, the last write wins.
 */
export type ChangeOp<C extends Coordinates = PageCoordinates, R = AnnotationResources> =
  | {
      readonly type: 'annotations.create';
      readonly page: PageRef;
      readonly data: AnnotationDraft<C>;
      readonly objectNumber?: number;
      readonly resources?: R;
    }
  | {
      readonly type: 'annotations.update';
      readonly ref: AnnotationRef;
      readonly patch: AnnotationPatch<C>;
      readonly resources?: R;
      readonly expect?: AnnotationPatch<C>;
    }
  | {
      readonly type: 'annotations.delete';
      readonly ref: AnnotationRef;
      readonly expect?: AnnotationPatch<C>;
    }
  | {
      readonly type: 'annotations.move';
      readonly page: PageRef;
      readonly refs: readonly AnnotationRef[];
      readonly toIndex: number;
      /** The index each of `refs` has now, in `refs` order. */
      readonly expect?: readonly number[];
    }
  | {
      readonly type: 'forms.setValue';
      readonly field: FormFieldRef;
      readonly value: FormFieldValue;
      readonly expect?: FormFieldValue;
    }
  | {
      readonly type: 'forms.setDisplay';
      readonly field: FormFieldRef;
      readonly display: FormFieldDisplay;
      readonly expect?: FormFieldDisplay;
    }
  | {
      readonly type: 'forms.setAppearanceText';
      readonly field: FormFieldRef;
      readonly text: string;
    }
  | {
      readonly type: 'forms.reset';
      /** The fields to reset; every field without it. */
      readonly fields?: readonly FormFieldRef[];
    }
  | {
      readonly type: 'forms.create';
      readonly draft: FormFieldDraft<C>;
      readonly objectNumber?: number;
      /** The object numbers its widgets get, in `draft.widgets` order. */
      readonly widgetObjectNumbers?: readonly number[];
    }
  | {
      readonly type: 'forms.update';
      readonly field: FormFieldRef;
      readonly patch: FormFieldPatch;
      readonly expect?: FormFieldPatch;
    }
  | {
      readonly type: 'forms.delete';
      readonly field: FormFieldRef;
      readonly expect?: FormFieldPatch;
    }
  | {
      readonly type: 'forms.addWidget';
      readonly field: FormFieldRef;
      readonly placement: WidgetPlacement<C>;
      readonly objectNumber?: number;
      /** The number the widget split off a merged field gets, when the field is merged. */
      readonly splitObjectNumber?: number;
    }
  | {
      readonly type: 'forms.removeWidget';
      readonly field: FormFieldRef;
      readonly widget: AnnotationRef;
    }
  | {
      readonly type: 'forms.setSignatureAppearance';
      readonly field: FormFieldRef;
      readonly appearance: SignatureAppearanceInput;
    }
  | {
      readonly type: 'metadata.update';
      readonly patch: MetadataPatch;
      readonly expect?: MetadataPatch;
    }
  | {
      readonly type: 'metadata.updateCustom';
      readonly patch: CustomMetadataPatch;
    };

/** What an item can be: an op's type, or a restore (only in an undo). */
export type ChangeItemType = ChangeOp['type'] | 'annotations.restore' | 'forms.restore';

/**
 * An op an undo left alone entirely: the document no longer showed what the
 * change being undone had set (someone changed it since, replied to it, or
 * deleted it), so nothing was written and no event published. `op` is the
 * item it would have been.
 */
export interface SkippedChangeItem {
  type: 'skipped';
  op: ChangeItemType;
  meta: MutationMeta;
}

/**
 * What one op did: its single verb's result, with the op's `type`; or, in an
 * undo, an op it left alone (`SkippedChangeItem`). An undo's update items list
 * in `skipped` the fields they left alone, and its restore items name what
 * came back.
 */
export type ChangeItem<C extends Coordinates = PageCoordinates> =
  | ({ type: 'annotations.create'; page: PageRef } & AnnotationCreateResult<C>)
  | ({
      type: 'annotations.update';
      page: PageRef;
      /** The fields an undo left alone: they no longer showed what the change had set. */
      skipped?: readonly string[];
    } & AnnotationUpdateResult<C>)
  | ({ type: 'annotations.delete'; page: PageRef } & AnnotationDeleteResult)
  | ({ type: 'annotations.move'; page: PageRef } & AnnotationMoveResult<C>)
  | {
      type: 'annotations.restore';
      page: PageRef;
      /** What came back, in `/Annots` order: the annotation first, then what went with it. */
      annotations: Annotation<C>[];
      meta: AnnotationListMutationMeta;
    }
  | ({ type: 'forms.setValue' } & FormSetValueResult<C>)
  | ({ type: 'forms.setDisplay' } & FormFieldUpdateResult<C>)
  | ({ type: 'forms.setAppearanceText' } & FormFieldUpdateResult<C>)
  | ({
      type: 'forms.reset';
      /** The fields an undo left alone, by name. */
      skipped?: readonly string[];
    } & FormResetResult<C>)
  | ({ type: 'forms.create' } & FormFieldCreateResult<C>)
  | ({
      type: 'forms.update';
      /** The properties an undo left alone: they no longer showed what the change had set. */
      skipped?: readonly string[];
    } & FormFieldUpdateResult<C>)
  | ({ type: 'forms.delete' } & FormFieldDeleteResult)
  | {
      type: 'forms.restore';
      field: FormFieldDTO<C>;
      meta: FormMutationMeta;
    }
  | ({ type: 'forms.setSignatureAppearance' } & FormFieldUpdateResult<C>)
  | ({ type: 'forms.addWidget' } & FormWidgetLinkResult<C>)
  | ({ type: 'forms.removeWidget' } & FormWidgetLinkResult<C>)
  | ({
      type: 'metadata.update';
      /** The entries an undo left alone. */
      skipped?: readonly string[];
    } & MetadataUpdateResult)
  | ({
      type: 'metadata.updateCustom';
      /** The keys an undo left alone. */
      skipped?: readonly string[];
    } & CustomMetadataUpdateResult)
  | SkippedChangeItem;

/** Whether an item is an op an undo left alone entirely. */
export function isSkippedItem<C extends Coordinates>(
  item: ChangeItem<C>,
): item is SkippedChangeItem {
  return item.type === 'skipped';
}

/** What `doc.apply` resolves. */
export interface ChangeResult<C extends Coordinates = PageCoordinates> {
  /** One per op, in op order; for an undo, one per op of the reverse. */
  items: ChangeItem<C>[];
  /**
   * Every page the change touched, the cloud's cache delta, the change's
   * `opId` (what `{ undoOf }` names) and whether it can be undone.
   */
  meta: MutationMeta;
}

/** Whether a change is an undo (`{ undoOf }`) rather than a list of ops. */
export function isUndoChange<C extends Coordinates, R>(
  change: Change<C, R>,
): change is { readonly undoOf: string } {
  return 'undoOf' in change;
}

/**
 * One change's answer from the server (`POST …/changes`): applied with its
 * result, or refused with the error. A change asked again gets the same
 * answer.
 */
export type ChangeAnswer =
  | { readonly opId: string; readonly status: 'applied'; readonly result: ChangeResult }
  | { readonly opId: string; readonly status: 'refused'; readonly error: SerializedEngineError };

/**
 * The object numbers a change's creates name: each must be one its editing
 * session holds. An undo names none; what it restores keeps its numbers.
 */
export function objectNumbersNamedBy<C extends Coordinates, R>(change: Change<C, R>): number[] {
  if (isUndoChange(change)) return [];
  const named: number[] = [];
  for (const op of change.ops) {
    switch (op.type) {
      case 'annotations.create':
        if (op.objectNumber !== undefined) named.push(op.objectNumber);
        break;
      case 'forms.create':
        if (op.objectNumber !== undefined) named.push(op.objectNumber);
        named.push(...(op.widgetObjectNumbers ?? []));
        break;
      case 'forms.addWidget':
        if (op.objectNumber !== undefined) named.push(op.objectNumber);
        if (op.splitObjectNumber !== undefined) named.push(op.splitObjectNumber);
        break;
      default:
        break;
    }
  }
  return named;
}

/**
 * A change with bytes it owns, ready to send: each op's resources copied
 * (`resolveAnnotationResources`), a file attachment's `file` completed from
 * its `File` (`withFileFromResource`), a signature appearance copied.
 * `buffers` lists every copy, for a worker's transfer list. The caller's
 * bytes are only read.
 */
export async function resolveChangeResources(change: Change): Promise<{
  change: Change<PageCoordinates, WireAnnotationResources>;
  buffers: ArrayBuffer[];
}> {
  if (isUndoChange(change)) return { change, buffers: [] };
  const buffers: ArrayBuffer[] = [];
  const ops: ChangeOp<PageCoordinates, WireAnnotationResources>[] = [];
  for (const op of change.ops) {
    switch (op.type) {
      case 'annotations.create': {
        const { resources, ...rest } = op;
        const wire = await resolveAnnotationResources(resources);
        buffers.push(...annotationResourceBuffers(wire));
        ops.push({
          ...rest,
          data: withFileFromResource(op.data, resources),
          ...(hasAnnotationResources(wire) ? { resources: wire } : {}),
        });
        break;
      }
      case 'annotations.update': {
        const { resources, ...rest } = op;
        const wire = await resolveAnnotationResources(resources);
        buffers.push(...annotationResourceBuffers(wire));
        ops.push({ ...rest, ...(hasAnnotationResources(wire) ? { resources: wire } : {}) });
        break;
      }
      case 'forms.setSignatureAppearance': {
        const pdf = op.appearance.pdf.slice();
        buffers.push(pdf.buffer);
        ops.push({ ...op, appearance: { pdf } });
        break;
      }
      default:
        ops.push(op);
    }
  }
  return { change: { ops }, buffers };
}
