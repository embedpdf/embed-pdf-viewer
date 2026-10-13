import type { KindResources } from './declaration';
import { mapKindFacts } from './kind-facts';
import type { AnnotationSubtype } from './subtype';

/**
 * Every field each annotation kind declares, in declaration order, without zod, for code that
 * checks the keys of a write but can't load the schemas (the engines, their workers, the
 * viewer). From `kind-facts.generated.ts`.
 */
export const ANNOTATION_FIELD_NAMES: Readonly<Record<AnnotationSubtype, readonly string[]>> =
  mapKindFacts((facts) => Object.keys(facts.owners));

/** The resources each kind takes (`create(data, resources)`), without zod. */
export const ANNOTATION_RESOURCE_ROLES: Readonly<Record<AnnotationSubtype, KindResources>> =
  mapKindFacts((facts) => facts.resources);
