import type {
  ChangeAuthority,
  ChangeItem,
  ChangeOp,
  PdfCoordinates,
  WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { ChangeRecord, ReverseStep } from './ChangeRecord';
import {
  createAnnotation,
  deleteAnnotation,
  moveAnnotations,
  removeAnnotation,
  reorderAnnotations,
  restoreAnnotations,
  revertAnnotation,
  updateAnnotation,
} from './internal/annotationChanges';
import type { ChangeContext, Done } from './internal/changeContext';
import {
  addWidget,
  createField,
  deleteField,
  removeField,
  removeWidget,
  reset,
  restoreField,
  revertForm,
  setAppearanceText,
  setDisplay,
  setSignatureAppearance,
  setValue,
  updateField,
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
    ops: readonly ChangeOp<PdfCoordinates, WireAnnotationResources>[],
    authority: ChangeAuthority,
    signal: AbortSignal,
  ): AppliedChange {
    const ctx = this.context(authority, signal);
    return collect(
      authority,
      ops.map((op, at) => () => runOp(ctx, op, at)),
      signal,
    );
  }

  undo(record: ChangeRecord, authority: ChangeAuthority, signal: AbortSignal): AppliedChange {
    const ctx = this.context(authority, signal);
    return collect(
      authority,
      record.steps.map((step) => () => runStep(ctx, step)),
      signal,
    );
  }

  private context(authority: ChangeAuthority, signal: AbortSignal): ChangeContext {
    return {
      runtime: this.runtime,
      session: this.session,
      ...(this.fonts ? { fonts: this.fonts } : {}),
      authority,
      signal,
    };
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
  op: ChangeOp<PdfCoordinates, WireAnnotationResources>,
  at: number,
): Done {
  switch (op.type) {
    case 'annotations.create':
      return createAnnotation(ctx, op);
    case 'annotations.update':
      return updateAnnotation(ctx, op, at);
    case 'annotations.delete':
      return deleteAnnotation(ctx, op, at);
    case 'annotations.move':
      return moveAnnotations(ctx, op, at);
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
    case 'forms.setSignatureAppearance':
      return setSignatureAppearance(ctx, op);
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
      return reorderAnnotations(ctx, step);
    case 'field.remove':
      return removeField(ctx, step);
    case 'field.restore':
      return restoreField(ctx, step);
    case 'metadata.revert':
      return revertMetadata(ctx, step);
  }
}
