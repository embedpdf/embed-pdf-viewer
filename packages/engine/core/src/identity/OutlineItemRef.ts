/**
 * How callers address an item of the document's outline — the outline-plane
 * sibling of `PageRef`, `AnnotationRef` and `FormFieldRef`.
 *
 * `objectNumber` is the indirect object number of the outline item
 * dictionary. ISO 32000-2 §12.3.3 requires every item to be an indirect
 * object (its siblings and parent refer to it), the layer runtime never
 * renumbers, and a deleted item's number is never given to anything else —
 * so it is the item's name for the life of the document. A create can name
 * it before the item exists (`doc.objectNumbers`). Like `PageRef`, this is
 * the only kind.
 */
export type OutlineItemRef = { kind: 'objectNumber'; objectNumber: number };

/** Build the address for an outline item from its object number. */
export function toOutlineItemRef(objectNumber: number): OutlineItemRef {
  return { kind: 'objectNumber', objectNumber };
}

/** Structural equality for two outline item addresses. */
export function outlineItemRefsEqual(a: OutlineItemRef, b: OutlineItemRef): boolean {
  return a.kind === b.kind && a.objectNumber === b.objectNumber;
}
