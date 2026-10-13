/**
 * The checks the engine runs at its door, where it runs: in its worker and on the server. A
 * write's values against its kind's schema, and the import planners that check a bundle's rows
 * before planning them. Built with zod, so a page never imports this entry: a viewer predicts a
 * write with the same preparation and derivation without schema validation
 * (`@embedpdf/engine-core/runtime`), and the engine refuses what it doesn't take when the write
 * reaches it.
 */

export {
  assertAnnotationDraft,
  assertAnnotationPatch,
  pdfResolveAnnotationDraft,
  pdfResolveAnnotationPatch,
} from './annotation/checkWrite';
export { planAnnotationImport } from './transfer/planAnnotationImport';
export type { AnnotationImportPlan, PlannedAnnotation } from './transfer/planAnnotationImport';
export { planFormImport, planFormValuesImport } from './transfer/planFormImport';
export type {
  FormImportPlan,
  FormValuesImportTarget,
  PlannedFormField,
  PlannedValueWrite,
} from './transfer/planFormImport';
