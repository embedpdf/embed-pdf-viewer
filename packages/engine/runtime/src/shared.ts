/**
 * The public surface COMMON to both entries (`index.browser.ts` /
 * `index.node.ts`). One package name, one API, two physical graphs — the
 * entries add only `createPdfRuntime` + `resolveRuntimeTarget`, each from
 * their own environment's implementation.
 */
export type {
  Callback,
  CallbackFn,
  CallbackKind,
  CreatePdfRuntimeOptions,
  MemoryValueKind,
  PdfFileAccessHandle,
  PdfRuntimeFileAccess,
  PdfRuntimeCallbacks,
  PdfRuntimeMemory,
  PdfRuntimeModule,
  Ptr,
} from './core/pdf-runtime-module';
export { NULL_PTR } from './core/pdf-runtime-module';
export type { PdfFunctions } from './core/pdf-functions.generated';
export { packageNameForTarget, type RuntimeTarget } from './core/platform';
export {
  toLegacyWrappedModule,
  toWrappedPdfiumModule,
  type LegacyWrappedPdfiumModule,
} from './legacy/to-wrapped-pdfium-module';
