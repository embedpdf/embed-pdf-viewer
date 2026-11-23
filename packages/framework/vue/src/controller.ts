/**
 * @embedpdf/vue/controller: a custom UI in a few lines.
 *
 * `<DocumentView>` shows the document in scope with every page layer a reader expects (pictures,
 * text selection, search hits, links, annotations, form fields) and copying wired. Put your own
 * buttons next to it, inside the same `<Viewer>`, and drive them with `useViewerController()`:
 * one reactive `state` and the common commands, from `@embedpdf/web/controller`.
 */
export * from '@embedpdf/web/controller';
export { default as DocumentView } from './controller/DocumentView.vue';
export { useViewerController } from './controller/composables';
export type { ViewerControllerRef } from './controller/composables';
