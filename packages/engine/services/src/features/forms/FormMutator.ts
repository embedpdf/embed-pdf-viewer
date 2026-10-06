import type {
  FormDataFormat,
  FormFieldDraft,
  FormFieldDTO,
  FormFieldFamily,
  FormFieldOptionInput,
  FormFieldPatch,
  FormFieldRef,
  FormFieldValue,
  FormImportResult,
  FormRepairResult,
  FormResetResult,
  FormSetValueResult,
  FormWidget,
  MutationMeta,
  PdfCoordinates,
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
import {
  applyNativeWrite,
  isAtDefault,
  nativeWriteOf,
  valueEntriesEqual,
  type NativeFieldWrite,
} from './internal/fieldValues';
import { withWideStringArray } from './internal/wideStringArray';
import { readFieldAt, readFormSnapshot } from './internal/readFormSnapshot';
import {
  fieldObjectNumberOf,
  resolveFieldRef,
  type ResolvedField,
} from './internal/resolveFieldRef';
import { AnnotationMutator } from '../annotations/AnnotationMutator';
import { promoteInlineAnnotations } from '../annotations/internal/write/promoteInlineAnnotations';
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
 * Value writes are non-structural: the cloud layer computes its own cache
 * delta server-side.
 */
const EMPTY_META: MutationMeta = { affectedPages: [], cacheDelta: null };

/** The families that hold a value: the ones `reset` puts back. */
const VALUE_FAMILIES: ReadonlySet<FormFieldFamily> = new Set([
  'text',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
]);

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

  setValue(
    ref: FormFieldRef,
    value: FormFieldValue,
    signal: AbortSignal,
  ): FormSetValueResult<PdfCoordinates> {
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
    const changed = this.applyWrite(resolved.fieldObjectNumber, nativeWriteOf(before, value));
    return this.readBack(resolved.fieldObjectNumber, changed);
  }

  /**
   * Put fields back to their default value: the ones named, or, with
   * `refs` absent, every field of the form. Fields that hold no value are
   * skipped; so, in a whole-form reset, are fields stored inline or locked
   * by a signature (named, they are refused). Every field is checked before
   * the first write. Returns the fields that changed.
   */
  reset(refs: FormFieldRef[] | undefined, signal: AbortSignal): FormResetResult<PdfCoordinates> {
    throwIfAborted(signal);
    const { fn } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const model = acquireFormModel(this.runtime, this.session);
    const targets =
      refs === undefined ? this.wholeFormTargets(model) : this.namedTargets(model, refs);
    throwIfAborted(signal);

    // A field already at its default is left alone: a reset would only repaint it.
    const written = targets
      .filter((field) => !isAtDefault(field))
      .map((before) => {
        const changed = this.withChangedWidgets((buf, cap, countPtr) =>
          fn.EPDFForm_ResetField(docPtr, fieldObjectNumberOf(before), buf, cap, countPtr),
        );
        if (changed === null) {
          throw new EngineError(EngineErrorCode.Unknown, `'${before.name}' could not be reset`);
        }
        return { before, changed };
      });
    if (written.length > 0) this.session.invalidateDerived();

    const fields: FormFieldDTO<PdfCoordinates>[] = [];
    const changedWidgets: FormWidget[] = [];
    for (const { before, changed } of written) {
      const after = this.readBackField(fieldObjectNumberOf(before));
      if (changed.length === 0 && valueEntriesEqual(before.valueEntry, after.valueEntry)) continue;
      fields.push(after);
      const changedSet = new Set(changed);
      for (const widget of after.widgets) {
        if (changedSet.has(widget.objectNumber)) {
          changedWidgets.push(formWidget(widget.objectNumber, widget.page));
        }
      }
    }
    return {
      fields,
      meta: formMutationMeta(
        fields.map((field) => field.ref),
        changedWidgets,
      ),
    };
  }

  /** Every field a whole-form reset puts back: those with a value, written directly, unlocked. */
  private wholeFormTargets(model: Ptr): FormFieldDTO<PdfCoordinates>[] {
    const docPtr = this.session.requireDocPtr();
    const locks = readFieldLocks(this.runtime, this.session);
    const targets: FormFieldDTO<PdfCoordinates>[] = [];
    const count = this.runtime.fn.EPDFForm_CountFields(model);
    for (let index = 0; index < count; index++) {
      const field = readFieldAt(this.runtime, model, index, docPtr);
      if (!VALUE_FAMILIES.has(field.family) || field.ref.kind !== 'objectNumber') continue;
      if (locks?.(field.name)) continue;
      targets.push(field);
    }
    return targets;
  }

  /** The named fields with a value, each once; one that can't be written is refused. */
  private namedTargets(model: Ptr, refs: FormFieldRef[]): FormFieldDTO<PdfCoordinates>[] {
    const docPtr = this.session.requireDocPtr();
    const seen = new Set<number>();
    const targets: FormFieldDTO<PdfCoordinates>[] = [];
    for (const ref of refs) {
      const resolved = resolveFieldRef(this.runtime, model, ref);
      const field = readFieldAt(this.runtime, model, resolved.fieldIndex, docPtr);
      if (!VALUE_FAMILIES.has(field.family) || seen.has(resolved.fieldObjectNumber)) continue;
      this.assertWritable(resolved);
      seen.add(resolved.fieldObjectNumber);
      targets.push(field);
    }
    return targets;
  }

  importData(
    data: ArrayBuffer,
    format: FormDataFormat | undefined,
    signal: AbortSignal,
  ): FormImportResult<PdfCoordinates> {
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

    this.session.invalidateDerived();
    const fresh = acquireFormModel(this.runtime, this.session);
    const form = readFormSnapshot(this.runtime, fresh, this.session.requireDocPtr());
    // The import names no widgets, so every page with a widget may have repainted.
    const widgets = counts.applied > 0 ? form.fields.flatMap((field) => field.widgets) : [];
    const { affectedPages, cacheDelta } = formMutationMeta([], widgets);
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

    this.session.invalidateDerived();
    return { ...report, meta: EMPTY_META };
  }

  /**
   * Create a field and (optionally) its widgets as one change: native
   * field creation, widget birth through the annotation plane, adoption,
   * then field-plane setters. Everything a caller can get wrong is checked
   * before the first write; any failure after it aborts the job's layer
   * transaction, so a rejected draft creates nothing.
   */
  createField(
    draft: FormFieldDraft<PdfCoordinates>,
    signal: AbortSignal,
    numbers: {
      /** The field's object number; the next free one when absent. */
      readonly objectNumber?: number;
      /** Its widgets', in `draft.widgets` order; the next free ones when absent. */
      readonly widgetObjectNumbers?: readonly number[];
    } = {},
  ): { field: FormFieldDTO<PdfCoordinates> } {
    throwIfAborted(signal);
    const { fn } = this.runtime;
    const docPtr = this.session.requireDocPtr();

    const placements = draft.widgets ?? [];
    const pageIndexes = placements.map((placement) => this.preflightPlacement(placement));
    const onStates = placements.map((placement) => onStateOf(draft.family, placement));
    if (draft.family === 'listbox' && draft.defaultValue !== undefined) {
      assertListDefault(draft.defaultValue, draft.options ?? [], draft.multiSelect ?? false);
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
    const { objectNumber, widgetObjectNumbers } = numbers;
    if (widgetObjectNumbers && widgetObjectNumbers.length !== placements.length) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `forms.create needs one widget object number per widget: ${widgetObjectNumbers.length} for ${placements.length}`,
        { details: { field: 'widgetObjectNumbers' } },
      );
    }
    if (objectNumber !== undefined) this.session.useObjectNumber(objectNumber);
    for (const number of widgetObjectNumbers ?? []) this.session.useObjectNumber(number);
    throwIfAborted(signal);

    // A failure from here on aborts the job's layer transaction, which takes
    // back the field, its widgets and any parent's /Kids together.
    const fieldObjectNumber = this.createFieldNode(draft, objectNumber);
    this.configureNewField(draft, fieldObjectNumber);
    placements.forEach((placement, at) => {
      const widgetObjectNumber = createUnattachedWidget(
        this.runtime,
        docPtr,
        pageIndexes[at]!,
        placement,
        widgetObjectNumbers?.[at],
      );
      // A new field is never merged, so no split number is needed.
      if (
        !fn.EPDFForm_AttachWidget(docPtr, fieldObjectNumber, widgetObjectNumber, onStates[at]!, 0)
      ) {
        throw new EngineError(EngineErrorCode.Unknown, 'widget adoption failed');
      }
    });
    this.session.invalidateDerived();
    return { field: this.readBackField(fieldObjectNumber) };
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
  private preflightPlacement(placement: WidgetPlacement<PdfCoordinates>): number {
    const record = this.session.resolvePageRef(placement.page);
    const { left, bottom, right, top } = placement.rect;
    if (![left, bottom, right, top].every(Number.isFinite)) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'widget rect must be finite numbers', {
        details: { field: 'rect' },
      });
    }
    return record.pageIndex;
  }

  /**
   * The native field node, linked into the tree, at `objectNumber` (checked
   * by the session) or the next free number.
   */
  private createFieldNode(draft: FormFieldDraft<PdfCoordinates>, objectNumber?: number): number {
    const { fn, mem } = this.runtime;
    const namePtr = mem.writeU16String(draft.name);
    let fieldObjectNumber: number;
    try {
      fieldObjectNumber = fn.EPDFForm_CreateField(
        this.session.requireDocPtr(),
        FAMILY_CODE[draft.family],
        namePtr,
        objectNumber ?? 0, // 0: the next free one
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
  private configureNewField(
    draft: FormFieldDraft<PdfCoordinates>,
    fieldObjectNumber: number,
  ): void {
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
      const values = Array.isArray(draft.defaultValue) ? draft.defaultValue : [draft.defaultValue];
      if (values.length > 0) this.applyDefaultValues(fieldObjectNumber, values);
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
   * is part of what the signature covers).
   */
  setSignatureAppearance(
    ref: FormFieldRef,
    pdf: Uint8Array,
    signal: AbortSignal,
  ): { field: FormFieldDTO<PdfCoordinates> } {
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
          s.field.objectNumber === resolved.fieldObjectNumber,
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
      bakeWidgetAppearance(this.runtime, docPtr, widget, pdf);
    }
    this.session.invalidateDerived();
    return { field: this.readBackField(resolved.fieldObjectNumber) };
  }

  updateField(
    ref: FormFieldRef,
    patch: FormFieldPatch,
    signal: AbortSignal,
  ): { field: FormFieldDTO<PdfCoordinates> } {
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
    const listDefault = 'defaultValue' in patch ? patch.defaultValue : undefined;
    if (before.family === 'listbox' && Array.isArray(listDefault)) {
      const multiSelect =
        ('multiSelect' in patch ? patch.multiSelect : undefined) ?? before.multiSelect;
      const options = ('options' in patch ? patch.options : undefined) ?? before.options;
      assertListDefault(listDefault, options, multiSelect);
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
      const values =
        patch.defaultValue === null
          ? []
          : Array.isArray(patch.defaultValue)
            ? patch.defaultValue
            : [patch.defaultValue];
      if (values.length === 0) {
        if (!fn.EPDFForm_RemoveFieldDefaultValue(docPtr, fieldObjectNumber)) {
          throw new EngineError(EngineErrorCode.InvalidArg, 'default value removal rejected');
        }
      } else {
        this.applyDefaultValues(fieldObjectNumber, values);
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

    this.session.invalidateDerived();
    return { field: this.readBackField(fieldObjectNumber) };
  }

  /**
   * Delete a terminal field and its widgets in one mutation. The native
   * write detaches kid widgets and unlinks the field from /Fields or its
   * parent's /Kids; the cascade then removes every placed widget from its
   * page through the annotation feature, which owns /Annots bookkeeping. A
   * merged field/widget has no
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
    const removedWidgets = before.widgets.map((w) => formWidget(w.objectNumber, w.page));

    // Apply boundary. EPDFForm_DeleteField validates before it writes, so a
    // refusal leaves the document untouched; nothing after it may throw for
    // caller input or cancellation.
    throwIfAborted(signal);
    if (!this.nativeDeleteField(resolved.fieldObjectNumber)) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'field cannot be deleted');
    }
    // Rebuild the form model before the cascade's attachment guard reads it.
    this.session.invalidateDerived();

    const annotations = new AnnotationMutator(this.runtime, this.session);
    for (const widget of removedWidgets) {
      if (!widget.ref) continue; // direct or unplaced: no /Annots entry to remove
      annotations.deleteReleasedWidget(widget.ref, resolved.fieldObjectNumber);
    }
    // The cascade edited /Annots after the bump above; bump again so the
    // form model rebuilds.
    this.session.invalidateDerived();
    return { deleted: before.ref, removedWidgets };
  }

  /**
   * Show a field in one more place: create the widget where the placement
   * says, styled by it, and add it to the field, as one change. A failure
   * after the first write rolls the page and the form back.
   */
  addWidget(
    ref: FormFieldRef,
    placement: WidgetPlacement<PdfCoordinates>,
    signal: AbortSignal,
    numbers: {
      /** The new widget's object number; the next free one when absent. */
      readonly objectNumber?: number;
      /** Where a merged field's widget moves; the next free one when absent. */
      readonly splitObjectNumber?: number;
    } = {},
  ): { field: FormFieldDTO<PdfCoordinates>; widget: FormWidget } {
    throwIfAborted(signal);
    const { fn } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const model = acquireFormModel(this.runtime, this.session);
    const resolved = resolveFieldRef(this.runtime, model, ref);
    this.assertWritable(resolved);
    const before = readFieldAt(this.runtime, model, resolved.fieldIndex, docPtr);
    const pageIndex = this.preflightPlacement(placement);
    const onState = onStateOf(before.family, placement);
    // A merged field/widget splits: its widget half leaves its place in
    // /Annots for a new widget at the end, which moves that page's entries.
    const mergedPage =
      before.widgets.find((w) => w.objectNumber === resolved.fieldObjectNumber)?.page ?? null;
    if (numbers.objectNumber !== undefined) this.session.useObjectNumber(numbers.objectNumber);
    // The split number is used only when the field is merged.
    const splitObjectNumber = mergedPage ? numbers.splitObjectNumber : undefined;
    if (splitObjectNumber !== undefined) this.session.useObjectNumber(splitObjectNumber);
    throwIfAborted(signal);

    // A failure from here on aborts the job's layer transaction.
    if (mergedPage) promoteInlineAnnotations(this.runtime, this.session, mergedPage.objectNumber);
    const widgetObjectNumber = createUnattachedWidget(
      this.runtime,
      docPtr,
      pageIndex,
      placement,
      numbers.objectNumber,
    );
    if (
      !fn.EPDFForm_AttachWidget(
        docPtr,
        resolved.fieldObjectNumber,
        widgetObjectNumber,
        onState,
        splitObjectNumber ?? 0, // 0: the next free one
      )
    ) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'the widget could not join the field');
    }
    this.session.invalidateDerived();
    return {
      field: this.readBackField(resolved.fieldObjectNumber),
      widget: formWidget(widgetObjectNumber, placement.page),
    };
  }

  detachWidget(
    ref: FormFieldRef,
    widget: AnnotationRef,
    signal: AbortSignal,
  ): { field: FormFieldDTO<PdfCoordinates>; widget: FormWidget } {
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
    this.session.invalidateDerived();
    return {
      field: this.readBackField(resolved.fieldObjectNumber),
      widget: formWidget(widgetObjectNumber(widget), widget.page),
    };
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

  private readBackField(fieldObjectNumber: number): FormFieldDTO<PdfCoordinates> {
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

  /** Run the native value write. Returns the changed widget objnums. */
  private applyWrite(fieldObjectNumber: number, write: NativeFieldWrite): number[] {
    const docPtr = this.session.requireDocPtr();
    const changed = this.withChangedWidgets((buf, cap, countPtr) =>
      applyNativeWrite(this.runtime, docPtr, fieldObjectNumber, write, { buf, cap, countPtr }),
    );
    if (changed === null) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        'form value rejected (a radio group that must keep a choice, or a length limit)',
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
  private readBack(
    fieldObjectNumber: number,
    changedObjNums: number[],
  ): FormSetValueResult<PdfCoordinates> {
    this.session.invalidateDerived();
    const fresh = acquireFormModel(this.runtime, this.session);
    const fieldIndex = this.runtime.fn.EPDFForm_GetFieldIndexByObjNum(fresh, fieldObjectNumber);
    if (fieldIndex < 0) {
      throw new EngineError(EngineErrorCode.Unknown, 'form field vanished after write');
    }
    const field: FormFieldDTO<PdfCoordinates> = readFieldAt(
      this.runtime,
      fresh,
      fieldIndex,
      this.session.requireDocPtr(),
    );
    const changedSet = new Set(changedObjNums);
    const changedWidgets: FormWidget[] = field.widgets
      .filter((w) => changedSet.has(w.objectNumber))
      .map((w) => formWidget(w.objectNumber, w.page));
    return { field, meta: formMutationMeta([field.ref], changedWidgets) };
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
  listbox: ['multiSelect', 'options', 'defaultValue'],
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
  // A list's default is option values; a text field's or a dropdown's, one string.
  const defaultValue = 'defaultValue' in patch ? patch.defaultValue : undefined;
  if (defaultValue !== undefined && defaultValue !== null) {
    if (Array.isArray(defaultValue) !== (family === 'listbox')) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        family === 'listbox'
          ? `a list's defaultValue is a list of option values`
          : `a ${family} field's defaultValue is one string`,
        { details: { field: 'defaultValue' } },
      );
    }
  }
}

/**
 * The on-state a new widget of a `family` field gets: its export value. A
 * radio button needs one other than `'Off'`; a checkbox's is `'Yes'` when
 * left out; other families take none.
 */
function onStateOf(family: FormFieldFamily, placement: WidgetPlacement<PdfCoordinates>): string {
  const { exportValue } = placement;
  if (family !== 'checkbox' && family !== 'radio') {
    if (exportValue !== undefined) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `'exportValue' applies to checkbox and radio widgets, not a ${family} field's`,
        { details: { field: 'exportValue' } },
      );
    }
    return '';
  }
  const value = exportValue ?? (family === 'checkbox' ? 'Yes' : undefined);
  if (!value || value === 'Off') {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      family === 'radio'
        ? 'every radio button needs an exportValue other than "Off"'
        : `a checkbox's exportValue can't be "Off"`,
      { details: { field: 'exportValue' } },
    );
  }
  return value;
}

/** A list's default: option values, each once, and one unless it's multi-select. */
function assertListDefault(
  values: readonly string[],
  options: readonly FormFieldOptionInput[],
  multiSelect: boolean,
): void {
  const invalid = (message: string) =>
    new EngineError(EngineErrorCode.InvalidArg, message, { details: { field: 'defaultValue' } });
  if (new Set(values).size !== values.length) throw invalid('the default values must not repeat');
  if (!multiSelect && values.length > 1)
    throw invalid('a list without multiSelect has one default');
  const optionValues = new Set(options.map((option) => option.value));
  const unknown = values.find((value) => !optionValues.has(value));
  if (unknown !== undefined) throw invalid(`'${unknown}' is not an option value of the list`);
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
  return widget.objectNumber;
}
