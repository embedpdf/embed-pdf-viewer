/**
 * The view lifecycle: the viewport report (initial placement is LEVEL-
 * triggered here — the moment the stage first learns a real size and the
 * document has pages), device pixel ratio, initial-view providers resolved
 * once by priority, re-fit after page-registry mutations, and the view
 * memento reads.
 */
import type { StageViewState } from '../contract';
import type { StageAnimation } from '../camera/animation';
import type { StageHostCapability } from '../host-contract';
import type { StageArrival } from '../navigation/arrive';
import type { StageContext, StageServices } from '../services';
import type { StageSettingsArea } from '../settings/settings';

export function createViewLifecycle(
  ctx: StageContext,
  { scene, placement }: Pick<StageServices, 'scene' | 'placement'>,
  { cancelAnim }: Pick<StageAnimation, 'cancelAnim'>,
  arrive: Pick<StageArrival, 'goToTarget' | 'reapply' | 'resetView'>,
  settings: Pick<StageSettingsArea, 'snapshotSettings' | 'syncResponsive' | 'applyViewState'>,
) {
  const { dpr, currentAnchor } = scene;
  const { goToTarget, reapply } = arrive;
  const { snapshotSettings, syncResponsive } = settings;

  // Initial-view providers (storage restore, deep-link, an explicit prop…). One owner
  // (placeInitial) resolves them by priority — no effect-ordering races.
  // (`placement.started` is declared above the camera-rest detector, which reads it.)
  const initialViewProviders: Array<{ priority: number; fn: () => StageViewState | null }> = [];

  const placeInitial = (): void => {
    placement.started = true;
    const sorted = [...initialViewProviders].sort((a, b) => b.priority - a.priority);
    for (const p of sorted) {
      const view = p.fn();
      if (view) {
        settings.applyViewState(view);
        ctx.dispatch({ type: 'PLACED' });
        return;
      }
    }
    arrive.resetView();
    // Publish renderability LAST. The VP/responsive/camera writes above are
    // still ordinary observable store updates, but page/scroll render-root
    // selectors return stable empty values until this commit lands.
    ctx.dispatch({ type: 'PLACED' });
  };

  return {
    api: {
      setViewportSize: (v) => {
        // Initial placement is LEVEL-triggered, owned here: the moment the stage
        // first learns a real size (both axes) and the document has pages, resolve
        // the initial view (storage/deep-link providers, else reset). Every report
        // re-checks the condition — no watch, no effect-registration race, no edge
        // to miss when the viewport was already sized before anyone listened.
        if (!placement.started) {
          ctx.dispatch({ type: 'VP', vp: v });
          syncResponsive(false); // rules see the box before placement resolves
          if (v.width > 0 && v.height > 0 && (ctx.document()?.pageCount ?? 0) > 0) {
            placeInitial();
          }
          return;
        }
        // Afterwards every resize keeps the same page and re-resolves fit-modes.
        cancelAnim();
        const anchor = currentAnchor(); // measured against the OLD viewport
        ctx.dispatch({ type: 'VP', vp: v }); // new viewport
        // A breakpoint crossing rides the SAME reframe: the rule patch lands
        // before the anchor is re-applied, so the restore resolves under the
        // new settings. Only a rule-driven FLOW flip escalates past reapply
        // (camera coordinates are meaningless across the flow boundary).
        const fx = syncResponsive(false);
        if (fx === 'reflow') {
          goToTarget(ctx.getState().cursor, { behavior: 'instant' });
        } else {
          reapply(anchor);
        }
      },
      setDevicePixelRatio: (ratio) => {
        // Pure device-resolution change: it only affects each page transform's
        // device px (crispness) + sub-pixel box snapping, never the layout or
        // camera — so no re-place, just store it; visiblePages re-keys on dpr.
        if (ratio > 0 && ratio !== dpr()) ctx.dispatch({ type: 'DPR', dpr: ratio });
      },
      refit: () => {
        // The page geometry changed underneath us (rotate/move/delete). Treat it
        // exactly like a viewport resize: re-resolve the active zoom intent and
        // re-place against the now-current scene, keeping the anchored page-point.
        // No-op until the first placement; the scene is re-keyed on the registry
        // revision, so `reapply` reads the rotated footprint.
        if (!placement.started) return;
        cancelAnim();
        reapply(currentAnchor());
      },
      getViewState: (): StageViewState => ({
        ...snapshotSettings(),
        cursor: ctx.getState().cursor,
        anchor: currentAnchor(),
      }),
      getLensId: () => ctx.id,
      provideInitialView: (priority, fn) => {
        const entry = { priority, fn };
        initialViewProviders.push(entry);
        return () => {
          const i = initialViewProviders.indexOf(entry);
          if (i >= 0) initialViewProviders.splice(i, 1);
        };
      },
      placeInitial,
    } satisfies Partial<StageHostCapability>,
  };
}
