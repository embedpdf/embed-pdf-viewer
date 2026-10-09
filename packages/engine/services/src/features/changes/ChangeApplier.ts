import type {
  ChangeAuthority,
  ChangeItem,
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
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import type { FontRegistrar } from '../fonts/FontRegistrar';

/** What a change did: one item per op (or per step of an undo), and the record that undoes it. */
export interface AppliedChange {
  readonly items: ChangeItem<PdfCoordinates>[];
  /** Its steps are empty when nothing was written: there is nothing to undo. */
  readonly record: ChangeRecord;
}

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

  apply(
    ops: readonly RecordedOp<PdfCoordinates, WireAnnotationResources>[],
    authority: ChangeAuthority,
    signal: AbortSignal,
  ): AppliedChange {
    const ctx = this.context(authority, signal, (self) => opsFillOwnField(self, ops));
    return collect(
      authority,
      ops.map((op, at) => () => runOp(ctx, op, at)),
      signal,
    );
  }

  undo(record: ChangeRecord, authority: ChangeAuthority, signal: AbortSignal): AppliedChange {
    const ctx = this.context(authority, signal, (self) => stepsFillOwnField(self, record.steps));
    return collect(
      authority,
      record.steps.map((step) => () => runStep(ctx, step)),
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

/** Runs each in order; the record reverses them in the opposite order. */
function collect(
  authority: ChangeAuthority,
  runs: readonly (() => Done)[],
  signal: AbortSignal,
): AppliedChange {
  const items: ChangeItem<PdfCoordinates>[] = [];
  const reverses: (readonly ReverseStep[])[] = [];
  for (const run of runs) {
    throwIfAborted(signal);
    const done = run();
    items.push(done.item);
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
  }
}

function runStep(ctx: ChangeContext, step: ReverseStep): Done {
  switch (step.kind) {
    case 'objects.revert':
      return 'annotation' in step.subject
        ? revertAnnotation(ctx, { ...step, subject: step.subject })
        : revertForm(ctx, { ...step, subject: step.subject });
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
  }
}
