import type {
  FormDataFormat,
  FormFieldDraft,
  FormFieldDTO,
  FormFieldPatch,
  FormFieldRef,
  FormFieldValue,
  FormImportResult,
  FormRepairResult,
  FormSetValueResult,
  FormWidgetRef,
  MutationMeta,
  WidgetPlacement,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/pdf-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import { withScratch, withScratchN } from '../../runtime/memory/scratch';
import { createUnattachedWidget } from './internal/authorWidget';
import { flagMasks } from './internal/fieldFlagBits';
import { acquireFormModel } from './internal/formModelCache';
import { withWideStringArray } from './internal/wideStringArray';
import { readFieldAt, readFormSnapshot } from './internal/readFormSnapshot';
import { resolveFieldRef } from './internal/resolveFieldRef';

// Mirrors EPDF_FORMFIELD_FAMILY_* in public/epdf_form.h.
const FAMILY_CODE = {
  checkbox: 2,
  radio: 3,
  text: 4,
  combobox: 5,
  listbox: 6,
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
    this.assertWritable(resolved.fieldObjectNumber);

    const before = readFieldAt(this.runtime, model, resolved.fieldIndex);
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
    this.assertWritable(resolved.fieldObjectNumber);

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

    const counters = withScratchN(mem, [bytes.byteLength, 16], ([dataPtr, resultPtr]) => {
      mem.writeBytes(dataPtr, bytes);
      const ok = call(docPtr, dataPtr, bytes.byteLength, resultPtr);
      if (!ok) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `payload is not valid ${resolvedFormat.toUpperCase()}`,
        );
      }
      return {
        fieldsTotal: Number(mem.peek(resultPtr, 'i32', 0)),
        fieldsApplied: Number(mem.peek(resultPtr, 'i32', 4)),
        fieldsSkipped: Number(mem.peek(resultPtr, 'i32', 8)),
        widgetsChanged: Number(mem.peek(resultPtr, 'i32', 12)),
      };
    });

    this.session.noteMutation();
    const fresh = acquireFormModel(this.runtime, this.session);
    return {
      ...counters,
      snapshot: readFormSnapshot(this.runtime, fresh),
      meta: EMPTY_META,
    };
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
        needAppearancesCleared: Number(mem.peek(reportPtr, 'i32', 20)) !== 0,
      };
    });

    this.session.noteMutation();
    return { ...report, meta: EMPTY_META };
  }

  /**
   * Create a field and (optionally) its widgets in one composed
   * transaction: native field creation, widget birth through the
   * annotation plane, adoption, then field-plane setters. A failure
   * mid-composition throws; earlier steps stay applied (the document is
   * never inconsistent - at worst a partially configured field exists).
   */
  createField(draft: FormFieldDraft, signal: AbortSignal): { field: FormFieldDTO } {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();

    const placements = this.placementsOf(draft);
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

    const familyCode = FAMILY_CODE[draft.family];
    const namePtr = mem.writeU16String(draft.name);
    let fieldObjectNumber: number;
    try {
      fieldObjectNumber = fn.EPDFForm_CreateField(docPtr, familyCode, namePtr);
    } finally {
      mem.free(namePtr);
    }
    if (fieldObjectNumber <= 0) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `cannot create field "${draft.name}" (name conflict or invalid)`,
      );
    }

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

    for (const placement of placements) {
      const widgetObjectNumber = createUnattachedWidget(this.runtime, this.session, placement);
      const onState =
        draft.family === 'radio'
          ? placement.onState!
          : draft.family === 'checkbox'
            ? (placement.onState ?? 'Yes')
            : '';
      if (!fn.EPDFForm_AttachWidget(docPtr, fieldObjectNumber, widgetObjectNumber, onState)) {
        throw new EngineError(EngineErrorCode.Unknown, 'widget adoption failed');
      }
    }

    this.session.noteMutation();
    return { field: this.readBackField(fieldObjectNumber) };
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
    this.assertWritable(resolved.fieldObjectNumber);
    const before = readFieldAt(this.runtime, model, resolved.fieldIndex);
    if (before.family !== patch.family) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `patch family '${patch.family}' does not match field family '${before.family}'`,
      );
    }
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
   * Delete a terminal field. Widgets are DETACHED here (they become inert
   * annotations); the worker host cascades their annotation deletion so
   * page /Annots bookkeeping flows through the annotation feature.
   */
  deleteField(
    ref: FormFieldRef,
    signal: AbortSignal,
  ): { deletedFieldObjectNumber: number; detachedWidgets: FormWidgetRef[] } {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const model = acquireFormModel(this.runtime, this.session);
    const resolved = resolveFieldRef(this.runtime, model, ref);
    this.assertWritable(resolved.fieldObjectNumber);
    const before = readFieldAt(this.runtime, model, resolved.fieldIndex);

    const ok = withScratchN(mem, [256 * 4, 4], ([buf, countPtr]) => {
      mem.poke(countPtr, 'i32', 0);
      return fn.EPDFForm_DeleteField(
        this.session.requireDocPtr(),
        resolved.fieldObjectNumber,
        buf,
        256,
        countPtr,
      );
    });
    if (!ok) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'field cannot be deleted');
    }

    this.session.noteMutation();
    return {
      deletedFieldObjectNumber: resolved.fieldObjectNumber,
      detachedWidgets: before.widgets.map((w) => ({
        annotObjectNumber: w.annotObjectNumber,
        pageObjectNumber: w.pageObjectNumber,
      })),
    };
  }

  attachWidget(
    ref: FormFieldRef,
    widget: FormWidgetRef,
    onState: string | undefined,
    signal: AbortSignal,
  ): { field: FormFieldDTO } {
    throwIfAborted(signal);
    const { fn } = this.runtime;
    const model = acquireFormModel(this.runtime, this.session);
    const resolved = resolveFieldRef(this.runtime, model, ref);
    this.assertWritable(resolved.fieldObjectNumber);
    const before = readFieldAt(this.runtime, model, resolved.fieldIndex);
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
        widget.annotObjectNumber,
        state,
      )
    ) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        'widget cannot be adopted (already attached, merged, or not a widget)',
      );
    }
    this.session.noteMutation();
    return { field: this.readBackField(resolved.fieldObjectNumber) };
  }

  detachWidget(
    ref: FormFieldRef,
    widget: FormWidgetRef,
    signal: AbortSignal,
  ): { field: FormFieldDTO } {
    throwIfAborted(signal);
    const { fn } = this.runtime;
    const model = acquireFormModel(this.runtime, this.session);
    const resolved = resolveFieldRef(this.runtime, model, ref);
    this.assertWritable(resolved.fieldObjectNumber);
    if (
      !fn.EPDFForm_DetachWidget(
        this.session.requireDocPtr(),
        resolved.fieldObjectNumber,
        widget.annotObjectNumber,
      )
    ) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'widget is not attached to this field');
    }
    this.session.noteMutation();
    return { field: this.readBackField(resolved.fieldObjectNumber) };
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
    return readFieldAt(this.runtime, fresh, fieldIndex);
  }

  private assertWritable(fieldObjectNumber: number): void {
    if (fieldObjectNumber === 0) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        'form field is stored as a direct object and cannot be written',
      );
    }
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
          // Empty string clears the group, same as the C API's NULL.
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
    return withScratchN(mem, [CHANGED_WIDGETS_CAPACITY * 4, 4], ([buf, countPtr]) => {
      mem.poke(countPtr, 'i32', 0);
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
    const field: FormFieldDTO = readFieldAt(this.runtime, fresh, fieldIndex);
    const changedSet = new Set(changedObjNums);
    const changedWidgets: FormWidgetRef[] = field.widgets
      .filter((w) => changedSet.has(w.annotObjectNumber))
      .map((w) => ({
        annotObjectNumber: w.annotObjectNumber,
        pageObjectNumber: w.pageObjectNumber,
      }));
    return { field, changedWidgets, meta: EMPTY_META };
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
