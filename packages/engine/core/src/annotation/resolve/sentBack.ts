import type { Coordinates } from '../../pageSpace/coordinates';
import { semanticEqual } from '../appearance';
import { sameColor } from '../color';
import { kindFactsOf } from '../kind-facts';
import type { Annotation, AnnotationPatch } from '../kinds';

/** `patch` without the fields `drop` names. `subtype` always stays. */
function without<C extends Coordinates>(
  patch: AnnotationPatch<C>,
  drop: (name: string, value: unknown) => boolean,
): AnnotationPatch<C> {
  const kept = Object.entries(patch).filter(
    ([name, value]) => name === 'subtype' || !drop(name, value),
  );
  return Object.fromEntries(kept) as AnnotationPatch<C>;
}

/**
 * The patch without the colors it sends back as they read. A gray or CMYK
 * color in the file reads as its sRGB equivalent; writing that back would
 * store it as sRGB, so leaving it out keeps the file as it is.
 */
export function withoutUnchangedColors<C extends Coordinates>(
  current: Annotation<C>,
  patch: AnnotationPatch<C>,
): AnnotationPatch<C> {
  const colors = kindFactsOf(current.subtype)?.colors ?? [];
  const read = current as unknown as Record<string, unknown>;
  return without(patch, (name, value) => {
    const was = read[name];
    return (
      colors.includes(name) &&
      typeof value === 'string' &&
      typeof was === 'string' &&
      sameColor(value, was)
    );
  });
}

/**
 * The patch without the fields it sends back as they read: a field equal to
 * the read is not a change, so the annotation keeps it and nothing follows
 * from it. Equal as `semanticEqual` judges it: `null` and a field left out
 * are the same, and numbers within the precision a round trip through page
 * space keeps, so a read sent back from page space is the read. A changed
 * value stays, whatever it is; the engine's check refuses one its kind can't
 * write.
 */
export function withoutUnchangedFields<C extends Coordinates>(
  current: Annotation<C>,
  patch: AnnotationPatch<C>,
): AnnotationPatch<C> {
  const read = current as unknown as Record<string, unknown>;
  return without(patch, (name, value) => value !== undefined && semanticEqual(value, read[name]));
}
