/**
 * @embedpdf/svelte/i18n — your viewer in the reader's language.
 *
 * The readers are the i18n plugin's API, state, settings and events; `useT()` gives a translate
 * function that follows the language.
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-i18n';

export { useI18n, useI18nEvent, useI18nSettings, useI18nState, useT } from './i18n/readers.svelte';
