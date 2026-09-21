import type { SnapSettings } from '@embedpdf/core-annotation';

import type { ChromeSettingsPatch } from '../contract';
import type { AnnotationContext, AnnotationServices } from '../services';

/** The live-adjustable settings: snapping (a UI toggle) and the selection
 *  chrome (theming). Both are seeded by the registration config. */
export function createSettings(
  ctx: Pick<AnnotationContext, 'dispatch' | 'getState'>,
  { store }: Pick<AnnotationServices, 'store'>,
) {
  const api = {
    getSnapSettings: () => store.model().snap,
    updateSnapSettings: (patch: Partial<SnapSettings>) => {
      store.commit({ t: 'setSnap', patch });
    },
    getChromeSettings: () => ctx.getState().chrome,
    updateChromeSettings: (patch: ChromeSettingsPatch) =>
      ctx.dispatch({ type: 'SET_CHROME', patch }),
  };
  return { api };
}
