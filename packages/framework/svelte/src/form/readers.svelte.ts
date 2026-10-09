/**
 * The form plugin's readers: `useForm()` (the API), the state and the settings, `useFormEvent()`,
 * `useFormValue()` (one field's value), and the colors `<FormLayer>` draws fields with.
 */
import type { EventHook } from '@embedpdf/core';
import { FormToken, formState } from '@embedpdf/plugin-form';
import type { FormCapability, FormFieldRef, FormFieldValue } from '@embedpdf/plugin-form';
import { formColorsOf, type FormColors } from '@embedpdf/web';
import { useViewerSettings } from '../runtime/documents.svelte';
import {
  useCapability,
  useCapabilityEvent,
  useOptionalSelector,
} from '../runtime/readers.svelte';
import { settingsReader, stateReader } from '../runtime/state.svelte';
import {
  currentOf,
  derivedValue,
  valueOf,
  type CurrentValue,
  type MaybeGetter,
} from '../runtime/values.svelte';

/**
 * The form API for the document in scope: reading, filling, form data and building. A handle:
 * always the capability of the document in scope, so keep it whole (`form.setValue(…)`).
 */
export function useForm(): FormCapability {
  return useCapability(FormToken);
}

/**
 * Subscribe to one form event while the component lives:
 * `useFormEvent((form) => form.onValueChanged, handler)`.
 */
export function useFormEvent<T>(
  select: (form: FormCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(FormToken, select, handler);
}

/**
 * The form's state: every field (`fields`), whether it's read (`status`), what kind of form the
 * document has (`formKind`), and the field of the selected widget (`selectedField`), declared
 * once in `formState`. A reactive object (`state.fields`), or with a selector one value as
 * `{ current }` that changes only when what it picks changes. Empty without a document.
 */
export const useFormState = stateReader(formState);

/**
 * The form settings (`validation`, `focus`, `fields`), with or without a document. They belong
 * to the plugin; change them with `useForm().updateSettings()`.
 */
export const useFormSettings = settingsReader(FormToken);

/**
 * One field's value, in the shape `setValue()` takes, or `null`, as `{ current }`: it changes
 * only when that field's value changes. Pass a function (`() => ref`) for a field that changes.
 * `null` without a document.
 */
export function useFormValue(ref: MaybeGetter<FormFieldRef>): CurrentValue<FormFieldValue | null> {
  // The plugin keeps one value object per field until the field changes, so a reference
  // comparison is enough.
  return useOptionalSelector(FormToken, (form) => form.getValue(valueOf(ref)), null);
}

/**
 * The colors the layer draws fields with: the form settings over the viewer's accent, each a
 * `var(--epdf-form-*)` first, so CSS wins.
 */
export function useFormColors(): CurrentValue<FormColors> {
  const accent = useViewerSettings((settings) => settings.accent);
  const focus = useFormSettings((settings) => settings.focus);
  const fields = useFormSettings((settings) => settings.fields);
  return currentOf(
    derivedValue(() =>
      formColorsOf({ focus: focus.current, fields: fields.current }, accent.current),
    ),
  );
}
