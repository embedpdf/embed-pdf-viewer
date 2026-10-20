import type {
  ChangeAuthority,
  ChangeItem,
  Coordinates,
  PdfCoordinates,
  RecordedOp,
  WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { ChangeRecord, ReverseStep } from './ChangeRecord';
import {
  createAnnotation,
  deleteAnnotation,
  importAnnotations,
  removeAnnotation,
  reorderAnnotations,
  reorderBack,
  restoreAnnotations,
  revertAnnotation,
  updateAnnotation,
} from './internal/annotationChanges';
import type { ChangeContext, Done } from './internal/changeContext';
import {
  addWidget,
  createField,
  deleteField,
  deleteRestoredWidget,
  deleteWidget,
  importForm,
  importFormValues,
  opsFillOwnField,
  removeField,
  removeWidget,
  reorderWidgets,
  reset,
  restoreField,
  restoreWidget,
  reorderCalculations,
  restoreCalculationOrder,
  revertForm,
  setAppearanceText,
  setDisplay,
  setSignatureAppearance,
  setValue,
  stepsFillOwnField,
  updateField,
  updateWidget,
} from './internal/formChanges';
import { revertMetadata, updateCustomMetadata, updateMetadata } from './internal/metadataChanges';
import {
  createOutlineItem,
  deleteOutlineItem,
  moveOutlineItems,
  moveOutlineItemsBack,
  removeOutlineItem,
  reopenOutlineItem,
  restoreOutlineItem,
  revertOutlineItem,
  updateOutlineItem,
} from './internal/outlineChanges';
import {
  changingPageTree,
  deletePages,
  insertBlankPages,
  insertPages,
  removePages,
  reorderPages,
  reorderPagesBack,
  restorePages,
  rotatePages,
  rotatePagesBack,
} from './internal/pageChanges';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import type { FontRegistrar } from '../fonts/FontRegistrar';

/** What a change did: one item per op (or per step of an undo), and the record that undoes it. */
export interface AppliedChange<C extends Coordinates = PdfCoordinates> {
  readonly items: ChangeItem<C>[];
  /** Its steps are empty when nothing was written: there is nothing to undo. */
  readonly record: ChangeRecord;
}

/**
 * Where a change's places are measured. Each op's places turn into the
 * file's coordinates right before it runs, and each item's into the
 * answer's space right after its op (or an undo's step) ran, against the
 * document as it is then: an earlier op can add, remove or put back a page a
 * later one names.
 */
export interface ChangeSpace<In extends Coordinates, Out extends Coordinates> {
  opInFileSpace(
    op: RecordedOp<In, WireAnnotationResources>,
  ): RecordedOp<PdfCoordinates, WireAnnotationResources>;
  itemOut(item: ChangeItem<PdfCoordinates>): ChangeItem<Out>;
}

/**
 * The file's own coordinates, in and out: for a single verb's one-op change,
 * whose job converts at the worker's boundary.
 */
export const FILE_SPACE: ChangeSpace<PdfCoordinates, PdfCoordinates> = {
  opInFileSpace: (op) => op,
  itemOut: (item) => item,
};

/**
 * Runs changes inside the job's layer transaction, which its caller opens and
 * ends, so a failure anywhere leaves the document as it was: a change's ops in
 * order (`apply`), or the steps of a recorded reverse (`undo`). Each op and
 * step is checked against the change's authority as it runs, as its single
 * verb's job checks it.
 *
 * Every op records the steps that reverse it as it runs, from what it found
 * and wrote; the record lists them in reverse op order, so each step meets the
 * document as the op after it left it.
 */
export class ChangeApplier {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
    private readonly fonts?: FontRegistrar,
  ) {}

  apply<In extends Coordinates, Out extends Coordinates>(
    ops: readonly RecordedOp<In, WireAnnotationResources>[],
    authority: ChangeAuthority,
    signal: AbortSignal,
    space: ChangeSpace<In, Out>,
  ): AppliedChange<Out> {
    const ctx = this.context(authority, signal, (self) => opsFillOwnField(self, ops));
    return collect(
      authority,
      ops.map((op, at) => () => runOp(ctx, space.opInFileSpace(op), at)),
      space,
      signal,
    );
  }

  undo<Out extends Coordinates>(
    record: ChangeRecord,
    authority: ChangeAuthority,
    signal: AbortSignal,
    space: Pick<ChangeSpace<Coordinates, Out>, 'itemOut'>,
  ): AppliedChange<Out> {
    const ctx = this.context(authority, signal, (self) => stepsFillOwnField(self, record.steps));
    return collect(
      authority,
      record.steps.map((step) => () => runStep(ctx, step)),
      space,
      signal,
    );
  }

  private context(
    authority: ChangeAuthority,
    signal: AbortSignal,
    ownFill: (ctx: ChangeContext) => boolean,
  ): ChangeContext {
    // Asked only when a field outside the caller's groups is written, and
    // answered once: before that write, from the fields as they are.
    let answer: boolean | undefined;
    const ctx: ChangeContext = {
      runtime: this.runtime,
      session: this.session,
      ...(this.fonts ? { fonts: this.fonts } : {}),
      authority,
      signal,
      fillsOwnField: () => (answer ??= ownFill(ctx)),
    };
    return ctx;
  }
}

