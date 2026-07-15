import type {
  FormEffect,
  FormEffectResult,
  FormEffectsResult,
  FormFieldDTO,
  FormFieldRef,
  FormFieldValue,
  FormWidgetRef,
  MutationMeta,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode, serializeError } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/pdf-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { withScratchN } from '../../runtime/memory/scratch';
import { throwIfAborted } from '../../shared/abort';
import { acquireFormModel } from './internal/formModelCache';
import { readFieldAt } from './internal/readFormSnapshot';
import { resolveFieldRef } from './internal/resolveFieldRef';
import { withWideStringArray } from './internal/wideStringArray';
import { ActionReadBudgetTracker } from '../actions/ActionModelReader';

const CHANGED_WIDGETS_CAPACITY = 1024;
const EMPTY_META: MutationMeta = { affectedPages: [], cacheDelta: null };
const DISPLAY_CODE = { visible: 0, hidden: 1, noPrint: 2, noView: 3 } as const;

interface PreflightEffect {
  effect: FormEffect;
  fieldObjectNumbers: number[];
  fields: FormFieldDTO[];
  error?: ReturnType<typeof serializeError>;
}

interface NativeEffectResult {
  ok: boolean;
  changedWidgetObjectNumbers: number[];
}

/** Ordered, non-rollback-atomic sink for one committed client script run. */
export class FormsEffectsApplier {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  apply(effects: FormEffect[], signal: AbortSignal): FormEffectsResult {
    throwIfAborted(signal);
    const preflightActionBudget = new ActionReadBudgetTracker();
    const resultActionBudget = new ActionReadBudgetTracker();
    const preflight = effects.map((effect) => this.preflight(effect, preflightActionBudget));
    const results: FormEffectResult[] = [];
    const allChangedWidgets = new Map<string, FormWidgetRef>();
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

      let before: FormFieldDTO[];
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
        const native = this.applyNative(item.effect, item.fieldObjectNumbers);
        if (!native.ok) {
          // Native false is outcome-indeterminate at this layer. Finalize the
          // session and stop; compounding writes would make recovery harder.
          mustFinalize = true;
          this.session.noteMutation();
          const fields = this.readFieldsBestEffort(item.fieldObjectNumbers, resultActionBudget);
          const changedWidgets = widgetRefs(native.changedWidgetObjectNumbers, before, fields);
          rememberWidgets(allChangedWidgets, changedWidgets);
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
        this.session.noteMutation();
        const fields = this.readFieldsBestEffort(item.fieldObjectNumbers, resultActionBudget);
        const changedWidgets = widgetRefs(native.changedWidgetObjectNumbers, before, fields);
        rememberWidgets(allChangedWidgets, changedWidgets);
        results.push({ index, status: 'applied', fields, changedWidgets });
      } catch (error) {
        mustFinalize = true;
        this.session.noteMutation();
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

    return {
      results,
      changedWidgets: [...allChangedWidgets.values()],
      meta: mustFinalize ? EMPTY_META : null,
    };
  }

  private preflight(effect: FormEffect, actionBudget: ActionReadBudgetTracker): PreflightEffect {
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
        readFieldAt(this.runtime, model, fieldIndex, actionBudget),
      );
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
        EngineErrorCode.InvalidReference,
        'direct-object form fields cannot be mutated',
      );
    }
    return resolved;
  }

  private readField(
    fieldObjectNumber: number,
    actionBudget = new ActionReadBudgetTracker(),
  ): FormFieldDTO {
    const model = acquireFormModel(this.runtime, this.session);
    const index = this.runtime.fn.EPDFForm_GetFieldIndexByObjNum(model, fieldObjectNumber);
    if (index < 0) {
      throw new EngineError(EngineErrorCode.InvalidReference, 'form field disappeared');
    }
    return readFieldAt(this.runtime, model, index, actionBudget);
  }

  private readFieldsBestEffort(
    fieldObjectNumbers: number[],
    actionBudget: ActionReadBudgetTracker,
  ): FormFieldDTO[] {
    const fields: FormFieldDTO[] = [];
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

  private applyNative(effect: FormEffect, fieldObjectNumbers: number[]): NativeEffectResult {
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
        return this.applyValue(objectNumber, effect.value);
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

  private applyValue(fieldObjectNumber: number, value: FormFieldValue): NativeEffectResult {
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    return this.withChangedWidgets((buf, cap, countPtr) => {
      if (value.type === 'toggle') {
        return fn.EPDFForm_SetToggle(
          docPtr,
          fieldObjectNumber,
          value.state ?? '',
          buf,
          cap,
          countPtr,
        );
      }
      if (value.type === 'choice') {
        return withWideStringArray(this.runtime, value.values, (valuesPtr, count) =>
          fn.EPDFForm_SetChoiceValues(
            docPtr,
            fieldObjectNumber,
            valuesPtr,
            count,
            buf,
            cap,
            countPtr,
          ),
        );
      }
      const valuePtr = mem.writeU16String(value.value);
      try {
        return fn.EPDFForm_SetTextValue(docPtr, fieldObjectNumber, valuePtr, buf, cap, countPtr);
      } finally {
        mem.free(valuePtr);
      }
    });
  }

  private withChangedWidgets(
    call: (buf: Ptr, cap: number, countPtr: Ptr) => boolean,
  ): NativeEffectResult {
    const { mem } = this.runtime;
    return withScratchN(mem, [CHANGED_WIDGETS_CAPACITY * 4, 4], ([buf, countPtr]) => {
      mem.poke(countPtr, 'i32', 0);
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

function validateEffect(effect: FormEffect, fields: FormFieldDTO[]): void {
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
  validateValue(field, effect.value);
}

function validateValue(field: FormFieldDTO, value: FormFieldValue): void {
  if (value.type === 'text') {
    if (field.family !== 'text') mismatch(field, value);
    if (field.maxLength !== null && value.value.length > field.maxLength) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'text value exceeds field maxLength');
    }
    return;
  }
  if (value.type === 'toggle') {
    if (field.family !== 'checkbox' && field.family !== 'radio') mismatch(field, value);
    if (value.state !== null && !field.widgets.some((widget) => widget.onState === value.state)) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'unknown toggle appearance state');
    }
    return;
  }
  if (field.family !== 'combobox' && field.family !== 'listbox') mismatch(field, value);
  if (new Set(value.values).size !== value.values.length) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'choice values must not contain duplicates');
  }
  if (field.family === 'combobox' && value.values.length > 1) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'combo boxes accept at most one value');
  }
  if (field.family === 'listbox' && !field.multiSelect && value.values.length > 1) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'single-select list boxes accept one value');
  }
  const optionValues = new Set(field.options.map((option) => option.value));
  const freeText = field.family === 'combobox' && field.edit && value.values.length === 1;
  if (!freeText && value.values.some((entry) => !optionValues.has(entry))) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'choice value is not a field option');
  }
}

