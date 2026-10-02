/**
 * @embedpdf/svelte/runtime — the generic binding.
 *
 * `<Viewer>` owns the kernel; the readers turn its one change stream into Svelte reactivity and
 * resolve capabilities against the document in scope (the active one, or a `<DocumentScope>`'s),
 * with a stand-in while there is none; the page context is the seam every layer draws through.
 * Every plugin binding is built from these. How to add one: this package's README.
 */

// Registration travels with the UI: the kernel's types, tokens and helpers come from here too.
export * from '@embedpdf/core';
// What a page with a viewer needs from the browser: handing bytes to the user as a download,
// and a font the engine draws with, for text you draw yourself.
export { mountWebFont, saveFile } from '@embedpdf/web';

export { default as Viewer } from './runtime/Viewer.svelte';
export { default as DocumentGate } from './runtime/DocumentGate.svelte';
export { default as DocumentScope } from './runtime/DocumentScope.svelte';
export type { DocumentGateProps, DocumentScopeProps, ViewerProps } from './runtime/props';

export { useKernel } from './runtime/binding.svelte';
export {
  shallowArray,
  useActiveDocumentId,
  useCapability,
  useCapabilityEvent,
  useDocumentId,
  useDocumentScope,
  useKernelValue,
  useOptionalCapability,
  useOptionalSelector,
  useSelector,
} from './runtime/readers.svelte';
export {
  useDocument,
  useDocuments,
  useDocumentsEvent,
  useDocumentsState,
  usePageList,
  useViewerSettings,
} from './runtime/documents.svelte';
export { settingsReader, stateReader } from './runtime/state.svelte';
export type { SettingsReader, StateReader } from './runtime/state.svelte';
export type { CurrentValue, MaybeGetter } from './runtime/values.svelte';
export { makePageContext, setPageContext, usePage } from './runtime/page';
export type { PageContextValue } from './runtime/page';
// A theme written with setting names, as the style for the element around a viewer.
export { epdfTheme } from './runtime/theme';
export type { EpdfTheme } from './runtime/theme';
