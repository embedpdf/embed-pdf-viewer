import type {
  FormEffect,
  FormEffectResult,
  FormEffectsResult,
  FormFieldDTO,
  FormFieldRef,
  FormWidget,
  PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import {
  EngineError,
  EngineErrorCode,
  encodeFieldRefKey,
  formWidget,
  serializeError,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { withScratchN } from '../../runtime/memory/scratch';
import { U64_BYTES, pokeU64 } from '../../runtime/memory/u64';
import { throwIfAborted } from '../../shared/abort';
import { acquireFormModel } from './internal/formModelCache';
import {
  assertFieldNotLocked,
  readFieldLocks,
  type FieldLockLookup,
} from './internal/signatureLocks';
import { formMutationMeta } from './internal/formMutationMeta';
import { readFieldAt } from './internal/readFormSnapshot';
import { resolveFieldRef } from './internal/resolveFieldRef';
import {
  applyNativeWrite,
  isNoOpWrite,
  nativeWriteOf,
  valueEntriesEqual,
  type NativeFieldWrite,
} from './internal/fieldValues';
import { ActionReadBudgetTracker } from '../actions/ActionModelReader';

const CHANGED_WIDGETS_CAPACITY = 1024;
const DISPLAY_CODE = { visible: 0, hidden: 1, noPrint: 2, noView: 3 } as const;

interface PreflightEffect {
  effect: FormEffect;
  fieldObjectNumbers: number[];
  fields: FormFieldDTO<PdfCoordinates>[];
  error?: ReturnType<typeof serializeError>;
}

interface NativeEffectResult {
  ok: boolean;
  changedWidgetObjectNumbers: number[];
}

/**
 * An effects batch's result, plus whether anything was written: a batch that
 * wrote nothing needs no artifact, event, or version bump.
 */
export interface AppliedFormEffects {
  result: FormEffectsResult<PdfCoordinates>;
  wrote: boolean;
}

/** Ordered, non-rollback-atomic sink for one committed client script run. */
export class FormsEffectsApplier {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  apply(effects: FormEffect[], signal: AbortSignal): AppliedFormEffects {
    throwIfAborted(signal);
    const preflightActionBudget = new ActionReadBudgetTracker();
    const resultActionBudget = new ActionReadBudgetTracker();
    const locks = readFieldLocks(this.runtime, this.session);
    const preflight = effects.map((effect) => this.preflight(effect, preflightActionBudget, locks));
    const results: FormEffectResult<PdfCoordinates>[] = [];
    const allChangedWidgets = new Map<string, FormWidget>();
    const allChangedFields = new Map<string, FormFieldRef>();
    let mustFinalize = false;
    let stop = false;

    for (let index = 0; index < preflight.length; index++) {
      const item = preflight[index];
      if (stop || (signal.aborted && mustFinalize)) {
        stop = true;
        results.push(emptyResult(index, 'skipped'));
        continue;
      }
      if (signal.aborted) throwIfAborted(signal);
      if (item.error) {
        results.push({
          ...emptyResult(index, 'rejected'),
          fields: item.fields,
          error: item.error,
        });
        continue;
      }

      let before: FormFieldDTO<PdfCoordinates>[];
      try {
        before = item.fieldObjectNumbers.map((objectNumber) => this.readField(objectNumber));
      } catch (error) {
        // No write has happened for this effect. A race between preflight and
        // apply is a rejection unless an earlier effect already landed.
        const status = mustFinalize ? 'failed' : 'rejected';
        results.push({ ...emptyResult(index, status), error: serializeError(error) });
        if (status === 'failed') stop = true;
        continue;
      }

      if (isNoOp(item.effect, before)) {
        results.push({ ...emptyResult(index, 'unchanged'), fields: before });
        continue;
      }

      try {
        const native = this.applyNative(item.effect, item.fieldObjectNumbers, before);
        if (!native.ok) {
          // Native false is outcome-indeterminate at this layer. Finalize the
          // session and stop; compounding writes would make recovery harder.
          mustFinalize = true;
          this.session.invalidateDerived();
          const fields = this.readFieldsBestEffort(item.fieldObjectNumbers, resultActionBudget);
          const changedWidgets = widgetRefs(native.changedWidgetObjectNumbers, before, fields);
          rememberWidgets(allChangedWidgets, changedWidgets);
          rememberFields(allChangedFields, fields);
          results.push({
            index,
            status: 'failed',
            fields,
            changedWidgets,
            error: serializeError(
              new EngineError(EngineErrorCode.Unknown, 'native form effect failed after preflight'),
            ),
          });
          stop = true;
          continue;
        }

        const applied = effectChangedState(item.effect, before, native.changedWidgetObjectNumbers);
        if (!applied) {
          results.push({ ...emptyResult(index, 'unchanged'), fields: before });
          continue;
        }

        mustFinalize = true;
        this.session.invalidateDerived();
        const fields = this.readFieldsBestEffort(item.fieldObjectNumbers, resultActionBudget);
        const changedWidgets = widgetRefs(native.changedWidgetObjectNumbers, before, fields);
        rememberWidgets(allChangedWidgets, changedWidgets);
        rememberFields(allChangedFields, fields);
        results.push({ index, status: 'applied', fields, changedWidgets });
      } catch (error) {
        mustFinalize = true;
        this.session.invalidateDerived();
        results.push({
          index,
          status: 'failed',
          fields: this.readFieldsBestEffort(item.fieldObjectNumbers, resultActionBudget),
          changedWidgets: [],
          error: serializeError(error),
        });
        stop = true;
      }
    }

    const meta = formMutationMeta(
      this.session,
      [...allChangedFields.values()],
      [...allChangedWidgets.values()],
    );
    return { result: { results, meta }, wrote: mustFinalize };
  }

  private preflight(
    effect: FormEffect,
    actionBudget: ActionReadBudgetTracker,
    locks: FieldLockLookup | null,
  ): PreflightEffect {
    try {
      const refs = effect.kind === 'reset' ? effect.refs : [effect.ref];
      if (refs.length === 0) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          'reset effect requires at least one field',
        );
      }
      const model = acquireFormModel(this.runtime, this.session);
      const resolved = refs.map((ref) => this.resolve(model, ref));
      const fields = resolved.map(({ fieldIndex }) =>
        readFieldAt(this.runtime, model, fieldIndex, this.session.requireDocPtr(), actionBudget),
      );
      // A field a signature locked is rejected like any other refused write.
      for (const field of fields) assertFieldNotLocked(field.name, locks);
      validateEffect(effect, fields);
      return {
        effect,
        fieldObjectNumbers: resolved.map(({ fieldObjectNumber }) => fieldObjectNumber),
        fields,
      };
    } catch (error) {
      return { effect, fieldObjectNumbers: [], fields: [], error: serializeError(error) };
    }
  }

  private resolve(
    model: Ptr,
    ref: FormFieldRef,
  ): { fieldIndex: number; fieldObjectNumber: number } {
    const resolved = resolveFieldRef(this.runtime, model, ref);
    if (resolved.fieldObjectNumber <= 0) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        'direct-object form fields cannot be mutated',
      );
    }
    return resolved;
  }

  private readField(
    fieldObjectNumber: number,
    actionBudget = new ActionReadBudgetTracker(),
  ): FormFieldDTO<PdfCoordinates> {
    const model = acquireFormModel(this.runtime, this.session);
    const index = this.runtime.fn.EPDFForm_GetFieldIndexByObjNum(model, fieldObjectNumber);
    if (index < 0) {
      throw new EngineError(EngineErrorCode.NotFound, 'form field disappeared');
    }
    return readFieldAt(this.runtime, model, index, this.session.requireDocPtr(), actionBudget);
  }

  private readFieldsBestEffort(
    fieldObjectNumbers: number[],
    actionBudget: ActionReadBudgetTracker,
  ): FormFieldDTO<PdfCoordinates>[] {
    const fields: FormFieldDTO<PdfCoordinates>[] = [];
    for (const objectNumber of fieldObjectNumbers) {
      try {
        fields.push(this.readField(objectNumber, actionBudget));
      } catch {
        // The result vocabulary already marks the effect failed. Never throw
        // here: landed state still has to reach WorkerHost.finishMutation().
      }
    }
    return fields;
  }

  private applyNative(
    effect: FormEffect,
    fieldObjectNumbers: number[],
    before: FormFieldDTO<PdfCoordinates>[],
  ): NativeEffectResult {
    if (effect.kind === 'reset') {
      const changed: number[] = [];
      for (const objectNumber of fieldObjectNumbers) {
        const result = this.withChangedWidgets((buf, cap, countPtr) =>
          this.runtime.fn.EPDFForm_ResetField(
            this.session.requireDocPtr(),
            objectNumber,
            buf,
            cap,
            countPtr,
          ),
        );
        changed.push(...result.changedWidgetObjectNumbers);
        if (!result.ok) return { ok: false, changedWidgetObjectNumbers: changed };
      }
      return { ok: true, changedWidgetObjectNumbers: changed };
    }

    const objectNumber = fieldObjectNumbers[0];
    switch (effect.kind) {
      case 'setValue':
        return this.applyValue(objectNumber, nativeWriteOf(before[0]!, effect.value));
      case 'setDisplay':
        return this.withChangedWidgets((buf, cap, countPtr) =>
          this.runtime.fn.EPDFForm_SetFieldDisplay(
            this.session.requireDocPtr(),
            objectNumber,
            DISPLAY_CODE[effect.display],
            buf,
            cap,
            countPtr,
          ),
        );
      case 'setAppearanceText': {
        const textPtr = this.runtime.mem.writeU16String(effect.text);
        try {
          return this.withChangedWidgets((buf, cap, countPtr) =>
            this.runtime.fn.EPDFForm_SetFieldAppearanceText(
              this.session.requireDocPtr(),
              objectNumber,
              textPtr,
              buf,
              cap,
              countPtr,
            ),
          );
        } finally {
          this.runtime.mem.free(textPtr);
        }
      }
    }
  }

  private applyValue(fieldObjectNumber: number, write: NativeFieldWrite): NativeEffectResult {
    const docPtr = this.session.requireDocPtr();
    return this.withChangedWidgets((buf, cap, countPtr) =>
      applyNativeWrite(this.runtime, docPtr, fieldObjectNumber, write, { buf, cap, countPtr }),
    );
  }

  private withChangedWidgets(
    call: (buf: Ptr, cap: number, countPtr: Ptr) => boolean,
  ): NativeEffectResult {
    const { mem } = this.runtime;
    return withScratchN(mem, [CHANGED_WIDGETS_CAPACITY * 4, U64_BYTES], ([buf, countPtr]) => {
      // `unsigned long*`: 8 bytes on native, 4 on wasm32 — zero the whole slot.
      pokeU64(mem, countPtr, 0);
      const ok = call(buf, CHANGED_WIDGETS_CAPACITY, countPtr);
      const count = Math.min(
        Math.max(0, Number(mem.peek(countPtr, 'i32'))),
        CHANGED_WIDGETS_CAPACITY,
      );
      const changedWidgetObjectNumbers: number[] = [];
      for (let index = 0; index < count; index++) {
        changedWidgetObjectNumbers.push(Number(mem.peek(buf, 'i32', index * 4)));
      }
      return { ok, changedWidgetObjectNumbers };
    });
  }
}

