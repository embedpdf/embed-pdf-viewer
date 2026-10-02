/**
 * The annotation readers other feature entries use too (the form plugin reads the selection),
 * kept apart so they don't import the whole annotation entry: the state and the settings, each
 * from its declaration.
 */
import { AnnotationToken, annotationState } from '@embedpdf/plugin-annotation/contract';
import { settingsReader, stateReader } from '../runtime/state.svelte';

/**
 * The annotation state: `status` (`'loading'` until every annotation is in, then `'ready'`), the
 * `selected` annotations, the one `hovered` under the pointer and the text box being typed in
 * (`editing`). A reactive object (`state.selected`), each field updating on its own; with a
 * selector, the value it picks as `{ current }`. Empty without a document.
 */
export const useAnnotationState = stateReader(annotationState);

/**
 * The annotation settings (`snap`, `chrome`, `afterCreate`, `tools`), or the value `select` picks
 * as `{ current }`. They belong to the plugin, so they read without a document; change them with
 * `useAnnotation().updateSettings()`.
 */
export const useAnnotationSettings = settingsReader(AnnotationToken);
