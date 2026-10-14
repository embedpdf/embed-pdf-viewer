/**
 * The annotation hooks other feature entries use too (the form plugin reads
 * the selection), kept apart so they don't import the whole annotation
 * feature: the state and the settings, each from its declaration.
 */
import { AnnotationToken, annotationState } from '@embedpdf/plugin-annotation/contract';

import { settingsHook, stateHook } from './state';

/**
 * The annotation state: `status` (`'loading'` until every annotation is in,
 * then `'ready'`), the `selected` annotations, the one `hovered` under the
 * pointer and the text box being typed in (`editing`). Re-renders only when a
 * field changes, or the value `select` picks. Empty without a document.
 */
export const useAnnotationState = stateHook(annotationState);

/**
 * The annotation settings (`snap`, `chrome`, `afterCreate`, `tools`), or the
 * value `select` picks. They belong to the plugin, so they read without a
 * document; change them with `useAnnotation().updateSettings()`.
 */
export const useAnnotationSettings = settingsHook(AnnotationToken);
