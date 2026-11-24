/**
 * @embedpdf/svelte/form — filling and building forms.
 *
 * `<FormLayer>` puts a real HTML control over each field of its page, for people to fill in, or
 * a control of yours (`controls`); `useForm()` reads, fills and builds the form from code;
 * `useFormState()` follows the fields as a reactive object, `useFormValue()` one field's value as
 * `{ current }`, `useFormWidgetAnchor()` where UI attaches to one box of a field,
 * `useFormSettings()` the settings, and `useFormEvent()` the plugin's events.
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-form';

export type { FieldControlFrame } from '@embedpdf/web';

export { default as FormLayer } from './form/FormLayer.svelte';
export type { FieldControl, FieldControlProps, FormLayerProps } from './form/props';
export {
  useForm,
  useFormEvent,
  useFormSettings,
  useFormState,
  useFormValue,
  useFormWidgetAnchor,
} from './form/readers.svelte';
