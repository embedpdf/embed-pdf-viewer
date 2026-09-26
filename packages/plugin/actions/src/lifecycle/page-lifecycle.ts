/**
 * The lifecycle coordinator's page half (document-open barrier + cascade
 * budget). Stage owns page truth (reports through `reportPageState`); this
 * owns WHEN page-lifecycle triggers fire: nothing emits before the §3.9 open
 * sequence has run (or been declared off/headless), and emission is a diff
 * against the last-emitted state — pre-open motion collapses to one open,
 * with no phantom close.
 */
import { toPageRef } from '@embedpdf/engine-core/runtime';
import type { PageObjectNumber } from '@embedpdf/engine-core/runtime';

import type { ActionsConfig } from '../contract';
import type { DispatchCore } from '../dispatch/core';
import type { ActionsHostCapability, PageStateReport } from '../host-contract';
import type { ActionsContext, ActionsServices } from '../services';

export function createPageLifecycle(
  ctx: ActionsContext,
  { events }: Pick<ActionsServices, 'events'>,
  config: ActionsConfig,
  { dispatch }: DispatchCore,
) {
  const { diagnosticHook } = events;
  const CASCADE_CAP = 8;
  let barrierOpen = false;
  let bufferedReport: PageStateReport | null = null;
  let lastEmitted: { currentPon: PageObjectNumber | null; visible: Set<PageObjectNumber> } = {
    currentPon: null,
    visible: new Set(),
  };
  let cascadeRounds = 0;

  const emitForReport = (report: PageStateReport): void => {
    if (report.cause === 'user') cascadeRounds = 0;
    const current = report.currentPage === null ? null : report.currentPage.pageObjectNumber;
    const nextVisible = new Set(report.visiblePages.map((page) => page.pageObjectNumber));
    const changedCurrent = current !== lastEmitted.currentPon;
    const leaving = [...lastEmitted.visible].filter((pon) => !nextVisible.has(pon));
    const entering = [...nextVisible].filter((pon) => !lastEmitted.visible.has(pon));
    if (!changedCurrent && leaving.length === 0 && entering.length === 0) return;
    const previousCurrent = lastEmitted.currentPon;
    // Track truth even when suppressed — the budget bounds EMISSION, not state.
    lastEmitted = { currentPon: current, visible: nextVisible };
    if (report.cause === 'programmatic') {
      cascadeRounds += 1;
      if (cascadeRounds > CASCADE_CAP) {
        diagnosticHook.emit({
          code: 'cascade-budget',
          message: `page-lifecycle emission suppressed: ${cascadeRounds} consecutive programmatic rounds (cap ${CASCADE_CAP})`,
        });
        return;
      }
    }
    // Canonical order (cross-page order is unspecified by ISO; within a page
    // planPageSteps holds Table 197's PO-after-O / PC-before-C):
    // close(old) → invisible set → visible set → open(new).
    if (changedCurrent && previousCurrent !== null) {
      void dispatch({ scope: 'page', event: 'close', page: toPageRef(previousCurrent) });
    }
    for (const pon of leaving) {
      void dispatch({ scope: 'page', event: 'invisible', page: toPageRef(pon) });
    }
    for (const pon of entering) {
      void dispatch({ scope: 'page', event: 'visible', page: toPageRef(pon) });
    }
    if (changedCurrent && current !== null) {
      void dispatch({ scope: 'page', event: 'open', page: toPageRef(current) });
    }
  };

  const reportPageState = (report: PageStateReport): void => {
    if (!report.placed) return;
    if (report.cause === 'user') cascadeRounds = 0;
    if (!barrierOpen) {
      bufferedReport = report; // coalesce: only the LATEST pre-open state matters
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
        // §3.9's initial page open falls back to the document's first page
        // ONLY in declared-headless mode (no stage will ever report). In
        // 'auto', the stage report owns the initial open — firing a
        // first-page /O before a restored view reports would be exactly the
        // phantom open the coordinator exists to prevent; a stage-less
        // 'auto' embedder drives page triggers itself or declares headless.
        const first = ctx.document()?.pages[0]?.ref.pageObjectNumber;
        if (first !== undefined) {
          lastEmitted = { currentPon: first, visible: lastEmitted.visible };
          void dispatch({ scope: 'page', event: 'open', page: toPageRef(first) });
        }
      }
    } catch (error) {
      // The barrier is OPEN either way — feeds must never stay buffered.
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