function validateEffect(effect: FormEffect, fields: FormFieldDTO<PdfCoordinates>[]): void {
  if (effect.kind === 'reset') {
    for (const field of fields) {
      if (field.family === 'pushbutton' || field.family === 'signature') {
        throw new EngineError(EngineErrorCode.InvalidArg, `${field.family} fields cannot be reset`);
      }
    }
    return;
  }
  const field = fields[0];
  if (effect.kind === 'setAppearanceText') {
    if (field.family !== 'text' && field.family !== 'combobox') {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `appearance text does not apply to a ${field.family} field`,
      );
    }
    return;
  }
  if (effect.kind === 'setDisplay') return;
  nativeWriteOf(field, effect.value);
}

function isNoOp(effect: FormEffect, fields: FormFieldDTO<PdfCoordinates>[]): boolean {
  if (effect.kind === 'setAppearanceText') return fields[0].widgets.length === 0;
  if (effect.kind === 'setDisplay') return fields[0].widgets.length === 0;
  if (effect.kind === 'reset') {
    return fields.every((field) => valueEntriesEqual(field.valueEntry, field.defaultValueEntry));
  }
  // A value the field can't take is no no-op: applying it reports why.
  try {
    return isNoOpWrite(fields[0]!, nativeWriteOf(fields[0]!, effect.value));
  } catch {
    return false;
  }
}

