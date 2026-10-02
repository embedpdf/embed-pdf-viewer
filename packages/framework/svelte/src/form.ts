/**
 * @embedpdf/svelte/form — filling and building forms.
 *
 * `<FormLayer>` puts a real HTML control over each field of its page, for people to fill in;
 * `useForm()` reads, fills and builds the form from code; `useFormState()` follows the fields as
 * a reactive object, `useFormValue()` one field's value as `{ current }`, `useFormSettings()` the
 * settings, and `useFormEvent()` the plugin's events.
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-form';

export { default as FormLayer } from './form/FormLayer.svelte';
export {
  useForm,
  useFormEvent,
  useFormSettings,
  useFormState,
  useFormValue,
} from './form/readers.svelte';
