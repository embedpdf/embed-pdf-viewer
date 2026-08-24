import type { DocumentActionsSnapshot } from '../dto/PdfAction';
import type { AbortablePromise } from '../promise/AbortablePromise';

/** Lazy, catalog-owned PDF action read. This API extracts; it never executes. */
export interface DocumentActionsService {
  read(): AbortablePromise<DocumentActionsSnapshot>;
}
