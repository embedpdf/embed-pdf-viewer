import type {
  AnnotationRef,
  MutationMeta,
  PageObjectNumber,
  RedactionApplyResult,
  RedactionApplyScope,
} from '@embedpdf/engine-core/runtime';
import {
  EngineError,
  EngineErrorCode,
  serializeError,
  subtypeFromCode,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { I32_BYTES, readI32 } from '../../runtime/memory/structs';
import { withScratch } from '../../runtime/memory/scratch';
import { throwIfAborted } from '../../shared/abort';
import { AnnotationReader } from '../annotations';
import { resolveAnnotPtr } from '../annotations/internal/identity/resolveAnnotationPointer';

/**
 * The destructive half of redaction (see `DocumentRedactionService` for the
 * model and the layer trust boundary). Content and annotation liveness
 * change together, exactly like {@link PagesFlattener} — this class mirrors
 * its validate-then-apply boundary and ordered-batch semantics.
 *
 * Scope semantics:
 *   - `pages`: every REDACT annotation on each listed page is applied; a
 *     page with none is `unchanged`.
 *   - `annotations`: exactly the referenced REDACT annotations are applied.
 *     Every ref is resolved and subtype-checked BEFORE the first native
 *     write; a non-REDACT ref rejects the whole call with `InvalidArg`.
 *
 * The per-page `removedAnnotationCount` is the native collateral count:
 * annotations other than REDACT ones removed alongside the apply (popup
 * cascades and detached widgets included).
 */
export class RedactionApplier {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  apply(scope: RedactionApplyScope, signal: AbortSignal): RedactionApplyResult {
    throwIfAborted(signal);

    const plan = this.buildPlan(scope);
    for (const pageObjectNumber of plan.keys()) {
      this.session.recordByObjectNumber(pageObjectNumber);
    }
    this.preflight(plan, signal);

    const { fn } = this.runtime;
    const results: RedactionApplyResult['results'] = [];
    const affected = new Set<PageObjectNumber>();
    let totalRemoved = 0;
    let stop = false;

    for (const [pageObjectNumber, refs] of plan) {
      if (stop || (signal.aborted && affected.size > 0)) {
        stop = true;
        results.push({ pageObjectNumber, status: 'skipped', removedAnnotationCount: 0 });
        continue;
      }
      if (signal.aborted) throwIfAborted(signal);

      const pool = this.session.pagePool();
      const pagePtr = pool.acquire(pageObjectNumber);
      try {
        const outcome =
          refs === null ? this.applyAllOnPage(pagePtr) : this.applyRefsOnPage(pagePtr, refs);
        if (outcome.status === 'applied') {
          fn.FPDFPage_GenerateContent(pagePtr);
          affected.add(pageObjectNumber);
          totalRemoved += outcome.removed;
        }
        results.push({
          pageObjectNumber,
          status: outcome.status,
          removedAnnotationCount: outcome.removed,
        });
      } catch (error) {
        affected.add(pageObjectNumber);
        results.push({
          pageObjectNumber,
          status: 'failed',
          removedAnnotationCount: 0,
          error: serializeError(error),
        });
        stop = true;
      } finally {
        pool.release(pageObjectNumber);
      }
    }

    if (affected.size === 0) {
      return { scope, results, removedAnnotationCount: totalRemoved, meta: null };
    }

    this.session.noteMutation();
    for (const pageObjectNumber of affected) {
      this.session.bumpRevision(pageObjectNumber);
      try {
        // Recompute the weak-annotation flag from the annotations that remain.
        new AnnotationReader(this.runtime, this.session).list(pageObjectNumber, signal);
      } catch {
        // The page state remains conservatively unknown. Never lose the layer
        // artifact because a post-apply diagnostic read failed.
      }
    }
    const meta: MutationMeta = {
      affectedPages: [...affected].map((pageObjectNumber) =>
        this.session.pageState(pageObjectNumber),
      ),
      cacheDelta: null,
    };
    return { scope, results, removedAnnotationCount: totalRemoved, meta };
  }

  /**
   * Normalize the scope into an ordered per-page plan. `null` refs means
   * "every REDACT annotation on the page" (the `pages` scope).
   */
  private buildPlan(scope: RedactionApplyScope): Map<PageObjectNumber, AnnotationRef[] | null> {
    const plan = new Map<PageObjectNumber, AnnotationRef[] | null>();
    if (scope.kind === 'pages') {
      if (scope.pageObjectNumbers.length === 0) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          'redaction.apply requires at least one page',
        );
      }
      for (const pageObjectNumber of scope.pageObjectNumbers) {
        if (plan.has(pageObjectNumber)) {
          throw new EngineError(
            EngineErrorCode.InvalidArg,
            `redaction.apply was given duplicate page object number ${pageObjectNumber}`,
          );
        }
        plan.set(pageObjectNumber, null);
      }
      return plan;
    }

    if (scope.refs.length === 0) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        'redaction.apply requires at least one annotation ref',
      );
    }
    for (const ref of scope.refs) {
      const existing = plan.get(ref.pageObjectNumber);
      if (existing === null) {
        throw new EngineError(EngineErrorCode.InvalidArg, 'mixed redaction scopes on one page');
      }
      if (existing) existing.push(ref);
      else plan.set(ref.pageObjectNumber, [ref]);
    }
    // Applying removes annotations, which shifts positional indices — a
    // batch of multiple refs on one page can only address the survivors
    // stably through durable ref kinds.
    for (const [pageObjectNumber, refs] of plan) {
      if (refs !== null && refs.length > 1 && refs.some((r) => r.kind === 'index')) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `multiple redactions on page ${pageObjectNumber} cannot be addressed by positional 'index' refs — use objectNumber/nm refs, or one apply call per index ref`,
        );
      }
    }
    return plan;
  }

  /**
   * Validate every ref BEFORE the first native write: it must resolve and
   * it must be a REDACT annotation. After this returns, the apply loop's
   * writes begin and per-page failures are recorded, not thrown.
   */
  private preflight(
    plan: Map<PageObjectNumber, AnnotationRef[] | null>,
    signal: AbortSignal,
  ): void {
    const { fn } = this.runtime;
    for (const [pageObjectNumber, refs] of plan) {
      if (refs === null) continue;
      throwIfAborted(signal);
      const pool = this.session.pagePool();
      const pagePtr = pool.acquire(pageObjectNumber);
      try {
        for (const ref of refs) {
          const annotPtr = resolveAnnotPtr(this.runtime, this.session, pagePtr, ref);
          try {
            const subtype = subtypeFromCode(fn.FPDFAnnot_GetSubtype(annotPtr));
            if (subtype !== 'redact') {
              throw new EngineError(
                EngineErrorCode.InvalidArg,
                `redaction.apply ref on page ${pageObjectNumber} resolves to a '${subtype}' annotation, not a redact annotation`,
              );
            }
          } finally {
            fn.FPDFPage_CloseAnnot(annotPtr);
          }
        }
      } finally {
        pool.release(pageObjectNumber);
      }
    }
  }

  private applyAllOnPage(pagePtr: Ptr): { status: 'applied' | 'unchanged'; removed: number } {
    const { fn, mem } = this.runtime;
    return withScratch(mem, I32_BYTES, (countPtr) => {
      // FALSE here means "no REDACT annotations on the page" — nothing was
      // written, so the page is unchanged, not failed.
      const ok = fn.EPDFPage_ApplyRedactions(pagePtr, countPtr);
      if (!ok) return { status: 'unchanged' as const, removed: 0 };
      return { status: 'applied' as const, removed: readI32(mem, countPtr) >>> 0 };
    });
  }

  private applyRefsOnPage(
    pagePtr: Ptr,
    refs: AnnotationRef[],
  ): { status: 'applied'; removed: number } {
    const { fn, mem } = this.runtime;
    let removed = 0;
    for (const ref of refs) {
      // Re-resolve at apply time: an earlier apply on this page may have
      // removed collateral annotations, and durable refs stay valid across
      // that (preflight rejected fragile batched index refs).
      const annotPtr = resolveAnnotPtr(this.runtime, this.session, pagePtr, ref);
      try {
        const ok = withScratch(mem, I32_BYTES, (countPtr) => {
          const applied = fn.EPDFAnnot_ApplyRedaction(pagePtr, annotPtr, countPtr);
          if (applied) removed += readI32(mem, countPtr) >>> 0;
          return applied;
        });
        if (!ok) {
          throw new EngineError(
            EngineErrorCode.Unknown,
            'native redaction apply failed after preflight',
          );
        }
      } finally {
        fn.FPDFPage_CloseAnnot(annotPtr);
      }
    }
    return { status: 'applied', removed };
  }
}
