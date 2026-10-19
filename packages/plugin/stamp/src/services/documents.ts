/**
 * The document a placing verb acts on: the one its options name, else the
 * active one (a document's scope fills `documentId` in through the plugin's
 * `inScope`), and the page arguments resolved in it.
 */
import { DocumentsToken, type PageInfo, type PageRef } from '@embedpdf/core';

import type { StampDocumentOptions } from '../contract';
import type { StampContext } from './context';
import { stampError } from './errors';

export function createTargets(ctx: StampContext) {
  const documents = () => ctx.get(DocumentsToken);

  /** The document's id, or null with no document open. */
  const documentIdOf = (documentId: string | undefined): string | null =>
    documentId ?? documents().getActiveId();

  /** The document a verb acts on. Rejects `not-ready` with no document open. */
  const targetOf = (options: StampDocumentOptions | undefined): string => {
    const documentId = documentIdOf(options?.documentId);
    if (!documentId) throw stampError('not-ready', 'no document is open');
    return documentId;
  };

  /** A page argument of the document, as a ref or an index. Rejects `not-found`. */
  const pageOf = (documentId: string, page: PageRef | number): PageInfo => {
    const found = documents().getPage(page, documentId);
    if (!found) {
      throw stampError(
        'not-found',
        `no page ${typeof page === 'number' ? page : page.objectNumber} in document '${documentId}'`,
      );
    }
    return found;
  };

  return { documentIdOf, targetOf, pageOf };
}
export type StampTargets = ReturnType<typeof createTargets>;