/**
 * Runs each in order, its item measured as soon as it ran; the record
 * reverses them in the opposite order.
 */
function collect<Out extends Coordinates>(
  authority: ChangeAuthority,
  runs: readonly (() => Done)[],
  space: Pick<ChangeSpace<Coordinates, Out>, 'itemOut'>,
  signal: AbortSignal,
): AppliedChange<Out> {
  const items: ChangeItem<Out>[] = [];
  const reverses: (readonly ReverseStep[])[] = [];
  for (const run of runs) {
    throwIfAborted(signal);
    const done = run();
    items.push(space.itemOut(done.item));
    reverses.push(done.reverse);
  }
  return {
    items,
    record: { userId: authority.identity.userId ?? null, steps: reverses.reverse().flat() },
  };
}

function runOp(
  ctx: ChangeContext,
  op: RecordedOp<PdfCoordinates, WireAnnotationResources>,
  at: number,
): Done {
  switch (op.type) {
    case 'annotations.create':
      return createAnnotation(ctx, op);
    case 'annotations.import':
      return importAnnotations(ctx, op);
    case 'annotations.update':
      return updateAnnotation(ctx, op, at);
    case 'annotations.delete':
      return deleteAnnotation(ctx, op, at);
    case 'annotations.reorder':
      return reorderAnnotations(ctx, op);
    case 'forms.setValue':
      return setValue(ctx, op, at);
    case 'forms.setDisplay':
      return setDisplay(ctx, op);
    case 'forms.setAppearanceText':
      return setAppearanceText(ctx, op);
    case 'forms.reset':
      return reset(ctx, op);
    case 'forms.create':
      return createField(ctx, op);
    case 'forms.update':
      return updateField(ctx, op, at);
    case 'forms.delete':
      return deleteField(ctx, op, at);
    case 'forms.addWidget':
      return addWidget(ctx, op);
    case 'forms.removeWidget':
      return removeWidget(ctx, op);
    case 'forms.deleteWidget':
      return deleteWidget(ctx, op, at);
    case 'forms.updateWidget':
      return updateWidget(ctx, op, at);
    case 'forms.reorderWidgets':
      return reorderWidgets(ctx, op);
    case 'forms.reorderCalculations':
      return reorderCalculations(ctx, op);
    case 'forms.setSignatureAppearance':
      return setSignatureAppearance(ctx, op);
    case 'forms.import':
      return importForm(ctx, op);
    case 'forms.importValues':
      return importFormValues(ctx, op);
    case 'metadata.update':
      return updateMetadata(ctx, op, at);
    case 'metadata.updateCustom':
      return updateCustomMetadata(ctx, op);
    case 'outline.create':
      return createOutlineItem(ctx, op);
    case 'outline.update':
      return updateOutlineItem(ctx, op, at);
    case 'outline.move':
      return moveOutlineItems(ctx, op);
    case 'outline.delete':
      return deleteOutlineItem(ctx, op, at);
    case 'pages.rotate':
      return changingPageTree(ctx, () => rotatePages(ctx, op));
    case 'pages.reorder':
      return changingPageTree(ctx, () => reorderPages(ctx, op));
    case 'pages.delete':
      return changingPageTree(ctx, () => deletePages(ctx, op));
    case 'pages.insertBlank':
      return changingPageTree(ctx, () => insertBlankPages(ctx, op));
    case 'pages.insert':
      return changingPageTree(ctx, () => insertPages(ctx, op));
  }
}

function runStep(ctx: ChangeContext, step: ReverseStep): Done {
  switch (step.kind) {
    case 'objects.revert':
      if ('annotation' in step.subject) {
        return revertAnnotation(ctx, { ...step, subject: step.subject });
      }
      if ('outlineItem' in step.subject) {
        return revertOutlineItem(ctx, { ...step, subject: step.subject });
      }
      return revertForm(ctx, { ...step, subject: step.subject });
    case 'annotation.remove':
      return removeAnnotation(ctx, step);
    case 'annotation.restore':
      return restoreAnnotations(ctx, step);
    case 'annotation.reorder':
      return reorderBack(ctx, step);
    case 'field.remove':
      return removeField(ctx, step);
    case 'field.restore':
      return restoreField(ctx, step);
    case 'widget.restore':
      return restoreWidget(ctx, step);
    case 'widget.delete':
      return deleteRestoredWidget(ctx, step);
    case 'calculations.restore':
      return restoreCalculationOrder(ctx, step);
    case 'metadata.revert':
      return revertMetadata(ctx, step);
    case 'outline.remove':
      return removeOutlineItem(ctx, step);
    case 'outline.restore':
      return restoreOutlineItem(ctx, step);
    case 'outline.move':
      return moveOutlineItemsBack(ctx, step);
    case 'outline.reopen':
      return reopenOutlineItem(ctx, step);
    case 'pages.rotate':
      return changingPageTree(ctx, () => rotatePagesBack(ctx, step));
    case 'pages.reorder':
      return changingPageTree(ctx, () => reorderPagesBack(ctx, step));
    case 'pages.restore':
      return changingPageTree(ctx, () => restorePages(ctx, step));
    case 'pages.remove':
      return changingPageTree(ctx, () => removePages(ctx, step));
  }
}
