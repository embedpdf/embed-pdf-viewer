/**
 * Full Screen (`view:fullscreen`): the viewer's box fills the screen, and back (ui/fullscreen.ts).
 * The layout's root registers it, since it needs the box. It shows wherever the box can fill the
 * screen, and where the window is all there is to fill, only while the box doesn't cover the
 * window already. It shows as pressed while the box fills the screen, however that started.
 */
import type { CommandDef } from '@embedpdf/react/commands';

import {
  enterFullscreen,
  exitFullscreen,
  fullscreenOf,
  type FullscreenState,
} from '../ui/fullscreen';

export const FULLSCREEN_COMMAND = 'view:fullscreen';

/** Full Screen for the box `target`, in `state`; `coversWindow` says the box covers the window. */
export function fullscreenCommandOf(
  target: HTMLElement,
  state: FullscreenState,
  coversWindow: boolean,
): CommandDef {
  const filling = state.current !== null;
  const shown = filling || state.way === 'screen' || (state.way === 'window' && !coversWindow);
  return {
    id: FULLSCREEN_COMMAND,
    labelKey: 'commands.fullscreen',
    icon: filling ? 'fullscreenExit' : 'fullscreen',
    visible: () => shown,
    active: () => filling,
    run: () => (fullscreenOf(target) === null ? enterFullscreen(target) : exitFullscreen(target)),
  };
}
