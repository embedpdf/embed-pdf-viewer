/**
 * The lifecycle coordinator's page half: the document-open barrier and the
 * cascade budget. The stage owns page truth (it reports through
 * `reportPageState`); this owns when page-lifecycle triggers fire: nothing
 * emits before the document-open sequence has run (or was declared off or
 * headless), and emission is a diff against the last-emitted state, so
 * pre-open motion collapses to one open with no phantom close.
 */
import { toPageRef, type PluginContext } from '@embedpdf/core';
import type { PageObjectNumber } from '@embedpdf/engine-core/runtime';

import type { ActionsConfig } from '../contract';
import type { DispatchCore } from '../dispatch/core';
import type { ActionsHostCapability, PageStateReport } from '../host-contract';
import type { ActionsServices } from '../services';

/** Consecutive programmatic rounds after which page-lifecycle emission is suppressed. */
const CASCADE_LIMIT = 8;

export function createPageLifecycle(
  ctx: PluginContext<void>,
  { events }: Pick<ActionsServices, 'events'>,
  config: ActionsConfig,
  { dispatch }: DispatchCore,
) {
  const { diagnosticHook } = events;
  let barrierOpen = false;
  let bufferedReport: PageStateReport | null = null;
  let lastEmitted: {
    current: PageObjectNumber | null;
    visible: Set<PageObjectNumber>;
  } = {
    current: null,
    visible: new Set(),
  };
  let cascadeRounds = 0;

  const emitForReport = (report: PageStateReport): void => {
    if (report.cause === 'user') cascadeRounds = 0;
    const current = report.currentPage === null ? null : report.currentPage.pageObjectNumber;
    const nextVisible = new Set(report.visiblePages.map((page) => page.pageObjectNumber));
    const changedCurrent = current !== lastEmitted.current;
    const leaving = [...lastEmitted.visible].filter(
      (pageObjectNumber) => !nextVisible.has(pageObjectNumber),
    );
    const entering = [...nextVisible].filter(
      (pageObjectNumber) => !lastEmitted.visible.has(pageObjectNumber),
    );
    if (!changedCurrent && leaving.length === 0 && entering.length === 0) return;
    const previousCurrent = lastEmitted.current;
    // Track truth even when suppressed: the budget bounds emission, not state.
    lastEmitted = { current, visible: nextVisible };
    if (report.cause === 'programmatic') {
      cascadeRounds += 1;
      if (cascadeRounds > CASCADE_LIMIT) {
        diagnosticHook.emit({
          code: 'cascade-budget',
          message: `page-lifecycle emission suppressed: ${cascadeRounds} consecutive programmatic rounds (cap ${CASCADE_LIMIT})`,
        });
        return;
      }
    }
    // Canonical order (ISO leaves the cross-page order unspecified; within a
    // page, planPageSteps holds Table 197's /PO-after-/O and /PC-before-/C):
    // close(previous) → invisible set → visible set → open(current).
    if (changedCurrent && previousCurrent !== null) {
      void dispatch({ scope: 'page', event: 'close', page: toPageRef(previousCurrent) });
    }
    for (const pageObjectNumber of leaving) {
      void dispatch({ scope: 'page', event: 'invisible', page: toPageRef(pageObjectNumber) });
    }
    for (const pageObjectNumber of entering) {
      void dispatch({ scope: 'page', event: 'visible', page: toPageRef(pageObjectNumber) });
    }
    if (changedCurrent && current !== null) {
      void dispatch({ scope: 'page', event: 'open', page: toPageRef(current) });
    }
  };

  const reportPageState = (report: PageStateReport): void => {
    if (!report.placed) return;
    if (report.cause === 'user') cascadeRounds = 0;
    if (!barrierOpen) {
      bufferedReport = report; // coalesce: only the latest pre-open state matters
      return;
    }
    emitForReport(report);
  };

  const releaseBarrier = (fireFallback: boolean): void => {
    barrierOpen = true;
    const report = bufferedReport;
    bufferedReport = null;
    try {
      if (report) {
        emitForReport(report);
      } else if (fireFallback && config.openSequence === 'headless') {
        // The initial page open falls back to the document's first page only
        // in declared-headless mode (no stage will ever report). In 'auto',
        // the stage report owns the initial open: firing a first-page /O
        // before a restored view reports would be exactly the phantom open
        // the coordinator exists to prevent; a stage-less 'auto' embedder
        // drives page triggers itself or declares headless.
        const first = ctx.document()?.pages[0]?.ref.pageObjectNumber;
        if (first !== undefined) {
          lastEmitted = { current: first, visible: lastEmitted.visible };
          void dispatch({ scope: 'page', event: 'open', page: toPageRef(first) });
        }
      }
    } catch (error) {
      // The barrier is open either way: feeds must never stay buffered.
      diagnosticHook.emit({
        code: 'trigger-failed',
        message: `barrier release failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

  return {
    releaseBarrier,
    /** A user gesture resets the programmatic-cascade counter. */
    resetCascade: (): void => {
      cascadeRounds = 0;
    },
    api: { reportPageState } satisfies Partial<ActionsHostCapability>,
  };
}
export type ActionsPageLifecycle = ReturnType<typeof createPageLifecycle>;
