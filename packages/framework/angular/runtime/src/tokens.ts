/**
 * DI tokens shared by the runtime's primitives and directives — split out so
 * `inject.ts` (consumers) and `scope.ts` (providers) never import each other.
 */
import { InjectionToken, type Signal } from '@angular/core';

/** The document a subtree is bound to (provided by `[epdfDocumentScope]`).
 *  Absent => the subtree follows the ACTIVE document. */
export interface EpdfDocumentScopeRef {
  readonly id: Signal<string>;
}

export const EPDF_DOCUMENT_SCOPE = new InjectionToken<EpdfDocumentScopeRef>('EPDF_DOCUMENT_SCOPE');
