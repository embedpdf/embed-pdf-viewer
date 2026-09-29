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

/** A written value as scripts see it: a toggle's export value (`'Off'` when clear). */
export function scriptValueFromFormValue(
  field: ScriptFieldInput,
  value: FormFieldValue,
): ScriptValue {
  switch (field.family) {
    case 'text':
    case 'combobox':
      if ('value' in value) return value.value ?? '';
      break;
    case 'radio':
      if ('value' in value) return value.value ?? 'Off';
      break;
    case 'checkbox':
      if ('value' in value) return value.value ?? 'Off';
      if ('checked' in value) {
        if (!value.checked) return 'Off';
        const first = field.exportValues?.[0];
        if (first === undefined)
          throw new Error(`Form field '${field.name}' has no widget to check`);
        return first;
      }
      break;
    case 'listbox':
      if ('selectedValues' in value) return [...value.selectedValues];
      break;
  }
  throw new Error(`Form field '${field.name}' (${field.family}) does not take this value`);
}

/** A script value as the engine writes it, or null for a family that holds none. */
export function formValueFromScriptValue(field: ScriptFieldInput): FormFieldValue | null {
  const value = field.value;
  switch (field.family) {
    case 'text':
      return { value: String(value ?? '') };
    case 'checkbox':
    case 'radio':
      return { value: value === null || String(value) === 'Off' ? null : String(value) };
    case 'combobox': {
      const selected = Array.isArray(value) ? value[0] : value;
      const text = selected === null || selected === undefined ? '' : String(selected);
      return { value: text === '' ? null : text };
    }
    case 'listbox':
      if (Array.isArray(value)) return { selectedValues: [...value] };
      return { selectedValues: value === null || value === '' ? [] : [String(value)] };
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
