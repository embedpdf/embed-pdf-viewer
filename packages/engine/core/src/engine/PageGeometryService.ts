import type { PageGeometrySnapshot } from '../dto/PageGeometrySnapshot';
import { AbortablePromise } from '../promise/AbortablePromise';

export interface PageGeometryService {
  read(): AbortablePromise<PageGeometrySnapshot>;
}
