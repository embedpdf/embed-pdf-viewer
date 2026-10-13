import type { FieldOwner, KindResources } from './declaration';
import type { MeasuredFieldSpace } from './field-spaces';
import { ANNOTATION_KIND_FACTS } from './kind-facts.generated';
import type { AnnotationSubtype } from './subtype';

/**
 * What one annotation kind declares about its fields, without zod, for the code that predicts
 * a write on the page. Written from the kind's declaration (`kinds/<kind>/declaration.ts`), the
 * one source of each kind's fields, into `kind-facts.generated.ts`.
 */
export interface KindFacts {
  /** Every field the kind declares, in declaration order, and who writes it. */
  readonly owners: Readonly<Record<string, FieldOwner>>;
  /** The fields an update may send back as a read returned them (`readBack()`). */
  readonly readBack: readonly string[];
  /** The fields that hold a color (`'#rrggbb'`). */
  readonly colors: readonly string[];
  /** The fields that hold something measured on the page, and what. */
  readonly spaces: Readonly<Record<string, MeasuredFieldSpace>>;
  /** The resources the kind takes beside its data, by role. */
  readonly resources: KindResources;
}

/** A table with an entry for every kind, worked out from the kind's facts. */
export function mapKindFacts<Value>(
  of: (facts: KindFacts) => Value,
): Readonly<Record<AnnotationSubtype, Value>> {
  const table = {} as Record<AnnotationSubtype, Value>;
  for (const subtype of Object.keys(ANNOTATION_KIND_FACTS) as AnnotationSubtype[]) {
    table[subtype] = of(ANNOTATION_KIND_FACTS[subtype]);
  }
  return table;
}

/** The facts of the kind `subtype` names, or `null` when no kind has that subtype. */
export function kindFactsOf(subtype: string): KindFacts | null {
  return Object.prototype.hasOwnProperty.call(ANNOTATION_KIND_FACTS, subtype)
    ? ANNOTATION_KIND_FACTS[subtype as AnnotationSubtype]
    : null;
}
