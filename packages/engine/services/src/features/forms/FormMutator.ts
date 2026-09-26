import type {
  FormDataFormat,
  FormFieldDraft,
  FormFieldFamily,
  FormFieldDTO,
  FormFieldPatch,
  FormFieldRef,
  FormFieldValue,
  FormImportResult,
  FormRepairResult,
  FormSetValueResult,
  FormWidget,
  MutationMeta,
  WidgetPlacement,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode, formWidget } from '@embedpdf/engine-core/runtime';
import type { AnnotationRef } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import { withScratch, withScratchN } from '../../runtime/memory/scratch';
import { U64_BYTES, pokeU64 } from '../../runtime/memory/u64';
import { createUnattachedWidget } from './internal/authorWidget';
import { flagMasks } from './internal/fieldFlagBits';
import { acquireFormModel } from './internal/formModelCache';
import {
  assertFieldNotLocked,
  lockedFieldObjectNumbers,
  readFieldLocks,
} from './internal/signatureLocks';
import { formMutationMeta } from './internal/formMutationMeta';
import { bakeWidgetAppearance } from '../signature/internal/appearance';
import {
  readSignaturesFromModel,
  withSignatureModel,
} from '../signature/internal/readSignatureModel';
import { withWideStringArray } from './internal/wideStringArray';
import { readFieldAt, readFormSnapshot } from './internal/readFormSnapshot';
import { resolveFieldRef, type ResolvedField } from './internal/resolveFieldRef';
import { AnnotationMutator } from '../annotations/AnnotationMutator';
import { DocumentCheckpoint } from '../../document-session/DocumentCheckpoint';
import { readUtf16String } from '../../runtime/memory/strings';

// Mirrors EPDF_FORMFIELD_FAMILY_* in public/epdf_form.h.
const FAMILY_CODE = {
  checkbox: 2,
  radio: 3,
  text: 4,
  combobox: 5,
  listbox: 6,
  signature: 7,
} as const;

/** Widgets a single value write can touch; far above any real form. */
const CHANGED_WIDGETS_CAPACITY = 256;

// Mirrors EPDF_FORM_REPAIR_* in public/epdf_form.h.
const REPAIR_BAKE_APPEARANCES = 0x1;

/**
 * Value writes are non-structural: no page-list revision bumps, and the
 * cloud layer computes its own cache delta server-side.
 */
const EMPTY_META: MutationMeta = { affectedPages: [], cacheDelta: null };

const FAMILY_BY_VALUE_TYPE: Record<FormFieldValue['type'], readonly string[]> = {
  text: ['text'],
  toggle: ['checkbox', 'radio'],
  choice: ['combobox', 'listbox'],
};

/**
 * Write side of the forms feature. Every method is a validate-then-apply
 * transaction over the native EPDFForm_* write API: a failed call leaves
 * the document untouched (on layers: nothing promoted), and each success
 * bumps the session's mutation sequence so version-keyed caches rebuild.
 */
export class FormMutator {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  setValue(ref: FormFieldRef, value: FormFieldValue, signal: AbortSignal): FormSetValueResult {
    throwIfAborted(signal);
    const model = acquireFormModel(this.runtime, this.session);
    const resolved = resolveFieldRef(this.runtime, model, ref);
    this.assertWritable(resolved);

