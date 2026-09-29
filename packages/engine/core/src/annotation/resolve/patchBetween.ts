import type { Coordinates } from '../../pageSpace/coordinates';
import type { KindFields } from '../declaration';
import { declarationOf, type AnnotationDTO, type AnnotationPatch } from '../kinds';
import { applyResolvedPatch } from './applyAnnotationPatch';

/** Exact deep equality: the same value, or arrays and objects whose members are. */
function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
    return false;
  }
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const names = Object.keys(leftRecord).filter((name) => leftRecord[name] !== undefined);
  const others = Object.keys(rightRecord).filter((name) => rightRecord[name] !== undefined);
  return (
    names.length === others.length &&
    names.every((name) => sameValue(leftRecord[name], rightRecord[name]))
  );
}

/**
 * What `after` changed from `before`, as `update` takes it: each data field
 * whose value differs, whole. Fields the engine works out, stamps or keeps as
 * found (a drawn kind's `rect`, the dates and authors, the refs it keeps) are
 * left out. Values are compared exactly, so a value rebuilt with the same
 * content is no change. Works in either space: it only compares values by
 * field name.
 */
export function annotationPatchBetween<C extends Coordinates>(
  before: AnnotationDTO<C>,
  after: AnnotationDTO<C>,
): AnnotationPatch<C> {
  const patch: Record<string, unknown> = {};
  if (before === after) return patch as AnnotationPatch<C>;
  const fields: KindFields = declarationOf(after.subtype)?.fields ?? {};
  const was = before as unknown as Record<string, unknown>;
  const now = after as unknown as Record<string, unknown>;
  for (const [name, spec] of Object.entries(fields)) {
    if (spec.traits.owner !== 'data' || sameValue(was[name], now[name])) continue;
    // A field `after` doesn't have any more is removed.
    patch[name] = now[name] === undefined ? null : now[name];
  }
  return patch as AnnotationPatch<C>;
}

/**
 * `current` with `patch`'s data fields set, each as a read spells it: the
 * patch as given. No field follows from another here; `applyAnnotationPatch`
 * adds what the engine's rules make follow. Works in either space.
 */
export function mergeAnnotationPatch<A extends AnnotationDTO<Coordinates>>(
  current: A,
  patch: AnnotationPatch<Coordinates>,
): A {
  return applyResolvedPatch(current, patch);
}
