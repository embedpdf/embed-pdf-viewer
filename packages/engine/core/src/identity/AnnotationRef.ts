import type { PageObjectNumber } from './PageObjectNumber';
import type { RevisionToken } from '../revision/RevisionToken';

/**
 * The discriminated union the engine accepts to address an annotation.
 *
 * The resolution order in `AnnotationIdentityResolver` is:
 *   1. `objectNumber` -> `EPDFPage_GetAnnotByObjectNumber(pagePtr, n)`
 *   2. `nm`           -> `EPDFPage_GetAnnotByName(pagePtr, nm)`
 *   3. `index`        -> validate `revision` against `RevisionStore`, then
 *                        `EPDFPage_GetAnnotRaw(docPtr, pageIndex, index)`
 *
 * The `index` form is the strict escape hatch for legacy / direct-object
 * annotations. It must carry a fresh `RevisionToken`, which the engine
 * checks against the per-page generation counter on every dereference.
 * Stale tokens fail with `EngineError(InvalidReference)` instead of silently
 * pointing at the wrong annotation.
 */
export type AnnotationRef =
  | {
      kind: 'objectNumber';
      pageObjectNumber: PageObjectNumber;
      annotObjectNumber: number;
    }
  | {
      kind: 'nm';
      pageObjectNumber: PageObjectNumber;
      nm: string;
    }
  | {
      kind: 'index';
      pageObjectNumber: PageObjectNumber;
      index: number;
      revision: RevisionToken;
    };
