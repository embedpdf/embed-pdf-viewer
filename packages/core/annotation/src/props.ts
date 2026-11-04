/**
 * The kind table's style-panel properties over a selection: which properties
 * a mixed selection shares, the kind it can become, and which kinds may carry
 * a link.
 */
import { canChangeKind, siblingKindsOf, type Annotation } from '@embedpdf/engine-core/runtime';

import { isEditableByHand } from './editable';
import type { AnnotationKind, AnnotationProperty } from './kinds';
import { FLAG_PROPERTIES, kindChoice } from './kinds/fields';
import { kindOf } from './record';
import type { Session, TextStyle } from './types';

/** Base text styling for kinds/tools with no explicit defaults. */
export const initialTextStyle: TextStyle = {
  fontFamily: 'helvetica',
  fontSize: 14,
  fontColor: '#000000',
  textAlign: 'left',
};

/** Does this kind's property table declare `link` (attachable link)? The link
 *  kind itself also declares it, but stores its own `/A` instead. */
export const kindTakesLink = (kind: AnnotationKind): boolean =>
  kind.properties.some((property) => property.key === 'link');

const withFlags = new WeakMap<AnnotationKind, readonly AnnotationProperty[]>();

/**
 * Everything a style panel edits for one kind: its own properties, then the
 * flags every kind has. The same array for a kind on every call.
 */
export function propertiesOf(kind: AnnotationKind): readonly AnnotationProperty[] {
  let properties = withFlags.get(kind);
  if (!properties) {
    properties = [...kind.properties, ...FLAG_PROPERTIES];
    withFlags.set(kind, properties);
  }
  return properties;
}

/**
 * The ordered properties every given kind has: the schema for a mixed
 * selection, in the first kind's display order. One kind: its own list
 * (`propertiesOf`), the same array every time.
 */
export function sharedProperties(kinds: readonly AnnotationKind[]): readonly AnnotationProperty[] {
  const unique = [...new Set(kinds)];
  if (!unique.length) return [];
  const first = propertiesOf(unique[0]!);
  if (unique.length === 1) return first;
  const rest = unique
    .slice(1)
    .map((kind) => new Set(propertiesOf(kind).map((property) => property.key)));
  return first.filter((property) => rest.every((keys) => keys.has(property.key)));
}

/**
 * The kind choice over `annotations` (`subtype`), or `null`: offered when
 * they are kinds of one sibling group and each can change kind now
 * (`canChangeKind`; a replacement's strikeout can't), and listing the kinds
 * of the group people may change by hand.
 */
function kindChoiceOf(
  model: Pick<Session, 'editable'>,
  annotations: readonly Annotation[],
): AnnotationProperty | null {
  const [first] = annotations;
  if (!first) return null;
  const group = [first.subtype, ...siblingKindsOf(first.subtype)];
  const changeable = annotations.every(
    (annotation) =>
      group.includes(annotation.subtype) &&
      siblingKindsOf(annotation.subtype).some((kind) => canChangeKind(annotation, kind)),
  );
  if (!changeable) return null;
  const kinds = group.filter((kind) =>
    isEditableByHand(model, { ...first, subtype: kind } as Annotation),
  );
  return kinds.length > 1 ? kindChoice(kinds) : null;
}

/**
 * Everything a style panel edits for the selected `annotations`: the
 * properties their kinds share (`sharedProperties`), led by the kind they can
 * become when they can (`kindChoiceOf`).
 */
export function selectionProperties(
  model: Pick<Session, 'editable'>,
  annotations: readonly Annotation[],
): readonly AnnotationProperty[] {
  const shared = sharedProperties(annotations.map((annotation) => kindOf(annotation)));
  const choice = kindChoiceOf(model, annotations);
  return choice ? [choice, ...shared] : shared;
}
