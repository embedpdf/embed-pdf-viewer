/**
 * The stage's wiring to its surroundings, run once every dependency exists:
 * the refit on page-registry changes (every lens) and, for the default lens
 * only, the page-state feed and the navigation executors of the actions
 * plugin. A thumbnail lens must never report page state or win the
 * last-wins executor registry and start navigating the sidebar.
 */
import type { PluginContext } from '@embedpdf/core';
import { ActionsToken, type ActionsHostCapability } from '@embedpdf/plugin-actions/contract/host';

import { destinationToReveal } from './destination';
import type { StageHostCapability } from './host-contract';
import type { StageState } from './model';

/** The id of the main lens; additional lenses register under their own id. */
export const DEFAULT_LENS_ID = 'stage';

export function connectStage(ctx: PluginContext<StageState>, stage: StageHostCapability): void {
  // Rotate, move and delete change the registry revision, so the page geometry
  // under this lens changed: re-resolve the zoom intent and re-place. It
  // reacts to changes only, never to the initial value, so it cannot race the
  // level-triggered initial placement.
  ctx.watch(
    () => ctx.document()?.revision ?? 0,
    () => stage.refit(),
  );

  if (ctx.id !== DEFAULT_LENS_ID) return;
  const actions = ctx.tryGet(ActionsToken);
  if (!actions) return;
  feedPageState(ctx, stage, actions);
  registerNavigationExecutors(ctx, stage, actions);
}

/**
 * The page-state feed. The stage is authoritative for what page the viewer is
 * on; the actions plugin's lifecycle coordinator owns when page-lifecycle
 * triggers fire. The feed reports `{ currentPage, visiblePages, placed, cause }`
 * (page refs, not indexes, so reordering is safe) on placement and on every
 * change; the coordinator buffers reports until the document has opened and
 * diffs them against what it last emitted, so this side only reports.
 */
function feedPageState(
  ctx: PluginContext<StageState>,
  stage: StageHostCapability,
  actions: ActionsHostCapability,
): void {
  const snapshot = () => {
    const state = ctx.state.get();
    if (!state.placed) return null;
    return {
      currentPage: stage.getCurrentPage()?.ref ?? null,
      visiblePages: stage.listVisiblePages().map((page) => page.ref),
      cause: state.motionCause,
    };
  };
  ctx.watch(
    // The signature covers what is reported: the current page and the visible
    // page set. `cause` is left out on purpose: a cause flip alone is not a
    // page-state change and must not produce a report.
    () => {
      const current = snapshot();
      return current === null
        ? 'unplaced'
        : `${current.currentPage?.pageObjectNumber ?? -1}|${current.visiblePages
            .map((page) => page.pageObjectNumber)
            .sort((left, right) => left - right)
            .join(',')}`;
    },
    () => {
      const current = snapshot();
      if (current === null) return;
      actions.reportPageState({
        currentPage: current.currentPage,
        visiblePages: current.visiblePages,
        placed: true,
        cause: current.cause,
      });
    },
  );
}

/**
 * The GoTo and Named page verbs for the action engine. The dispatcher runs
 * them as deferred navigation effects, after every document node of a tree
 * succeeded, never in the middle of a walk. /N Print is not handled here: the
 * dispatcher owns it (policy and the UI adapter).
 */
function registerNavigationExecutors(
  ctx: PluginContext<StageState>,
  stage: StageHostCapability,
  actions: ActionsHostCapability,
): void {
  ctx.cleanup(
    actions.registerExecutor('goto', (node) => {
      if (node.type !== 'goto') return { status: 'inert', reason: 'not a goto node' };
      const layout = ctx.getPage(node.destination.page);
      if (!layout)
        return { status: 'failed', error: 'the destination page is not in this document' };
      const { pageIndex, options } = destinationToReveal(node.destination, layout);
      stage.revealIndex(pageIndex, { ...options, behavior: 'smooth' });
      return { status: 'executed' };
    }),
  );
  ctx.cleanup(
    actions.registerExecutor('named', (node) => {
      if (node.type !== 'named') return { status: 'inert', reason: 'not a named node' };
      switch (node.name) {
        case 'NextPage':
          stage.nextPage({ behavior: 'smooth' });
          return { status: 'executed' };
        case 'PrevPage':
          stage.previousPage({ behavior: 'smooth' });
          return { status: 'executed' };
        case 'FirstPage':
          stage.goToFirstPage({ behavior: 'smooth' });
          return { status: 'executed' };
        case 'LastPage':
          stage.goToLastPage({ behavior: 'smooth' });
          return { status: 'executed' };
        default:
          return { status: 'inert', reason: `unknown named action '${node.name}'` };
      }
    }),
  );
}
