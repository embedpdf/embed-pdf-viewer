/**
 * @embedpdf/vue/form: the Vue surface of `@embedpdf/plugin-form`.
 *
 * `<FormLayer>` puts a real HTML control over each field of its page, for
 * people to fill in; `useForm()` reads, fills and builds the form from code;
 * `useFormState()` and `useFormValue()` follow the fields and one field's
 * value as refs, `useFormSettings()` the settings, and `useFormEvent()` the
 * plugin's events.
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
} from './form/composables';
