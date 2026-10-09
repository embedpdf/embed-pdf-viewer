import {
  assertFormBundleManifest,
  EngineError,
  pdfFormFieldDraftOf,
  planFormImport,
  planFormValuesImport,
  toPageRef,
  type AnnotationActor,
  type BundleImportPages,
  type BundleLimits,
  type FormFieldDTO,
  type FormFieldRef,
  type FormImportResult,
  type FormValuesImportDrop,
  type FormWidget,
  type PdfCoordinates,
  type PlannedValueWrite,
  type WidgetFlags,
  type WireFormBundle,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { FormMutator } from './FormMutator';
import { readCalculationOrder, sameOrder } from './internal/calculationOrder';
import { restoreFieldCreation, restoreFieldFill } from './internal/fieldAttribution';
import { isNoOpWrite, nativeWriteOf } from './internal/fieldValues';
import { acquireFormModel } from './internal/formModelCache';
import { formMutationMeta } from './internal/formMutationMeta';
import { readFieldAt } from './internal/readFormSnapshot';
import { readFieldLocks } from './internal/signatureLocks';
import { withWidgetRows } from './internal/widgetRows';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { readUtf16String } from '../../runtime/memory/strings';
import { throwIfAborted } from '../../shared/abort';
import { openAnnotRaw } from '../annotations/internal/identity/resolveAnnotIndexRaw';
import { setAnnotFlags } from '../annotations/internal/write/annotationWritePrimitives';
import type { FontRegistrar } from '../fonts/FontRegistrar';
import { visibleBoxReader } from '../pages/PagesReader';
import { checkWireBundle } from '../transfer/checkWireBundle';

export interface FormImportRequest {
  /** In page space, as bundles are: each widget is measured on the page it goes to. */
  readonly bundle: WireFormBundle;
  readonly pages?: BundleImportPages;
  readonly attribution: 'restore' | 'stamp';
  /** Whether each field gets the value the bundle holds. */
  readonly values: boolean;
  /**
   * The session's identity: whom `'stamp'` makes each field's creator and
   * filler, and whose user `'restore'` records as `importedBy`.
   */
  readonly actor: AnnotationActor;
  readonly limits: BundleLimits;
  /** Whether scripts, submits and links are kept (`doc.forms.script`); without it they're left out. */
  readonly mayScript: boolean;
  /**
   * The group a field goes in, given the one it had in the bundle (if any):
   * checked by the caller, which refuses one it may not set.
   */
  readonly groupOf: (groupId: string | undefined) => string | undefined;
}

/** What a values import writes, decided before the first write. */
export interface FormValuesImportPlan {
  /** Each against the field as it is now; a write that changes nothing isn't among them. */
  readonly writes: readonly PlannedValueWrite<FormFieldDTO<PdfCoordinates>>[];
  readonly dropped: readonly FormValuesImportDrop[];
}

/**
 * `doc.forms.import` and `doc.forms.importValues`: a bundle's fields, copied
 * into this document or filled in from it. The bundle is checked first: its
 * shape, counts and sizes against the limits, and each resource against its
 * id. Then the core plans (`planFormImport`, `planFormValuesImport`), so all
 * that is left out is decided before the first write, and the writes go
 * through the form's own: `createField` and `setValue`.
 */
export class FormImporter {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
    /** This thread's font registry, for the widget rows. */
    private readonly fonts?: FontRegistrar,
  ) {}

  /**
   * The design: each field the plan keeps, created with its widgets on
   * their mapped pages, their flags, and, with `values`, the value the
   * bundle holds; then the calculation order among them, appended to the
   * form's in bundle order; then who made and filled each, restored or
   * stamped.
   */
  import(request: FormImportRequest, signal: AbortSignal): FormImportResult<PdfCoordinates> {
    throwIfAborted(signal);
    const { bundle } = request;
    checkWireBundle(this.runtime, 'form', bundle, request.limits, assertFormBundleManifest);
    const names = this.fieldNames();
    const plan = planFormImport({
      bundle,
      ...(request.pages !== undefined ? { pages: request.pages } : {}),
      target: this.session.allRecords().map((record) => ({
        page: toPageRef(record.pageObjectNumber),
        position: record.pageIndex,
      })),
      nameTaken: (name) => nameConflicts(names, name),
      mayScript: request.mayScript,
      values: request.values,
    });

    const orderBefore = this.calculationOrder();
    const boxOf = visibleBoxReader(this.runtime, this.session);
    const forms = new FormMutator(this.runtime, this.session);
    const docPtr = this.session.requireDocPtr();
    const importedBy = request.actor.userId ?? null;
    const created = plan.creates.map((planned) => {
      const source = bundle.fields[planned.field]!.data;
      const { groupId: bundleGroup, ...draft } = pdfFormFieldDraftOf(planned.draft, boxOf);
      const groupId = request.groupOf(bundleGroup);
      const { field } = forms.createField(
        { ...draft, ...(groupId !== undefined ? { groupId } : {}) },
        signal,
        request.actor,
      );
      field.widgets.forEach((widget, at) => this.writeFlags(widget, planned.flags[at]!));
      this.session.invalidateDerived();
      if (planned.value) forms.setValue(field.ref, planned.value, signal, request.actor);
      const objectNumber = objectNumberOf(field.ref);
      if (request.attribution === 'restore') {
        restoreFieldCreation(this.runtime, docPtr, objectNumber, source, importedBy);
        if (planned.value) restoreFieldFill(this.runtime, docPtr, objectNumber, source, importedBy);
      }
      return objectNumber;
    });
    // Each create with a calculate script joined the order at its end; the
    // bundle's order among them is put back there.
    const calculating = plan.calculationOrder.map((at) => fieldRef(created[at]!));
    if (calculating.length > 0) forms.reorderCalculations(calculating, 'end', signal);
    this.session.invalidateDerived();

    const orderAfter = this.calculationOrder();
    const fields = created.map((objectNumber) => this.readField(objectNumber));
    return withWidgetRows(
      this.runtime,
      this.session,
      {
        fields,
        refMap: plan.creates.map((planned, at) => ({
          from: bundle.fields[planned.field]!.data.ref,
          to: fields[at]!.ref,
        })),
        dropped: [...plan.dropped],
        ...(sameOrder(orderBefore, orderAfter)
          ? {}
          : { calculationOrder: orderAfter.map(fieldRef) }),
        meta: formMutationMeta(
          this.session.writeStamp(),
          fields.map((field) => field.ref),
          fields.flatMap((field) => field.widgets as FormWidget[]),
        ),
      },
      this.fonts,
    );
  }

  /**
   * What a values import of `bundle` writes, nothing written yet: each
   * field the bundle holds a value for, matched by full name, when it can
   * take the value (`nativeWriteOf`) and no signature locked it. A field
   * stored as a direct object can't be written, so it can't take the value
   * either.
   */
  planValues(
    bundle: WireFormBundle,
    limits: BundleLimits,
    signal: AbortSignal,
    /** Whether the session may fill the field in; one it may not is left out. */
    mayFill: (field: FormFieldDTO<PdfCoordinates>) => boolean,
  ): FormValuesImportPlan {
    throwIfAborted(signal);
    checkWireBundle(this.runtime, 'form', bundle, limits, assertFormBundleManifest);
    const locks = readFieldLocks(this.runtime, this.session);
    const plan = planFormValuesImport({
      bundle,
      target: this.readFields(),
      refusal: (field, value) => {
        if (field.ref.kind !== 'objectNumber') return 'value-not-allowed';
        try {
          nativeWriteOf(field, value);
        } catch (error) {
          if (EngineError.is(error)) return 'value-not-allowed';
          throw error;
        }
        if (locks?.(field.name)) return 'locked';
        return mayFill(field) ? null : 'fill-not-allowed';
      },
    });
    return {
      writes: plan.writes.filter(
        ({ target, value }) => !isNoOpWrite(target, nativeWriteOf(target, value)),
      ),
      dropped: plan.dropped,
    };
  }

  /**
   * One write of a values import: the value, then, for `'restore'`, who
   * filled it in as the bundle has it. `'stamp'` leaves the session as the
   * filler, as `setValue` stamps it.
   */
  writeValue(
    write: PlannedValueWrite<FormFieldDTO<PdfCoordinates>>,
    bundle: WireFormBundle,
    attribution: 'restore' | 'stamp',
    actor: AnnotationActor,
    signal: AbortSignal,
  ): FormFieldDTO<PdfCoordinates> {
    new FormMutator(this.runtime, this.session).setValue(
      write.target.ref,
      write.value,
      signal,
      actor,
    );
    const objectNumber = objectNumberOf(write.target.ref);
    if (attribution === 'restore') {
      restoreFieldFill(
        this.runtime,
        this.session.requireDocPtr(),
        objectNumber,
        bundle.fields[write.field]!.data,
        actor.userId ?? null,
      );
      this.session.invalidateDerived();
    }
    return this.readField(objectNumber);
  }

  /** A new widget's flags, as its row in the bundle has them: a create writes none. */
  private writeFlags(widget: FormWidget, flags: WidgetFlags): void {
    if (!widget.ref) return;
    const annotPtr = openAnnotRaw(this.runtime, this.session, widget.ref);
    try {
      setAnnotFlags(this.runtime.fn, annotPtr, flags);
    } finally {
      this.runtime.fn.FPDFPage_CloseAnnot(annotPtr);
    }
  }

  /** The full name of every field of the form. */
  private fieldNames(): Set<string> {
    const { fn, mem } = this.runtime;
    const model = acquireFormModel(this.runtime, this.session);
    const names = new Set<string>();
    for (let index = 0; index < fn.EPDFForm_CountFields(model); index++) {
      const name = readUtf16String(mem, (buf, cap) =>
        fn.EPDFForm_GetFieldName(model, index, buf, cap),
      );
      if (name) names.add(name);
    }
    return names;
  }

  /** Every field of the form, as it is now. */
  private readFields(): FormFieldDTO<PdfCoordinates>[] {
    const model = acquireFormModel(this.runtime, this.session);
    const docPtr = this.session.requireDocPtr();
    const count = this.runtime.fn.EPDFForm_CountFields(model);
    return Array.from({ length: count }, (_, index) =>
      readFieldAt(this.runtime, model, index, docPtr),
    );
  }

  private readField(objectNumber: number): FormFieldDTO<PdfCoordinates> {
    const model = acquireFormModel(this.runtime, this.session);
    const index = this.runtime.fn.EPDFForm_GetFieldIndexByObjNum(model, objectNumber);
    return readFieldAt(this.runtime, model, index, this.session.requireDocPtr());
  }

  private calculationOrder(): number[] {
    return readCalculationOrder(this.runtime, acquireFormModel(this.runtime, this.session));
  }
}

/**
 * Whether a new field named `name` can't join a form whose fields are
 * `names`: one has that name, one sits under it (`name` would have to be a
 * parent), or one is its parent (it would have to stop being a field).
 */
function nameConflicts(names: ReadonlySet<string>, name: string): boolean {
  if (names.has(name)) return true;
  for (const other of names) {
    if (other.startsWith(`${name}.`) || name.startsWith(`${other}.`)) return true;
  }
  return false;
}

function objectNumberOf(ref: FormFieldRef): number {
  if (ref.kind !== 'objectNumber') throw new Error('a written field has an object number');
  return ref.objectNumber;
}

function fieldRef(objectNumber: number): FormFieldRef {
  return { kind: 'objectNumber', objectNumber };
}
