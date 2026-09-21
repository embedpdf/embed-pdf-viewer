/**
 * The transaction overlay: a working copy of the script field view that
 * every pass mutates, and the canonical effect list diffed from it at the
 * end (values, display, appearance text; resets folded back to one effect).
 */
import type { ScriptFieldInput, ScriptValue } from '@embedpdf/core-acrojs';
import type {
  FormEffect,
  FormFieldDTO,
  FormFieldRef,
  FormFieldValue,
  FormSnapshot,
} from '@embedpdf/engine-core/runtime';

export interface Overlay {
  original: ScriptFieldInput[];
  fields: ScriptFieldInput[];
  resetKeys: Set<string>;
  appearances: Map<string, { ref: FormFieldRef; text: string }>;
}

export const refKey = (ref: FormFieldRef): string =>
  ref.kind === 'objectNumber' ? `obj:${ref.fieldObjectNumber}` : `fqn:${ref.name}`;

export const sameRef = (left: FormFieldRef, right: FormFieldRef): boolean =>
  refKey(left) === refKey(right);

export const cloneValue = (value: ScriptValue): ScriptValue =>
  Array.isArray(value) ? [...value] : value;

export const sameValue = (left: ScriptValue, right: ScriptValue): boolean =>
  Array.isArray(left) && Array.isArray(right)
    ? left.length === right.length && left.every((value, index) => value === right[index])
    : left === right;

export function cloneFields(fields: ScriptFieldInput[]): ScriptFieldInput[] {
  return fields.map((field) => ({
    ...field,
    ref: { ...field.ref },
    value: cloneValue(field.value),
    defaultValue: cloneValue(field.defaultValue),
    ...(field.options ? { options: field.options.map((option) => ({ ...option })) } : {}),
  }));
}

export function fieldByRef<T extends { ref: FormFieldRef }>(
  fields: T[],
  ref: FormFieldRef,
): T | undefined {
  return fields.find((field) => sameRef(field.ref, ref));
}

export function snapshotField(snapshot: FormSnapshot, ref: FormFieldRef): FormFieldDTO | undefined {
  return snapshot.fields.find((field) => sameRef(field.ref, ref));
}

export function scriptValueFromFormValue(
  field: ScriptFieldInput,
  value: FormFieldValue,
): ScriptValue {
  if (field.family === 'text' && value.type === 'text') return value.value;
  if ((field.family === 'checkbox' || field.family === 'radio') && value.type === 'toggle') {
    return value.state ?? 'Off';
  }
  if (field.family === 'combobox' && value.type === 'choice') return value.values[0] ?? '';
  if (field.family === 'listbox' && value.type === 'choice') return [...value.values];
  throw new Error(`Form value type '${value.type}' does not match field family '${field.family}'`);
}

export function formValueFromScriptValue(field: ScriptFieldInput): FormFieldValue | null {
  switch (field.family) {
    case 'text':
      return { type: 'text', value: String(field.value ?? '') };
    case 'checkbox':
    case 'radio':
      return {
        type: 'toggle',
        state:
          field.value === null || field.value === undefined || String(field.value) === 'Off'
            ? null
            : String(field.value),
      };
    case 'combobox':
      return {
        type: 'choice',
        values: Array.isArray(field.value) ? field.value.slice(0, 1) : [String(field.value ?? '')],
      };
    case 'listbox':
      return {
        type: 'choice',
        values: Array.isArray(field.value) ? [...field.value] : [String(field.value ?? '')],
      };
    default:
      return null;
  }
}

export function applyEffects(overlay: Overlay, effects: FormEffect[]): void {
  for (const effect of effects) {
    if (effect.kind === 'reset') {
      for (const ref of effect.refs) {
        const field = fieldByRef(overlay.fields, ref);
        if (!field) continue;
        field.value = cloneValue(field.defaultValue);
        overlay.resetKeys.add(refKey(ref));
      }
      continue;
    }

    const field = fieldByRef(overlay.fields, effect.ref);
    if (!field) continue;
    const key = refKey(effect.ref);
    if (effect.kind === 'setValue') {
      field.value = scriptValueFromFormValue(field, effect.value);
      overlay.resetKeys.delete(key);
    } else if (effect.kind === 'setDisplay') {
      field.display = effect.display;
    } else {
      overlay.appearances.set(key, { ref: effect.ref, text: effect.text });
    }
  }
}

export function canonicalEffects(overlay: Overlay): FormEffect[] {
  const effects: FormEffect[] = [];
  const resets: FormFieldRef[] = [];
  for (const field of overlay.fields) {
    const original = fieldByRef(overlay.original, field.ref);
    if (!original) continue;
    if (!sameValue(original.value, field.value)) {
      const key = refKey(field.ref);
      if (overlay.resetKeys.has(key) && sameValue(field.value, field.defaultValue)) {
        resets.push(field.ref);
      } else {
        const value = formValueFromScriptValue(field);
        if (value) effects.push({ kind: 'setValue', ref: field.ref, value });
      }
    }
    if (original.display !== field.display) {
      effects.push({ kind: 'setDisplay', ref: field.ref, display: field.display });
    }
  }
  if (resets.length > 0) effects.unshift({ kind: 'reset', refs: resets });
  effects.push(
    ...Array.from(overlay.appearances.values(), ({ ref, text }) => ({
      kind: 'setAppearanceText' as const,
      ref,
      text,
    })),
  );
  return effects;
}