    const before = readFieldAt(
      this.runtime,
      model,
      resolved.fieldIndex,
      this.session.requireDocPtr(),
    );
    const allowed = FAMILY_BY_VALUE_TYPE[value.type];
    if (!allowed.includes(before.family)) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `value type '${value.type}' does not apply to a '${before.family}' field`,
      );
    }

    const changed = this.applyWrite(resolved.fieldObjectNumber, value);
    return this.readBack(resolved.fieldObjectNumber, changed);
  }

  reset(ref: FormFieldRef, signal: AbortSignal): FormSetValueResult {
    throwIfAborted(signal);
    const model = acquireFormModel(this.runtime, this.session);
    const resolved = resolveFieldRef(this.runtime, model, ref);
    this.assertWritable(resolved);

    const changed = this.withChangedWidgets((buf, cap, countPtr) =>
      this.runtime.fn.EPDFForm_ResetField(
        this.session.requireDocPtr(),
        resolved.fieldObjectNumber,
        buf,
        cap,
        countPtr,
      ),
    );
    if (changed === null) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'form field cannot be reset');
    }
    return this.readBack(resolved.fieldObjectNumber, changed);
  }

  importData(
    data: ArrayBuffer,
    format: FormDataFormat | undefined,
    signal: AbortSignal,
  ): FormImportResult {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const bytes = new Uint8Array(data);
    if (bytes.byteLength === 0) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'empty form data payload');
    }
    const resolvedFormat = format ?? sniffFormat(bytes);
    const call = resolvedFormat === 'fdf' ? fn.EPDFForm_ImportFDF : fn.EPDFForm_ImportXFDF;
    const docPtr = this.session.requireDocPtr();

    // A field a signature locked is never written: the import skips it.
    const locked = lockedFieldObjectNumbers(this.runtime, this.session);
    const scratch = [bytes.byteLength, 16, Math.max(locked.length, 1) * 4];
    const counts = withScratchN(mem, scratch, ([dataPtr, resultPtr, skipPtr]) => {
      mem.writeBytes(dataPtr, bytes);
      locked.forEach((objectNumber, at) => mem.poke(skipPtr, 'i32', objectNumber, at * 4));
      const ok = call(docPtr, dataPtr, bytes.byteLength, skipPtr, locked.length, resultPtr);
      if (!ok) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `payload is not valid ${resolvedFormat.toUpperCase()}`,
        );
      }
      // The report also counts all fields (offset 0) and changed widgets (12).
      return {
        applied: Number(mem.peek(resultPtr, 'i32', 4)),
        skipped: Number(mem.peek(resultPtr, 'i32', 8)),
      };
    });

    this.session.noteMutation();
    const fresh = acquireFormModel(this.runtime, this.session);
    const form = readFormSnapshot(this.runtime, fresh, this.session.requireDocPtr());
    // The import names no widgets, so every page with a widget may have repainted.
    const widgets = counts.applied > 0 ? form.fields.flatMap((field) => field.widgets) : [];
    const { affectedPages, cacheDelta } = formMutationMeta(this.session, [], widgets);
    return { form, ...counts, meta: { affectedPages, cacheDelta } };
  }

  repair(bakeAppearances: boolean, signal: AbortSignal): FormRepairResult {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const flags = bakeAppearances ? REPAIR_BAKE_APPEARANCES : 0;

    const report = withScratch(mem, 24, (reportPtr) => {
      const ok = fn.EPDFForm_Repair(this.session.requireDocPtr(), flags, reportPtr);
      if (!ok) {
        throw new EngineError(EngineErrorCode.Unknown, 'form repair failed');
      }
      return {
        acroformCreated: Number(mem.peek(reportPtr, 'i32', 0)) !== 0,
        fieldsLinked: Number(mem.peek(reportPtr, 'i32', 4)),
        widgetsLinked: Number(mem.peek(reportPtr, 'i32', 8)),
        fieldsUnrepairable: Number(mem.peek(reportPtr, 'i32', 12)),
        appearancesBaked: Number(mem.peek(reportPtr, 'i32', 16)),
        needsAppearancesCleared: Number(mem.peek(reportPtr, 'i32', 20)) !== 0,
      };
    });

    this.session.noteMutation();
    return { ...report, meta: EMPTY_META };
  }

  /**
   * Create a field and (optionally) its widgets as one change: native
   * field creation, widget birth through the annotation plane, adoption,
   * then field-plane setters. Everything a caller can get wrong is checked
   * before the first write; any failure after it undoes the whole create
   * (the field is unlinked from an existing parent, then a checkpoint rolls
   * back the rest), so a rejected draft creates nothing.
   */
  createField(draft: FormFieldDraft, signal: AbortSignal): { field: FormFieldDTO } {
    throwIfAborted(signal);
    const { fn } = this.runtime;
    const docPtr = this.session.requireDocPtr();

    const placements = this.placementsOf(draft);
    const pageIndexes = placements.map((placement) => this.preflightPlacement(placement));
    if (draft.family === 'radio') {
      for (const placement of placements) {
        if (!placement.onState || placement.onState === 'Off') {
          throw new EngineError(
            EngineErrorCode.InvalidArg,
            'every radio widget needs a non-"Off" onState',
          );
        }
      }
    }
    if ('maxLength' in draft && draft.maxLength !== undefined) {
      if (!Number.isInteger(draft.maxLength) || draft.maxLength <= 0) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `maxLength must be a positive integer, got ${draft.maxLength}`,
          { details: { field: 'maxLength' } },
        );
      }
    }
    throwIfAborted(signal);

    const checkpoint = DocumentCheckpoint.begin(fn, docPtr);
    let fieldObjectNumber = 0;
    try {
      fieldObjectNumber = this.createFieldNode(draft);
      this.configureNewField(draft, fieldObjectNumber);
      placements.forEach((placement, at) => {
        const pageIndex = pageIndexes[at]!;
        checkpoint.page(pageIndex);
        const widgetObjectNumber = createUnattachedWidget(
          this.runtime,
          docPtr,
          pageIndex,
          placement,
        );
        const onState =
          draft.family === 'radio'
            ? placement.onState!
            : draft.family === 'checkbox'
              ? (placement.onState ?? 'Yes')
              : '';
        if (!fn.EPDFForm_AttachWidget(docPtr, fieldObjectNumber, widgetObjectNumber, onState)) {
          throw new EngineError(EngineErrorCode.Unknown, 'widget adoption failed');
        }
      });
      this.session.noteMutation();
      return { field: this.readBackField(fieldObjectNumber) };
    } catch (error) {
      // The checkpoint records the form dictionary and the pages, not an
      // existing parent field whose /Kids gained the new one: unlink the
      // field first, then roll back everything else.
      if (fieldObjectNumber > 0) this.nativeDeleteField(fieldObjectNumber);
      checkpoint.rollback();
      throw error;
    } finally {
      checkpoint.end();
      // Written or rolled back, the form model must be read again.
      this.session.noteMutation();
    }
  }

  /** EPDFForm_DeleteField: unlink the field and detach its kid widgets. */
  private nativeDeleteField(fieldObjectNumber: number): boolean {
    const { fn, mem } = this.runtime;
    return withScratchN(mem, [256 * 4, U64_BYTES], ([buf, countPtr]) => {
      // `unsigned long*`: 8 bytes on native, 4 on wasm32 — zero the whole slot.
      pokeU64(mem, countPtr, 0);
      return fn.EPDFForm_DeleteField(
        this.session.requireDocPtr(),
        fieldObjectNumber,
        buf,
        256,
        countPtr,
      );
    });
  }

  /** Check a widget placement before anything is written; returns its page index. */
  private preflightPlacement(placement: WidgetPlacement): number {
    const record = this.session.resolvePageRef(placement.page);
    const { left, bottom, right, top } = placement.rect;
    if (![left, bottom, right, top].every(Number.isFinite)) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'widget rect must be finite numbers', {
        details: { field: 'rect' },
      });
    }
    return record.pageIndex;
  }

  /** The native field node, linked into the tree. */
  private createFieldNode(draft: FormFieldDraft): number {
    const { fn, mem } = this.runtime;
    const namePtr = mem.writeU16String(draft.name);
    let fieldObjectNumber: number;
    try {
      fieldObjectNumber = fn.EPDFForm_CreateField(
        this.session.requireDocPtr(),
        FAMILY_CODE[draft.family],
        namePtr,
      );
    } finally {
      mem.free(namePtr);
    }
    if (fieldObjectNumber <= 0) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `cannot create field "${draft.name}" (name conflict or invalid)`,
      );
    }
    return fieldObjectNumber;
  }

  /** The draft's field-plane settings, on a field just created. */
  private configureNewField(draft: FormFieldDraft, fieldObjectNumber: number): void {
    const { fn } = this.runtime;
    const docPtr = this.session.requireDocPtr();

    const { setBits, clearBits } = flagMasks(
      draft as unknown as Record<string, boolean | undefined>,
    );
    if (setBits !== 0 || clearBits !== 0) {
      fn.EPDFForm_SetFieldFlags(docPtr, fieldObjectNumber, setBits, clearBits);
    }
    if ('options' in draft && draft.options) {
      this.applyOptions(fieldObjectNumber, draft.options);
    }
    if ('defaultValue' in draft && draft.defaultValue !== undefined) {
      this.applyDefaultValues(fieldObjectNumber, [draft.defaultValue]);
    }
    if ('maxLength' in draft && draft.maxLength !== undefined) {
      if (!fn.EPDFForm_SetFieldMaxLen(docPtr, fieldObjectNumber, draft.maxLength)) {
        throw new EngineError(EngineErrorCode.InvalidArg, 'maxLength rejected');
      }
    }
    if (draft.alternateName !== undefined) {
      this.applyWideSetter(
        fn.EPDFForm_SetFieldAlternateName,
        fieldObjectNumber,
        draft.alternateName,
        'alternate name rejected',
      );
    }
    if (draft.mappingName !== undefined) {
      this.applyWideSetter(
        fn.EPDFForm_SetFieldMappingName,
        fieldObjectNumber,
        draft.mappingName,
        'mapping name rejected',
      );
    }
  }

  /**
   * Draw a PDF page into every widget of an unsigned signature field: the
   * visual "sign" of a viewer without a signer. The field's value stays
   * empty and nothing is sealed; a signed field is refused (its appearance
   * is part of what the signature covers). The pages of its widgets get a
   * new revision so their renders re-pin.
   */
  setSignatureAppearance(
    ref: FormFieldRef,
    pdf: Uint8Array,
    pageIndex: number,
    signal: AbortSignal,
  ): { field: FormFieldDTO } {
    throwIfAborted(signal);
    const docPtr = this.session.requireDocPtr();
    const model = acquireFormModel(this.runtime, this.session);
    const resolved = resolveFieldRef(this.runtime, model, ref);
    this.assertWritable(resolved);
    const before = readFieldAt(this.runtime, model, resolved.fieldIndex, docPtr);
    if (before.family !== 'signature') {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `'${before.name}' is a ${before.family} field, not a signature field`,
      );
    }
    const signed = withSignatureModel(this.runtime, docPtr, (signatures) =>
      readSignaturesFromModel(this.runtime, signatures).some(
        (s) =>
          s.signed &&
          s.field.kind === 'objectNumber' &&
          s.field.fieldObjectNumber === resolved.fieldObjectNumber,
      ),
    );
    if (signed) {
      throw new EngineError(
        EngineErrorCode.ProtectedDocument,
        `'${before.name}' is signed; its appearance is sealed with the signature`,
      );
    }
    if (before.widgets.length === 0) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `'${before.name}' has no widget to draw into`,
      );
    }
    for (const widget of before.widgets) {
      bakeWidgetAppearance(this.runtime, docPtr, widget, pdf, pageIndex);
    }
    this.session.noteMutation();
    const pages = [
      ...new Set(before.widgets.flatMap((w) => (w.page ? [w.page.pageObjectNumber] : []))),
    ];
    for (const pageObjectNumber of pages) this.session.bumpRevision(pageObjectNumber);
    return { field: this.readBackField(resolved.fieldObjectNumber) };
  }

  updateField(
    ref: FormFieldRef,
    patch: FormFieldPatch,
    signal: AbortSignal,
  ): { field: FormFieldDTO } {
    throwIfAborted(signal);
    const { fn } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const model = acquireFormModel(this.runtime, this.session);
    const resolved = resolveFieldRef(this.runtime, model, ref);
    this.assertWritable(resolved);
    const before = readFieldAt(
      this.runtime,
      model,
      resolved.fieldIndex,
      this.session.requireDocPtr(),
    );
    assertPatchFitsFamily(patch, before.family);
    const fieldObjectNumber = resolved.fieldObjectNumber;

    if (patch.name !== undefined) {
      this.applyWideSetter(
        fn.EPDFForm_SetFieldName,
        fieldObjectNumber,
        patch.name,
        `cannot rename to "${patch.name}" (sibling conflict or invalid)`,
      );
    }
    const { setBits, clearBits } = flagMasks(
      patch as unknown as Record<string, boolean | undefined>,
    );
    if (setBits !== 0 || clearBits !== 0) {
      if (!fn.EPDFForm_SetFieldFlags(docPtr, fieldObjectNumber, setBits, clearBits)) {
        throw new EngineError(EngineErrorCode.InvalidArg, 'flag update rejected');
      }
    }
    if ('maxLength' in patch && patch.maxLength !== undefined) {
      if (!fn.EPDFForm_SetFieldMaxLen(docPtr, fieldObjectNumber, patch.maxLength ?? 0)) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          'maxLength rejected (current value exceeds it)',
        );
      }
    }
    if ('defaultValue' in patch && patch.defaultValue !== undefined) {
      if (patch.defaultValue === null) {
        if (!fn.EPDFForm_RemoveFieldDefaultValue(docPtr, fieldObjectNumber)) {
          throw new EngineError(EngineErrorCode.InvalidArg, 'default value removal rejected');
        }
      } else {
        this.applyDefaultValues(fieldObjectNumber, [patch.defaultValue]);
      }
    }
    if (patch.alternateName !== undefined) {
      this.applyWideSetter(
        fn.EPDFForm_SetFieldAlternateName,
        fieldObjectNumber,
        patch.alternateName ?? '',
        'alternate name rejected',
      );
    }
    if (patch.mappingName !== undefined) {
      this.applyWideSetter(
        fn.EPDFForm_SetFieldMappingName,
        fieldObjectNumber,
        patch.mappingName ?? '',
        'mapping name rejected',
      );
    }
    if ('options' in patch && patch.options) {
      this.applyOptions(fieldObjectNumber, patch.options);
    }

    this.session.noteMutation();
    return { field: this.readBackField(fieldObjectNumber) };
  }

  /**
   * Delete a terminal field and its widgets in one mutation. The native
   * write detaches kid widgets and unlinks the field from /Fields or its
   * parent's /Kids; the cascade then removes every placed widget from its
   * page through the annotation feature, which owns /Annots bookkeeping,
   * weak-ref invalidation and page revisions. A merged field/widget has no
   * kid to detach: its own dictionary leaves its page in the same cascade.
   */
  deleteField(
    ref: FormFieldRef,
    signal: AbortSignal,
  ): { deleted: FormFieldRef; removedWidgets: FormWidget[] } {
    throwIfAborted(signal);
    const model = acquireFormModel(this.runtime, this.session);
    const resolved = resolveFieldRef(this.runtime, model, ref);
    this.assertWritable(resolved);
    const before = readFieldAt(
      this.runtime,
      model,
      resolved.fieldIndex,
      this.session.requireDocPtr(),
    );
    const removedWidgets = before.widgets.map((w) => formWidget(w.annotObjectNumber, w.page));

    // Apply boundary. EPDFForm_DeleteField validates before it writes, so a
    // refusal leaves the document untouched; nothing after it may throw for
    // caller input or cancellation.
    throwIfAborted(signal);
    if (!this.nativeDeleteField(resolved.fieldObjectNumber)) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'field cannot be deleted');
    }
    // Rebuild the form model before the cascade's attachment guard reads it.
    this.session.noteMutation();

    const annotations = new AnnotationMutator(this.runtime, this.session);
    for (const widget of removedWidgets) {
      if (!widget.ref) continue; // direct or unplaced: no /Annots entry to remove
      annotations.deleteReleasedWidget(widget.ref, resolved.fieldObjectNumber);
    }
    // The cascade edited /Annots after the bump above; bump again so the
    // form model rebuilds.
    this.session.noteMutation();
    return { deleted: before.ref, removedWidgets };
  }

  attachWidget(
    ref: FormFieldRef,
    widget: AnnotationRef,
    onState: string | undefined,
    signal: AbortSignal,
  ): { field: FormFieldDTO; widget: FormWidget } {
    throwIfAborted(signal);
    const { fn } = this.runtime;
    const model = acquireFormModel(this.runtime, this.session);
    const resolved = resolveFieldRef(this.runtime, model, ref);
    this.assertWritable(resolved);
    const before = readFieldAt(
      this.runtime,
      model,
      resolved.fieldIndex,
      this.session.requireDocPtr(),
    );
    const toggle = before.family === 'checkbox' || before.family === 'radio';
    const state = toggle ? (onState ?? (before.family === 'checkbox' ? 'Yes' : '')) : '';
    if (toggle && (!state || state === 'Off')) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        'attaching to a radio group needs a non-"Off" onState',
      );
    }
    if (
      !fn.EPDFForm_AttachWidget(
        this.session.requireDocPtr(),
        resolved.fieldObjectNumber,
        widgetObjectNumber(widget),
        state,
      )
    ) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        'widget cannot be adopted (already attached, merged, or not a widget)',
      );
    }
    this.session.noteMutation();
    return {
      field: this.readBackField(resolved.fieldObjectNumber),
      widget: formWidget(widgetObjectNumber(widget), widget.page),
    };
  }

  detachWidget(
    ref: FormFieldRef,
    widget: AnnotationRef,
    signal: AbortSignal,
  ): { field: FormFieldDTO; widget: FormWidget } {
    throwIfAborted(signal);
    const { fn } = this.runtime;
    const model = acquireFormModel(this.runtime, this.session);
    const resolved = resolveFieldRef(this.runtime, model, ref);
    this.assertWritable(resolved);
    // A merged field/widget is refused: the widget is the field's own
    // dictionary, and separating the two gives one of them a new object
    // number, so a ref the caller holds would stop naming what it named.
    const widgetNumber = widgetObjectNumber(widget);
    if (widgetNumber === resolved.fieldObjectNumber) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `widget ${widgetNumber} is the field's own dictionary (a merged field/widget) and cannot be removed from it - delete the field with doc.forms.delete`,
      );
    }
    if (
      !fn.EPDFForm_DetachWidget(
        this.session.requireDocPtr(),
        resolved.fieldObjectNumber,
        widgetNumber,
      )
    ) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'widget is not attached to this field');
    }
    this.session.noteMutation();
    return {
      field: this.readBackField(resolved.fieldObjectNumber),
      widget: formWidget(widgetObjectNumber(widget), widget.page),
    };
  }

  private placementsOf(draft: FormFieldDraft): WidgetPlacement[] {
    if (draft.family === 'radio') {
      return draft.widgets ?? [];
    }
    return draft.widget ? [draft.widget] : [];
  }

  private applyOptions(
    fieldObjectNumber: number,
    options: ReadonlyArray<{ label: string; value: string }>,
  ): void {
    const { fn } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const ok = withWideStringArray(
      this.runtime,
      options.map((o) => o.label),
      (labelsPtr) =>
        withWideStringArray(
          this.runtime,
          options.map((o) => o.value),
          (exportsPtr, count) =>
            fn.EPDFForm_SetFieldOptions(docPtr, fieldObjectNumber, labelsPtr, exportsPtr, count),
        ),
    );
    if (!ok) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'options rejected');
    }
  }

  private applyWideSetter(
    setter: (docPtr: Ptr, fieldObjectNumber: number, valuePtr: Ptr) => boolean,
    fieldObjectNumber: number,
    value: string,
    errorMessage: string,
  ): void {
    const { mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const valuePtr = mem.writeU16String(value);
    try {
      if (!setter(docPtr, fieldObjectNumber, valuePtr)) {
        throw new EngineError(EngineErrorCode.InvalidArg, errorMessage);
      }
    } finally {
      mem.free(valuePtr);
    }
  }

  private applyDefaultValues(fieldObjectNumber: number, values: readonly string[]): void {
    const { fn } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const ok = withWideStringArray(this.runtime, values, (valuesPtr, count) =>
      fn.EPDFForm_SetFieldDefaultValues(docPtr, fieldObjectNumber, valuesPtr, count),
    );
    if (!ok) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'default value rejected');
    }
  }

  private readBackField(fieldObjectNumber: number): FormFieldDTO {
    const fresh = acquireFormModel(this.runtime, this.session);
    const fieldIndex = this.runtime.fn.EPDFForm_GetFieldIndexByObjNum(fresh, fieldObjectNumber);
    if (fieldIndex < 0) {
      throw new EngineError(EngineErrorCode.Unknown, 'form field vanished after write');
    }
    return readFieldAt(this.runtime, fresh, fieldIndex, this.session.requireDocPtr());
  }

  private assertWritable(resolved: ResolvedField): void {
    if (resolved.fieldObjectNumber === 0) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        'form field is stored as a direct object and cannot be written',
      );
    }
    this.assertNotLockedBySignature(resolved);
  }

  /** A field an earlier signature locked refuses every write (see `readFieldLocks`). */
  private assertNotLockedBySignature(resolved: ResolvedField): void {
    const locks = readFieldLocks(this.runtime, this.session);
    if (!locks) return;
    const model = acquireFormModel(this.runtime, this.session);
    const name =
      readUtf16String(this.runtime.mem, (buf, cap) =>
        this.runtime.fn.EPDFForm_GetFieldName(model, resolved.fieldIndex, buf, cap),
      ) ?? '';
    assertFieldNotLocked(name, locks);
  }

  /** Dispatch the typed native write. Returns the changed widget objnums. */
  private applyWrite(fieldObjectNumber: number, value: FormFieldValue): number[] {
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();

    const changed = this.withChangedWidgets((buf, cap, countPtr) => {
      switch (value.type) {
        default:
          throw new EngineError(EngineErrorCode.InvalidArg, 'unknown form value type');
        case 'text': {
          const textPtr = mem.writeU16String(value.value);
          try {
            return fn.EPDFForm_SetTextValue(docPtr, fieldObjectNumber, textPtr, buf, cap, countPtr);
          } finally {
            mem.free(textPtr);
          }
        }
        case 'toggle':
          // Empty string clears the group, same as the C API's null.
          return fn.EPDFForm_SetToggle(
            docPtr,
            fieldObjectNumber,
            value.state ?? '',
            buf,
            cap,
            countPtr,
          );
        case 'choice':
          return withWideStringArray(this.runtime, value.values, (arrayPtr, count) =>
            fn.EPDFForm_SetChoiceValues(
              docPtr,
              fieldObjectNumber,
              arrayPtr,
              count,
              buf,
              cap,
              countPtr,
            ),
          );
      }
    });

    if (changed === null) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        'form value rejected (unknown toggle state, length limit, or non-option choice)',
      );
    }
    return changed;
  }

  /** Run a native write with the changed-widgets out buffer wired up. */
  private withChangedWidgets(
    call: (buf: Ptr, cap: number, countPtr: Ptr) => boolean,
  ): number[] | null {
    const { mem } = this.runtime;
    return withScratchN(mem, [CHANGED_WIDGETS_CAPACITY * 4, U64_BYTES], ([buf, countPtr]) => {
      // `unsigned long*`: 8 bytes on native, 4 on wasm32 — zero the whole slot.
      pokeU64(mem, countPtr, 0);
      if (!call(buf, CHANGED_WIDGETS_CAPACITY, countPtr)) {
        return null;
      }
      const total = Number(mem.peek(countPtr, 'i32'));
      const reported = Math.min(total, CHANGED_WIDGETS_CAPACITY);
      const changed: number[] = [];
      for (let i = 0; i < reported; i++) {
        changed.push(Number(mem.peek(buf, 'i32', i * 4)));
      }
      return changed;
    });
  }

  /** Bump the session version, rebuild the model, and read the field back. */
  private readBack(fieldObjectNumber: number, changedObjNums: number[]): FormSetValueResult {
    this.session.noteMutation();
    const fresh = acquireFormModel(this.runtime, this.session);
    const fieldIndex = this.runtime.fn.EPDFForm_GetFieldIndexByObjNum(fresh, fieldObjectNumber);
    if (fieldIndex < 0) {
      throw new EngineError(EngineErrorCode.Unknown, 'form field vanished after write');
    }
    const field: FormFieldDTO = readFieldAt(
      this.runtime,
      fresh,
      fieldIndex,
      this.session.requireDocPtr(),
    );
    const changedSet = new Set(changedObjNums);
    const changedWidgets: FormWidget[] = field.widgets
      .filter((w) => changedSet.has(w.annotObjectNumber))
      .map((w) => formWidget(w.annotObjectNumber, w.page));
    return { field, meta: formMutationMeta(this.session, [field.ref], changedWidgets) };
  }
}

