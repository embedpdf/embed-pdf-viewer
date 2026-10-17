/**
 * The annotation composables other feature entries use too (the form layer
 * reads the selection and the settings), kept apart so they don't import the
 * whole annotation feature: the state and the settings, each from its
 * declaration.
 */
import { AnnotationToken, annotationState } from '@embedpdf/plugin-annotation/contract';
import { settingsComposable, stateComposable } from '../state';

/**
 * The annotation state as refs: `status` (`'loading'` until every annotation
 * is in, then `'ready'`), the `selected` annotations, the one `hovered` under
 * the pointer and the text box being typed in (`editing`). With a selector,
 * one ref that updates only when the value it picks changes. Empty without a
 * document.
 */
export const useAnnotationState = stateComposable(annotationState);

/**
 * The annotation settings (`snap`, `chrome`, `afterCreate`, `tools`) as refs,
 * or one ref for the value `select` picks. They belong to the plugin, so they
 * read without a document; change them with `useAnnotation().updateSettings()`.
 */
export const useAnnotationSettings = settingsComposable(AnnotationToken);
