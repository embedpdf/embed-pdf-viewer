import type { DocumentActionsSnapshot } from '../dto/PdfAction';
import type { PageDestination } from '../dto/PdfDestination';
import type { AbortablePromise } from '../promise/AbortablePromise';

/** Lazy, catalog-owned PDF action read. This API extracts; it never executes. */
export interface DocumentActionsService {
  get(): AbortablePromise<DocumentActionsSnapshot>;
  /**
   * The destination the document names `name` (its `/Names /Dests` tree,
   * then the older `/Dests` dictionary), as an outline item or a link that
   * names it goes to. `null` when no destination has that name, or its page
   * is gone. Names compare as text.
   */
  resolveNamedDestination(name: string): AbortablePromise<PageDestination | null>;
}