function effectChangedState(
  effect: FormEffect,
  before: FormFieldDTO<PdfCoordinates>[],
  changedWidgetObjectNumbers: number[],
): boolean {
  if (effect.kind === 'setDisplay' || effect.kind === 'setAppearanceText') {
    return changedWidgetObjectNumbers.length > 0;
  }
  return !isNoOp(effect, before) || changedWidgetObjectNumbers.length > 0;
}

function widgetRefs(
  objectNumbers: number[],
  before: FormFieldDTO<PdfCoordinates>[],
  after: FormFieldDTO<PdfCoordinates>[],
): FormWidget[] {
  const byObjectNumber = new Map<number, FormWidget>();
  for (const field of [...before, ...after]) {
    for (const widget of field.widgets) byObjectNumber.set(widget.objectNumber, widget);
  }
  return [...new Set(objectNumbers)]
    .map((objectNumber) => byObjectNumber.get(objectNumber))
    .filter((widget): widget is FormWidget => widget !== undefined)
    .map(({ objectNumber: annotObjectNumber, page }) => formWidget(annotObjectNumber, page));
}

function rememberFields(
  target: Map<string, FormFieldRef>,
  fields: FormFieldDTO<PdfCoordinates>[],
): void {
  for (const field of fields) target.set(encodeFieldRefKey(field.ref), field.ref);
}

function rememberWidgets(target: Map<string, FormWidget>, widgets: FormWidget[]): void {
  for (const widget of widgets) {
    target.set(`${widget.page?.objectNumber ?? 0}:${widget.objectNumber}`, widget);
  }
}

function emptyResult(
  index: number,
  status: FormEffectResult<PdfCoordinates>['status'],
): FormEffectResult<PdfCoordinates> {
  return { index, status, fields: [], changedWidgets: [] };
}
