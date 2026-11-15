import {
  pdfFormFieldDraftOf,
  type AnnotationActor,
  type FormField,
  type FormFieldDraft,
  type FormFieldRef,
  type FormFieldValue,
  type FormMutationMeta,
  type FormWidget,
  type FormWidgetRows,
  type PdfCoordinates,
  type WidgetFlags,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { readCalculationOrder, sameOrder } from './calculationOrder';
import { acquireFormModel } from './formModelCache';
import { formMutationMeta } from './formMutationMeta';
import { readFieldAt } from './readFormSnapshot';
import { withWidgetRows } from './widgetRows';
import type { DocumentSession } from '../../../document-session/DocumentSession';
import { openAnnotRaw } from '../../annotations/internal/identity/resolveAnnotIndexRaw';
import { setAnnotFlags } from '../../annotations/internal/write/annotationWritePrimitives';
import type { FontRegistrar } from '../../fonts/FontRegistrar';
import { visibleBoxReader } from '../../pages/PagesReader';
import { FormMutator } from '../FormMutator';

/** One field a plan makes: a design import's, or a copy's. */
export interface PlannedCreate {
  /** What `create` writes, in page space: each widget is measured on the page it goes to. */
  readonly draft: FormFieldDraft;
  /** Each widget's flags, in `draft.widgets` order. */
  readonly flags: readonly WidgetFlags[];
  /** The value it gets; absent when none is written. */
  readonly value?: FormFieldValue;
  /** The object numbers it takes: its own, then its widgets'. The next free ones when absent. */
  readonly objectNumbers?: readonly number[];
}

/** What the fields a plan made answer, apart from where each came from. */
export interface CreatedFields extends FormWidgetRows<PdfCoordinates> {
  /** In the order of the creates, each as it is now. */
  fields: FormField<PdfCoordinates>[];
  /** The form's whole calculation order, when the creates changed it. */
  calculationOrder?: FormFieldRef[];
  meta: FormMutationMeta;
}

/**
 * The fields of a plan, written through the form's own `createField` and
 * `setValue`: each with its widgets on their pages and their flags, in the
 * group `groupOf` gives it, with its value when it has one; then the
 * calculation order among them, appended to the form's in the order given.
 * `made` runs after each field is written, for what only its caller knows
 * (who made and filled an imported field).
 */
export function createPlannedFields(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  fonts: FontRegistrar | undefined,
  creates: readonly PlannedCreate[],
  calculationOrder: readonly number[],
  write: {
    readonly actor: AnnotationActor;
    /** The group a field goes in, given the one its source had (if any). */
    readonly groupOf: (groupId: string | undefined) => string | undefined;
    readonly signal: AbortSignal;
    readonly made?: (objectNumber: number, at: number) => void;
  },
): CreatedFields {
  const order = (): number[] => readCalculationOrder(runtime, acquireFormModel(runtime, session));
  const orderBefore = order();
  const boxOf = visibleBoxReader(runtime, session);
  const forms = new FormMutator(runtime, session, fonts);
  const created = creates.map((planned, at) => {
    const { groupId: sourceGroup, ...draft } = pdfFormFieldDraftOf(planned.draft, boxOf);
    const groupId = write.groupOf(sourceGroup);
    const [objectNumber, ...widgetObjectNumbers] = planned.objectNumbers ?? [];
    const { field } = forms.createField(
      { ...draft, ...(groupId !== undefined ? { groupId } : {}) },
      write.signal,
      write.actor,
      objectNumber === undefined ? {} : { objectNumber, widgetObjectNumbers },
    );
    field.widgets.forEach((widget, index) =>
      writeFlags(runtime, session, widget, planned.flags[index]!),
    );
    session.invalidateDerived();
    if (planned.value) forms.setValue(field.ref, planned.value, write.signal, write.actor);
    const made = objectNumberOf(field.ref);
    write.made?.(made, at);
    return made;
  });
  // Each create with a calculate script joined the order at its end; the
  // plan's order among them is put back there.
  const calculating = calculationOrder.map((at) => fieldRef(created[at]!));
  if (calculating.length > 0) forms.reorderCalculations(calculating, 'end', write.signal);
  session.invalidateDerived();

  const orderAfter = order();
  const fields = created.map((objectNumber) => {
    const model = acquireFormModel(runtime, session);
    const index = runtime.fn.EPDFForm_GetFieldIndexByObjNum(model, objectNumber);
    return readFieldAt(runtime, model, index, session.requireDocPtr());
  });
  return withWidgetRows(
    runtime,
    session,
    {
      fields,
      ...(sameOrder(orderBefore, orderAfter) ? {} : { calculationOrder: orderAfter.map(fieldRef) }),
      meta: formMutationMeta(
        session.writeStamp(),
        fields.map((field) => field.ref),
        fields.flatMap((field) => field.widgets as FormWidget[]),
      ),
    },
    fonts,
  );
}

/** A new widget's flags, as its source has them: a create writes none. */
function writeFlags(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  widget: FormWidget,
  flags: WidgetFlags,
): void {
  if (!widget.ref) return;
  const annotPtr = openAnnotRaw(runtime, session, widget.ref);
  try {
    setAnnotFlags(runtime.fn, annotPtr, flags);
  } finally {
    runtime.fn.FPDFPage_CloseAnnot(annotPtr);
  }
}

function objectNumberOf(ref: FormFieldRef): number {
  if (ref.kind !== 'objectNumber') throw new Error('a written field has an object number');
  return ref.objectNumber;
}

function fieldRef(objectNumber: number): FormFieldRef {
  return { kind: 'objectNumber', objectNumber };
}