/** The patch members every family has. */
const PATCH_BASE_MEMBERS = [
  'family',
  'name',
  'readOnly',
  'required',
  'noExport',
  'alternateName',
  'mappingName',
];

/** The members each family's patch adds; a family not listed takes the base only. */
const PATCH_FAMILY_MEMBERS: Partial<Record<FormFieldFamily, readonly string[]>> = {
  text: ['defaultValue', 'maxLength', 'multiline', 'password', 'comb'],
  radio: ['radiosInUnison', 'noToggleToOff'],
  combobox: ['edit', 'defaultValue', 'options'],
  listbox: ['multiSelect', 'options'],
};

/**
 * A patch names no family (the ref says it) or the field's own, and sets
 * only members that family has.
 */
function assertPatchFitsFamily(patch: FormFieldPatch, family: FormFieldFamily): void {
  if (patch.family !== undefined && patch.family !== family) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `patch family '${patch.family}' does not match field family '${family}'`,
      { details: { field: 'family' } },
    );
  }
  const allowed = new Set([...PATCH_BASE_MEMBERS, ...(PATCH_FAMILY_MEMBERS[family] ?? [])]);
  for (const [member, value] of Object.entries(patch)) {
    if (value !== undefined && !allowed.has(member)) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `'${member}' does not apply to a ${family} field`,
        { details: { field: member } },
      );
    }
  }
}

/** `%FDF-…` payloads are FDF; anything starting with markup is XFDF. */
function sniffFormat(bytes: Uint8Array): FormDataFormat {
  for (let i = 0; i < Math.min(bytes.length, 64); i++) {
    const c = bytes[i];
    // Skip UTF-8 BOM and whitespace.
    if (c === 0xef || c === 0xbb || c === 0xbf) continue;
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) continue;
    return c === 0x3c /* '<' */ ? 'xfdf' : 'fdf';
  }
  return 'fdf';
}

/** Widgets are addressed by object number: a name or index address cannot join a field. */
function widgetObjectNumber(widget: AnnotationRef): number {
  if (widget.kind !== 'objectNumber') {
    throw new EngineError(EngineErrorCode.InvalidArg, 'widget must be addressed by object number');
  }
  return widget.annotObjectNumber;
}
