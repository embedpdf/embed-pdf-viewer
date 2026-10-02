/**
 * @embedpdf/vue/runtime: the generic binding.
 *
 * `<Viewer>` owns the kernel and binds its one change stream to Vue; the
 * composables resolve capabilities (document-scoped ones against the active
 * or `<DocumentScope>`-given document, with a stand-in while there is none) and
 * read state as refs; the page context is the seam every layer draws through.
 * Every plugin binding rides on this.
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/core';
// What a page with a viewer needs from the browser: handing bytes to the user as a download,
// and a font the engine draws with, for text you draw yourself.
export { mountWebFont, saveFile } from '@embedpdf/web';
// A theme written with setting names, as the style for the element around a viewer.
export { epdfTheme } from './theme';
export type { EpdfTheme } from './theme';

export { default as Viewer } from './runtime/Viewer.vue';
export { default as DocumentGate } from './runtime/DocumentGate.vue';
export { default as DocumentScope } from './runtime/DocumentScope.vue';

export {
  useActiveDocumentId,
  useDocumentId,
  useDocumentScope,
  useKernel,
  useKernelValue,
} from './runtime/kernel';
export {
  useCapability,
  useCapabilityEvent,
  useCapabilityRef,
  useOptionalCapability,
  useOptionalSelector,
  useSelector,
} from './runtime/capabilities';
export {
  useDocument,
  useDocuments,
  useDocumentsEvent,
  useDocumentsState,
  usePageList,
  useViewerSettings,
} from './runtime/documents';
export { makePageContext, providePage, usePage } from './runtime/page';
export type { PageContextValue } from './runtime/page';
export { fieldRefs } from './runtime/refs';
export type { FieldRefs } from './runtime/refs';
