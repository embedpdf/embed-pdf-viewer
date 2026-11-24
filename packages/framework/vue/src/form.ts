/**
 * @embedpdf/vue/form: the Vue surface of `@embedpdf/plugin-form`.
 *
 * `<FormLayer>` puts a real HTML control over each field of its page, for
 * people to fill in, and draws the boxes you say with controls of yours
 * (`controls`); `useForm()` reads, fills and builds the form from code;
 * `useFormState()` and `useFormValue()` follow the fields and one field's
 * value as refs, `useFormSettings()` the settings, `useFormEvent()` the
 * plugin's events, and `useFormWidgetAnchor()` gives the anchor of one box,
 * for UI attached to it.
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-form';
export { default as FormLayer } from './form/FormLayer.vue';
export {
  useForm,
  useFormEvent,
  useFormSettings,
  useFormState,
  useFormValue,
  useFormWidgetAnchor,
} from './form/composables';
export type { FieldControl, FieldControlFrame, FieldControlProps } from './form/types';
