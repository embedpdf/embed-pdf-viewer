import type { AnyField } from '../annotation/declaration';
import { declarationOf } from '../annotation/kinds/declarations';

/**
 * Compares annotation reads with their kind declarations. Each difference is
 * one line, `<field>: <problem> (<kinds>)`:
 *
 * - `missing`: the declaration has the field, the read doesn't;
 * - `invalid`: the read has a value the declaration doesn't accept;
 * - `undeclared`: the read has a field the declaration doesn't know.
 *
 * `<kinds>` is `every kind` when the difference holds for every kind read,
 * otherwise the affected subtypes. Lines are sorted, so two engines reading
 * the same documents produce the same list.
 */
export function annotationReadDriftOf(reads: readonly unknown[]): string[] {
  const kindsRead = new Set<string>();
  const kindsByProblem = new Map<string, Set<string>>();
  const note = (problem: string, subtype: string) => {
    const kinds = kindsByProblem.get(problem) ?? new Set<string>();
    kinds.add(subtype);
    kindsByProblem.set(problem, kinds);
  };

  for (const read of reads) {
    const record = read as Record<string, unknown>;
    const subtype = String(record.subtype);
    kindsRead.add(subtype);
    if (subtype === 'unsupported' && record.rawSubtypeName === 'Popup') {
      note('subtype: popup reads as unsupported', subtype);
    }
    const declaration = declarationOf(subtype);
    if (!declaration) {
      note('subtype: no declaration', subtype);
      continue;
    }
    const fields: Readonly<Record<string, AnyField>> = declaration.fields;
    for (const [name, spec] of Object.entries(fields)) {
      if (!(name in record) || record[name] === undefined) {
        note(`${name}: missing`, subtype);
        continue;
      }
      const schema = spec.traits.readNullable ? spec.read.nullable() : spec.read;
      if (!schema.safeParse(record[name]).success) note(`${name}: invalid`, subtype);
    }
    for (const name of Object.keys(record)) {
      if (name !== 'subtype' && !(name in fields)) note(`${name}: undeclared`, subtype);
    }
  }

  return [...kindsByProblem]
    .map(([problem, kinds]) =>
      kinds.size === kindsRead.size
        ? `${problem} (every kind)`
        : `${problem} (${[...kinds].sort().join(', ')})`,
    )
    .sort();
}
