/**
 * The form composables for app code: `useForm()` (the API), `useFormEvent()`,
 * the state and the settings as refs, and `useFormValue()` for one field. And
 * what the controls of `<FormLayer>` share: the colors the viewer draws fields
 * with, and a widget's click running its action.
 */
import { computed, toValue } from 'vue';
import type { MaybeRefOrGetter, Ref } from 'vue';
import type { EventHook } from '@embedpdf/core';
import type { AnnotationRef } from '@embedpdf/plugin-annotation/contract';
import { FormToken, formState } from '@embedpdf/plugin-form';
import type { FormCapability, FormFieldRef, FormFieldValue } from '@embedpdf/plugin-form';
// Activating a widget from the layer is a host call.
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import { formColorsOf } from '@embedpdf/web';
import type { FormColors } from '@embedpdf/web';
import { useCapability, useCapabilityEvent, useOptionalSelector } from '../runtime/capabilities';
import { useViewerSettings } from '../runtime/documents';
import { settingsComposable, stateComposable } from '../state';

/**
 * The form API for the document in scope: reading, filling, form data and
 * building. The object never changes, so it's safe to keep in a closure; keep
 * it whole (`form.setValue(…)`), since a member taken out of it once stays the
 * one of that moment.
 */
export function useForm(): FormCapability {
  return useCapability(FormToken);
}

/** Subscribe to one form event while the component lives: `useFormEvent((form) => form.onValueChanged, handler)`. */
export function useFormEvent<Event>(
  select: (form: FormCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(FormToken, select, handler);
}

/**
 * The form's state as refs: every field (`fields`), whether it's read
 * (`status`), what kind of form the document has (`formKind`), and the field
 * of the selected widget in design mode (`selectedField`), declared once in
 * `formState`. With a selector, one ref that updates only when the value it
 * picks changes. Empty without a document.
 */
export const useFormState = stateComposable(formState);

/**
 * The form settings (`validation`, `focus`, `fields`) as refs, or one ref for
 * the value `select` picks. They belong to the plugin, so they read without a
 * document; change them with `useForm().updateSettings()`.
 */
export const useFormSettings = settingsComposable(FormToken);

/**
 * One field's value, in the shape `setValue()` takes, or `null`: a ref that
 * updates only when that field's value changes (the plugin keeps one value
 * object per field while it stays the same). `field` may be a ref or a
 * getter, and the ref follows it. `null` without a document.
 */
export function useFormValue(
  field: MaybeRefOrGetter<FormFieldRef>,
): Readonly<Ref<FormFieldValue | null>> {
  return useOptionalSelector(FormToken, (form) => form.getValue(toValue(field)), null);
}

// ── what the controls of <FormLayer> share ───────────────────────────────────

/**
 * The colors the viewer draws fields with: the form settings over the
 * viewer's accent, each behind its `--epdf-form-*` CSS variable.
 */
export function useFormColors(): Readonly<Ref<FormColors>> {
  const accent = useViewerSettings((settings) => settings.accent);
  const focus = useFormSettings((settings) => settings.focus);
  const fields = useFormSettings((settings) => settings.fields);
  return computed(() => formColorsOf({ focus: focus.value, fields: fields.value }, accent.value));
}

/**
 * A click on a widget runs its `/A` action. ISO 32000 puts the activate
 * action on the widget, whatever its field, and many forms ship "buttons" as
 * read-only text fields with an `/A` that Acrobat runs; a widget without one
 * is inert. `widget` is read at the click, so it is the item's current one.
 */
export function useWidgetActivation(widget: () => AnnotationRef | null): () => void {
  const form = useCapability(FormHostToken);
  return () => {
    const target = widget();
    if (target) void form.activateWidget(target);
  };
}
