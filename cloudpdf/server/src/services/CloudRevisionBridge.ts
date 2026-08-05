import type {
  AnnotationCreateResult,
  AnnotationDeleteResult,
  AnnotationDTO,
  AnnotationListPageSnapshot,
  AnnotationMoveResult,
  AnnotationRef,
  AnnotationUpdateResult,
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
  decorateAnnotationSnapshot(
    pageState: PageState,
    snapshot: AnnotationListPageSnapshot,
  ): AnnotationListPageSnapshot {
    return {
      ...snapshot,
      pageState,
      annotations: snapshot.annotations.map((annotation) =>
        this.decorateAnnotationRef(pageState, annotation),
      ),
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

    if ('created' in base) {
      return {
        ...base,
        created: this.decorateAnnotationRef(pageState, base.created),
      } as T;
    }
    if ('updated' in base) {
      return {
        ...base,
        updated: this.decorateAnnotationRef(pageState, base.updated),
      } as T;
    }
    if ('moved' in base) {
      return {
        ...base,
        moved: base.moved.map((annotation) => this.decorateAnnotationRef(pageState, annotation)),
      } as T;
    }
    return base as T;
  }

  validateClientIndexRef(
    pageState: PageState,
    ref: AnnotationRef,
    opts?: {
      /**
       * WS2b: additional `docSessionId`s to accept as equivalent to
       * `pageState`'s own — in practice the doc's BASE revision scope. A
       * weak/index ref minted by a SHARED base read carries the base scope
       * (the response is one CDN object for every inheriting layer, so it
       * cannot carry per-layer scopes). Accepting it is sound because the
       * GENERATION check still runs: layer pages snapshot the base rows and
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
      ref.revision.pageObjectNumber !== ref.pageObjectNumber ||
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