function mismatch(field: FormFieldDTO, value: FormFieldValue): never {
  throw new EngineError(
    EngineErrorCode.InvalidArg,
    `value type '${value.type}' does not apply to a '${field.family}' field`,
  );
}

function isNoOp(effect: FormEffect, fields: FormFieldDTO[]): boolean {
  if (effect.kind === 'setAppearanceText') return fields[0].widgets.length === 0;
  if (effect.kind === 'setDisplay') return fields[0].widgets.length === 0;
  if (effect.kind === 'reset') {
    return fields.every((field) => valueEntriesEqual(field.valueEntry, field.defaultValueEntry));
  }
  const field = fields[0];
  const value = effect.value;
  if (value.type === 'text' && field.family === 'text') return field.value === value.value;
  if (value.type === 'toggle' && (field.family === 'checkbox' || field.family === 'radio')) {
    return field.widgets.every((widget) => widget.checked === (widget.onState === value.state));
  }
  if (value.type === 'choice' && field.family === 'combobox') {
    return value.values.length === 0 ? field.value === '' : field.value === value.values[0];
  }
  if (value.type === 'choice' && field.family === 'listbox') {
    return arraysEqual(field.selectedValues, value.values);
  }
  return false;
}

function effectChangedState(
  effect: FormEffect,
  before: FormFieldDTO[],
  changedWidgetObjectNumbers: number[],
): boolean {
  if (effect.kind === 'setDisplay' || effect.kind === 'setAppearanceText') {
    return changedWidgetObjectNumbers.length > 0;
  }
  return !isNoOp(effect, before) || changedWidgetObjectNumbers.length > 0;
}

function valueEntriesEqual(
  left: FormFieldDTO['valueEntry'],
  right: FormFieldDTO['defaultValueEntry'],
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'scalar' && right.kind === 'scalar') return left.value === right.value;
  if (left.kind === 'array' && right.kind === 'array')
    return arraysEqual(left.values, right.values);
  return true;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function widgetRefs(
  objectNumbers: number[],
  before: FormFieldDTO[],
  after: FormFieldDTO[],
): FormWidgetRef[] {
  const byObjectNumber = new Map<number, FormWidgetRef>();
  for (const field of [...before, ...after]) {
    for (const widget of field.widgets) byObjectNumber.set(widget.annotObjectNumber, widget);
  }
  return [...new Set(objectNumbers)]
    .map((objectNumber) => byObjectNumber.get(objectNumber))
    .filter((widget): widget is FormWidgetRef => widget !== undefined)
    .map(({ annotObjectNumber, pageObjectNumber }) => ({ annotObjectNumber, pageObjectNumber }));
}

function rememberWidgets(target: Map<string, FormWidgetRef>, widgets: FormWidgetRef[]): void {
  for (const widget of widgets) {
    target.set(`${widget.pageObjectNumber}:${widget.annotObjectNumber}`, widget);
  }
}

function emptyResult(index: number, status: FormEffectResult['status']): FormEffectResult {
  return { index, status, fields: [], changedWidgets: [] };
}
