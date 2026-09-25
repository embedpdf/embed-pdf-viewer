import type {
  AnnotationCreateResult,
  AnnotationDeleteResult,
  AnnotationDTO,
  AnnotationList,
  AnnotationMoveResult,
  AnnotationRef,
  AnnotationUpdateResult,
  PageRef,
  PageState,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';

export type AnnotationMutationResult =
  | AnnotationCreateResult
  | AnnotationUpdateResult
  | AnnotationDeleteResult
  | AnnotationMoveResult;

/**
 * Server-side boundary between two revision epochs:
 *
 * - worker-local `sess_*` tokens are valid only inside one PDFium worker
 *   session;
 * - cloud `cloud:*` tokens are durable and safe to cache in client/CDN
 *   responses.
 *
 * Cloud routes must call this bridge whenever annotation payloads cross that
 * boundary. No worker-local revision token should leave the server, and no
 * durable cloud token should be sent into worker mutators.
 */
export class CloudRevisionBridge {
  /**
   * A worker's list in cloud revision terms: each listed page takes the
   * state `stateOf` gives it, and that page's annotations are decorated with
   * it. A page `stateOf` doesn't know keeps what the worker said.
   */
  decorateAnnotationList(
    list: AnnotationList,
    stateOf: (page: PageRef) => PageState | undefined,
  ): AnnotationList {
    const states = new Map<number, PageState>();
    for (const { page } of list.pages) {
      const state = stateOf(page);
      if (state) states.set(page.pageObjectNumber, state);
    }
    return {
      ...list,
      pages: list.pages.map((state) => states.get(state.page.pageObjectNumber) ?? state),
      annotations: list.annotations.map((annotation) => {
        const state = states.get(annotation.page.pageObjectNumber);
        return state ? this.decorateAnnotationRef(state, annotation) : annotation;
      }),
    };
  }

  decorateAnnotationMutationResult<T extends AnnotationMutationResult>(
    affectedPages: PageState[],
    result: T,
  ): T {
    const pageState = affectedPages[0];
    if (!pageState) {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        'annotation mutation result did not include an affected page',
      );
    }
    const base = {
      ...result,
      meta: {
        ...result.meta,
        affectedPages,
      },
    };

    // A create or an update carries the one annotation, a move all it moved.
    if ('annotation' in base) {
      return {
        ...base,
        annotation: this.decorateAnnotationRef(pageState, base.annotation),
      } as T;
    }
    if ('annotations' in base) {
      return {
        ...base,
        annotations: base.annotations.map((annotation) =>
          this.decorateAnnotationRef(pageState, annotation),
        ),
      } as T;
    }
    return base as T;
  }

  validateClientIndexRef(
    pageState: PageState,
    ref: AnnotationRef,
    opts?: {
      /**
       * Additional `docSessionId`s to accept as equivalent to
       * `pageState`'s own — in practice the doc's base revision scope. A
       * weak/index ref minted by a shared base read carries the base scope
       * (the response is one CDN object for every inheriting layer, so it
       * cannot carry per-layer scopes). Accepting it is sound because the
       * generation check still runs: layer pages snapshot the base rows and
       * generations only move forward on layer writes, so an equal
       * generation proves the two views are identical — the alias never
       * widens staleness acceptance.
       */
      aliasDocSessionIds?: readonly string[];
    },
  ): void {
    if (ref.kind !== 'index') {
      return;
    }
    const scopeMatches =
      ref.revision.docSessionId === pageState.revision.docSessionId ||
      (opts?.aliasDocSessionIds?.includes(ref.revision.docSessionId) ?? false);
    if (
      !scopeMatches ||
      ref.revision.page.pageObjectNumber !== ref.page.pageObjectNumber ||
      ref.revision.generation !== pageState.revision.generation
    ) {
      throw new EngineError(EngineErrorCode.InvalidReference, 'revision token is stale', {
        details: {
          provided: ref.revision,
          current: pageState.revision,
        },
      });
    }
  }

  rewriteIndexRefForWorker(workerPageState: PageState, ref: AnnotationRef): AnnotationRef {
    if (ref.kind !== 'index') {
      return ref;
    }
    return {
      ...ref,
      revision: workerPageState.revision,
    };
  }

  private decorateAnnotationRef(pageState: PageState, annotation: AnnotationDTO): AnnotationDTO {
    if (annotation.ref.kind !== 'index') {
      return annotation;
    }
    return {
      ...annotation,
      ref: {
        ...annotation.ref,
        revision: pageState.revision,
      },
    };
  }
}
