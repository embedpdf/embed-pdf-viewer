/**
 * The view lifecycle: the viewport report (initial placement is
 * level-triggered here, the moment the stage first learns a real size and the
 * document has pages), the device pixel ratio, initial-view providers resolved
 * once by priority, the refit after page-registry changes, and the view
 * memento reads.
 */
import type { PluginContext } from '@embedpdf/core';

import type { StageViewState } from '../contract';
import type { StageAnimation } from '../camera/animation';
import type { StageHostCapability } from '../host-contract';
import { markPlaced, setDpr, setViewport, type StageState } from '../model';
import type { StageArrival } from '../navigation/arrive';
import type { StageServices } from '../services';
import type { StageSettingsArea } from '../settings/settings';

interface InitialViewProvider {
  readonly priority: number;
  readonly provide: () => StageViewState | null;
}

export function createViewLifecycle(
  ctx: PluginContext<StageState>,
  { scene, placement }: Pick<StageServices, 'scene' | 'placement'>,
  { cancelAnimation }: Pick<StageAnimation, 'cancelAnimation'>,
  arrive: Pick<StageArrival, 'goToTarget' | 'reapply' | 'resetView'>,
  settings: Pick<StageSettingsArea, 'snapshotSettings' | 'syncResponsive' | 'applyViewState'>,
) {
  const { dpr, currentAnchor } = scene;
  const { goToTarget, reapply } = arrive;
  const { snapshotSettings, syncResponsive } = settings;
  const state = () => ctx.state.get();

  // Initial-view providers (a storage restore, a deep link, an explicit
  // prop). One owner, `placeInitial`, resolves them by priority, so there is
  // no ordering race between the providers.
  const initialViewProviders: InitialViewProvider[] = [];

  const placeInitial = (): void => {
    placement.started = true;
    const byPriority = [...initialViewProviders].sort(
      (left, right) => right.priority - left.priority,
    );
    for (const provider of byPriority) {
      const view = provider.provide();
      if (view) {
        settings.applyViewState(view);
        ctx.state.update(markPlaced);
        return;
      }
    }
    arrive.resetView();
    // Publish renderability last. The viewport, responsive and camera writes
    // above are ordinary observable state changes, but page and scroll reads
    // return stable empty values until this commit lands.
    ctx.state.update(markPlaced);
  };

  return {
    api: {
      setViewportSize: (size) => {
        // Initial placement is level-triggered here: the moment the stage
        // first learns a real size (both axes) and the document has pages,
        // resolve the initial view (providers, else a reset). Every report
        // re-checks the condition, so there is no edge to miss when the
        // viewport was sized before anyone listened.
        if (!placement.started) {
          ctx.state.update(setViewport, size);
          syncResponsive(false); // rules see the box before placement resolves
          if (size.width > 0 && size.height > 0 && (ctx.document()?.pageCount ?? 0) > 0) {
            placeInitial();
          }
          return;
        }
        // Afterwards every resize keeps the same page and re-resolves fit modes.
        cancelAnimation();
        const anchor = currentAnchor(); // measured against the old viewport
        ctx.state.update(setViewport, size);
        // A breakpoint crossing rides the same reframe: the rule patch lands
        // before the anchor is re-applied, so the restore resolves under the
        // new settings. Only a rule-driven flow flip escalates past reapply
        // (camera coordinates are meaningless across the flow boundary).
        const effect = syncResponsive(false);
        if (effect === 'reflow') {
          goToTarget(state().cursor, { behavior: 'instant' });
        } else {
          reapply(anchor);
        }
      },
      setDevicePixelRatio: (ratio) => {
        // A device-resolution change only affects each page transform's device
        // px (crispness) and sub-pixel box snapping, never the layout or the
        // camera: store it, and the visible pages re-key on dpr.
        if (ratio > 0 && ratio !== dpr()) ctx.state.update(setDpr, ratio);
      },
      refit: () => {
        // The page geometry changed underneath (rotate, move, delete). Treat
        // it like a viewport resize: re-resolve the zoom intent and re-place
        // against the current scene, keeping the anchored page-point. A no-op
        // before the first placement; the scene is keyed on the registry
        // revision, so `reapply` reads the new footprint.
        if (!placement.started) return;
        cancelAnimation();
        reapply(currentAnchor());
      },
      getViewState: (): StageViewState => ({
        ...snapshotSettings(),
        cursor: state().cursor,
        anchor: currentAnchor(),
      }),
      getLensId: () => ctx.id,
      provideInitialView: (priority, provide) => {
        const entry: InitialViewProvider = { priority, provide };
        initialViewProviders.push(entry);
        return () => {
          const index = initialViewProviders.indexOf(entry);
          if (index >= 0) initialViewProviders.splice(index, 1);
        };
      },
      placeInitial,
    } satisfies Partial<StageHostCapability>,
  };
}
