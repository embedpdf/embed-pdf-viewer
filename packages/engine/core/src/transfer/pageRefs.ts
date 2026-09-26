import type { PageRef } from '../identity/PageRef';

/** Every page `value` names: each `PageRef` anywhere in it, in the order met. */
export function pageRefsIn(value: unknown): PageRef[] {
  const found: PageRef[] = [];
  const visit = (node: unknown) => {
    if (typeof node !== 'object' || node === null) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (isPageRef(node)) {
      found.push(node);
      return;
    }
    Object.values(node).forEach(visit);
  };
  visit(value);
  return found;
}

/** A copy of `value` with each `PageRef` anywhere in it replaced by `map(page)`. */
export function mapPageRefs<Value>(value: Value, map: (page: PageRef) => PageRef): Value {
  const visit = (node: unknown): unknown => {
    if (typeof node !== 'object' || node === null) return node;
    if (Array.isArray(node)) return node.map(visit);
    if (isPageRef(node)) return map(node);
    return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, visit(child)]));
  };
  return visit(value) as Value;
}

function isPageRef(value: object): value is PageRef {
  const keys = Object.keys(value);
  return (
    keys.length === 2 &&
    (value as { kind?: unknown }).kind === 'objectNumber' &&
    typeof (value as { pageObjectNumber?: unknown }).pageObjectNumber === 'number'
  );
}
