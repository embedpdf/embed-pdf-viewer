import type { SnapSettings } from '@embedpdf/core-annotation';

import type { ChromeSettingsPatch } from '../contract';
import { patchChrome } from '../model';
import type { AnnotationContext, AnnotationServices } from '../services';

/** The live-adjustable settings: snapping (a UI toggle) and the selection
 *  chrome (theming). Both are seeded by the registration config. */
export function createSettings(
  ctx: Pick<AnnotationContext, 'state'>,
  { store }: Pick<AnnotationServices, 'store'>,
) {
  const api = {
    getSnapSettings: () => store.model().snap,
    updateSnapSettings: (patch: Partial<SnapSettings>) => {
      store.commit({ type: 'setSnap', patch });
    },
    getChromeSettings: () => ctx.state.get().chrome,
    updateChromeSettings: (patch: ChromeSettingsPatch) => ctx.state.update(patchChrome, patch),
  };
  return { api };
}
