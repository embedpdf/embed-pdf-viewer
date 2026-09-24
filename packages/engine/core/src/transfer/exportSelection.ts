import type { AnnotationDTO } from '../annotation/kinds';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { annotationKey, positionKey } from '../identity/annotationKey';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { encodePageKey, type PageRef } from '../identity/PageRef';

/** Which annotations an export takes. Without `refs` or `pages`, every one in the document. */
export interface AnnotationExportSelection {
  readonly refs?: readonly AnnotationRef[];
  readonly pages?: readonly PageRef[];
  /**
   * `'threads'` (the default): the selection, what it points at, and every
   * reply below a selected annotation, so a comment travels with its
   * discussion. `'references'`: the selection and only what it points at.
   */
  readonly include?: 'references' | 'threads';
}

/**
 * The annotations an export takes, in document order: page order, then each
 * page's annotation order. Besides the selection:
 *
 * - a reply brings its parent, and the parent's, up to the root;
 * - an annotation brings its popup, and a popup brings its parent;
 * - with `include: 'threads'`, the default, every reply below a selected
 *   annotation.
 *
 * A reply is on its parent's page (ISO 32000-2 §12.5.6.2, `/IRT`) and a popup
 * on its parent's, so none of this reaches another page. `readPage` returns a
 * page's annotations in `/Annots` order and is called once for each page
 * the selection is on. `pages` is the document's pages in order. A selected
 * page or annotation the document doesn't have is refused with `NotFound`.
 */
export function closeExportSelection(
  selection: AnnotationExportSelection,
  pages: readonly PageRef[],
  readPage: (page: PageRef) => readonly AnnotationDTO[],
): AnnotationDTO[] {
  const inDocument = new Set(pages.map(encodePageKey));
  const read = new Map<string, readonly AnnotationDTO[]>();
  const byKey = new Map<string, AnnotationDTO>();
  // A ref may name a page the document doesn't have (a broken /IRT): it
  // finds nothing.
  const readOnce = (page: PageRef) => {
    const pageKey = encodePageKey(page);
    if (read.has(pageKey) || !inDocument.has(pageKey)) return;
    const annotations = readPage(page);
    read.set(pageKey, annotations);
    for (const annotation of annotations) {
      for (const key of keysOf(annotation)) byKey.set(key, annotation);
    }
  };
  const find = (ref: AnnotationRef): AnnotationDTO | undefined => {
    readOnce(ref.page);
    return byKey.get(annotationKey(ref));
  };

  for (const page of selection.pages ?? []) {
    if (!inDocument.has(encodePageKey(page))) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `export: the document has no page ${encodePageKey(page)}`,
      );
    }
  }
  const everything = !selection.refs && !selection.pages;
  const threads = (selection.include ?? 'threads') === 'threads';
  for (const page of everything ? pages : (selection.pages ?? [])) readOnce(page);

  const taken = new Set<string>();
  const pending: AnnotationDTO[] = [];
  const take = (annotation: AnnotationDTO | undefined) => {
    if (!annotation) return;
    const key = annotationKey(annotation.ref);
    if (taken.has(key)) return;
    taken.add(key);
    pending.push(annotation);
  };

  if (everything) {
    for (const annotations of read.values()) annotations.forEach(take);
  } else {
    for (const page of selection.pages ?? []) read.get(encodePageKey(page))?.forEach(take);
    for (const ref of selection.refs ?? []) {
      const annotation = find(ref);
      if (!annotation) {
        throw new EngineError(
          EngineErrorCode.NotFound,
          `export: the document has no annotation ${annotationKey(ref)}`,
        );
      }
      take(annotation);
    }
  }

  if (threads) {
    // A popup is its parent's window: selecting it selects the comment, and
    // so the comment's replies.
    for (const annotation of [...pending]) {
      if (annotation.subtype === 'popup' && annotation.parent) take(find(annotation.parent));
    }
    const replies = new Map<string, AnnotationDTO[]>();
    for (const annotations of read.values()) {
      for (const annotation of annotations) {
        const parent = annotation.reply ? find(annotation.reply.to) : undefined;
        if (!parent) continue;
        const key = annotationKey(parent.ref);
        replies.set(key, [...(replies.get(key) ?? []), annotation]);
      }
    }
    for (let i = 0; i < pending.length; i++) {
      replies.get(annotationKey(pending[i]!.ref))?.forEach(take);
    }
  }

  for (let i = 0; i < pending.length; i++) {
    const annotation = pending[i]!;
    if (annotation.reply) take(find(annotation.reply.to));
    if (annotation.popup) take(find(annotation.popup));
    if (annotation.subtype === 'popup' && annotation.parent) take(find(annotation.parent));
  }

  const ordered: AnnotationDTO[] = [];
  for (const page of pages) {
    for (const annotation of read.get(encodePageKey(page)) ?? []) {
      if (taken.has(annotationKey(annotation.ref))) ordered.push(annotation);
    }
  }
  return ordered;
}

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

// The keys a ref to this annotation can have: by object number or index,
// by name, and by position.
function keysOf(annotation: AnnotationDTO): string[] {
  const { ref } = annotation;
  const keys = [annotationKey(ref), positionKey(ref.page, annotation.index)];
  if (annotation.nm) keys.push(annotationKey({ kind: 'nm', page: ref.page, nm: annotation.nm }));
  return keys;
}

function isPageRef(value: object): value is PageRef {
  const keys = Object.keys(value);
  return (
    keys.length === 2 &&
    (value as { kind?: unknown }).kind === 'objectNumber' &&
    typeof (value as { pageObjectNumber?: unknown }).pageObjectNumber === 'number'
  );
}
