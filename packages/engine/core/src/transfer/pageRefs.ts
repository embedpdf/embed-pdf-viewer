import type { PageRef } from '../identity/PageRef';

/**
 * Every page `value` names: each `PageRef` anywhere in it, in the order met.
 * A page ref is found by where it sits, under a `page` key (an annotation's,
 * a ref's, a destination's): a field ref has the same shape.
 */
export function pageRefsIn(value: unknown): PageRef[] {
  const found: PageRef[] = [];
  const visit = (node: unknown, key?: string) => {
    if (typeof node !== 'object' || node === null) return;
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child));
      return;
    }
    if (key === 'page' && isPageRef(node)) {
      found.push(node);
      return;
    }
    Object.entries(node).forEach(([name, child]) => visit(child, name));
  };
  visit(value);
  return found;
}

/** A copy of `value` with each `PageRef` anywhere in it replaced by `map(page)`. */
export function mapPageRefs<Value>(value: Value, map: (page: PageRef) => PageRef): Value {
  const visit = (node: unknown, key?: string): unknown => {
    if (typeof node !== 'object' || node === null) return node;
    if (Array.isArray(node)) return node.map((child) => visit(child));
    if (key === 'page' && isPageRef(node)) return map(node);
    return Object.fromEntries(
      Object.entries(node).map(([name, child]) => [name, visit(child, name)]),
    );
  };
  return visit(value) as Value;
}

function isPageRef(value: object): value is PageRef {
  const keys = Object.keys(value);
  return (
    keys.length === 2 &&
    (value as { kind?: unknown }).kind === 'objectNumber' &&
    typeof (value as { objectNumber?: unknown }).objectNumber === 'number'
  );
}
